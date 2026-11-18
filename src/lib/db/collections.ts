import { Collection, ObjectId } from "mongodb";
import { getDb } from "./client";

export type UserRole = "operator" | "admin";

export interface UserDocument {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  disabled: boolean;
}

export interface SessionDocument {
  _id: ObjectId;
  name: string;
  count: number;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId | null;
}

export interface SessionLogDocument {
  _id: ObjectId;
  sessionId: ObjectId;
  userId: ObjectId;
  action: "add" | "remove" | "rename" | "in" | "out";
  before?: number;
  after?: number;
  at: Date;
}

export async function getUsersCollection(): Promise<Collection<UserDocument>> {
  const db = await getDb();
  return db.collection<UserDocument>("users");
}

export async function getSessionsCollection(): Promise<Collection<SessionDocument>> {
  const db = await getDb();
  return db.collection<SessionDocument>("sessions");
}

export async function getSessionLogCollection(): Promise<Collection<SessionLogDocument>> {
  const db = await getDb();
  return db.collection<SessionLogDocument>("session_log");
}

export async function ensureIndexes(): Promise<void> {
  const users = await getUsersCollection();
  await users.createIndex({ email: 1 }, { unique: true });

  const sessions = await getSessionsCollection();
  await sessions.createIndex({ position: 1 });

  const logs = await getSessionLogCollection();
  await logs.createIndex({ sessionId: 1, at: -1 });
}
