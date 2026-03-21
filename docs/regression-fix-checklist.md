# Regression Fix Checklist

This file tracks the concrete regressions identified after the Convex migration and UI refactors. Do not remove items from this list until the fix is implemented, verified locally, and synced to production.

## 1. Trace And Streaming Contract

- Restore streamed draft-token output during generate and revise.
- Restore streamed reasoning details during generate and revise.
- Restore streamed tool-call activity with exact URLs surfaced in the UI.
- Persist reasoning details into hydrated runs instead of dropping them.
- Persist tool-call activity and retrieved sources so completed runs still show traces.
- Ensure the live client hook consumes Convex live-activity events rather than only the summary run document.

## 2. Timeout Unification

- Make `1_000_000` ms the single universal timeout across all OpenRouter execution paths.
- Remove conflicting timeout constants and make one shared source of truth.
- Verify benchmark execution, prompt-runtime helpers, and Convex wrappers all use the same timeout.

## 3. Repo / Deployment Sync

- Remove the current repo/prod mismatch caused by local-only fixes.
- Commit the trace/timeout/archive/UI fixes instead of leaving them in a dirty working tree.
- Deploy the matching Convex backend after the repo is consistent.
- Ensure the Vercel app and Convex deployment are operating from the same checked-in code assumptions.

## 4. Archive Visibility And Filtering

- Fix archive filtering so the latest runs reliably appear.
- Remove stale local filter state that can hide newly returned runs.
- Align visibility semantics with the current public-only direction.
- Audit archive pagination and search so filter changes do not silently drop runs.

## 5. Archive Detail Stability

- Stop archive detail views from crashing on client-side navigation.
- Separate archive/read-only result viewing from the live arena shell if needed.
- Verify old imported runs and fresh runs both render correctly in detail view.

## 6. UI Cleanup

- Remove remaining rounded card/boxed treatments from failure/status UI.
- Remove remaining badge/pill-style status treatments where they break the editorial system.
- Reposition export actions so they are accessible but not cluttering the main result header.
- Clean remaining arena/archive/leaderboard/account surfaces that still regress into utility-card styling.
- Keep the visual language aligned with the landing/dashboard/editorial surfaces.

## 7. Settings / Surface Behavior

- Restore only the settings/account controls that still make sense in the public-only app direction.
- Avoid reintroducing private project / policy clutter.
- Keep account focused on auth and BYOK, with any additional controls integrated cleanly.

## 8. Verification

- Run `bun test`.
- Run `bun run lint`.
- Run `bun run typecheck`.
- Run `bun run build`.
- Browser-test sign-in, arena run start, live traces, archive list, archive detail, leaderboard, and exports.
- Sync production after verification and confirm the deployed app matches the checked-in code.

## 9. Follow-up Regressions

- Remove OCC conflicts caused by live trace mutations repeatedly patching the hot `runs` document.
- Fix public archive detail so older public runs do not crash when export queries execute.
- Replace mixed client-side/server-side archive filtering with one consistent server-backed flow.
- Fix leaderboard category counts so they reflect category run totals, not the top model's run count.
