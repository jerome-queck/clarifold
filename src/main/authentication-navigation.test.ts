import { describe, expect, it } from "vitest";
import { requireApprovedChatGptAuthenticationUrl } from "./authentication-navigation";

describe("ChatGPT authentication navigation policy", () => {
  it("accepts the provider-approved normalized HTTPS authorization route", () => {
    expect(requireApprovedChatGptAuthenticationUrl(
      "https://auth.openai.com/oauth/authorize?client_id=app&state=one%20two"
    )).toBe("https://auth.openai.com/oauth/authorize?client_id=app&state=one%20two");
  });

  it.each([
    "http://auth.openai.com/oauth/authorize",
    "https://learner@auth.openai.com/oauth/authorize",
    "https://auth.openai.com:444/oauth/authorize",
    "https://auth.openai.com.evil.example/oauth/authorize",
    "https://auth.opena\u0131.com/oauth/authorize",
    "https://auth.openai.com/%6fAuth/authorize",
    "https://auth.openai.com/oauth/authorize/extra",
    "https://auth.openai.com/oauth/authorize#unexpected",
    "https://example.test/login;open=/Applications/Calculator.app",
    "not a URL"
  ])("rejects an unsupported authentication destination: %s", (value) => {
    expect(() => requireApprovedChatGptAuthenticationUrl(value)).toThrow(
      "Codex returned an unsupported ChatGPT authentication URL."
    );
  });
});
