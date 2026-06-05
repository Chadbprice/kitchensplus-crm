import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Sleep helper for retry backoff */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns true if the error is a transient TiDB schema-sync error.
 * TiDB occasionally returns "Information schema is out of date" right after
 * a DDL migration while the metadata lease propagates. These are safe to retry.
 */
function isTransientTiDBError(error: unknown): boolean {
  const msg = (error as any)?.message ?? "";
  const sqlMsg = (error as any)?.cause?.message ?? (error as any)?.sqlMessage ?? "";
  const combined = `${msg} ${sqlMsg}`;
  return (
    combined.includes("Information schema is out of date") ||
    combined.includes("schema failed to update") ||
    combined.includes("try again later")
  );
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] Cannot upsert user: database not available");
      return;
    }

    try {
      const values: InsertUser = { openId: user.openId };
      const updateSet: Record<string, unknown> = {};

      const textFields = ["name", "email", "loginMethod"] as const;
      type TextField = (typeof textFields)[number];

      const assignNullable = (field: TextField) => {
        const value = user[field];
        if (value === undefined) return;
        const normalized = value ?? null;
        values[field] = normalized;
        updateSet[field] = normalized;
      };

      textFields.forEach(assignNullable);

      if (user.lastSignedIn !== undefined) {
        values.lastSignedIn = user.lastSignedIn;
        updateSet.lastSignedIn = user.lastSignedIn;
      }

      if (user.role !== undefined) {
        values.role = user.role;
        updateSet.role = user.role;
      } else if (user.openId === ENV.ownerOpenId) {
        values.role = "admin";
        updateSet.role = "admin";
      }

      if (!values.lastSignedIn) {
        values.lastSignedIn = new Date();
      }

      if (Object.keys(updateSet).length === 0) {
        updateSet.lastSignedIn = new Date();
      }

      await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
      return; // success
    } catch (error) {
      if (isTransientTiDBError(error) && attempt < MAX_RETRIES) {
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 8000); // 500ms → 1s → 2s → 4s → 8s
        console.warn(
          `[Database] Transient TiDB schema error on attempt ${attempt}/${MAX_RETRIES}, retrying in ${delay}ms...`
        );
        await sleep(delay);
        // Drop the cached connection so a fresh one is obtained on the next attempt
        _db = null;
        continue;
      }
      console.error("[Database] Failed to upsert user:", error);
      throw error;
    }
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
