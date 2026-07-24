import { CLARIFOLD_IDENTITY } from "../shared/clarifold-identity";

const APPROVED_PUBLIC_URLS = new Set([
  CLARIFOLD_IDENTITY.repositoryUrl,
  CLARIFOLD_IDENTITY.feedbackUrl,
  CLARIFOLD_IDENTITY.privacyUrl,
  CLARIFOLD_IDENTITY.securityUrl,
  `${CLARIFOLD_IDENTITY.repositoryUrl}/blob/main/LICENSE.md`
]);

export function requireApprovedClarifoldPublicUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("unsupported Clarifold public URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("unsupported Clarifold public URL");
  }
  if (url.protocol !== "https:" || url.href !== value || !APPROVED_PUBLIC_URLS.has(url.href)
    || url.username || url.password || url.port || url.hash) {
    throw new Error("unsupported Clarifold public URL");
  }
  return url.href;
}
