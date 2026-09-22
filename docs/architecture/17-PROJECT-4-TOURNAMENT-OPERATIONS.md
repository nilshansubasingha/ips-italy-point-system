# Project 4 — Tournament Operations

## Objective

Prepare a tournament completely before live scoring without retyping identities in the Match Controller.

## Operational flow

Tournament → team applications → confirmed teams → tournament squads → deadline/lock → fixtures → officials/scorers.

The Match Controller does not own any of these identities. Project 5 imports them.

## Squad integrity

A squad is editable only while it is not effectively locked. Effective lock is true when either:

- `tournament_squads.status = LOCKED`, or
- the tournament `squad_deadline` has passed.

After lock, direct roster changes are rejected in the database. The only mutation path is the audited emergency replacement workflow. The current product rule permits one approved emergency replacement per squad.

## Scorer assignment

Assigning a user as a match scorer creates the appropriate `SCORER / MATCH` role grant automatically. Removing that assignment revokes only the role grant created by that assignment; independent/manual grants are not silently removed.

## Owner safety

The last active `OWNER / GLOBAL` grant cannot be revoked or deleted. A second active global owner must exist before the final owner can be removed.

## Scope boundary

Project 4 prepares operational data only. It does not create live scoring events, derived score state, certification or statistics.
