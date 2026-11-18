import { describe, it, expect } from "vitest";
import { enqueue } from "@/lib/realtime/queue";

describe("Serial Mutation Queue", () => {
  it("runs asynchronous tasks sequentially in FIFO order", async () => {
    const order: number[] = [];

    const p1 = enqueue(async () => {
      await new Promise((r) => setTimeout(r, 40));
      order.push(1);
      return 1;
    });

    const p2 = enqueue(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(2);
      return 2;
    });

    const p3 = enqueue(async () => {
      order.push(3);
      return 3;
    });

    const results = await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("continues processing subsequent tasks even if one throws an error", async () => {
    const results: string[] = [];

    const p1 = enqueue(async () => {
      results.push("first");
      return "first";
    });

    const p2 = enqueue(async () => {
      throw new Error("Task failed");
    });

    const p3 = enqueue(async () => {
      results.push("third");
      return "third";
    });

    await expect(p1).resolves.toBe("first");
    await expect(p2).rejects.toThrow("Task failed");
    await expect(p3).resolves.toBe("third");

    expect(results).toEqual(["first", "third"]);
  });
});
