// Hex Harvest — sample bot.
// Plays legal moves through the HTTP API. No dependencies, Node 18+ (global fetch).
// Usage:
//   node bot.js [baseUrl] [matchId] [player]
//   node bot.js http://localhost:3000            # creates a 2-player match, joins as player 1, plays to the end
//   node bot.js http://localhost:3000 m123 1     # joins existing match m123 as player 1
// Strategy: claim first (free expansion beats paying 3 points to capture a
// cell your rival can just take back), capture the highest-value adjacent
// enemy cell only when there is nothing left to claim, otherwise harvest.
'use strict';
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
    if (owner !== -1 && mine.points >= 3 && (!bestCapture || resources[r][c] > resources[bestCapture.row][bestCapture.col])) {
      bestCapture = { type: 'capture', row: r, col: c };
    }
    if (owner === -1 && (!bestClaim || resources[r][c] > resources[bestClaim.row][bestClaim.col])) {
      bestClaim = { type: 'claim', row: r, col: c };
    }
  }
  return bestClaim || bestCapture || { type: 'harvest' };
}

async function main() {
  let matchId = MATCH_ARG;
  if (!matchId) {
    const created = await api('/api/matches', 'POST', { playerCount: 2 });
    matchId = created.match.id;
    console.log('Created match', matchId, 'code', created.match.code);
    await api('/api/matches/' + matchId + '/join', 'POST', { player: 0, name: 'Human', isBot: false });
  }
  try {
    await api('/api/matches/' + matchId + '/join', 'POST', { player: PLAYER, name: 'Bot', isBot: true });
  } catch (e) {
    // 409 = slot already taken (e.g. reserved for the bot via the API) — keep playing.
    if (!e.message.includes('409')) throw e;
    console.log('Slot ' + PLAYER + ' already taken (reserved for bot), continuing.');
  }
  console.log('Bot joined match', matchId, 'as player', PLAYER);

  for (let turn = 0; turn < 200; turn++) {
    const { match } = await api('/api/matches/' + matchId);
    if (match.status === 'finished') {
      console.log('Game finished. Winner:', match.winner, '-', match.winReason);
      const log = await api('/api/matches/' + matchId + '/log');
      console.log('Moves played:', log.log.length);
      return;
    }
    if (match.turn !== PLAYER) { await sleep(300); continue; }
    const move = chooseMove(match, PLAYER);
    const result = await api('/api/matches/' + matchId + '/move', 'POST', { player: PLAYER, action: move });
    console.log('Move #' + result.match.moveNumber + ':', move.type, move.row !== undefined ? '(' + move.row + ',' + move.col + ')' : '', '-', result.note);
  }
  console.log('Bot stopped after 200 turns without a finish.');
}
main().catch((e) => { console.error('Bot error:', e.message); process.exit(1); });
