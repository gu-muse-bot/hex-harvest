# Hex Harvest — Agent HTTP/JSON API

Base URL: the game server root (default `http://localhost:3000`).
All responses are JSON. Errors are `{ok:false, error:"..."}` with a 4xx/5xx status.

## Concepts

- A **match** is 2–4 players on an 8×8 board. Player ids are `0..playerCount-1`.
- `board[r][c]` is `-1` (neutral) or the owning player id.
- `resources[r][c]` is the cell's resource value, 1–3 (fixed, deterministic).
- `gamePlayers[i]` is `{id, name, color, points, cells}`.
- `turn` is the player id whose move it is. `status` is `playing` or `finished`.
- Win: first to 39 cells (60% of 64), or the only player left with cells.
  Board-full / move-limit (160 moves) ends the game on most cells, then points.

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
# Capture an adjacent enemy cell (costs 3 points):
curl -s -X POST http://localhost:3000/api/matches/m123/move \
  -H 'Content-Type: application/json' -d '{"player":0,"action":{"type":"capture","row":2,"col":3}}'
# Harvest (+3 points, no board change):
curl -s -X POST http://localhost:3000/api/matches/m123/move \
  -H 'Content-Type: application/json' -d '{"player":0,"action":{"type":"harvest"}}'
```
Actions are validated: wrong turn, non-adjacent target, claiming a taken cell,
or capturing without 3 points all return 400 with an `error` message and the
current match state. A successful move returns `{ok:true, note:"...", match:{...}}`.

### GET /api/matches/:id/log — match log (replay source)
```bash
curl -s http://localhost:3000/api/matches/m123/log
# {"ok":true,"matchId":"m123","log":[{"n":1,"player":0,"action":"claim","row":0,"col":1,
#   "note":"claimed (0,1), +2 points (resource 2)","points":4,"cells":2}, ...]}
```
Replaying the log through the shared game logic (`public/game.js`) reproduces
the final board exactly — the frontend's **Replay from start** button does this.

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
otherwise harvest.
