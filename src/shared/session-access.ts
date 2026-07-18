export type SessionAccessPolicy = "focused" | "workspace" | "full";

export function sessionAccessPolicyLabel(policy: SessionAccessPolicy): string {
  return {
    focused: "Focused Access",
    workspace: "Workspace Access",
    full: "Full Access"
  }[policy];
}
