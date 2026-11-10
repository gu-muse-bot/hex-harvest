// Tournament harness for Hex Harvest balance testing.
// Usage: node /tmp/tourney.js [game.js path]
// Strategies are deterministic; each pairing is one full game.
'use strict';
const path = process.argv[2] || '/home/hatch/workspace/taskmarket-game/public/game.js';
const H = require(path);

function distToEnemy(state, player, r, c) {
  let best = 99;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const o = state.board[i][j];
    if (o !== -1 && o !== player) best = Math.min(best, Math.abs(i - r) + Math.abs(j - c));
  }
  return best;
}

function choose(name, state, player) {
  const moves = H.legalMoves(state, player);
  const caps = moves.filter((m) => m.type === 'capture')
    .sort((a, b) => state.resources[b.row][b.col] - state.resources[a.row][a.col]);
  const claims = moves.filter((m) => m.type === 'claim')
    .sort((a, b) => state.resources[b.row][b.col] - state.resources[a.row][a.col]);
  const harvest = { type: 'harvest' };
  const pts = state.players[player].points;
  switch (name) {
    case 'captureFirst': return caps[0] || claims[0] || harvest;
    case 'claimHigh': return claims[0] || caps[0] || harvest;
    case 'harvestAll': return harvest;
    case 'rush': {
      // Expand toward the nearest enemy cell; capture when adjacent.
      if (caps[0]) return caps[0];
      if (!claims.length) return harvest;
      let best = claims[0], bestD = 99;
      for (const m of claims) {
        const d = distToEnemy(state, player, m.row, m.col);
        if (d < bestD || (d === bestD && state.resources[m.row][m.col] > state.resources[best.row][best.col])) {
          best = m; bestD = d;
        }
      }
      return best;
    }
    case 'away': {
      // Expand away from enemy cells.
      if (!claims.length) return caps[0] || harvest;
      let best = claims[0], bestD = -1;
      for (const m of claims) {
        const d = distToEnemy(state, player, m.row, m.col);
        if (d > bestD || (d === bestD && state.resources[m.row][m.col] > state.resources[best.row][best.col])) {
          best = m; bestD = d;
        }
      }
      return best;
    }
    case 'cap3': {
      const c3 = caps.find((m) => state.resources[m.row][m.col] === 3);
      return c3 || claims[0] || harvest;
    }
    case 'reserve': return (pts >= 9 && caps[0]) || claims[0] || harvest;
    default: throw new Error('unknown strategy ' + name);
  }
}

function playGame(strategies) {
  const state = H.createGame(strategies.length);
  let guard = 0;
  while (state.status === 'playing' && guard++ < 500) {
    const p = state.turn;
    const move = choose(strategies[p], state, p);
    const res = H.applyMove(state, p, move);
    if (!res.ok) throw new Error('illegal move by ' + strategies[p] + ': ' + res.error);
  }
  const cells = state.players.map((pl) => pl.cells);
  const points = state.players.map((pl) => pl.points);
  return {
    winner: state.winner, reason: state.winReason,
    cells: cells, points: points, moves: state.moveNumber, status: state.status
  };
}

const pairings = [
  ['captureFirst', 'claimHigh'],
  ['claimHigh', 'captureFirst'],
  ['captureFirst', 'harvestAll'],
  ['captureFirst', 'rush'],
  ['captureFirst', 'away'],
  ['captureFirst', 'cap3'],
  ['captureFirst', 'reserve'],
  ['captureFirst', 'captureFirst'],
  ['claimHigh', 'claimHigh'],
  ['claimHigh', 'cap3'],
  ['claimHigh', 'reserve'],
  ['claimHigh', 'rush'],
  ['claimHigh', 'away'],
  ['captureFirst', 'claimHigh', 'claimHigh'],
  ['claimHigh', 'captureFirst', 'claimHigh'],
  ['captureFirst', 'claimHigh', 'claimHigh', 'claimHigh']
];

console.log('CAPTURE_COST=' + H.CAPTURE_COST + '  HARVEST_GAIN=' + H.HARVEST_GAIN + '  MAX_MOVES=' + H.MAX_MOVES);
for (const p of pairings) {
  const r = playGame(p);
  const label = p.map((s, i) => 'P' + i + '=' + s).join(' ');
  console.log(
    label.padEnd(52) +
    ' winner=' + (r.winner === null ? 'DRAW' : 'P' + r.winner) +
    ' cells=' + r.cells.join('/') +
    ' pts=' + r.points.join('/') +
    ' moves=' + r.moves +
    ' :: ' + r.reason
  );
}
