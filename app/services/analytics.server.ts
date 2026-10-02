import { withPrismaClient } from "../db.server";
import {
  PHASE4_OPTION_IDS,
  assertPhase4Entitlement,
  type Phase4OptionId,
} from "./analytics";

export type ActivityOutcome = "SUCCESS" | "ERROR" | "SKIPPED";

export type ActivityEventInput = {
  shop: string;
  category: "sorting" | "visibility" | "settings" | "analytics";
  action: string;
  outcome?: ActivityOutcome;
  source?: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  details?: Record<string, unknown> | null;
  totalProducts?: number | null;
  soldOutProducts?: number | null;
  movedProducts?: number | null;
  occurredAt?: Date;
};

export type ActivityHistoryEvent = {
  id: string;
  category: string;
  action: string;
  outcome: string;
  source: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  details: string;
  totalProducts: number | null;
  soldOutProducts: number | null;
  movedProducts: number | null;
  occurredAt: string;
};

const MAX_HISTORY_ROWS = 250;
const MAX_ANALYTICS_ROWS = 5000;
const MAX_CSV_ROWS = 5000;
const MAX_SUMMARY_LENGTH = 500;
const MAX_DETAILS_LENGTH = 12000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function safeSummary(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, MAX_SUMMARY_LENGTH) : null;
}

function safeDetails(value: Record<string, unknown> | null | undefined) {
  if (!value) return "{}";

  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= MAX_DETAILS_LENGTH
      ? serialized
      : JSON.stringify({
          truncated: true,
          originalLength: serialized.length,
        });
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function boundedNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

function historySince(retentionDays: number | null, requestedDays?: number) {
  const candidates = [
    retentionDays == null ? null : Math.max(1, retentionDays),
    requestedDays == null ? null : Math.max(1, requestedDays),
  ].filter((value): value is number => value !== null);

  if (!candidates.length) return null;

  const days = Math.min(...candidates);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function normalizeEvent(event: {
  id: string;
  category: string;
  action: string;
  outcome: string;
  source: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  details: string;
  totalProducts: number | null;
  soldOutProducts: number | null;
  movedProducts: number | null;
  occurredAt: Date;
}): ActivityHistoryEvent {
  return {
    ...event,
    occurredAt: event.occurredAt.toISOString(),
  };
}

export async function recordActivityEvent(input: ActivityEventInput) {
  return withPrismaClient((db) =>
    db.activityEvent.create({
      data: {
        shop: input.shop,
        category: input.category,
        action: input.action,
        outcome: input.outcome ?? "SUCCESS",
        source: input.source?.trim() || "runtime",
        entityType: input.entityType?.trim() || null,
        entityId: input.entityId?.trim() || null,
        summary: safeSummary(input.summary),
        details: safeDetails(input.details),
        totalProducts: boundedNumber(input.totalProducts),
        soldOutProducts: boundedNumber(input.soldOutProducts),
        movedProducts: boundedNumber(input.movedProducts),
        occurredAt: input.occurredAt ?? new Date(),
      },
    }),
  );
}

export async function recordActivityEventSafe(input: ActivityEventInput) {
  try {
    await recordActivityEvent(input);
    return true;
  } catch (error) {
    console.error(
      "activity event persistence failed",
      error instanceof Error ? error.message : "Unknown activity persistence error",
    );
    return false;
  }
}

function assertOption(
  optionIds: readonly string[],
  optionId: Phase4OptionId,
  label: string,
) {
  assertPhase4Entitlement(optionIds, optionId, label);
}

export async function getActivityHistory(
  shop: string,
  optionIds: readonly string[],
  retentionDays: number | null,
  limit = 100,
) {
  assertOption(
    optionIds,
    PHASE4_OPTION_IDS.activityHistory,
    "activity history",
  );

  const since = historySince(retentionDays);
  const events = await withPrismaClient((db) =>
    db.activityEvent.findMany({
      where: {
        shop,
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: clamp(limit, 1, MAX_HISTORY_ROWS),
    }),
  );

  return events.map(normalizeEvent);
}

export async function getAutomationAnalytics(
  shop: string,
  optionIds: readonly string[],
  retentionDays: number | null,
  requestedDays = 30,
) {
  assertOption(
    optionIds,
    PHASE4_OPTION_IDS.analytics,
    "inventory and automation analytics",
  );

  const days = clamp(requestedDays, 1, 90);
  const since = historySince(retentionDays, days);
  const events = await withPrismaClient((db) =>
    db.activityEvent.findMany({
      where: {
        shop,
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: MAX_ANALYTICS_ROWS + 1,
    }),
  );

  const truncated = events.length > MAX_ANALYTICS_ROWS;
  const usable = truncated ? events.slice(0, MAX_ANALYTICS_ROWS) : events;

  const uniqueCollections = new Set<string>();
  const uniqueProducts = new Set<string>();
  const daily = new Map<
    string,
    {
      date: string;
      events: number;
      errors: number;
      sortRuns: number;
      visibilityChanges: number;
      movedProducts: number;
      soldOutObserved: number;
    }
  >();

  let successfulEvents = 0;
  let errorEvents = 0;
  let sortRuns = 0;
  let visibilityChanges = 0;
  let settingsChanges = 0;
  let productsMoved = 0;
  let soldOutObserved = 0;

  for (const event of usable) {
    const day = event.occurredAt.toISOString().slice(0, 10);
    const bucket =
      daily.get(day) ?? {
        date: day,
        events: 0,
        errors: 0,
        sortRuns: 0,
        visibilityChanges: 0,
        movedProducts: 0,
        soldOutObserved: 0,
      };

    bucket.events += 1;

    if (event.outcome === "ERROR") {
      errorEvents += 1;
      bucket.errors += 1;
    } else if (event.outcome === "SUCCESS") {
      successfulEvents += 1;
    }

    if (event.action === "collection.sorted") {
      sortRuns += 1;
      bucket.sortRuns += 1;
    }

    if (event.category === "visibility" && event.outcome === "SUCCESS") {
      visibilityChanges += 1;
      bucket.visibilityChanges += 1;
    }

    if (event.category === "settings" && event.outcome === "SUCCESS") {
      settingsChanges += 1;
    }

    const moved = event.movedProducts ?? 0;
    const soldOut = event.soldOutProducts ?? 0;
    productsMoved += moved;
    soldOutObserved += soldOut;
    bucket.movedProducts += moved;
    bucket.soldOutObserved += soldOut;

    if (event.entityType === "collection" && event.entityId) {
      uniqueCollections.add(event.entityId);
    }
    if (event.entityType === "product" && event.entityId) {
      uniqueProducts.add(event.entityId);
    }

    daily.set(day, bucket);
  }

  return {
    requestedDays: days,
    truncated,
    eventLimit: MAX_ANALYTICS_ROWS,
    totalEvents: usable.length,
    successfulEvents,
    errorEvents,
    sortRuns,
    visibilityChanges,
    settingsChanges,
    productsMoved,
    soldOutObserved,
    uniqueCollections: uniqueCollections.size,
    uniqueProducts: uniqueProducts.size,
    lastActivityAt: usable[0]?.occurredAt.toISOString() ?? null,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function getCsvActivityHistory(
  shop: string,
  optionIds: readonly string[],
  retentionDays: number | null,
) {
  assertOption(optionIds, PHASE4_OPTION_IDS.csvExport, "CSV export");

  const since = historySince(retentionDays);
  const events = await withPrismaClient((db) =>
    db.activityEvent.findMany({
      where: {
        shop,
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: MAX_CSV_ROWS,
    }),
  );

  return {
    rows: events.map(normalizeEvent),
    rowLimit: MAX_CSV_ROWS,
    capped: events.length === MAX_CSV_ROWS,
  };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function activityHistoryToCsv(events: ActivityHistoryEvent[]) {
  const header = [
    "occurred_at",
    "category",
    "action",
    "outcome",
    "source",
    "entity_type",
    "entity_id",
    "summary",
    "total_products",
    "sold_out_products",
    "moved_products",
    "details",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const event of events) {
    lines.push(
      [
        event.occurredAt,
        event.category,
        event.action,
        event.outcome,
        event.source,
        event.entityType,
        event.entityId,
        event.summary,
        event.totalProducts,
        event.soldOutProducts,
        event.movedProducts,
        event.details,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}
