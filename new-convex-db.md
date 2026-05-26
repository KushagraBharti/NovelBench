Migrate NovelBench's Convex database to the minimal durable schema below without breaking any existing product functionality. Preserve all user-visible benchmark data, access control, BYOK provider behavior, archive/results/leaderboard/export behavior, and active-run live behavior. Do not perform destructive deletes until compact replacements are backfilled, all reads/writes are switched, and the verification gate passes.

Below is the clean plan: preserve product behavior, remove permanent debug/audit bloat, and rebuild the DB around minimal durable data.

**Target Principle**
Permanent DB should store only:

1. Identity/access/config needed to run.
2. Final benchmark results needed to render archive/results/leaderboard/export.
3. Minimal cost/accounting.
4. Active-run live state while a run is in progress.

Everything else is cache, debug, export artifact, workflow internals, or historical telemetry and should be deleted or regenerated.

**Current Table Disposition**

| Table | Final Action | Why |
|---|---|---|
| `users` | keep | auth/profile/default org/project |
| `authSessions` | keep, prune expired | login sessions |
| `authAccounts` | keep | OAuth account link |
| `authRefreshTokens` | keep, prune expired/used old chains | auth |
| `authVerificationCodes` | prune aggressively | temporary |
| `authVerifiers` | prune expired/stale | temporary |
| `authRateLimits` | prune old | auth throttling only |
| `organizations` | keep | workspace source of truth |
| `organizationMembers` | keep | access control |
| `projects` | keep | run ownership/visibility |
| `projectMembers` | keep | access control |
| `providerVaultEntries` | keep | encrypted BYOK keys |
| `providerPolicies` | keep | model/budget/research policy |
| `runs` | keep, slim later | run header/source of truth |
| `runParticipants` | keep, slim raw refs later | final model outputs |
| `runEvents` | replace/delete | huge telemetry/event log |
| `runArtifacts` | mostly delete | raw/debug/export file pointers |
| `runStageStates` | active only or compact | useful during run, redundant after terminal |
| `runSearchDocs` | rebuildable cache | archive search |
| `usageLedger` | keep or compact | cost/accounting |
| `usageBudgets` | keep | budget enforcement |
| `rateLimitBuckets` | keep table, prune old | transient throttles |
| `auditLogs` | delete/stop most writes | audit/debug history |
| `jobs` | active only; delete terminal history | operational history |
| `jobAttempts` | active only; delete terminal history | operational history |
| `exports` | optional persistent, otherwise regenerate | old downloads are not core data |
| `leaderboardSnapshots` | rebuildable cache | not source of truth |
| `categoryStatsDaily` | rebuildable aggregate | can rebuild from runs |
| `modelStatsDaily` | rebuildable aggregate | can rebuild from runs |
| `projectUsageDaily` | keep/rebuild | cheap aggregate |
| `workflow/*` | cleanup completed only | Convex Workflow internals |
| `workflow/workpool/*` | cleanup idle/finished only | queue internals |
| `exportsWorkpool/*` | cleanup idle/finished only | queue internals |

**New Minimal Product Schema**

| New/Kept Table | Purpose |
|---|---|
| `runs` | prompt, category, status, selected models, winner, timestamps, final cost/counters |
| `runParticipants` | generated idea, critique result, revised idea, final ranking, token/cost totals |
| `runHumanCritiques` | durable human critiques currently hidden inside `runEvents` |
| `runSources` | compact search/source records: query, URL, title, model, stage |
| `runFailures` | durable model/run failure messages |
| `runControlEvents` | pause/resume/cancel/proceed history, small and bounded |
| `runLiveEvents` | active-only stream/tool/reasoning events; deleted on terminal |
| `usageLedger` | provider usage rows, optionally compacted per run/model/stage |
| `runSearchDocs` | rebuildable search index doc |
| existing auth/org/project/provider tables | unchanged |

**What Moves Out Of `runEvents`**

| Old `runEvents.kind` | New Location |
|---|---|
| `human_critique_submitted` | `runHumanCritiques` |
| `web_stage_trace` | `runSources` plus small source summary |
| `model_failed`, `run_failed` | `runFailures`, plus participant/run error fields |
| `run_paused`, `run_resumed`, `run_canceled`, `human_critique_proceeded` | `runControlEvents` |
| `live_token` | `runLiveEvents`, active only |
| `tool_call_activity` | `runLiveEvents`, active only |
| `reasoning_detail` | `runLiveEvents`, or optional compact `runReasoningSummaries` |
| `model_started`, `model_completed`, `stage_updated`, `run_finalized` | mostly delete; state already exists on `runs`/`runParticipants` |

**Required Code Changes Before Deleting**

| Area | Change |
|---|---|
| `hydrateRun` | stop reading all `runEvents`; read participants + compact tables |
| Results UI | keep same shape: `humanCritiques`, `failures`, `controls`, `web`, `reasoning` |
| Live UI | subscribe to `runLiveEvents` instead of `runEvents` |
| Revision stage | read `runHumanCritiques` and `runSources` instead of old event payloads |
| Exports | build export from compact tables, not full event history |
| Leaderboard rebuild | use run fields + participants + human critique count |
| Delete flow | delete new compact tables and file storage references |
| Diagnostics | stop depending on old audit/job history |
| Workflow completion | cleanup workflow steps after terminal completion |

**Migration Order**

1. Add compact tables to schema without deleting anything.
2. Backfill compact tables from existing `runEvents`:
   - human critiques
   - source URLs/search summaries
   - failures
   - control events
   - optional reasoning summaries
3. Backfill missing counters onto `runs`:
   - `humanCritiqueCount`
   - final winner
   - completed/failed counts
   - settled cost
4. Add read helpers that return the same `BenchmarkRun` object from compact tables.
5. Switch `runs.get`, exports, prompt review, leaderboard rebuild, and UI live queries to compact reads.
6. Change writers:
   - new live writes go to `runLiveEvents`
   - human critique writes go to `runHumanCritiques`
   - web/search writes go to `runSources`
   - failure/control writes go to compact tables
7. Add terminal cleanup:
   - when run becomes `complete/partial/canceled/dead_lettered/error`, delete `runLiveEvents`
   - cleanup completed workflow rows
   - delete raw provider/search artifacts if not required
8. Verify every old run renders the same public result.
9. Hard-delete old bloat:
   - `runEvents.live_token`
   - `runEvents.reasoning_detail`
   - `runEvents.tool_call_activity`
   - `runEvents.web_stage_trace` after source migration
   - lifecycle events after control/failure migration
10. Remove old fields/tables from schema only after production has zero dependency.

**Verification Gate**

Before any destructive delete, compare old vs new for every run:

| Check | Must Match |
|---|---|
| archive list | run count/status/category/prompt excerpt |
| run detail | prompt, models, status, winner |
| ideas | generated ideas per model |
| critiques | model critiques + human critiques |
| revisions | revised ideas per model |
| final vote | rankings and scores |
| failures | failed models and messages |
| search tab | source URLs/titles/query/model/stage |
| leaderboard | same entries/totals |
| exports | JSON/CSV generated successfully |
| active run | live streaming/tool/reasoning still works |
| pause/resume/cancel/proceed | still works |

**Dev Env**

After prod cutover is verified:

1. Delete/disable the dev deployment.
2. Remove `.env.local` dev deployment values if you want a fresh link later.
3. Recreate dev from the new schema only.
4. Do not import old telemetry into dev.

**Actual Delete Policy**

Safe final deletes:

- all terminal-run `runEvents`
- old raw OpenRouter artifacts
- old Exa payload artifacts
- old generated exports, if downloads are regeneratable
- terminal `jobs`/`jobAttempts`
- old `auditLogs`
- completed workflow `steps/events/workflows`
- stale rate/auth/session records
- rebuildable snapshots before rebuild

Unsafe deletes until migrated:

- human critique events
- web trace/source events
- failure events
- active workflow rows
- active live events
- participants
- provider vault entries
- auth/org/project membership data

**Final Shape**

The permanent DB becomes:

- `runs`
- `runParticipants`
- `runHumanCritiques`
- `runSources`
- `runFailures`
- `runControlEvents`
- `usageLedger`
- auth/org/project/provider tables
- small rebuildable cache tables

The big firehose becomes:

- `runLiveEvents`, active only, deleted on terminal

That preserves functionality and removes the storage explosion.

Do not stop until EVERYTHING is implemented, tested, and perfectly completed. Ensure absolute perfection. Use all your tools to your advantage.