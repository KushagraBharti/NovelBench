import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuthUser, requireProjectAccess, slugify } from "./lib/auth";

const MIN_CONCURRENT_RUNS = 5;

export const bootstrapViewer = mutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    defaultOrgId: v.id("organizations"),
    defaultProjectId: v.id("projects"),
  }),
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();

    if (user.defaultOrgId && user.defaultProjectId) {
      await ctx.db.patch(user._id, {
        lastSeenAt: now,
        onboardingComplete: true,
      });
      return {
        userId: user._id,
        defaultOrgId: user.defaultOrgId,
        defaultProjectId: user.defaultProjectId,
      };
    }

    const baseName = user.name?.trim() || user.email?.split("@")[0] || "Personal Workspace";
    const orgId = await ctx.db.insert("organizations", {
      name: `${baseName}'s Workspace`,
      slug: `${slugify(baseName)}-${String(now).slice(-6)}`,
      kind: "personal",
      ownerUserId: user._id,
      createdByUserId: user._id,
    });
    const projectId = await ctx.db.insert("projects", {
      organizationId: orgId,
      name: "My Arena",
      slug: "my-arena",
      visibility: "public_full",
      createdByUserId: user._id,
    });
    await ctx.db.insert("organizationMembers", {
      organizationId: orgId,
      userId: user._id,
      role: "owner",
      joinedAt: now,
    });
    await ctx.db.insert("projectMembers", {
      projectId,
      userId: user._id,
      role: "editor",
      joinedAt: now,
    });
    await ctx.db.patch(user._id, {
      defaultOrgId: orgId,
      defaultProjectId: projectId,
      onboardingComplete: true,
      lastSeenAt: now,
    });
    await ctx.db.insert("providerPolicies", {
      organizationId: orgId,
      projectId,
      maxModelsPerRun: 8,
      maxConcurrentRuns: MIN_CONCURRENT_RUNS,
      researchEnabled: true,
      hardBlockOnBudget: true,
      updatedByUserId: user._id,
      updatedAt: now,
    });
    return {
      userId: user._id,
      defaultOrgId: orgId,
      defaultProjectId: projectId,
    };
  },
});

export const currentViewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      user: v.object({
        id: v.id("users"),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        image: v.optional(v.string()),
      }),
      defaultOrgId: v.optional(v.id("organizations")),
      defaultProjectId: v.optional(v.id("projects")),
      providerStatus: v.object({
        openrouterConfigured: v.boolean(),
        exaConfigured: v.boolean(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) return null;
    const user = await requireAuthUser(ctx);
    const openrouter = await ctx.db
      .query("providerVaultEntries")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "openrouter"),
      )
      .unique();
    const exa = await ctx.db
      .query("providerVaultEntries")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", user._id).eq("provider", "exa"),
      )
      .unique();
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
      defaultOrgId: user.defaultOrgId,
      defaultProjectId: user.defaultProjectId,
      providerStatus: {
        openrouterConfigured: Boolean(openrouter && !openrouter.revokedAt),
        exaConfigured: Boolean(exa && !exa.revokedAt),
      },
    };
  },
});

export const setDefaultProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireProjectAccess(ctx, args.projectId, "viewer");
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await ctx.db.patch(user._id, {
      defaultOrgId: project.organizationId,
      defaultProjectId: project._id,
      lastSeenAt: Date.now(),
    });
    return null;
  },
});
