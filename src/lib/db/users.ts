import { ObjectId } from "mongodb";
import { getUsersCollection, UserDocument, UserRole } from "./collections";
import { hashPassword } from "../auth/password";

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
}

export async function createUser(input: CreateUserInput): Promise<UserDocument> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const users = await getUsersCollection();

  const userDoc: UserDocument = {
    _id: new ObjectId(),
    email,
    passwordHash,
    role: input.role,
    createdAt: new Date(),
    disabled: false,
  };

  await users.insertOne(userDoc);
  return userDoc;
}

export async function findUserByEmail(email: string): Promise<UserDocument | null> {
  const cleanEmail = email.trim().toLowerCase();
  const users = await getUsersCollection();
  return users.findOne({ email: cleanEmail });
}

export async function findUserById(id: string | ObjectId): Promise<UserDocument | null> {
  const objectId = typeof id === "string" ? new ObjectId(id) : id;
  const users = await getUsersCollection();
  return users.findOne({ _id: objectId });
}
