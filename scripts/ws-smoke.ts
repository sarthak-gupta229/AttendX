import { WebSocket } from "ws";
import { config } from "../src/lib/config";
import { signSession } from "../src/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookies";

const PORT = config.PORT || 3000;
const WS_URL = `ws://localhost:${PORT}/ws`;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSmoke() {
  console.log("=== STARTING WEBSOCKET SMOKE TESTS ===");
  console.log(`Connecting to ${WS_URL}`);

  // Test 1: Anonymous Connection
  console.log("\n[Test 1] Anonymous connection...");
  const anonWs = new WebSocket(WS_URL);

  let anonReceivedState = false;
  let anonCanEdit: boolean = true;
  let anonForbiddenReceived = false;

  await new Promise<void>((resolve, reject) => {
    anonWs.on("open", () => {
      console.log("✓ Anonymous connected");
    });

    anonWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "state") {
        anonReceivedState = true;
        anonCanEdit = msg.canEdit;
        console.log(`✓ Received state: ${msg.sessions.length} sessions, canEdit: ${msg.canEdit}`);

        // Try mutating as anonymous
        anonWs.send(JSON.stringify({ type: "in", id: "507f1f77bcf86cd799439011" }));
      } else if (msg.type === "error" && msg.code === "forbidden") {
        anonForbiddenReceived = true;
        console.log("✓ Received expected 'forbidden' error for anonymous mutation attempt");
        anonWs.close();
        resolve();
      }
    });

    anonWs.on("error", (err) => {
      reject(err);
    });

    setTimeout(() => {
      if (!anonForbiddenReceived) {
        anonWs.close();
        reject(new Error("Anonymous test timed out waiting for forbidden error"));
      }
    }, 5000);
  });

  if (!anonReceivedState || anonCanEdit || !anonForbiddenReceived) {
    throw new Error("Anonymous smoke test failed!");
  }

  // Test 2: Authenticated Operator Connection
  console.log("\n[Test 2] Operator connection...");
  const testUserId = "507f1f77bcf86cd799439099";
  const token = await signSession({ sub: testUserId, role: "operator" });

  const opWs = new WebSocket(WS_URL, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      Origin: config.APP_ORIGIN,
    },
  });

  let createdSessionId: string | null = null;
  const testSessionName = `Smoke Test ${Date.now()}`;
  let currentStep: "init" | "in_sent" | "out_sent" | "rename_sent" | "react_sent" | "done" = "init";

  await new Promise<void>((resolve, reject) => {
    opWs.on("open", () => {
      console.log("✓ Operator connected with cookie");
    });

    opWs.on("message", async (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "state") {
        if (currentStep === "init") {
          console.log(`✓ Operator received initial state, canEdit: ${msg.canEdit}`);
          if (!msg.canEdit) {
            reject(new Error("Expected canEdit to be true for operator"));
            return;
          }
          console.log(`Adding session "${testSessionName}"...`);
          currentStep = "in_sent";
          opWs.send(JSON.stringify({ type: "add", name: testSessionName }));
          return;
        }

        // Find the created session
        if (!createdSessionId) {
          const found = msg.sessions.find((s: any) => s.name === testSessionName);
          if (found) {
            createdSessionId = found.id;
            console.log(`✓ Session successfully created with ID: ${createdSessionId}`);
            console.log("Testing IN mutation...");
            opWs.send(JSON.stringify({ type: "in", id: createdSessionId }));
          }
          return;
        }

        const session = msg.sessions.find((s: any) => s.id === createdSessionId);
        if (!session) return;

        if (currentStep === "in_sent" && session.count === 1) {
          console.log("✓ IN mutation confirmed, count is 1. Testing OUT mutation...");
          currentStep = "out_sent";
          opWs.send(JSON.stringify({ type: "out", id: createdSessionId }));
        } else if (currentStep === "out_sent" && session.count === 0) {
          console.log("✓ OUT mutation confirmed, count is 0. Testing RENAME mutation...");
          currentStep = "rename_sent";
          opWs.send(
            JSON.stringify({
              type: "rename",
              id: createdSessionId,
              name: `${testSessionName} Renamed`,
            })
          );
        } else if (currentStep === "rename_sent" && session.name.endsWith("Renamed")) {
          console.log("✓ RENAME mutation confirmed. Testing REACT mutation...");
          currentStep = "react_sent";
          opWs.send(
            JSON.stringify({
              type: "react",
              id: createdSessionId,
              emoji: "😂",
            })
          );
        }
      } else if (msg.type === "react") {
        console.log(`✓ Received reaction broadcast: ${msg.emoji} for session ${msg.id}`);
        if (createdSessionId && currentStep === "react_sent") {
          currentStep = "done";
          console.log("Cleaning up: removing session...");
          opWs.send(JSON.stringify({ type: "remove", id: createdSessionId }));
          await delay(500);
          opWs.close();
          resolve();
        }
      } else if (msg.type === "error") {
        console.error("Unexpected error message:", msg);
        reject(new Error(`Server returned error: ${msg.code} - ${msg.message}`));
      }
    });

    opWs.on("error", (err) => {
      reject(err);
    });

    setTimeout(() => {
      opWs.close();
      reject(new Error(`Operator test timed out at step ${currentStep}`));
    }, 10000);
  });

  console.log("\n=== ALL WEBSOCKET SMOKE TESTS PASSED! ===");
}

runSmoke().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
