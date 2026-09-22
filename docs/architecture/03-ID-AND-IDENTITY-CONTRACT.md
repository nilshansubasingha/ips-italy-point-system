# ID and identity contract

## Internal identifiers
Use UUID primary keys for canonical database entities.

## Public player identifier
Players additionally receive a stable human-visible code such as `ITA-0001847`.

The public code is unique but is not used as the relational primary key.

## Identity rules
- Never use player display names as foreign keys.
- Team changes create membership history; they never create a new player identity.
- Tournament squads are snapshots of selected permanent players.
- Match playing XI is a separate match-specific snapshot/selection.
- Historical matches always reference the IDs that existed at the time of the match.
