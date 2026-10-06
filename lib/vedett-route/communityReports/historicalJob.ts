// VÉDETT ÚTVONAL — HISTORICAL SENSORY LOAD — aggregációs job (tároló-független).
//
// Idempotens, determinisztikus ÚJRAÉPÍTÉS (nem vak increment):
//   1. napi részaggregátumok: a kiválasztott szolgáltatási napok TELJES
//      újraszámolása a nyers reportokból, majd upsert + az adott nap el nem
//      ért sorainak törlése -> ugyanaz az input kétszer = ugyanaz az eredmény;
//   2. profilok: az utolsó HISTORY_WINDOW napi aggregátumaiból teljes
//      újraszámolás az aktuális napra (decay), upsert + elavultak törlése;
//   3. reporter token purge: csak már aggregált, az újraépítési ablakon kívüli
//      napokra. Purge-hiba NEM rontja el a kész aggregátumot — jelzi.
// Módok: napi (alap), felzárkóztató (még nem aggregált napok, max catchUpDays),
// backfill (from/to, max maxDaysPerRun; force nélkül a már aggregált, purge-ölt
// napokat nem építi újra, mert azoknál a dedup-token már nincs meg).

import { AGGREGATION_JOB, HISTORICAL_DECAY } from "./historicalConfig.ts";
import { buildDailyLoadPartials, buildLoadProfiles, type DailyLoadPartial, type HistoricalReportRow, type LoadProfile } from "./historicalAggregation.ts";
import { computeCommunityReportTimeKeys } from "./context.ts";

export interface CommunityLoadStore {
  listBuiltDays(dates: readonly string[]): Promise<Set<string>>;
  fetchRawReportsForDay(serviceDate: string): Promise<HistoricalReportRow[]>;
  replaceDailyPartials(serviceDate: string, partials: readonly DailyLoadPartial[], runStartedAt: string): Promise<void>;
  markDayBuilt(serviceDate: string, reportCount: number, partialCount: number, runStartedAt: string): Promise<void>;
  fetchDailyPartialsSince(fromServiceDate: string): Promise<DailyLoadPartial[]>;
  replaceProfiles(profiles: readonly LoadProfile[], runStartedAt: string): Promise<void>;
  purgeTokensBefore(serviceDate: string): Promise<number>;
}

export interface AggregationOptions {
  now: Date;
  from?: string;
  to?: string;
  force?: boolean;
}

export interface AggregationSummary {
  ok: boolean;
  mode: "daily" | "backfill";
  serviceDate: string;
  daysRebuilt: number;
  daysFailed: number;
  partialsWritten: number;
  profilesWritten: number;
  tokensPurged: number;
  purgeFailed: boolean;
  profileRebuildFailed: boolean;
}

export const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(serviceDate: string, days: number): string {
  const t = Date.parse(`${serviceDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= AGGREGATION_JOB.maxDaysPerRun; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Mely napokat kell újraépíteni (tiszta függvény, tesztelhető). */
export function planAggregationDays(
  today: string,
  builtDays: ReadonlySet<string>,
  options: { from?: string; to?: string; force?: boolean }
): { mode: "daily" | "backfill"; days: string[] } | { error: string } {
  if (options.from || options.to) {
    if (!options.from || !options.to || !SERVICE_DATE_PATTERN.test(options.from) || !SERVICE_DATE_PATTERN.test(options.to) || options.from > options.to) {
      return { error: "INVALID_RANGE" };
    }
    if (options.to >= today) return { error: "RANGE_NOT_COMPLETE" };
    const range = dateRange(options.from, options.to);
    if (range.length > AGGREGATION_JOB.maxDaysPerRun) return { error: "RANGE_TOO_LONG" };
    const purgeBoundary = addDays(today, -AGGREGATION_JOB.tokenPurgeAfterCompleteDays);
    const days = range.filter((d) => options.force || !builtDays.has(d) || d >= purgeBoundary);
    return { mode: "backfill", days };
  }
  const rebuild = Array.from({ length: AGGREGATION_JOB.rebuildCompleteDays }, (_, i) => addDays(today, -(i + 1)));
  const catchUp = Array.from({ length: AGGREGATION_JOB.catchUpDays }, (_, i) => addDays(today, -(i + 1)))
    .filter((d) => !rebuild.includes(d) && !builtDays.has(d));
  const days = [...new Set([...catchUp, ...rebuild])].sort().slice(-AGGREGATION_JOB.maxDaysPerRun);
  return { mode: "daily", days };
}

export async function runCommunityLoadAggregation(store: CommunityLoadStore, options: AggregationOptions): Promise<AggregationSummary | { ok: false; error: string }> {
  const runStartedAt = options.now.toISOString();
  const today = computeCommunityReportTimeKeys(options.now).serviceDate;
  const candidateDays = options.from && options.to && SERVICE_DATE_PATTERN.test(options.from) && SERVICE_DATE_PATTERN.test(options.to)
    ? dateRange(options.from, options.to)
    : Array.from({ length: AGGREGATION_JOB.catchUpDays }, (_, i) => addDays(today, -(i + 1)));
  const built = await store.listBuiltDays(candidateDays);
  const plan = planAggregationDays(today, built, options);
  if ("error" in plan) return { ok: false, error: plan.error };

  let daysRebuilt = 0;
  let daysFailed = 0;
  let partialsWritten = 0;
  for (const day of plan.days) {
    try {
      const rows = await store.fetchRawReportsForDay(day);
      const partials = buildDailyLoadPartials(rows);
      await store.replaceDailyPartials(day, partials, runStartedAt);
      await store.markDayBuilt(day, rows.length, partials.length, runStartedAt);
      daysRebuilt += 1;
      partialsWritten += partials.length;
    } catch {
      daysFailed += 1;
    }
  }

  let profilesWritten = 0;
  let profileRebuildFailed = false;
  try {
    const partials = await store.fetchDailyPartialsSince(addDays(today, -HISTORICAL_DECAY.historyWindowDays));
    const profiles = buildLoadProfiles(partials, today);
    await store.replaceProfiles(profiles, runStartedAt);
    profilesWritten = profiles.length;
  } catch {
    profileRebuildFailed = true;
  }

  let tokensPurged = 0;
  let purgeFailed = false;
  try {
    tokensPurged = await store.purgeTokensBefore(addDays(today, -AGGREGATION_JOB.tokenPurgeAfterCompleteDays));
  } catch {
    purgeFailed = true;
  }

  return {
    ok: daysFailed === 0 && !profileRebuildFailed && !purgeFailed,
    mode: plan.mode,
    serviceDate: today,
    daysRebuilt,
    daysFailed,
    partialsWritten,
    profilesWritten,
    tokensPurged,
    purgeFailed,
    profileRebuildFailed,
  };
}
