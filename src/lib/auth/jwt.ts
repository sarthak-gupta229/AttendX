import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";
import { UserRole } from "../db/collections";

const secretKey = new TextEncoder().encode(config.JWT_SECRET);

export interface SessionPayload {
  sub: string;
  role: UserRole;
  exp?: number;
}

export async function signSession(payload: { sub: string; role: UserRole }): Promise<string> {
  const ttlSeconds = config.JWT_TTL_HOURS * 3600;
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    if (!payload.sub || (payload.role !== "operator" && payload.role !== "admin")) {
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
