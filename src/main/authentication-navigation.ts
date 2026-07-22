const CHATGPT_AUTHENTICATION_ORIGIN = "https://auth.openai.com";
const CHATGPT_AUTHENTICATION_PATH = "/oauth/authorize";
const UNSUPPORTED_AUTHENTICATION_URL = "Codex returned an unsupported ChatGPT authentication URL.";

export function requireApprovedChatGptAuthenticationUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error(UNSUPPORTED_AUTHENTICATION_URL);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(UNSUPPORTED_AUTHENTICATION_URL);
  }
  if (url.href !== value
    || url.origin !== CHATGPT_AUTHENTICATION_ORIGIN
    || url.pathname !== CHATGPT_AUTHENTICATION_PATH
    || url.username || url.password || url.port || url.hash) {
    throw new Error(UNSUPPORTED_AUTHENTICATION_URL);
  }
  return url.href;
}
