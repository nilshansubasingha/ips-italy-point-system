# Project 3 — Authentication and scoped roles

## Scope

Project 3 adds account identity and authorization context without changing any Project 1 cricket identities or scores.

### Stored roles
- OWNER — global platform authority
- ADMIN — granted to an explicit scope
- LEADER — club/team scope
- SCORER — match scope
- PLAYER — account/player participation context

Public visitors are not stored as a role. Public is the unauthenticated browsing state.

## Core rule

A user does not have one global `role` column. `role_grants` allows one user to hold multiple independent contexts.

Example:

- PLAYER / TEAM / Napoli Lions
- LEADER / CLUB / Napoli Lions Cricket Club
- ADMIN / TOURNAMENT / Napoli Cup

## Security boundary

The frontend may hide or show controls, but that is never the security boundary. RLS on `profiles` and `role_grants` protects account data. Project 4 will add cricket-domain write policies for tournament operations.

## Owner bootstrap

No email is hard-coded in the migration. Create the intended account first, then run `database/PROJECT3_BOOTSTRAP_OWNER.sql` once in the Supabase SQL Editor with the intended account email.

## Deliberately not included yet

- tournament CRUD permissions
- squad approval and locking
- scorer match ownership
- scoring event writes
- Google OAuth configuration
- player-account claim workflow

Those are separate projects so authorization can be verified incrementally.
