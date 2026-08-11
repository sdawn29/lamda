import { describe, expect, it } from "vitest";

import { isFreshOAuthCredential, type AuthEntry } from "./auth-service.js";

const oauth = (access: string, expires = 1): AuthEntry => ({
  type: "oauth",
  access,
  refresh: "r",
  expires,
});

describe("isFreshOAuthCredential", () => {
  it("treats a credential written by this login as a success", () => {
    // ModelRuntime.login() stores the credential and only then refreshes the
    // model catalogs; a network failure in that refresh rejects a sign-in that
    // actually worked.
    expect(isFreshOAuthCredential(undefined, oauth("new"))).toBe(true);
  });

  it("treats a rotated credential as a success", () => {
    expect(isFreshOAuthCredential(oauth("old"), oauth("new"))).toBe(true);
  });

  it("treats a re-login that only moved the expiry as a success", () => {
    expect(isFreshOAuthCredential(oauth("same", 1), oauth("same", 2))).toBe(
      true,
    );
  });

  it("treats an untouched credential from an earlier session as a failure", () => {
    expect(isFreshOAuthCredential(oauth("same"), oauth("same"))).toBe(false);
  });

  it("treats a missing credential as a failure", () => {
    expect(isFreshOAuthCredential(undefined, undefined)).toBe(false);
    expect(isFreshOAuthCredential(oauth("old"), undefined)).toBe(false);
  });

  it("ignores api-key entries for the same provider", () => {
    const apiKey: AuthEntry = { type: "api_key", key: "sk-test" };
    expect(isFreshOAuthCredential(undefined, apiKey)).toBe(false);
    expect(isFreshOAuthCredential(apiKey, oauth("new"))).toBe(true);
  });
});
