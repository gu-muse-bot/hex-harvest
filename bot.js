// Hex Harvest — sample bot.
// Plays legal moves through the HTTP API. No dependencies, Node 18+ (global fetch).
// Usage:
//   node bot.js [baseUrl] [matchId] [player]
//   node bot.js http://localhost:3000            # demo: creates a 2-player match and plays BOTH seats to the end
//   node bot.js http://localhost:3000 m123 1     # joins existing match m123 as player 1
// Strategy: claim first (free expansion beats paying 5 points to capture a
// cell your rival can just take back), capture the highest-value adjacent
// enemy cell only when there is nothing left to claim, otherwise harvest.
// Costs come from the shared game logic (public/game.js), so the bot never
// goes stale when the rules change. Contested claims (next to an enemy cell)
// cost points, so the bot skips ones it cannot afford.
'use strict';
const { CAPTURE_COST, CONTESTED_CLAIM_COST, touchesEnemy } = require('./public/game.js');
const BASE = process.argv[2] || 'http://localhost:3000';
const MATCH_ARG = process.argv[3];
const PLAYER = parseInt(process.argv[4] || '1', 10);

async function api(path, method, body) {
  const res = await fetch(BASE + path, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + JSON.stringify(data));
  return data;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function chooseMove(match, player) {
  const { board, resources, gamePlayers } = match;
  const size = board.length;
  const mine = gamePlayers[player];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const touches = (r, c) => dirs.some(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    return nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === player;
  });
  let bestCapture = null, bestClaim = null;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const owner = board[r][c];
    if (owner === player || !touches(r, c)) continue;
    if (owner !== -1 && mine.points >= CAPTURE_COST && (!bestCapture || resources[r][c] > resources[bestCapture.row][bestCapture.col])) {
      bestCapture = { type: 'capture', row: r, col: c };
    }
    if (owner === -1) {
      // A claim next to an enemy cell is contested ground: it costs points.
      if (touchesEnemy(board, player, r, c) && mine.points < CONTESTED_CLAIM_COST) continue;
      if (!bestClaim || resources[r][c] > resources[bestClaim.row][bestClaim.col]) {
        bestClaim = { type: 'claim', row: r, col: c };
      }
    }
  }
  return bestClaim || bestCapture || { type: 'harvest' };
}

async function main() {
  let matchId = MATCH_ARG;
  const demo = !matchId; // D7: no match id given = demo mode, bot plays BOTH seats.
  if (demo) {
    const created = await api('/api/matches', 'POST', { playerCount: 2 });
    matchId = created.match.id;
    console.log('Created match', matchId, 'code', created.match.code);
    console.log('Demo mode: the bot plays both seats (player 0 and player 1).');
    await api('/api/matches/' + matchId + '/join', 'POST', { player: 0, name: 'Bot-A', isBot: true });
  }
  try {
    await api('/api/matches/' + matchId + '/join', 'POST', { player: PLAYER, name: demo ? 'Bot-B' : 'Bot', isBot: true });
  } catch (e) {
    // 409 = slot already taken (e.g. reserved for the bot via the API) — keep playing.
    if (!e.message.includes('409')) throw e;
    console.log('Slot ' + PLAYER + ' already taken (reserved for bot), continuing.');
  }
  console.log('Bot joined match', matchId, 'as player', PLAYER + (demo ? ' (and player 0 in demo mode)' : ''));

  for (let turn = 0; turn < 200; turn++) {
    const { match } = await api('/api/matches/' + matchId);
    if (match.status === 'finished') {
      console.log('Game finished. Winner:', match.winner, '-', match.winReason);
      const log = await api('/api/matches/' + matchId + '/log');
      console.log('Moves played:', log.log.length);
      return;
    }
    // Demo mode: drive whichever seat is to move. Otherwise only our seat.
    const cur = match.turn;
    if (!demo && cur !== PLAYER) { await sleep(300); continue; }
    const move = chooseMove(match, cur);
    const result = await api('/api/matches/' + matchId + '/move', 'POST', { player: cur, action: move });
    console.log('Move #' + result.match.moveNumber + ' (P' + cur + '):', move.type, move.row !== undefined ? '(' + move.row + ',' + move.col + ')' : '', '-', result.note);
  }
  console.log('Bot stopped after 200 turns without a finish.');
}
main().catch((e) => { console.error('Bot error:', e.message); process.exit(1); });
