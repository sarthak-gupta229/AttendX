import { getSnapshot } from "@/lib/sessions/snapshot";
import { getSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { Board } from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [sessions, session] = await Promise.all([
    getSnapshot(),
    getSession(),
  ]);

  const canEdit = session !== null;

  return (
    <Board
      initialSessions={sessions}
      initialCanEdit={canEdit}
      initialMaxSessions={config.MAX_SESSIONS}
    />
  );
}
