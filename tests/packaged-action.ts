import type { TestInfo } from "@playwright/test";
import type { Page } from "@playwright/test";

export type PackagedActionSettlement = "completed" | "failed" | "cancelled";

export type PackagedActionReceipt = {
  operation: string;
  startedAt: string;
  settledAt: string;
  elapsedMs: number;
  settlement: PackagedActionSettlement;
  error?: string;
  visibleState?: string;
  backendState?: unknown;
};

export type PackagedActionDiagnostics = {
  scenario: string;
  receipts: PackagedActionReceipt[];
  failures: Array<{ operation: string; error: string }>;
};

export const DEFAULT_PACKAGED_ACTION_TIMEOUT_MS = 15_000;

export async function runBoundedPackagedAction<T>(
  operation: string,
  action: () => Promise<T>,
  timeoutMs: number = DEFAULT_PACKAGED_ACTION_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          `Packaged operation "${operation}" did not settle within ${timeoutMs}ms.`
        )), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runPackagedAction<T>(
  page: Page,
  testInfo: TestInfo,
  diagnostics: PackagedActionDiagnostics,
  operation: string,
  action: () => Promise<T>,
  timeoutMs: number = DEFAULT_PACKAGED_ACTION_TIMEOUT_MS
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await runBoundedPackagedAction(operation, action, timeoutMs);
    diagnostics.receipts.push({
      operation,
      startedAt: new Date(startedAt).toISOString(),
      settledAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      settlement: "completed"
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const [visibleState, backendState] = await Promise.all([
      page.locator("body").innerText({ timeout: 2_000 }).catch((cause) => `unavailable: ${String(cause)}`),
      page.evaluate(() => (window as unknown as Window & { quickStudy: { getState(): Promise<unknown> } }).quickStudy.getState())
        .catch((cause) => ({ unavailable: String(cause) }))
    ]);
    const receipt: PackagedActionReceipt = {
      operation,
      startedAt: new Date(startedAt).toISOString(),
      settledAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      settlement: /(?:was|been) cancell?ed|cancel(?:led|ed) before/i.test(message) ? "cancelled" : "failed",
      error: message,
      visibleState,
      backendState
    };
    diagnostics.receipts.push(receipt);
    diagnostics.failures.push({ operation, error: message });
    await testInfo.attach(`${safeAttachmentName(operation)}-error-context.json`, {
      body: Buffer.from(JSON.stringify(receipt, null, 2), "utf8"),
      contentType: "application/json"
    });
    throw new Error(`${message}\nOperation receipt: ${JSON.stringify({
      operation, elapsedMs: receipt.elapsedMs, settlement: receipt.settlement
    })}`);
  }
}

export async function readBoundedPackagedBackendState(page: Page, timeoutMs = 2_000): Promise<unknown> {
  return runBoundedPackagedAction(
    "Collect packaged backend state receipt",
    () => page.evaluate(() => (window as unknown as Window & { quickStudy: { getState(): Promise<unknown> } }).quickStudy.getState()),
    timeoutMs
  ).catch((error) => ({ unavailable: String(error) }));
}

export async function attachPackagedDiagnostics(
  page: Page | undefined,
  testInfo: TestInfo,
  diagnostics: PackagedActionDiagnostics,
  lifecycleLog: string,
  finalBackendState?: unknown
): Promise<void> {
  const backendState = finalBackendState ?? (page
    ? await readBoundedPackagedBackendState(page)
    : { unavailable: "renderer was not available" });
  await testInfo.attach("operation-state-receipt.json", {
    body: Buffer.from(JSON.stringify({
      scenario: diagnostics.scenario,
      receipts: diagnostics.receipts,
      failures: diagnostics.failures,
      finalBackendState: backendState
    }, null, 2), "utf8"),
    contentType: "application/json"
  });
  await testInfo.attach("packaged-app-lifecycle.log", {
    body: Buffer.from(lifecycleLog, "utf8"),
    contentType: "text/plain"
  });
  await testInfo.attach("packaged-error-context.txt", {
    body: Buffer.from(JSON.stringify({ scenario: diagnostics.scenario, failures: diagnostics.failures }, null, 2), "utf8"),
    contentType: "text/plain"
  });
}

function safeAttachmentName(operation: string): string {
  return operation.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "packaged-action";
}
