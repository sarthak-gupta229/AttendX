import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "@/lib/auth/jwt";
import { SignJWT } from "jose";
import { config } from "@/lib/config";

describe("JWT Authentication", () => {
  it("successfully signs and verifies a valid session payload", async () => {
    const payload = { sub: "507f1f77bcf86cd799439011", role: "operator" as const };
    const token = await signSession(payload);
    expect(typeof token).toBe("string");

    const decoded = await verifySession(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe(payload.sub);
    expect(decoded?.role).toBe(payload.role);
  });

  it("rejects expired tokens", async () => {
    const secretKey = new TextEncoder().encode(config.JWT_SECRET);
    // Create an expired token (-10s)
    const expiredToken = await new SignJWT({ role: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("507f1f77bcf86cd799439011")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 100)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secretKey);

    const verified = await verifySession(expiredToken);
    expect(verified).toBeNull();
  });

  it("rejects tokens signed with invalid/different secret or wrong algorithm", async () => {
    const wrongKey = new TextEncoder().encode("wrong_secret_key_that_is_at_least_32_chars_long!");
    const fakeToken = await new SignJWT({ role: "operator" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("507f1f77bcf86cd799439011")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(wrongKey);

    const verified = await verifySession(fakeToken);
    expect(verified).toBeNull();
  });

  it("rejects tokens with non-allowed roles", async () => {
    const secretKey = new TextEncoder().encode(config.JWT_SECRET);
    const badRoleToken = await new SignJWT({ role: "superuser" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("507f1f77bcf86cd799439011")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secretKey);

    const verified = await verifySession(badRoleToken);
    expect(verified).toBeNull();
  });
});
