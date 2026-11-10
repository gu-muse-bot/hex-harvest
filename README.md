# Hex Harvest

A turn-based multiplayer strategy game for humans **and** AI agents, built for
TaskMarket bounty **TSK-JKVSTHB7** — "Build a Fun Multiplayer Strategy Game for
Agents AND Humans" (10 OUSD, Tempo network).

## Rules (in one paragraph)

On an 8×8 board, 2–4 players each start from one corner with a single cell and
2 points; every cell has a resource value of 1–3, and on your turn you do exactly
one thing — claim an empty cell next to your territory for free and gain its
resource in points, except a cell next to an enemy is contested ground and
costs 2 points, capture an adjacent enemy cell for 5 points (you don't gain
its resource), or harvest for +3 points — and the first player to control 39
of the 64 cells (60% of the board), or to eliminate every opponent, wins, with
the board-full / move-limit case decided by most territory, then most points.

## How to run

```bash
node server.js          # zero npm dependencies, plain Node.js (18+)
# open http://localhost:3000
PORT=4000 node server.js   # custom port
```

## How to play (human vs bot)

1. Open http://localhost:3000, pick 2 players, click **New match** (you are player 0).
2. Click a glowing cell to claim/capture it, or **Harvest +3 points**.
3. In a second terminal, run the sample bot as player 1:
   ```bash
   node bot.js http://localhost:3000 <match-id> 1
   ```
   The bot plays a demo game by itself if you give it no match id — it creates
   a 2-player match and plays both seats to the end:
   ```bash
   node bot.js http://localhost:3000
   ```
4. The match log (every move, with notes) is shown on the page; **Replay from
   start** rebuilds the game from the log. Empty seats can be filled by bots.

The page also works on static hosting: if no server is reachable it falls back
to a local game using the same shared logic, with the other players as bots.

## Why every turn matters (no dominant strategy)

- **Claim** is free but only expands along your frontier, and high-value cells
  (resource 3) are the contested ones — claiming a cell next to an enemy
  costs 2 points, so pushing into the middle costs tempo while a defender at
  home banks points for free.
- **Capture** costs 5 points and gains no resource, so you must harvest or
  claim first to afford it — turtling and hoarding points loses the race to
  39 cells, while over-expanding leaves a long border that rivals can capture
  cheaply in return. Balance-tested: see [BALANCE.md](BALANCE.md).
- **Harvest** is the only way to bank points without expanding, so the tension
  every turn is: expand now, save up to strike, or bank for a bigger push?

## API (summary)

Full docs: [API.md](API.md). Base URL is the server root.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/matches` | Create a match `{playerCount: 2-4}` |
| GET | `/api/matches/:id` | Full match state |
| GET | `/api/matches/by-code/:code` | Find a match by its lobby code |
| POST | `/api/matches/:id/join` | Join a slot `{player, name, isBot}` |
| POST | `/api/matches/:id/move` | Make a move `{player, action: {type, row?, col?}}` |
| GET | `/api/matches/:id/log` | Match log (all moves, replay source) |
| GET | `/api/matches/:id/legal?player=N` | Legal moves for a player |

In the browser the same API is available as `window.StrategyGameAPI`, plus
`createLocalGame` / `localMove` for static hosting.

## Self-test (run 2026-11-10)

Started the server, created a 2-player match with curl, joined Human (P0)
and Bot (P1), made a human claim via curl, verified two invalid moves are
rejected with 400 (wrong turn, non-adjacent target), then played the game to
the end with `bot.js` (P1) and a greedy API driver (P0). Result: game
finished in 62 moves, `status: finished, winner: 0, reason: "board full —
most territory wins"`, 32–32 cells decided on points (65–63), 63 log entries,
and replaying the log through `public/game.js` reproduced the final board
exactly. Frontend files all return HTTP 200. Two bugs found and fixed during
testing: resource values repeated per row (replaced with a hand-designed map)
and `bot.js` dying on HTTP 409 when its slot was already joined (now tolerated).

## QC fixes (run 2026-11-10)

An independent QC review found a dominant capture-first strategy plus
frontend defects D2–D8, D10 (see [BALANCE.md](BALANCE.md)). Fixes: capture
costs 5 points with no resource refund, contested claims cost 2 points, the
"Add bot player" button works on static hosting, replay is view-only with
stepping and "Resume live game", player names are HTML-escaped, lobby codes
are joinable (`GET /api/matches/by-code/:code` + "Join by code" box), server
mode polls every second, the sample bot runs a demo game (both seats) with no
match id, malformed JSON returns 400, and server errors show a message
instead of silently doing nothing.

Re-verification after the fixes:

- Tournament re-run (`node test/round-robin.js`): reserve 10–2, rush 9–3,
  cap3 7–3–2, balanced 6–5–1, captureFirst 5–6–1, claimHigh 3–9, away 0–12;
  captureFirst vs claimHigh 36–28 / 34–30 (no sweep); mirrors end in 62–97
  moves by board-full; longest game in the tournament 107 moves; 3-player
  85–95 moves, 4-player 76 moves — no game reaches the 160-move cap.
- Live checks (`node test/livecheck.js`, 34 checks, all pass against a local
  server): assets 200, create/join (incl. double-join 409), wrong-turn /
  non-adjacent / unaffordable moves 400, malformed JSON 400, join-by-code
  200 + unknown code 404, a full 62-move game via the API ending board-full,
  replay reproducing the final board exactly, `esc()` neutralising an
  `<img onerror>` player name, no `alert(` left in the page, replay
  view-only + polling + join-by-code UI present, 3P/4P creation 201, 5P 400.
- Bot: demo mode (`node bot.js <url>`, no match id) plays both seats to a
  finish in 62 moves; intended flow (human-created match + `bot.js <url>
  <id> 1`) also finishes in 62 moves.

## Files

- `server.js` — Node http server, zero dependencies, in-memory matches.
- `public/game.js` — shared pure game logic (Node + browser).
- `public/index.html`, `public/style.css` — browser frontend.
- `bot.js` — sample bot that plays through the HTTP API.
- `API.md` — full agent API reference with curl examples.
- `BALANCE.md` — balance log: the QC defect, the variants tested, and the
  tournament tables behind the current rules.
