import { getSessionsCollection, SessionDocument } from "../db/collections";

export interface SessionDTO {
  id: string;
  name: string;
  count: number;
  position: number;
}

let inMemorySessions: SessionDTO[] = [];
let isLoaded = false;

function toDTO(doc: SessionDocument): SessionDTO {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    count: doc.count,
    position: doc.position,
  };
}

export async function refreshSnapshot(): Promise<SessionDTO[]> {
  const sessionsCol = await getSessionsCollection();
  const docs = await sessionsCol.find({}).sort({ position: 1 }).toArray();
  inMemorySessions = docs.map(toDTO);
  isLoaded = true;
  return inMemorySessions;
}

export async function getSnapshot(): Promise<SessionDTO[]> {
  if (!isLoaded) {
    return refreshSnapshot();
  }
  return inMemorySessions;
}

export function getCachedSnapshot(): SessionDTO[] {
  return inMemorySessions;
}

export function isSessionInSnapshot(id: string): boolean {
  return inMemorySessions.some((s) => s.id === id);
}
