import { describe, it, expect } from "vitest";
import { clientMsgSchema } from "@/lib/realtime/protocol";

describe("Realtime Protocol Validation", () => {
  const validId = "507f1f77bcf86cd799439011";

  it("accepts valid 'add' messages", () => {
    const res = clientMsgSchema.safeParse({ type: "add", name: "Classroom A" });
    expect(res.success).toBe(true);
  });

  it("rejects 'add' with empty name or over 40 characters", () => {
    const emptyRes = clientMsgSchema.safeParse({ type: "add", name: "" });
    expect(emptyRes.success).toBe(false);

    const whitespaceRes = clientMsgSchema.safeParse({ type: "add", name: "    " });
    expect(whitespaceRes.success).toBe(false);

    const longRes = clientMsgSchema.safeParse({
      type: "add",
      name: "A".repeat(41),
    });
    expect(longRes.success).toBe(false);
  });

  it("accepts valid 'in' and 'out' messages", () => {
    const inRes = clientMsgSchema.safeParse({ type: "in", id: validId });
    expect(inRes.success).toBe(true);

    const outRes = clientMsgSchema.safeParse({ type: "out", id: validId });
    expect(outRes.success).toBe(true);
  });

  it("rejects messages with invalid ObjectId", () => {
    const res = clientMsgSchema.safeParse({ type: "in", id: "not-a-valid-id" });
    expect(res.success).toBe(false);
  });

  it("rejects messages that try to supply delta or count amounts", () => {
    // clientMsgSchema should only accept defined types and fields
    const res = clientMsgSchema.safeParse({
      type: "in",
      id: validId,
      delta: 5,
    });
    // Even if parsed, extra fields are stripped or not part of schema
    if (res.success) {
      expect((res.data as any).delta).toBeUndefined();
    }
  });

  it("accepts valid 'rename' and 'remove' messages", () => {
    const renameRes = clientMsgSchema.safeParse({
      type: "rename",
      id: validId,
      name: "New Name",
    });
    expect(renameRes.success).toBe(true);

    const removeRes = clientMsgSchema.safeParse({
      type: "remove",
      id: validId,
    });
    expect(removeRes.success).toBe(true);
  });

  it("accepts valid 'react' messages and rejects unknown emoji", () => {
    const laughRes = clientMsgSchema.safeParse({
      type: "react",
      id: validId,
      emoji: "😂",
    });
    expect(laughRes.success).toBe(true);

    const cryRes = clientMsgSchema.safeParse({
      type: "react",
      id: validId,
      emoji: "😢",
    });
    expect(cryRes.success).toBe(true);

    const badEmojiRes = clientMsgSchema.safeParse({
      type: "react",
      id: validId,
      emoji: "🔥",
    });
    expect(badEmojiRes.success).toBe(false);
  });
});
