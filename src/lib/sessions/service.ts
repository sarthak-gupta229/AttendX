import { ObjectId } from "mongodb";
import { config } from "../config";
import {
  getSessionsCollection,
  getSessionLogCollection,
  SessionDocument,
} from "../db/collections";
import { refreshSnapshot } from "./snapshot";
import { ErrorCode } from "../realtime/protocol";

export class ServiceError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function addSession(name: string, userId: string): Promise<SessionDocument> {
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 40) {
    throw new ServiceError("bad_request", "Session name must be between 1 and 40 characters");
  }

  const sessionsCol = await getSessionsCollection();
  const currentCount = await sessionsCol.countDocuments();
  if (currentCount >= config.MAX_SESSIONS) {
    throw new ServiceError("limit_reached", `Limit of ${config.MAX_SESSIONS} sessions reached.`);
  }

  // Find max position
  const maxPosDoc = await sessionsCol
    .find({})
    .sort({ position: -1 })
    .limit(1)
    .toArray();
  const nextPosition = maxPosDoc.length > 0 ? maxPosDoc[0].position + 1 : 0;

  const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;
  const newSession: SessionDocument = {
    _id: new ObjectId(),
    name: trimmedName,
    count: 0,
    position: nextPosition,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: userObjectId,
  };

  await sessionsCol.insertOne(newSession);

  // Audit log
  if (userObjectId) {
    const logsCol = await getSessionLogCollection();
    await logsCol.insertOne({
      _id: new ObjectId(),
      sessionId: newSession._id,
      userId: userObjectId,
      action: "add",
      at: new Date(),
    });
  }

  await refreshSnapshot();
  return newSession;
}

export async function removeSession(id: string, userId: string): Promise<void> {
  if (!ObjectId.isValid(id)) {
    throw new ServiceError("bad_request", "Invalid session ID");
  }

  const sessionObjectId = new ObjectId(id);
  const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;
  const sessionsCol = await getSessionsCollection();

  const res = await sessionsCol.deleteOne({ _id: sessionObjectId });
  if (res.deletedCount === 0) {
    throw new ServiceError("not_found", "Session not found");
  }

  // Audit log
  if (userObjectId) {
    const logsCol = await getSessionLogCollection();
    await logsCol.insertOne({
      _id: new ObjectId(),
      sessionId: sessionObjectId,
      userId: userObjectId,
      action: "remove",
      at: new Date(),
    });
  }

  await refreshSnapshot();
}

export async function renameSession(id: string, name: string, userId: string): Promise<void> {
  if (!ObjectId.isValid(id)) {
    throw new ServiceError("bad_request", "Invalid session ID");
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 40) {
    throw new ServiceError("bad_request", "Session name must be between 1 and 40 characters");
  }

  const sessionObjectId = new ObjectId(id);
  const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;
  const sessionsCol = await getSessionsCollection();

  const res = await sessionsCol.updateOne(
    { _id: sessionObjectId },
    {
      $set: {
        name: trimmedName,
        updatedAt: new Date(),
        updatedBy: userObjectId,
      },
    }
  );

  if (res.matchedCount === 0) {
    throw new ServiceError("not_found", "Session not found");
  }

  // Audit log
  if (userObjectId) {
    const logsCol = await getSessionLogCollection();
    await logsCol.insertOne({
      _id: new ObjectId(),
      sessionId: sessionObjectId,
      userId: userObjectId,
      action: "rename",
      at: new Date(),
    });
  }

  await refreshSnapshot();
}

export async function applyCountChange(
  id: string,
  action: "in" | "out",
  userId: string
): Promise<number> {
  if (!ObjectId.isValid(id)) {
    throw new ServiceError("bad_request", "Invalid session ID");
  }

  const sessionObjectId = new ObjectId(id);
  const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;
  const sessionsCol = await getSessionsCollection();

  const before = await sessionsCol.findOne({ _id: sessionObjectId });
  if (!before) {
    throw new ServiceError("not_found", "Session not found");
  }

  const delta = action === "in" ? 1 : -1;

  const res = await sessionsCol.findOneAndUpdate(
    { _id: sessionObjectId },
    [
      {
        $set: {
          count: { $max: [0, { $add: ["$count", delta] }] },
          updatedAt: "$$NOW",
          updatedBy: userObjectId,
        },
      },
    ],
    { returnDocument: "after" }
  );

  if (!res) {
    throw new ServiceError("not_found", "Session not found");
  }

  const afterCount = res.count;

  // Audit log
  if (userObjectId) {
    const logsCol = await getSessionLogCollection();
    await logsCol.insertOne({
      _id: new ObjectId(),
      sessionId: sessionObjectId,
      userId: userObjectId,
      action,
      before: before.count,
      after: afterCount,
      at: new Date(),
    });
  }

  await refreshSnapshot();
  return afterCount;
}
