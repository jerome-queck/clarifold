import identity from "./clarifold-identity.json";

export const CLARIFOLD_IDENTITY = Object.freeze(identity);

export type DataDirectorySource = "default" | "canonical-environment" | "legacy-environment" | "test-environment";

export interface ClarifoldRuntimeConfiguration {
  readonly dataDirectory: string;
  readonly dataDirectorySource: DataDirectorySource;
  readonly testUserDataDirectory: string | null;
  readonly devUrl: string | null;
  readonly codexPath: string | null;
  readonly leanPath: string | null;
  readonly testArtifactExportPath: string | null;
  readonly testPrimaryFolder: string | null;
  readonly testExternalAttachment: string | null;
  readonly testRelocatedSource: string | null;
  readonly testAuthenticationOpenLog: string | null;
  readonly testVerifierRemovalFailure: string | null;
  readonly testSkipDefaultVerifierInstall: boolean;
  readonly testExternalResearch: string | null;
}

export interface RuntimeEnvironmentWarning {
  readonly message: string;
  readonly variable: string;
}

export function resolveClarifoldRuntimeConfiguration(
  environment: NodeJS.ProcessEnv,
  defaultDataDirectory: string,
  warn: (warning: RuntimeEnvironmentWarning) => void = ({ message }) => console.warn(message)
): ClarifoldRuntimeConfiguration {
  const testUserDataDirectory = nonEmptyEnvironmentValue(environment, identity.testUserDataDirectoryVariable);
  const canonicalDataDirectory = nonEmptyEnvironmentValue(environment, identity.canonicalDataDirectoryVariable);
  const legacyDataDirectory = nonEmptyEnvironmentValue(environment, identity.legacyDataDirectoryVariable);
  let dataDirectory = testUserDataDirectory ?? defaultDataDirectory;
  let dataDirectorySource: DataDirectorySource = testUserDataDirectory ? "test-environment" : "default";
  if (testUserDataDirectory) {
    if (canonicalDataDirectory || legacyDataDirectory) {
      warn({
        variable: identity.testUserDataDirectoryVariable,
        message: `${identity.testUserDataDirectoryVariable} is an isolated test data path; real default-user-data discovery is disabled.`
      });
    }
  } else if (canonicalDataDirectory) {
    dataDirectory = canonicalDataDirectory;
    dataDirectorySource = "canonical-environment";
    if (legacyDataDirectory) {
      warn({
        variable: identity.legacyDataDirectoryVariable,
        message: `${identity.legacyDataDirectoryVariable} is ignored because ${identity.canonicalDataDirectoryVariable} is set.`
      });
    }
  } else if (legacyDataDirectory) {
    dataDirectory = legacyDataDirectory;
    dataDirectorySource = "legacy-environment";
    warn({
      variable: identity.legacyDataDirectoryVariable,
      message: `${identity.legacyDataDirectoryVariable} is deprecated for this Clarifold beta; use ${identity.canonicalDataDirectoryVariable} instead.`
    });
  }

  return {
    dataDirectory,
    dataDirectorySource,
    testUserDataDirectory,
    devUrl: nonEmptyEnvironmentValue(environment, identity.developmentUrlVariable),
    codexPath: nonEmptyEnvironmentValue(environment, identity.codexPathVariable),
    leanPath: nonEmptyEnvironmentValue(environment, identity.leanPathVariable),
    testArtifactExportPath: nonEmptyEnvironmentValue(environment, identity.testArtifactExportPathVariable),
    testPrimaryFolder: nonEmptyEnvironmentValue(environment, identity.testPrimaryFolderVariable),
    testExternalAttachment: nonEmptyEnvironmentValue(environment, identity.testExternalAttachmentVariable),
    testRelocatedSource: nonEmptyEnvironmentValue(environment, identity.testRelocatedSourceVariable),
    testAuthenticationOpenLog: nonEmptyEnvironmentValue(environment, identity.testAuthenticationOpenLogVariable),
    testVerifierRemovalFailure: nonEmptyEnvironmentValue(environment, identity.testVerifierRemovalFailureVariable),
    testSkipDefaultVerifierInstall: nonEmptyEnvironmentValue(environment, identity.testSkipDefaultVerifierInstallVariable) === "1",
    testExternalResearch: nonEmptyEnvironmentValue(environment, identity.testExternalResearchVariable)
  };
}

function nonEmptyEnvironmentValue(environment: NodeJS.ProcessEnv, variable: string): string | null {
  const value = environment[variable]?.trim();
  return value ? value : null;
}
