const PROCESS_ENVIRONMENT_ALLOWLIST = [
  "HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "TERM", "COLORTERM", "CODEX_HOME",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy", "__CF_USER_TEXT_ENCODING"
] as const;

export function boundedProcessEnvironment(
  source: Record<string, string | undefined> = process.env
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of PROCESS_ENVIRONMENT_ALLOWLIST) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
