# Match Controller UX — automation first

## Core principle
The scorer records what happened. IPS calculates what it means.

## Main scoring screen
Normal delivery entry must be possible with large touch targets and little/no typing.

Primary actions:
- 0, 1, 2, 3, 4, 6
- WICKET
- WD
- NB
- BYE
- LB

## Contextual extras
WD opens a contextual action sheet such as WD+0, WD+1, WD+2, WD+3, WD+4 and Advanced.

NB opens a structured consequence selector: no-ball only, bat runs, byes, leg-byes, wicket/run-out, advanced. The scorer must never manually calculate the final team-run delta.

BYE/LB use the same contextual selection philosophy.

## Wicket flow
Ask only information required by the selected dismissal type. Then show only eligible incoming batters from the official playing XI.

## Automated transitions
The engine/controller should guide:
- end of over
- eligible next bowler
- retirement condition
- innings end
- target/chase setup
- mathematical match completion
- generated result wording

## Corrections
UI may say Undo/Correct, but backend behavior is an auditable correction/reversal, not history deletion.
