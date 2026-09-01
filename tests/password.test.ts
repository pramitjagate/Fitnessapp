import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, newSessionToken, sessionExpiry, verifyPassword } from "@/lib/password";

describe("hashPassword / verifyPassword", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
  });

  it("never stores the password", async () => {
    const stored = await hashPassword("hunter2hunter2");
    expect(stored).not.toContain("hunter2");
  });

  it("salts, so the same password hashes differently for two users", async () => {
    // Without this, one precomputed table covers everyone who picked the same
    // password, and a breach of one account is a breach of all of them.
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("records the scheme, so another algorithm can be added beside it", async () => {
    expect((await hashPassword("x".repeat(12))).startsWith("scrypt$")).toBe(true);
  });

  it("refuses an absent or malformed hash instead of throwing", async () => {
    // An account with no password (a row that predates sign-up) must fail
    // closed. Throwing here would surface as a 500 and tell an attacker the
    // email exists.
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "notahash")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$salt$hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$$")).toBe(false);
  });
});

describe("session tokens", () => {
  it("issues a different token every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it("issues tokens with enough entropy to be unguessable", () => {
    // 32 bytes, base64url — 43 characters, no padding.
    expect(newSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores a hash, not the token", () => {
    const token = newSessionToken();
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic, or a returning cookie could never be looked up.
    expect(hashToken(token)).toBe(hash);
  });

  it("expires thirty days out", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(sessionExpiry(from).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});
