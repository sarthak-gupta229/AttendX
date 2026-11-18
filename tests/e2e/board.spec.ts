import { test, expect } from "@playwright/test";
import { MongoClient } from "mongodb";
import { hashPassword } from "../../src/lib/auth/password";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || "";
const MONGODB_DB = process.env.MONGODB_DB || "live_session_counter";

test.beforeAll(async () => {
  if (!MONGODB_URI) return;
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const users = db.collection("users");
    const existing = await users.findOne({ email: "operator@example.com" });
    if (!existing) {
      const passwordHash = await hashPassword("operator123");
      await users.insertOne({
        email: "operator@example.com",
        passwordHash,
        role: "operator",
        createdAt: new Date(),
        disabled: false,
      });
    }

    // Ensure at least one session exists for public viewing
    const sessions = db.collection("sessions");
    const count = await sessions.countDocuments();
    if (count === 0) {
      await sessions.insertOne({
        name: "Welcome Hall",
        count: 5,
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null,
      });
    }
  } finally {
    await client.close();
  }
});

test.describe("Headcount Live Board", () => {
  test("Public visitor sees sessions and counts without any mutating operator controls", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Dismiss startup screen if present
    const startup = page.locator('[role="dialog"]');
    if (await startup.isVisible()) {
      await startup.click();
    }

    // Title should be visible
    await expect(page.locator("h1")).toContainText("AttendX");

    // Mutating controls must NOT be visible to public visitors
    await expect(page.getByRole("button", { name: /Student in|\+ IN/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Student out|− OUT/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Delete session/i })).toHaveCount(0);
    await expect(page.getByPlaceholder(/New session name/i)).toHaveCount(0);

    // Emojis are open to all visitors per user specification
    await expect(page.getByRole("button", { name: /React with laugh/i })).toBeVisible();

    // Login link should be present
    await expect(page.getByRole("link", { name: /Log in/i })).toBeVisible();

    // Verify no horizontal overflow/scroll
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("Interactive touch targets meet 44px minimum sizing", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Submit button >= 44px
    const submitBtn = page.getByRole("button", { name: /Sign In/i });
    const btnBox = await submitBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    if (btnBox) {
      expect(btnBox.height).toBeGreaterThanOrEqual(44);
    }

    // Inputs >= 44px
    const emailInput = page.locator("#email");
    const emailBox = await emailInput.boundingBox();
    expect(emailBox).not.toBeNull();
    if (emailBox) {
      expect(emailBox.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("Operator login, realtime count increment, reaction, and multi-client broadcast", async ({
    browser,
  }) => {
    // Context 1: Public visitor
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/");
    await publicPage.waitForLoadState("networkidle");
    const pubStartup = publicPage.locator('[role="dialog"]');
    if (await pubStartup.isVisible()) {
      await pubStartup.click();
    }

    // Context 2: Operator
    const opContext = await browser.newContext();
    const opPage = await opContext.newPage();

    opPage.on("console", (msg) => console.log(`[OP BROWSER]:`, msg.text()));
    opPage.on("pageerror", (err) => console.error(`[OP ERROR]:`, err));

    // Log in as operator
    await opPage.goto("/login");
    await opPage.fill("#email", "operator@example.com");
    await opPage.fill("#password", "operator123");
    await opPage.click('button[type="submit"]');

    // Should redirect to / and show operator controls
    await opPage.waitForURL("**/");
    const opStartup = opPage.locator('[role="dialog"]');
    if (await opStartup.isVisible()) {
      await opStartup.click();
    }
    await expect(opPage.getByText("Signed in as operator")).toBeVisible();

    // Add a unique test session via + ADD tab
    const testSessionName = `Room${Date.now().toString().slice(-4)}`;
    await opPage.click('button:has-text("+ ADD")');
    await opPage.fill('input[placeholder*="New session name"]', testSessionName);
    await opPage.click('button:has-text("+ Add Session")');

    // Verify session appears on operator page
    const opCard = opPage.locator(`[data-session-id]:has-text("${testSessionName}")`);
    await expect(opCard.first()).toBeVisible({ timeout: 10000 });

    // Operator clicks "+ IN [A]"
    const inBtn = opPage.getByRole("button", { name: /Student in|\+ IN/i });
    await inBtn.click();

    // Count updates to 1 on operator screen
    await expect(opPage.locator('[aria-label*="1 present"]')).toBeVisible({ timeout: 5000 });

    // Operator triggers reaction 😂
    const laughBtn = opPage.getByRole("button", { name: /React with laugh/i });
    await laughBtn.click();

    // Toast notification displays the single emoji without message
    await expect(opPage.locator('[data-rht-toaster]')).toContainText("😂", { timeout: 5000 });
    await expect(publicPage.locator('[data-rht-toaster]')).toContainText("😂", { timeout: 5000 });

    // Operator logs out
    await opPage.click('button:has-text("Log Out")');
    await expect(opPage.getByRole("link", { name: /Log in/i })).toBeVisible();

    await publicContext.close();
    await opContext.close();
  });
});
