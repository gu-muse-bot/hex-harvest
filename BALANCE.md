# Hex Harvest — balance log (2026-11-10)

Independent QC (2026-11-10) found defect D1: "capture-first" was a dominant
strategy. Original rules: capture cost 3, and the capturer gained the captured
cell's resource (1–3 points) — so capturing a resource-3 cell was free, and
the 2-cell swing paid for the next capture. Tournament evidence (QC):
captureFirst beat claimHigh 39–17 / 39–16, beat harvestAll 39–1, and two
captureFirst players stalled to the 160-move cap (18–18).

## Why cost tuning alone cannot fix it

A capture flips a cell (+1 you, −1 them = a 2-cell swing) on the capture turn,
while a claim gains 1 cell. Saving up for a capture costs no tempo, because
the saving turns are claims — which gain cells *and* points at the same time.
So a cycle of (k claims + 1 capture) always yields k+2 cells in k+1 turns,
one more than pure claiming, whatever the cost is. Cost only changes k.
That is why cost 5 and cost 8 both still let "rush" (expand toward the enemy
+ capture whenever affordable) sweep the round-robin.

## Variants tested (deterministic round-robin, 7 strategies × both seats)

Strategies: captureFirst (capture if affordable, else claim high), claimHigh
(claim high, capture only when nothing left to claim — the shipped sample
bot), harvestAll (always harvest), rush (capture if affordable, else expand
toward the nearest enemy cell), away (expand away from the enemy), cap3
(capture only resource-3 cells), reserve (capture only with ≥9 points).
Plus "balanced" (capture resource-3 when affordable, capture when rich ≥8,
else claim high) and "sentry" (expand toward the enemy; recapture the cell
deepest inside your territory first).

| Variant | Rush record | Best | Worst | Notes |
|---|---|---|---|---|
| Original: cost 3 + refund | — (QC) | captureFirst sweeps | — | captureFirst 39–17 vs claimHigh; mirrors stall at 160 |
| Cost 5, no refund | 12–0, +151 | rush 12–0 | claimHigh 3–9 | captureFirst no longer sweeps claimHigh (36–28), mirrors end ≤88 moves — QC criteria met, but rush dominates |
| Cost 8, no refund | 10–2, +136 | rush 10–2 | away 1–11 | cost alone does not stop rush |
| Cost 5 + capture needs 2-cell surround | 11–1, +119 | rush 11–1 | away 1–11 | surround rule delays captures but does not break the snowball |
| **Cost 5, no refund + contested claims cost 2 (ADOPTED)** | **9–3, +66** | reserve 10–2 | away 0–12 | see below |
| Cost 6 + contested 2 | 11–1, +98 | rush 11–1 | away 0–12 | worse |
| Cost 5 + contested 3 | 12–0, +92 | rush 12–0 | away 0–12 | heavier middle tax hurts defenders more |

## Adopted rules (in `public/game.js`)

- **Capture costs 5 points, and the capturer does NOT gain the captured
  cell's resource.** (Was: cost 3 + resource refund.)
- **Contested claim:** claiming a neutral cell next to an enemy cell costs
  2 points (shown as `cost: 2` on the move in `legalMoves`; unaffordable
  contested claims are not legal moves). Safe claims are still free and gain
  the cell's resource (1–3 points).
- **Harvest:** +3 points, unchanged. Win: 39 cells (60%), elimination, or
  board-full / 160-move limit decided by cells, then points. Unchanged.

## Adopted-variant tournament (deterministic, 2026-11-10)

Round-robin (7 strategies, both seats, 12 games each):

| Strategy | W–L–D | Cell margin |
|---|---|---|
| reserve | 10–2–0 | +28 |
| rush | 9–3–0 | +66 |
| cap3 | 7–3–2 | −8 |
| balanced | 6–5–1 | +18 |
| captureFirst | 5–6–1 | +0 |
| claimHigh | 3–9–0 | −48 |
| away | 0–12–0 | −56 |

- captureFirst vs claimHigh: 36–28 / 34–30 (was 39–17 / 39–16) — no sweep.
- rush vs claimHigh splits 1–1 (36–28 as P0, 33–31 loss as P1); rush vs
  reserve splits 1–1. No strategy is unbeaten.
- Mirrors: captureFirst 30–34 in 92 moves, rush 36–28 in 97, claimHigh
  32–32 in 62, reserve 32–32 in 82 — all end by board-full, well before 160.
- Longest game in the whole tournament: 107 moves (rush vs captureFirst);
  3-player games 85–95 moves, 4-player 76 moves. No game reaches the cap.

## Residual, stated honestly

- The strongest simple strategies are the ones that fight (rush, reserve,
  cap3, balanced, captureFirst are all within 5–10 wins of each other).
  Strategies that (almost) never fight — claimHigh, away, harvestAll — lose
  to fighters, because captures are the only way past 32 cells each in a
  2-player game. That is inherent to the design, not a tunable number: a
  player who never attacks cannot win a territory game.
- One order-dependent blowout remains: cap3 (P0) vs rush (P1) ends 19–39.
  The reverse seating is 34–30, so it is a bad matchup for a strategy that
  only ever captures resource-3 cells, not a general collapse.
- Reproduce with: `node test/tournament.js` and `node test/round-robin.js`
  (in this repo under `test/`; strategies defined inside them).
