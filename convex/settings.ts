import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAuthUser, requireOrganizationAdminAccess, requireProjectAccess } from "./lib/auth";
import { getEffectiveProviderPolicy } from "./lib/policies";

const providerValidator = v.union(v.literal("openrouter"), v.literal("exa"));
const MIN_CONCURRENT_RUNS = 5;

export const getProviderStatus = query({
  args: {},
  returns: v.object({
    openrouterConfigured: v.boolean(),
    exaConfigured: v.boolean(),
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const entries = await Promise.all([
      ctx.db
        .query("providerVaultEntries")
        .withIndex("by_user_and_provider", (q) =>
          q.eq("userId", user._id).eq("provider", "openrouter"),
        )
        .unique(),
      ctx.db
        .query("providerVaultEntries")
        .withIndex("by_user_and_provider", (q) =>
          q.eq("userId", user._id).eq("provider", "exa"),
        )
        .unique(),
    ]);
    const updatedAt =
      Math.max(...entries.filter(Boolean).map((entry) => entry!.updatedAt), 0) || undefined;

    return {
      openrouterConfigured: Boolean(entries[0] && !entries[0].revokedAt),
      exaConfigured: Boolean(entries[1] && !entries[1].revokedAt),
      updatedAt,
    };
  },
});

export const updateProviderPolicy = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    allowedModelIds: v.optional(v.array(v.string())),
    maxModelsPerRun: v.number(),
    maxConcurrentRuns: v.number(),
    dailySpendLimitUsd: v.optional(v.number()),
    monthlySpendLimitUsd: v.optional(v.number()),
    researchEnabled: v.boolean(),
    hardBlockOnBudget: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireOrganizationAdminAccess(ctx, args.organizationId);

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.organizationId !== args.organizationId) {
        throw new ConvexError("Project does not belong to the organization");
      }
    }

    const existing = await ctx.db
      .query("providerPolicies")
      .withIndex("by_organization_and_project", (q) =>
        q.eq("organizationId", args.organizationId).eq("projectId", args.projectId),
      )
      .unique();

    const next = {
      organizationId: args.organizationId,
      projectId: args.projectId,
      allowedModelIds: args.allowedModelIds,
      maxModelsPerRun: args.maxModelsPerRun,
      maxConcurrentRuns: Math.max(args.maxConcurrentRuns, MIN_CONCURRENT_RUNS),
      dailySpendLimitUsd: args.dailySpendLimitUsd,
      monthlySpendLimitUsd: args.monthlySpendLimitUsd,
      researchEnabled: args.researchEnabled,
      hardBlockOnBudget: args.hardBlockOnBudget,
      updatedByUserId: user._id,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
    } else {
      await ctx.db.insert("providerPolicies", next);
    }

    return null;
  },
});

export const getProjectPolicy = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    allowedModelIds: v.optional(v.array(v.string())),
    maxModelsPerRun: v.number(),
    maxConcurrentRuns: v.number(),
    dailySpendLimitUsd: v.optional(v.number()),
    monthlySpendLimitUsd: v.optional(v.number()),
    researchEnabled: v.boolean(),
    hardBlockOnBudget: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const projectId = args.projectId ?? user.defaultProjectId;
    if (!projectId) {
      throw new ConvexError("No default project is configured");
    }

    await requireProjectAccess(ctx, projectId, "viewer");
    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const policy = await getEffectiveProviderPolicy(ctx, project.organizationId, projectId);
    return {
      organizationId: project.organizationId,
      projectId,
      allowedModelIds: policy?.allowedModelIds,
      maxModelsPerRun: policy?.maxModelsPerRun ?? 8,
      maxConcurrentRuns: Math.max(policy?.maxConcurrentRuns ?? MIN_CONCURRENT_RUNS, MIN_CONCURRENT_RUNS),
      dailySpendLimitUsd: policy?.dailySpendLimitUsd,
      monthlySpendLimitUsd: policy?.monthlySpendLimitUsd,
      researchEnabled: policy?.researchEnabled ?? true,
      hardBlockOnBudget: policy?.hardBlockOnBudget ?? true,
    };
  },
});

export const getCurrentUserInternal = internalQuery({
  args: {},
  returns: v.object({
    _id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
    };
  },
});

export const upsertVaultEntryInternal = internalMutation({
  args: {
    userId: v.id("users"),
    provider: providerValidator,
    ciphertext: v.string(),
    iv: v.string(),
    wrappedDek: v.string(),
    fingerprint: v.string(),
    keyVersion: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerVaultEntries")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();

    const payload = {
      userId: args.userId,
      provider: args.provider,
      ciphertext: args.ciphertext,
      iv: args.iv,
      wrappedDek: args.wrappedDek,
      fingerprint: args.fingerprint,
      keyVersion: args.keyVersion,
      lastValidatedAt: args.now,
      revokedAt: undefined,
      updatedAt: args.now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("providerVaultEntries", {
        ...payload,
        createdAt: args.now,
      });
    }

    return null;
  },
});

export const logAuditInternal = internalMutation({
  args: {
    actorUserId: v.id("users"),
    action: v.string(),
    organizationId: v.optional(v.id("organizations")),
    projectId: v.optional(v.id("projects")),
    resourceType: v.string(),
    resourceId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
