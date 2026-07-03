import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { settings } from "../schema.js";

export function getSetting(key: string): string | null {
  return (
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  );
}

export function upsertSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function deleteSetting(key: string) {
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function getAllSettings(): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
