import { describe, expect, it } from "vitest";
import {
  getRoleEntryPath,
  getRoleHome,
  getRoleSetupPath,
  getWorkerBrowsePath,
  hasSelectedRole,
  sanitiseAppRedirectPath,
} from "./auth-routing";

describe("auth-client", () => {
  it("rejects unsafe redirect paths", () => {
    expect(sanitiseAppRedirectPath("https://example.com")).toBeNull();
    expect(sanitiseAppRedirectPath("//evil.example")).toBeNull();
    expect(sanitiseAppRedirectPath(" dashboard")).toBeNull();
  });

  it("keeps safe in-app redirect paths", () => {
    expect(sanitiseAppRedirectPath("/shifts/123?intent=take")).toBe("/shifts/123?intent=take");
  });

  it("routes incomplete workers to shift browsing", () => {
    expect(getRoleEntryPath("worker", false)).toBe(getWorkerBrowsePath());
  });

  it("routes completed users to their dashboards", () => {
    expect(getRoleEntryPath("worker", true)).toBe(getRoleHome("worker"));
    expect(getRoleEntryPath("business", true)).toBe(getRoleHome("business"));
  });

  it("routes incomplete businesses to onboarding", () => {
    expect(getRoleEntryPath("business", false)).toBe(getRoleSetupPath("business"));
  });

  it("prefers a safe explicit redirect target", () => {
    expect(getRoleEntryPath("worker", false, "/shifts/abc")).toBe("/shifts/abc");
  });

  it("identifies when a role has been fully selected", () => {
    expect(
      hasSelectedRole({
        id: "1",
        email: null,
        role: "worker",
        role_selected: true,
        display_name: null,
        phone: null,
        whatsapp_opt_in: false,
        onboarding_complete: false,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(true);

    expect(
      hasSelectedRole({
        id: "1",
        email: null,
        role: null,
        role_selected: false,
        display_name: null,
        phone: null,
        whatsapp_opt_in: false,
        onboarding_complete: false,
        created_at: "",
        updated_at: "",
      }),
    ).toBe(false);
  });
});
