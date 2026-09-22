# Project 0 — Foundation Freeze

## Objective
Create a clean IPS architecture foundation without changing or overwriting the uploaded CricketGraphicsStudioPremiumV2 project.

## Decisions implemented in this skeleton
- New monorepo: web, controller, overlay, shared packages.
- CGS V2 is treated as reference/raw material.
- No single global match state is copied into IPS.
- Match scoring will use a match-scoped immutable event ledger.
- Derived values belong to a deterministic scoring engine.
- Public/admin website, controller and overlay are separate surfaces over the same canonical backend.
- Project 0 runs without backend credentials.

## Explicitly not implemented yet
- Supabase schema and migrations for Project 1 entities.
- Authentication/RLS.
- Realtime subscriptions.
- Official scoring semantics.
- Offline queue.
- Certification workflow.
- Rankings, records or Media Studio rendering.

These omissions are deliberate so later modules are not built on accidental contracts.
