import { z } from "zod";
import { ObjectId } from "mongodb";
import { SessionDTO } from "../sessions/snapshot";

export type { SessionDTO };

export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "limit_reached"
  | "rate_limited"
  | "server_error";

export type ClientMsg =
  | { type: "add"; name: string }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "in"; id: string }
  | { type: "out"; id: string }
  | { type: "react"; id: string; emoji: "😂" | "😢" };

export type ServerMsg =
  | {
      type: "state";
      sessions: SessionDTO[];
      maxSessions: number;
      canEdit: boolean;
    }
  | { type: "react"; id: string; emoji: "😂" | "😢" }
  | { type: "error"; code: ErrorCode; message: string };

const objectIdSchema = z.string().refine((val) => ObjectId.isValid(val), {
  message: "Invalid ObjectId format",
});

export const clientMsgSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    name: z.string().trim().min(1).max(40),
  }),
  z.object({
    type: z.literal("remove"),
    id: objectIdSchema,
  }),
  z.object({
    type: z.literal("rename"),
    id: objectIdSchema,
    name: z.string().trim().min(1).max(40),
  }),
  z.object({
    type: z.literal("in"),
    id: objectIdSchema,
  }),
  z.object({
    type: z.literal("out"),
    id: objectIdSchema,
  }),
  z.object({
    type: z.literal("react"),
    id: objectIdSchema,
    emoji: z.union([z.literal("😂"), z.literal("😢")]),
  }),
]);

/**
 * Protocol architectural decision:
 * In this app, each connected WebSocket client has an associated authentication status (canEdit).
 * When broadcasting a "state" message to all connected clients, we send each socket a state message
 * with its tailored `canEdit` property (true for operators/admins, false for anonymous public visitors),
 * keeping the contract simple and self-contained with no extra handshakes.
 */
