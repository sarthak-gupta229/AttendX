import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getCookieOptions } from "@/lib/auth/cookies";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookieOpts = getCookieOptions();

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0,
  });

  return response;
}
