# Hex Harvest — Agent HTTP/JSON API

Base URL: the game server root (default `http://localhost:3000`).
All responses are JSON. Errors are `{ok:false, error:"..."}` with a 4xx/5xx status
(a malformed JSON body is a 400, not a 500).

## Concepts

- A **match** is 2–4 players on an 8×8 board. Player ids are `0..playerCount-1`.
- `board[r][c]` is `-1` (neutral) or the owning player id.
- `resources[r][c]` is the cell's resource value, 1–3 (fixed, deterministic).
- `gamePlayers[i]` is `{id, name, color, points, cells}`.
- `turn` is the player id whose move it is. `status` is `playing` or `finished`.
- Win: first to 39 cells (60% of 64), or the only player left with cells.
  Board-full / move-limit (160 moves) ends the game on most cells, then points.
- Claim: free, gain the cell's resource (1–3 points) — except a cell next to
  an enemy cell is contested ground and costs 2 points. `legalMoves` only
  lists a contested claim when you can afford it, and marks it `cost: 2`.
- Capture: costs 5 points, and you do NOT gain the captured cell's resource.
- Harvest: +3 points, no board change.

## Endpoints

### POST /api/matches — create a match
```bash
curl -s -X POST http://localhost:3000/api/matches \
  -H 'Content-Type: application/json' -d '{"playerCount":2}'
# {"ok":true,"match":{"id":"m...","code":"AB12","playerCount":2,"status":"playing","turn":0,...}}
```
`playerCount` defaults to 2, must be 2–4. Returns 201 with the match object,
including `id` (use it in later calls) and a short lobby `code` to share.

### GET /api/matches/:id — match state
```bash
curl -s http://localhost:3000/api/matches/m123
# {"ok":true,"match":{"board":[[0,-1,...],...],"resources":[[1,2,...],...],
#   "gamePlayers":[{"id":0,"name":"Ruby","points":2,"cells":1},...],
#   "turn":0,"moveNumber":0,"status":"playing","winner":null,"winReason":null}}
```

### GET /api/matches/by-code/:code — find a match by lobby code
```bash
curl -s http://localhost:3000/api/matches/by-code/STBQ
# {"ok":true,"match":{"id":"m...","code":"STBQ",...}}
```
Codes are the short code shown on the match page (unique per match). Unknown
code returns 404. The page also has a "Join by code" box that uses this.

### POST /api/matches/:id/join — join a slot
```bash
curl -s -X POST http://localhost:3000/api/matches/m123/join \
  -H 'Content-Type: application/json' -d '{"player":1,"name":"Bot","isBot":true}'
```
A slot can only be taken once (409 if already taken). Empty seats are filled
by bots — see `bot.js`.

### POST /api/matches/:id/move — make a move
```bash
# Claim an empty cell adjacent to your territory (free, gain its resource):
curl -s -X POST http://localhost:3000/api/matches/m123/move \
  -H 'Content-Type: application/json' -d '{"player":0,"action":{"type":"claim","row":0,"col":1}}'
# Capture an adjacent enemy cell (costs 5 points, no resource gained):
curl -s -X POST http://localhost:3000/api/matches/m123/move \
  -H 'Content-Type: application/json' -d '{"player":0,"action":{"type":"capture","row":2,"col":3}}'
# Harvest (+3 points, no board change):
curl -s -X POST http://localhost:3000/api/matches/m123/move \
  -H 'Content-Type: application/json' -d '{"player":0,"action":{"type":"harvest"}}'
```
Actions are validated: wrong turn, non-adjacent target, claiming a taken cell,
claiming contested ground without 2 points, or capturing without 5 points all
return 400 with an `error` message and the current match state. A successful
move returns `{ok:true, note:"...", match:{...}}`.

### GET /api/matches/:id/log — match log (replay source)
```bash
curl -s http://localhost:3000/api/matches/m123/log
# {"ok":true,"matchId":"m123","log":[{"n":1,"player":0,"action":"claim","row":0,"col":1,
#   "note":"claimed (0,1), +2 points (resource 2)","points":4,"cells":2}, ...]}
```
Replaying the log through the shared game logic (`public/game.js`) reproduces
the final board exactly — the frontend's **Replay from start** button does this
as a view-only, step-by-step replay (Prev/Next), and **Resume live game**
returns to the live match; replaying never disconnects or forks the match.

### GET /api/matches/:id/legal?player=N — legal moves
```bash
curl -s "http://localhost:3000/api/matches/m123/legal?player=0"
# {"ok":true,"player":0,"legalMoves":[{"type":"harvest"},{"type":"claim","row":0,"col":1},...]}
```

### GET /api/matches — list matches
```bash
curl -s http://localhost:3000/api/matches
```

## In-browser API

When the page is loaded, `window.StrategyGameAPI` exposes the same calls
(`createMatch`, `getMatch`, `joinMatch`, `move`, `getLog`) plus
`createLocalGame(playerCount)` / `localMove(player, action)` / `localState()`
for static hosting without a server.

## Sample bot

`bot.js` plays through this API (see its header). Strategy: claim the
highest-value adjacent neutral cell first (free expansion), capture the
highest-value adjacent enemy cell only when nothing is left to claim,
otherwise harvest. Costs come from the shared game logic, so the bot follows
the current rules (capture 5, contested claim 2).

Run with no match id for a demo: it creates a 2-player match and plays both
seats to the end, so a reviewer sees a full game from one command:

```bash
node bot.js http://localhost:3000
```
