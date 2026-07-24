import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function readClarifoldReleaseIdentity(rootDirectory = process.cwd()) {
  const [packageJson, identity] = await Promise.all([
    readJson(join(rootDirectory, "package.json")),
    readJson(join(rootDirectory, "src", "shared", "clarifold-identity.json"))
  ]);
  const mismatches = [
    ["package name", packageJson.name, identity.packageName],
    ["product name", packageJson.productName, identity.productName],
    ["version", packageJson.version, identity.version]
  ].filter(([, packageValue, identityValue]) => packageValue !== identityValue);
  if (mismatches.length > 0) {
    const details = mismatches.map(([field, packageValue, identityValue]) =>
      `${field}: package=${String(packageValue)} identity=${String(identityValue)}`).join(", ");
    throw new Error(`Clarifold package identity is inconsistent: ${details}`);
  }
  if (!identity.release?.releaseIdPrefix || !identity.release?.workflowArtifactPrefix) {
    throw new Error("Clarifold release identity is missing its candidate naming contract.");
  }

  const archiveName = (architecture) => {
    if (architecture !== "arm64" && architecture !== "x64") {
      throw new Error(`Unsupported Clarifold macOS architecture: ${architecture}`);
    }
    return `${identity.productName}-darwin-${architecture}-${identity.version}.zip`;
  };
  return Object.freeze({
    packageJson,
    identity,
    packageName: identity.packageName,
    productName: identity.productName,
    version: identity.version,
    bundleIdentifier: identity.bundleIdentifier,
    applicationName: `${identity.productName}.app`,
    executableName: identity.productName,
    releaseId: `${identity.release.releaseIdPrefix}-${identity.version}`,
    workflowArtifactName: (architecture) => `${identity.release.workflowArtifactPrefix}-${architecture.toUpperCase()}`,
    archiveName
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const release = await readClarifoldReleaseIdentity();
  console.log(`Clarifold ${release.version} package identity is consistent (${release.bundleIdentifier}).`);
}
