import { Server as HttpServer, IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "../config";
import { parseCookies, SESSION_COOKIE_NAME } from "../auth/cookies";
import { verifySession, SessionPayload } from "../auth/jwt";
import {
  ClientMsg,
  clientMsgSchema,
  ServerMsg,
  ErrorCode,
} from "./protocol";
import { enqueue } from "./queue";
import { ReactionLimiter } from "./reactionLimiter";
import {
  addSession,
  removeSession,
  renameSession,
  applyCountChange,
  ServiceError,
} from "../sessions/service";
import { getSnapshot, isSessionInSnapshot } from "../sessions/snapshot";
import {
  incrementConnections,
  decrementConnections,
} from "./connectionTracker";

interface AuthenticatedSocket extends WebSocket {
  isAlive: boolean;
  canEdit: boolean;
  userId: string;
  reactionLimiter: ReactionLimiter;
  expiryTimer?: NodeJS.Timeout;
}

export function attachWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096, // 4KB limit from Section 13
  });

  // Heartbeat interval: ping every 25s
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedSocket;
      if (!client.isAlive) {
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, 25000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  server.on("upgrade", async (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== "/ws") {
      // Allow Next.js HMR or other upgrade handlers to take over
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    const origin = req.headers.origin;

    let session: SessionPayload | null = null;
    if (token) {
      // Check origin if session cookie is present
      if (origin && origin !== config.APP_ORIGIN) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      session = await verifySession(token);
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, session);
    });
  });

  async function broadcastState() {
    const sessions = await getSnapshot();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const authSocket = client as AuthenticatedSocket;
        const stateMsg: ServerMsg = {
          type: "state",
          sessions,
          maxSessions: config.MAX_SESSIONS,
          canEdit: authSocket.canEdit,
        };
        client.send(JSON.stringify(stateMsg));
      }
    });
  }

  function broadcastReaction(id: string, emoji: "😂" | "😢") {
    const reactMsg: ServerMsg = { type: "react", id, emoji };
    const payload = JSON.stringify(reactMsg);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  function sendError(client: WebSocket, code: ErrorCode, message: string) {
    if (client.readyState === WebSocket.OPEN) {
      const errorMsg: ServerMsg = { type: "error", code, message };
      client.send(JSON.stringify(errorMsg));
    }
  }

  wss.on("connection", async (ws: WebSocket, _req: IncomingMessage, session: SessionPayload | null) => {
    const client = ws as AuthenticatedSocket;
    client.isAlive = true;
    client.canEdit = session !== null;
    client.userId = session ? session.sub : "";
    client.reactionLimiter = new ReactionLimiter(300);

    incrementConnections();

    // Expired JWT timer
    if (session && session.exp) {
      const msUntilExpiry = session.exp * 1000 - Date.now();
      if (msUntilExpiry > 0) {
        client.expiryTimer = setTimeout(() => {
          sendError(client, "forbidden", "Session expired, log in again.");
          client.close(1008, "Session expired");
        }, msUntilExpiry);
      } else {
        client.canEdit = false;
        client.userId = "";
      }
    }

    client.on("pong", () => {
      client.isAlive = true;
    });

    client.on("close", () => {
      if (client.expiryTimer) clearTimeout(client.expiryTimer);
      decrementConnections();
    });

    // Send immediate initial state
    try {
      const sessions = await getSnapshot();
      const initialMsg: ServerMsg = {
        type: "state",
        sessions,
        maxSessions: config.MAX_SESSIONS,
        canEdit: client.canEdit,
      };
      client.send(JSON.stringify(initialMsg));
    } catch (err) {
      console.error("Error sending initial state:", err);
      sendError(client, "server_error", "Failed to load sessions state");
    }

    client.on("message", async (raw: Buffer) => {
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        sendError(client, "bad_request", "Invalid JSON");
        return;
      }

      const parseResult = clientMsgSchema.safeParse(json);
      if (!parseResult.success) {
        sendError(client, "bad_request", "Invalid message schema");
        return;
      }

      const msg: ClientMsg = parseResult.data;

      // Reaction is ephemeral - any viewer or operator can send emojis, with no rate limit
      if (msg.type === "react") {
        if (!isSessionInSnapshot(msg.id)) {
          sendError(client, "not_found", "Session not found");
          return;
        }

        broadcastReaction(msg.id, msg.emoji);
        return;
      }

      // Check permissions for mutations (add, remove, rename, in, out)
      if (!client.canEdit) {
        sendError(client, "forbidden", "Operator permissions required");
        return;
      }

      // Serial DB mutations
      try {
        await enqueue(async () => {
          if (msg.type === "add") {
            await addSession(msg.name, client.userId);
          } else if (msg.type === "remove") {
            await removeSession(msg.id, client.userId);
          } else if (msg.type === "rename") {
            await renameSession(msg.id, msg.name, client.userId);
          } else if (msg.type === "in" || msg.type === "out") {
            await applyCountChange(msg.id, msg.type, client.userId);
          }

          // Broadcast state upon success
          await broadcastState();
        });
      } catch (err) {
        if (err instanceof ServiceError) {
          sendError(client, err.code, err.message);
        } else {
          console.error("Mutation failed:", err);
          sendError(client, "server_error", "An unexpected error occurred");
        }
      }
    });
  });

  return wss;
}
