import { createServer } from "node:http";
import next from "next";
import { config } from "./src/lib/config";
import { ensureIndexes } from "./src/lib/db/collections";
import { refreshSnapshot } from "./src/lib/sessions/snapshot";
import { attachWebSocketServer } from "./src/lib/realtime/wsServer";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = config.PORT;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function start() {
  try {
    console.log("Starting server in", config.NODE_ENV, "mode...");

    // 1. Validate DB connection & ensure indexes
    console.log("Connecting to database & ensuring indexes...");
    await ensureIndexes();
    console.log("Database connected & indexes ensured.");

    // 2. Load snapshot from MongoDB
    console.log("Loading snapshot into memory...");
    const snapshot = await refreshSnapshot();
    console.log(`Loaded ${snapshot.length} session(s) into snapshot.`);

    // 3. Prepare Next.js
    await app.prepare();

    // 4. Create HTTP Server
    const server = createServer((req, res) => {
      handle(req, res);
    });

    // 5. Attach WebSocket Server
    attachWebSocketServer(server);

    // 6. Start listening
    server.listen(config.PORT, () => {
      console.log(`> Ready on http://localhost:${config.PORT}`);
      console.log(`> WebSockets ready on ws://localhost:${config.PORT}/ws`);
    });
  } catch (err) {
    console.error("Fatal error during server startup:", err);
    process.exit(1);
  }
}

start();
