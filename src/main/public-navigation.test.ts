import { describe, expect, it } from "vitest";
import { requireApprovedClarifoldPublicUrl } from "./public-navigation";

describe("Clarifold public navigation", () => {
  it("allows only the configured public repository surfaces", () => {
    expect(requireApprovedClarifoldPublicUrl("https://github.com/jerome-queck/clarifold/issues/new/choose"))
      .toBe("https://github.com/jerome-queck/clarifold/issues/new/choose");
    expect(requireApprovedClarifoldPublicUrl("https://github.com/jerome-queck/clarifold/security/advisories/new"))
      .toBe("https://github.com/jerome-queck/clarifold/security/advisories/new");
  });

  it("rejects lookalike, non-HTTPS, and unapproved destinations", () => {
    for (const destination of [
      "https://github.com/jerome-queck/clarifold.evil.example/issues/new/choose",
      "http://github.com/jerome-queck/clarifold/issues/new/choose",
      "https://example.com/",
      "mailto:security@jeromegroup.org"
    ]) {
      expect(() => requireApprovedClarifoldPublicUrl(destination)).toThrow("unsupported Clarifold public URL");
    }
  });
});
