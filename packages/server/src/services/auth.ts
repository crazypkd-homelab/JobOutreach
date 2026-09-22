import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

type UserRow = typeof users.$inferSelect;

export class UsernameTakenError extends Error {
  constructor(readonly username: string) {
    super(`Username ${username} is already taken`);
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid username or password");
  }
}

const SALT_LEN = 16;
const HASH_LEN = 64;
const SEP = ":";

/** Scrypt-based hash in the format "salt:hash" (both base64). */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(password, salt, HASH_LEN);
  return `${salt.toString("base64")}${SEP}${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(SEP);
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0]!, "base64");
  const hash = Buffer.from(parts[1]!, "base64");
  if (salt.length !== SALT_LEN || hash.length !== HASH_LEN) return false;
  const computed = scryptSync(password, salt, HASH_LEN);
  return timingSafeEqual(computed, hash);
}

export class AuthService {
  constructor(private readonly db: Db) {}

  hasUsers(): boolean {
    return this.count() > 0;
  }

  count(): number {
    return this.db.select().from(users).limit(1).all().length;
  }

  findByUsername(username: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.username, username)).get();
  }

  createUser(username: string, password: string): UserRow {
    if (this.findByUsername(username)) throw new UsernameTakenError(username);
    return this.db
      .insert(users)
      .values({ username, passwordHash: hashPassword(password) })
      .returning()
      .get();
  }

  authenticate(username: string, password: string): UserRow {
    const user = this.findByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new InvalidCredentialsError();
    }
    return user;
  }
}
