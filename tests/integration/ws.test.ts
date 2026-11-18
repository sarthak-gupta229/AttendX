import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server as HttpServer } from "node:http";
import { WebSocket } from "ws";
import { AddressInfo } from "node:net";
import { MongoClient, ObjectId } from "mongodb";
import { config } from "@/lib/config";
import { attachWebSocketServer } from "@/lib/realtime/wsServer";
import { signSession } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies";
import { refreshSnapshot } from "@/lib/sessions/snapshot";

class TestClient {
  ws: WebSocket;
  messages: any[] = [];
  private waiters: Array<() => void> = [];

  constructor(url: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(url, { headers });
    this.ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this.messages.push(parsed);
        for (const waiter of [...this.waiters]) {
          waiter();
        }
      } catch {
        // ignore
      }
    });
  }

  waitUntilOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
  }

  send(data: string) {
    this.ws.send(data);
  }

  close() {
    this.ws.close();
  }

  waitForMessage(predicate: (msg: any) => boolean, timeoutMs = 8000): Promise<any> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(check);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms. Received: ${JSON.stringify(this.messages)}`
          )
        );
      }, timeoutMs);

      const check = () => {
        const item = this.messages.find(predicate);
        if (item) {
          clearTimeout(timer);
          const idx = this.waiters.indexOf(check);
          if (idx !== -1) this.waiters.splice(idx, 1);
          resolve(item);
        }
      };

      this.waiters.push(check);
    });
  }
}

describe("Realtime WebSocket Integration Tests", () => {
  let server: HttpServer;
  let wsUrl: string;
  let mongoClient: MongoClient;
  let operatorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoClient = new MongoClient(config.MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db(config.MONGODB_DB);

    // Clean up any lingering test sessions
    await db.collection("sessions").deleteMany({ name: { $regex: /^Test/ } });
    await refreshSnapshot();

    operatorToken = await signSession({
      sub: new ObjectId().toHexString(),
      role: "operator",
    });

    adminToken = await signSession({
      sub: new ObjectId().toHexString(),
      role: "admin",
    });

    server = createServer((_req, res) => {
      res.writeHead(200);
      res.end("OK");
    });
    attachWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        wsUrl = `ws://localhost:${port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (mongoClient) {
      const db = mongoClient.db(config.MONGODB_DB);
      await db.collection("sessions").deleteMany({ name: { $regex: /^Test/ } });
      await mongoClient.close();
    }
  });

  function createClient(token?: string, origin = config.APP_ORIGIN): TestClient {
    const headers: Record<string, string> = { Origin: origin };
    if (token) {
      headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
    }
    return new TestClient(wsUrl, headers);
  }

  it("Anonymous socket receives state with canEdit: false, and sending 'in' returns 'forbidden'", async () => {
    const anon = createClient();
    await anon.waitUntilOpen();

    const stateMsg = await anon.waitForMessage((m) => m.type === "state");
    expect(stateMsg.canEdit).toBe(false);
    expect(Array.isArray(stateMsg.sessions)).toBe(true);

    anon.send(JSON.stringify({ type: "in", id: new ObjectId().toHexString() }));
    const errorMsg = await anon.waitForMessage((m) => m.type === "error");
    expect(errorMsg.code).toBe("forbidden");

    anon.close();
  });

  it("Operator in and out update the count and broadcast to every socket", async () => {
    const anon = createClient();
    const op = createClient(operatorToken);
    await Promise.all([anon.waitUntilOpen(), op.waitUntilOpen()]);

    await anon.waitForMessage((m) => m.type === "state");
    await op.waitForMessage((m) => m.type === "state");

    const sessionName = `Test Physics ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name: sessionName }));

    const afterAdd = await anon.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === sessionName)
    );
    const session = afterAdd.sessions.find((s: any) => s.name === sessionName);
    expect(session.count).toBe(0);

    // Operator sends 'in'
    op.send(JSON.stringify({ type: "in", id: session.id }));
    const afterIn = await anon.waitForMessage(
      (m) => m.type === "state" && m.sessions.find((s: any) => s.id === session.id)?.count === 1
    );
    expect(afterIn.sessions.find((s: any) => s.id === session.id).count).toBe(1);

    // Operator sends 'out'
    op.send(JSON.stringify({ type: "out", id: session.id }));
    const afterOut = await anon.waitForMessage(
      (m) => m.type === "state" && m.sessions.find((s: any) => s.id === session.id)?.count === 0
    );
    expect(afterOut.sessions.find((s: any) => s.id === session.id).count).toBe(0);

    // Cleanup session
    op.send(JSON.stringify({ type: "remove", id: session.id }));
    await op.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session.id)
    );

    anon.close();
    op.close();
  });

  it("Count clamps at zero when Out is pressed at 0", async () => {
    const op = createClient(operatorToken);
    await op.waitUntilOpen();
    await op.waitForMessage((m) => m.type === "state");

    const name = `Test Zero Clamp ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name }));
    const state = await op.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === name)
    );
    const session = state.sessions.find((s: any) => s.name === name);
    expect(session.count).toBe(0);

    // Decrement at 0
    op.send(JSON.stringify({ type: "out", id: session.id }));
    const afterOut = await op.waitForMessage(
      (m) => m.type === "state" && m.sessions.find((s: any) => s.id === session.id)
    );
    expect(afterOut.sessions.find((s: any) => s.id === session.id).count).toBe(0);

    // Cleanup
    op.send(JSON.stringify({ type: "remove", id: session.id }));
    await op.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session.id)
    );

    op.close();
  });

  it("Reaction from both operators and anonymous viewers broadcasts to all sockets", async () => {
    const anon = createClient();
    const op = createClient(operatorToken);
    await Promise.all([anon.waitUntilOpen(), op.waitUntilOpen()]);

    const name = `Test Reaction ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name }));
    const state = await op.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === name)
    );
    const session = state.sessions.find((s: any) => s.name === name);

    // Operator reacts
    op.send(JSON.stringify({ type: "react", id: session.id, emoji: "😂" }));
    const reactMsg = await anon.waitForMessage((m) => m.type === "react");
    expect(reactMsg.id).toBe(session.id);
    expect(reactMsg.emoji).toBe("😂");

    // Anonymous reacts -> broadcasts to all
    anon.send(JSON.stringify({ type: "react", id: session.id, emoji: "😢" }));
    const anonReactMsg = await op.waitForMessage((m) => m.type === "react" && m.emoji === "😢");
    expect(anonReactMsg.id).toBe(session.id);
    expect(anonReactMsg.emoji).toBe("😢");

    // Cleanup
    op.send(JSON.stringify({ type: "remove", id: session.id }));
    await op.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session.id)
    );

    anon.close();
    op.close();
  });

  it("Two operators each send 50 'in' messages: final count is exactly 100 with no lost updates", async () => {
    const op1 = createClient(operatorToken);
    const op2 = createClient(adminToken);
    await Promise.all([op1.waitUntilOpen(), op2.waitUntilOpen()]);

    const name = `Test Concurrency ${Date.now()}`;
    op1.send(JSON.stringify({ type: "add", name }));
    const state = await op1.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === name)
    );
    const session = state.sessions.find((s: any) => s.name === name);

    // Send 50 from op1 and 50 from op2 concurrently
    for (let i = 0; i < 50; i++) {
      op1.send(JSON.stringify({ type: "in", id: session.id }));
      op2.send(JSON.stringify({ type: "in", id: session.id }));
    }

    // Wait for count to reach 100
    const finalState = await op1.waitForMessage(
      (m) => m.type === "state" && m.sessions.find((s: any) => s.id === session.id)?.count === 100,
      20000
    );

    expect(finalState.sessions.find((s: any) => s.id === session.id).count).toBe(100);

    // Cleanup
    op1.send(JSON.stringify({ type: "remove", id: session.id }));
    await op1.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session.id)
    );

    op1.close();
    op2.close();
  }, 25000);

  it("Invalid JSON does not crash the server and returns bad_request", async () => {
    const op = createClient(operatorToken);
    await op.waitUntilOpen();
    await op.waitForMessage((m) => m.type === "state");

    op.send("NOT_VALID_JSON{:::{{");
    const errorMsg = await op.waitForMessage((m) => m.type === "error");
    expect(errorMsg.code).toBe("bad_request");

    // Verify still functional
    const name = `Test Still Alive ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name }));
    const state = await op.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === name)
    );
    const session = state.sessions.find((s: any) => s.name === name);
    expect(session).toBeDefined();

    // Cleanup
    op.send(JSON.stringify({ type: "remove", id: session.id }));
    await op.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session.id)
    );

    op.close();
  });

  it("Removing a session, then sending 'in' for it, returns not_found", async () => {
    const op = createClient(operatorToken);
    await op.waitUntilOpen();
    await op.waitForMessage((m) => m.type === "state");

    const name = `Test Delete Target ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name }));
    const state = await op.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === name)
    );
    const session = state.sessions.find((s: any) => s.name === name);

    // Remove
    op.send(JSON.stringify({ type: "remove", id: session.id }));
    await op.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session.id)
    );

    // Send 'in' for removed session
    op.send(JSON.stringify({ type: "in", id: session.id }));
    const errorMsg = await op.waitForMessage((m) => m.type === "error");
    expect(errorMsg.code).toBe("not_found");

    op.close();
  });

  it("Enforces session cap and returns limit_reached when MAX_SESSIONS reached", async () => {
    const op = createClient(operatorToken);
    await op.waitUntilOpen();
    const initialState = await op.waitForMessage((m) => m.type === "state");

    const currentCount = initialState.sessions.length;
    const originalMax = config.MAX_SESSIONS;
    (config as any).MAX_SESSIONS = currentCount + 1;

    const name1 = `Test Cap 1 ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name: name1 }));
    const state = await op.waitForMessage(
      (m) => m.type === "state" && m.sessions.some((s: any) => s.name === name1)
    );
    const session1 = state.sessions.find((s: any) => s.name === name1);

    // Next add should fail with limit_reached
    const name2 = `Test Cap 2 ${Date.now()}`;
    op.send(JSON.stringify({ type: "add", name: name2 }));
    const errorMsg = await op.waitForMessage((m) => m.type === "error");
    expect(errorMsg.code).toBe("limit_reached");

    // Restore limit
    (config as any).MAX_SESSIONS = originalMax;

    // Cleanup session1
    op.send(JSON.stringify({ type: "remove", id: session1.id }));
    await op.waitForMessage(
      (m) => m.type === "state" && !m.sessions.some((s: any) => s.id === session1.id)
    );

    op.close();
  });
});
