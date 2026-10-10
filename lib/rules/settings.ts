import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  SETTINGS_KEYS,
  type BusinessSettings,
  type RubricText,
  type RuleSettings,
  type SettingsKey,
} from "./settings-schema";

// Load/save the editable rubric. Values are merged over defaults and validated, so a bad or partial
// saved value can never break the rule engine. Cached briefly; saving clears the cache.

type ValueOf<K extends SettingsKey> = K extends "rules" ? RuleSettings : K extends "rubric_text" ? RubricText : BusinessSettings;

const cache = new Map<SettingsKey, { at: number; value: unknown }>();
const TTL_MS = 30_000;

export async function getSettings<K extends SettingsKey>(key: K): Promise<ValueOf<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as ValueOf<K>;
  const { schema: zs, defaults } = SETTINGS_KEYS[key];
  let value: unknown = defaults;
  try {
    const [row] = await db().select().from(schema.settings).where(eq(schema.settings.key, key));
    if (row) {
      const merged = { ...(defaults as object), ...(row.value as object) };
      const parsed = zs.safeParse(merged);
      value = parsed.success ? parsed.data : defaults;
    }
  } catch (e) {
    console.error(`settings ${key}: using defaults (${e instanceof Error ? e.message : e})`);
  }
  cache.set(key, { at: Date.now(), value });
  return value as ValueOf<K>;
}

export const getRuleSettings = () => getSettings("rules");
export const getBusinessSettings = () => getSettings("business");
export const getRubricText = () => getSettings("rubric_text");

export type SaveResult = { ok: true } | { ok: false; errors: string[] };

/** Validates and saves a full or partial value; writes settings_audit. Owner-only is enforced by the caller. */
export async function saveSettings(key: SettingsKey, patch: unknown, actor: string, reason?: string): Promise<SaveResult> {
  const { schema: zs } = SETTINGS_KEYS[key];
  const current = await getSettings(key);
  const merged = { ...(current as object), ...(typeof patch === "object" && patch ? patch : {}) };
  const parsed = zs.safeParse(merged);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || key}: ${i.message}`) };
  }
  if (key === "rules") {
    const r = parsed.data as RuleSettings;
    if (r.tightTimelineWeeks < r.minWeeksToCompletion) return { ok: false, errors: ["Tight-timeline weeks must be at least the minimum weeks"] };
    if (r.commercialMaxSqft <= r.commercialMinSqft) return { ok: false, errors: ["Commercial max must be above the min"] };
    if (r.warmMinScore >= r.hotMinScore) return { ok: false, errors: ["Hot threshold must be above the warm threshold"] };
  }
  await db()
    .insert(schema.settings)
    .values({ key, value: parsed.data as object, updatedBy: actor, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data as object, updatedBy: actor, updatedAt: new Date() } });
  await db().insert(schema.settingsAudit).values({ key, actor, oldValue: current as object, newValue: parsed.data as object, reason: reason ?? null });
  cache.delete(key);
  return { ok: true };
}

/** Restores defaults for a key (keeps an audit entry). */
export async function resetSettings(key: SettingsKey, actor: string) {
  const current = await getSettings(key);
  await db().delete(schema.settings).where(eq(schema.settings.key, key));
  await db().insert(schema.settingsAudit).values({ key, actor, oldValue: current as object, newValue: null, reason: "Reset to defaults" });
  cache.delete(key);
}

export async function settingsHistory(limit = 30) {
  return db().select().from(schema.settingsAudit).orderBy(desc(schema.settingsAudit.at)).limit(limit);
}
