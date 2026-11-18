import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/db/users";
import { verifyPassword, verifyDummyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME, getCookieOptions } from "@/lib/auth/cookies";

// Rate limiter: 10 attempts per IP per 15 minutes
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, RateLimitEntry>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);

  if (!user || user.disabled) {
    // Run dummy verify to prevent timing attacks
    await verifyDummyPassword();
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await signSession({
    sub: user._id.toHexString(),
    role: user.role,
  });

  const response = NextResponse.json({ ok: true });
  const cookieOpts = getCookieOptions();

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: cookieOpts.maxAge,
  });

  return response;
}
