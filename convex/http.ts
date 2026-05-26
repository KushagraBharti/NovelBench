import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

function requireMigrationSecret(request: Request) {
  const configured = process.env.LEGACY_MIGRATION_SECRET;
  if (!configured) {
    throw new Error("LEGACY_MIGRATION_SECRET is not configured");
  }
  const provided = request.headers.get("x-migration-secret");
  if (provided !== configured) {
    throw new Error("Unauthorized");
  }
}

http.route({
  path: "/api/migrations/bootstrap-target",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      requireMigrationSecret(request);
      const target = await ctx.runMutation(internal.migrations.ensureLegacyImportTargetInternal, {});
      return Response.json(target);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Bootstrap failed" },
        { status: 400 },
      );
    }
  }),
});

http.route({
  path: "/api/migrations/import-legacy-run",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      requireMigrationSecret(request);
      const body = await request.json();
      const runId = await ctx.runAction(internal.migrationActions.importLegacyRunAction, body);
      return Response.json({ runId });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Migration import failed" },
        { status: 400 },
      );
    }
  }),
});

http.route({
  path: "/api/migrations/rebuild-read-models",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      requireMigrationSecret(request);
      await ctx.runAction(internal.leaderboards.rebuildSnapshotsInternal, {});
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Rebuild failed" },
        { status: 400 },
      );
    }
  }),
});

export default http;
