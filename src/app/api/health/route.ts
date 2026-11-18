import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getConnectionCount } from "@/lib/realtime/connectionTracker";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus: "ok" | "down" = "down";
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    dbStatus = "ok";
  } catch {
    dbStatus = "down";
  }

  const connections = getConnectionCount();
  const status = dbStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      db: dbStatus,
      connections,
    },
    {
      status: status === "ok" ? 200 : 503,
    }
  );
}
