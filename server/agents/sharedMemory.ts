/**
 * Shared Memory Layer
 * Wraps the existing app_settings table as a typed key-value store for agents.
 * All agent keys are namespaced with "agent:" prefix to avoid collisions.
 */
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/** Build a namespaced agent memory key */
export function agentKey(agentName: string, ...parts: string[]): string {
  return `agent:${agentName}:${parts.join(":")}`;
}

/** Get a value from agent memory. Returns null if not found. */
export async function memGet(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

/** Set a value in agent memory (upsert) */
export async function memSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const existing = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    if (existing.length > 0) {
      await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
  } catch (err) {
    console.error("[SharedMemory] memSet failed:", err);
  }
}

/** Delete a value from agent memory */
export async function memDel(key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  } catch (err) {
    console.error("[SharedMemory] memDel failed:", err);
  }
}

/** Get a value and parse it as JSON. Returns null if not found or parse fails. */
export async function memGetJson<T>(key: string): Promise<T | null> {
  const raw = await memGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Set a value as serialized JSON */
export async function memSetJson(key: string, value: unknown): Promise<void> {
  await memSet(key, JSON.stringify(value));
}
