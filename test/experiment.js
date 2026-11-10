// Experiment runner: test extra strategies / variant rule files.
// Usage: node /tmp/exp.js [game.js path] [pairing ...]
// Pairing format: "rush:rush" or "sentry:rush" (strategies separated by :)
'use strict';
const path = process.argv[2] || '/home/hatch/workspace/taskmarket-game/public/game.js';
const H = require(path);

function friendlyNeighbors(state, player, r, c) {
  let n = 0;
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && state.board[nr][nc] === player) n++;
  });
  return n;
}
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
  const toward = () => {
    if (!claims.length) return null;
    let best = claims[0], bestD = 99;
    for (const m of claims) {
      const d = distToEnemy(state, player, m.row, m.col);
      if (d < bestD || (d === bestD && state.resources[m.row][m.col] > state.resources[best.row][best.col])) { best = m; bestD = d; }
    }
    return best;
  };
  switch (name) {
    case 'captureFirst': return caps[0] || claims[0] || harvest;
    case 'claimHigh': return claims[0] || caps[0] || harvest;
    case 'rush': return caps[0] || toward() || harvest;
    case 'sentry': {
      // Expand toward the enemy; capture the enemy cell deepest inside your
      // territory first (recapture priority), else any capture.
      if (caps.length) {
        const deep = caps.slice().sort((a, b) => friendlyNeighbors(state, player, b.row, b.col) - friendlyNeighbors(state, player, a.row, a.col))[0];
        return deep;
      }
      return toward() || harvest;
    }
    case 'cap3': {
      const c3 = caps.find((m) => state.resources[m.row][m.col] === 3);
      return c3 || claims[0] || harvest;
    }
    case 'reserve': return (pts >= 9 && caps[0]) || claims[0] || harvest;
    case 'balanced': {
      const c3 = caps.find((m) => state.resources[m.row][m.col] === 3);
      if (c3) return c3;
      if (pts >= 8 && caps[0]) return caps[0];
      return claims[0] || caps[0] || harvest;
    }
    case 'away': {
      if (!claims.length) return caps[0] || harvest;
      let best = claims[0], bestD = -1;
      for (const m of claims) {
        const d = distToEnemy(state, player, m.row, m.col);
        if (d > bestD || (d === bestD && state.resources[m.row][m.col] > state.resources[best.row][best.col])) { best = m; bestD = d; }
      }
      return best;
    }
    default: throw new Error('unknown strategy ' + name);
  }
}

function playGame(strategies) {
  const state = H.createGame(strategies.length);
  let guard = 0;
  while (state.status === 'playing' && guard++ < 500) {
    const p = state.turn;
    const res = H.applyMove(state, p, choose(strategies[p], state, p));
    if (!res.ok) throw new Error('illegal move by ' + strategies[p] + ': ' + res.error);
  }
  return {
    winner: state.winner, cells: state.players.map((pl) => pl.cells),
    points: state.players.map((pl) => pl.points), moves: state.moveNumber, reason: state.winReason
  };
}

const pairings = process.argv.slice(3);
console.log('CAPTURE_COST=' + H.CAPTURE_COST + ' HARVEST_GAIN=' + H.HARVEST_GAIN + ' file=' + path);
for (const spec of pairings) {
  const names = spec.split(':');
  const r = playGame(names);
  console.log(names.map((s, i) => 'P' + i + '=' + s).join(' ').padEnd(44) +
    ' winner=' + (r.winner === null ? 'DRAW' : 'P' + r.winner) +
    ' cells=' + r.cells.join('/') + ' pts=' + r.points.join('/') + ' moves=' + r.moves + ' :: ' + r.reason);
}
