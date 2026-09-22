# Realtime contract

## Confirmed state channel
Carries rebuildable current match projection such as:
- score/wickets
- innings/over/ball display
- striker/non-striker
- bowler
- recent deliveries
- target/chase metrics
- match status
- match version

Consumers: controller, Match Centre, scorecard, tournament dashboard, PRISM overlay.

## Broadcast cue channel
Carries short-lived presentation instructions such as:
- FOUR
- SIX
- WICKET
- innings break
- match result reveal
- sponsor/lower-third requests

A reconnecting client receives current score state but does **not** replay old transient cues by default.
