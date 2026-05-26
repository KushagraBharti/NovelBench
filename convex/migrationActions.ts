"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

type ImportLegacyRunResult = Id<"runs">;

const importLegacyRunHandler = async (
  ctx: any,
  args: {
    ownerUserId: Id<"users">;
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    legacyRunId: string;
    run: unknown;
    promptCaptureJsonl?: string;
  },
): Promise<ImportLegacyRunResult> => {
  return await ctx.runMutation(internal.migrations.importLegacyRunInternal, {
    ownerUserId: args.ownerUserId,
    organizationId: args.organizationId,
    projectId: args.projectId,
    legacyRunId: args.legacyRunId,
    run: args.run,
    promptCaptureStorageId: undefined,
  });
};

export const importLegacyRunAction: ReturnType<typeof internalAction> = internalAction({
  args: {
    ownerUserId: v.id("users"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    legacyRunId: v.string(),
    run: v.any(),
    promptCaptureJsonl: v.optional(v.string()),
  },
  returns: v.id("runs"),
  handler: importLegacyRunHandler,
});
