import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import {
  getCollectionStockSummary,
  sortCollection,
} from "./collection-sorter.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  PHASE5_OPTION_IDS,
  assertAutomationRuleEntitlements,
  normalizeAutomationRuleInput,
  type AutomationRuleInput,
} from "./automation";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type AutomationRunSource = "manual" | "scheduled";

const MAX_DUE_RULES_PER_TICK = 25;
const RULE_LEASE_MINUTES = 15;

function nextRunAt(scheduleMinutes: number | null, from = new Date()) {
  return scheduleMinutes == null
    ? null
    : new Date(from.getTime() + scheduleMinutes * 60 * 1000);
}

async function currentOptionIds(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(
    admin as Parameters<typeof getCurrentSubscriptionPlan>[0],
  );
  return current?.plan.option_ids ?? null;
}

function toRuleInput(rule: {
  name: string;
  collectionId: string;
  enabled: boolean;
  scheduleMinutes: number | null;
  minSoldOutProducts: number | null;
  minSoldOutPercent: number | null;
  minTotalProducts: number | null;
}): AutomationRuleInput {
  return {
    name: rule.name,
    collectionId: rule.collectionId,
    enabled: rule.enabled,
    scheduleMinutes: rule.scheduleMinutes,
    minSoldOutProducts: rule.minSoldOutProducts,
    minSoldOutPercent: rule.minSoldOutPercent,
    minTotalProducts: rule.minTotalProducts,
  };
}

export async function listAutomationRules(shop: string) {
  return withPrismaClient((db) =>
    db.automationRule.findMany({
      where: { shop },
      orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
    }),
  );
}

export async function saveAutomationRule(
  admin: AdminClient,
  shop: string,
  ruleId: string | null,
  input: Partial<Record<keyof AutomationRuleInput, unknown>>,
  entitledOptionIds?: readonly string[],
) {
  const optionIds =
    entitledOptionIds ?? (await currentOptionIds(admin));

  if (!optionIds) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required for automation.",
    );
  }

  const normalized = normalizeAutomationRuleInput(input);
  assertAutomationRuleEntitlements(normalized, optionIds);

  const configured = await withPrismaClient((db) =>
    db.collectionSetting.findUnique({
      where: {
        shop_collectionId: {
          shop,
          collectionId: normalized.collectionId,
        },
      },
      select: { collectionId: true },
    }),
  );

  if (!configured) {
    throw new Error(
      "Configure this collection in VSN Stock Down Sort before creating an automation rule.",
    );
  }

  if (ruleId) {
    const existing = await withPrismaClient((db) =>
      db.automationRule.findUnique({ where: { id: ruleId } }),
    );
    if (!existing || existing.shop !== shop) {
      throw new Error("Automation rule not found.");
    }
  }

  const scheduleNextRun =
    normalized.enabled && normalized.scheduleMinutes !== null
      ? nextRunAt(normalized.scheduleMinutes)
      : null;

  const rule = await withPrismaClient((db) =>
    ruleId
      ? db.automationRule.update({
          where: { id: ruleId },
          data: {
            ...normalized,
            nextRunAt: scheduleNextRun,
            leaseUntil: null,
            lastError: null,
          },
        })
      : db.automationRule.create({
          data: {
            shop,
            ...normalized,
            nextRunAt: scheduleNextRun,
          },
        }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: ruleId ? "automation.rule_updated" : "automation.rule_created",
    outcome: "SUCCESS",
    source: "automation-settings",
    entityType: "automation_rule",
    entityId: rule.id,
    summary: ruleId
      ? "Automation rule updated."
      : "Automation rule created.",
    details: {
      collectionId: rule.collectionId,
      enabled: rule.enabled,
      scheduleMinutes: rule.scheduleMinutes,
      hasAdvancedConditions:
        rule.minSoldOutProducts !== null ||
        rule.minSoldOutPercent !== null ||
        rule.minTotalProducts !== null,
    },
  });

  return rule;
}

export async function setAutomationRuleEnabled(
  admin: AdminClient,
  shop: string,
  ruleId: string,
  enabled: boolean,
  entitledOptionIds?: readonly string[],
) {
  const optionIds =
    entitledOptionIds ?? (await currentOptionIds(admin));
  if (!optionIds) {
    throw new Error(
      "An active VSN Stock Down Sort subscription is required for automation.",
    );
  }

  const existing = await withPrismaClient((db) =>
    db.automationRule.findUnique({ where: { id: ruleId } }),
  );
  if (!existing || existing.shop !== shop) {
    throw new Error("Automation rule not found.");
  }

  assertAutomationRuleEntitlements(
    { ...toRuleInput(existing), enabled },
    optionIds,
  );

  const rule = await withPrismaClient((db) =>
    db.automationRule.update({
      where: { id: ruleId },
      data: {
        enabled,
        nextRunAt:
          enabled && existing.scheduleMinutes !== null
            ? nextRunAt(existing.scheduleMinutes)
            : null,
        leaseUntil: null,
        lastError: null,
      },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: enabled ? "automation.rule_enabled" : "automation.rule_paused",
    outcome: "SUCCESS",
    source: "automation-settings",
    entityType: "automation_rule",
    entityId: ruleId,
    summary: enabled ? "Automation rule enabled." : "Automation rule paused.",
  });

  return rule;
}

export async function deleteAutomationRule(shop: string, ruleId: string) {
  const existing = await withPrismaClient((db) =>
    db.automationRule.findUnique({ where: { id: ruleId } }),
  );

  if (!existing || existing.shop !== shop) {
    throw new Error("Automation rule not found.");
  }

  await withPrismaClient((db) =>
    db.automationRule.delete({ where: { id: ruleId } }),
  );

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "automation.rule_deleted",
    outcome: "SUCCESS",
    source: "automation-settings",
    entityType: "automation_rule",
    entityId: ruleId,
    summary: "Automation rule deleted.",
  });
}

function evaluateConditions(
  rule: {
    minSoldOutProducts: number | null;
    minSoldOutPercent: number | null;
    minTotalProducts: number | null;
  },
  summary: {
    totalProducts: number;
    soldOutProducts: number;
    soldOutPercent: number;
  },
) {
  const checks = [
    rule.minSoldOutProducts === null
      ? null
      : {
          label: "minSoldOutProducts",
          matched: summary.soldOutProducts >= rule.minSoldOutProducts,
          actual: summary.soldOutProducts,
          expected: rule.minSoldOutProducts,
        },
    rule.minSoldOutPercent === null
      ? null
      : {
          label: "minSoldOutPercent",
          matched: summary.soldOutPercent >= rule.minSoldOutPercent,
          actual: summary.soldOutPercent,
          expected: rule.minSoldOutPercent,
        },
    rule.minTotalProducts === null
      ? null
      : {
          label: "minTotalProducts",
          matched: summary.totalProducts >= rule.minTotalProducts,
          actual: summary.totalProducts,
          expected: rule.minTotalProducts,
        },
  ].filter(
    (
      check,
    ): check is {
      label: string;
      matched: boolean;
      actual: number;
      expected: number;
    } => check !== null,
  );

  return {
    matched: checks.every((check) => check.matched),
    checks,
  };
}

async function persistRunState(
  shop: string,
  ruleId: string,
  values: {
    outcome: string;
    error?: string | null;
    disable?: boolean;
    scheduleMinutes: number | null;
  },
) {
  const now = new Date();

  await withPrismaClient((db) =>
    db.automationRule.updateMany({
      where: { id: ruleId, shop },
      data: {
        ...(values.disable ? { enabled: false } : {}),
        lastRunAt: now,
        lastOutcome: values.outcome,
        lastError: values.error?.slice(0, 1000) ?? null,
        leaseUntil: null,
        nextRunAt:
          values.disable || values.scheduleMinutes === null
            ? null
            : nextRunAt(values.scheduleMinutes, now),
      },
    }),
  );
}

export async function executeAutomationRule(
  admin: AdminClient,
  shop: string,
  ruleId: string,
  entitledOptionIds?: readonly string[],
  source: AutomationRunSource = "manual",
) {
  const rule = await withPrismaClient((db) =>
    db.automationRule.findUnique({ where: { id: ruleId } }),
  );

  if (!rule || rule.shop !== shop) {
    throw new Error("Automation rule not found.");
  }

  const optionIds =
    entitledOptionIds ?? (await currentOptionIds(admin));

  if (!optionIds) {
    const message =
      "Active subscription no longer includes automation access.";
    await persistRunState(shop, rule.id, {
      outcome: "ENTITLEMENT_BLOCKED",
      error: message,
      disable: source === "scheduled",
      scheduleMinutes: rule.scheduleMinutes,
    });
    await recordActivityEventSafe({
      shop,
      category: "settings",
      action: "automation.rule_blocked",
      outcome: "ERROR",
      source: `automation-${source}`,
      entityType: "automation_rule",
      entityId: rule.id,
      summary: message,
    });
    return { ruleId: rule.id, executed: false, outcome: "ENTITLEMENT_BLOCKED", error: message };
  }

  try {
    assertAutomationRuleEntitlements(toRuleInput(rule), optionIds);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation entitlement failed.";
    await persistRunState(shop, rule.id, {
      outcome: "ENTITLEMENT_BLOCKED",
      error: message,
      disable: source === "scheduled",
      scheduleMinutes: rule.scheduleMinutes,
    });
    await recordActivityEventSafe({
      shop,
      category: "settings",
      action: "automation.rule_blocked",
      outcome: "ERROR",
      source: `automation-${source}`,
      entityType: "automation_rule",
      entityId: rule.id,
      summary: message,
    });
    return { ruleId: rule.id, executed: false, outcome: "ENTITLEMENT_BLOCKED", error: message };
  }

  try {
    const summary = await getCollectionStockSummary(
      admin,
      shop,
      rule.collectionId,
      optionIds,
    );
    const conditions = evaluateConditions(rule, summary);

    if (!conditions.matched) {
      await persistRunState(shop, rule.id, {
        outcome: "SKIPPED",
        scheduleMinutes: rule.scheduleMinutes,
      });

      await recordActivityEventSafe({
        shop,
        category: "settings",
        action: "automation.rule_skipped",
        outcome: "SKIPPED",
        source: `automation-${source}`,
        entityType: "automation_rule",
        entityId: rule.id,
        summary: "Automation conditions did not match live collection stock.",
        details: {
          collectionId: rule.collectionId,
          summary,
          checks: conditions.checks,
        },
        totalProducts: summary.totalProducts,
        soldOutProducts: summary.soldOutProducts,
      });

      return {
        ruleId: rule.id,
        executed: false,
        outcome: "SKIPPED",
        summary,
        checks: conditions.checks,
      };
    }

    const result = await sortCollection(
      admin,
      shop,
      rule.collectionId,
      optionIds,
    );

    await persistRunState(shop, rule.id, {
      outcome: "SUCCESS",
      scheduleMinutes: rule.scheduleMinutes,
    });

    await recordActivityEventSafe({
      shop,
      category: "settings",
      action: "automation.rule_executed",
      outcome: "SUCCESS",
      source: `automation-${source}`,
      entityType: "automation_rule",
      entityId: rule.id,
      summary: "Automation conditions matched and collection sorting ran.",
      details: {
        collectionId: rule.collectionId,
        stockSummary: summary,
        checks: conditions.checks,
        movedProducts: result.movedProducts,
      },
      totalProducts: result.totalProducts,
      soldOutProducts: result.soldOutProducts,
      movedProducts: result.movedProducts,
    });

    return {
      ruleId: rule.id,
      executed: true,
      outcome: "SUCCESS",
      summary,
      checks: conditions.checks,
      result,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation rule failed.";

    await persistRunState(shop, rule.id, {
      outcome: "ERROR",
      error: message,
      scheduleMinutes: rule.scheduleMinutes,
    });

    await recordActivityEventSafe({
      shop,
      category: "settings",
      action: "automation.rule_failed",
      outcome: "ERROR",
      source: `automation-${source}`,
      entityType: "automation_rule",
      entityId: rule.id,
      summary: message,
      details: { collectionId: rule.collectionId },
    });

    return {
      ruleId: rule.id,
      executed: false,
      outcome: "ERROR",
      error: message,
    };
  }
}

export async function claimDueAutomationRules(
  now = new Date(),
  limit = MAX_DUE_RULES_PER_TICK,
) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_DUE_RULES_PER_TICK);
  const candidates = await withPrismaClient((db) =>
    db.automationRule.findMany({
      where: {
        enabled: true,
        scheduleMinutes: { not: null },
        nextRunAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
      take: boundedLimit,
    }),
  );

  const leaseUntil = new Date(
    now.getTime() + RULE_LEASE_MINUTES * 60 * 1000,
  );
  const claimed = [];

  for (const candidate of candidates) {
    const updated = await withPrismaClient((db) =>
      db.automationRule.updateMany({
        where: {
          id: candidate.id,
          shop: candidate.shop,
          enabled: true,
          nextRunAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        data: { leaseUntil },
      }),
    );

    if (updated.count === 1) {
      claimed.push({ ...candidate, leaseUntil });
    }
  }

  return claimed;
}

export async function failClaimedAutomationRule(
  shop: string,
  ruleId: string,
  message: string,
) {
  const rule = await withPrismaClient((db) =>
    db.automationRule.findUnique({ where: { id: ruleId } }),
  );

  if (!rule || rule.shop !== shop) return;

  await persistRunState(shop, ruleId, {
    outcome: "ERROR",
    error: message,
    scheduleMinutes: rule.scheduleMinutes,
  });

  await recordActivityEventSafe({
    shop,
    category: "settings",
    action: "automation.rule_failed",
    outcome: "ERROR",
    source: "automation-scheduled",
    entityType: "automation_rule",
    entityId: ruleId,
    summary: message,
  });
}

export const AUTOMATION_SCHEDULER_BATCH_LIMIT = MAX_DUE_RULES_PER_TICK;
export { PHASE5_OPTION_IDS };
