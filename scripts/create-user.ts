import readline from "node:readline";
import { createUser, findUserByEmail } from "../src/lib/db/users";
import { UserRole } from "../src/lib/db/collections";
import { ensureIndexes } from "../src/lib/db/collections";
import { getMongoClient } from "../src/lib/db/client";

function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    process.stdout.write(prompt);

    // Mute output when typing password
    let password = "";
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    const onData = (buffer: Buffer) => {
      const char = buffer.toString("utf8");

      if (char === "\n" || char === "\r" || char === "\u0004") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(password);
      } else if (char === "\u0003") {
        // Ctrl+C
        process.exit(1);
      } else if (char === "\u0008" || char === "\x7f") {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else {
        password += char;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const role = (args[1] || "operator") as UserRole;
  const envPassword = process.env.USER_PASSWORD || args[2];

  if (!email || !["operator", "admin"].includes(role)) {
    console.error("Usage: npm run create-user -- <email> <operator|admin> [password]");
    process.exit(1);
  }

  await ensureIndexes();

  const existing = await findUserByEmail(email);
  if (existing) {
    console.error(`User with email "${email}" already exists.`);
    process.exit(1);
  }

  let password = envPassword;
  if (!password) {
    password = await readPassword(`Enter password for ${email}: `);
  }

  if (!password || password.trim().length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  const user = await createUser({
    email,
    password,
    role,
  });

  console.log(`Created user ${user.email} (${user.role}) with ID ${user._id}`);

  const client = await getMongoClient();
  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating user:", err);
  process.exit(1);
});
