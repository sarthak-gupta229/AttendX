import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, createUser } from "@/lib/db/users";
import { signSession } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME, getCookieOptions } from "@/lib/auth/cookies";

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid input";
    return NextResponse.json({ error: "bad_request", message: errorMsg }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "user_exists", message: "An account with this email already exists. Please log in." },
      { status: 409 }
    );
  }

  const user = await createUser({
    email,
    password,
    role: "operator",
  });

  const token = await signSession({
    sub: user._id.toHexString(),
    role: user.role,
  });

  const response = NextResponse.json({
    ok: true,
    user: { email: user.email, role: user.role },
  });

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
