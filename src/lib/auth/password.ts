import argon2 from "argon2";
import bcrypt from "bcryptjs";

// Pre-computed dummy hash to prevent timing attacks when email is not found
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dHVtbXlzYWx0MTIzNDU2$0123456789abcdefghijklmnopqrstuvwxyz";

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  } catch {
    // Fallback to bcryptjs if argon2 fails for any reason
    return await bcrypt.hash(password, 12);
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2")) {
      return await argon2.verify(hash, password);
    }
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function verifyDummyPassword(): Promise<boolean> {
  try {
    await argon2.verify(DUMMY_HASH, "dummy_password_for_timing_safety");
  } catch {
    // Ignore error
  }
  return false;
}
