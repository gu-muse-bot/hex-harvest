// Round-robin balance check for Hex Harvest.
// Usage: node /tmp/rr.js [game.js path]
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
      if (caps[0]) return caps[0];
      if (!claims.length) return harvest;
      let best = claims[0], bestD = 99;
      for (const m of claims) {
        const d = distToEnemy(state, player, m.row, m.col);
        if (d < bestD || (d === bestD && state.resources[m.row][m.col] > state.resources[best.row][best.col])) { best = m; bestD = d; }
      }
      return best;
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
    case 'cap3': {
      const c3 = caps.find((m) => state.resources[m.row][m.col] === 3);
      return c3 || claims[0] || harvest;
    }
    case 'reserve': return (pts >= 9 && caps[0]) || claims[0] || harvest;
    case 'balanced': {
      // Claim highest; capture a resource-3 enemy cell when affordable,
      // otherwise capture when rich (>=8) — a "sensible" mid strategy.
      const c3 = caps.find((m) => state.resources[m.row][m.col] === 3);
      if (c3) return c3;
      if (pts >= 8 && caps[0]) return caps[0];
      return claims[0] || caps[0] || harvest;
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

const names = ['captureFirst', 'claimHigh', 'rush', 'away', 'cap3', 'reserve', 'balanced'];
console.log('CAPTURE_COST=' + H.CAPTURE_COST + ' HARVEST_GAIN=' + H.HARVEST_GAIN);
const wins = {};
names.forEach((n) => { wins[n] = { w: 0, l: 0, d: 0, margin: 0 }; });
for (let i = 0; i < names.length; i++) {
  for (let j = 0; j < names.length; j++) {
    if (i === j) continue;
    const r = playGame([names[i], names[j]]);
    const a = names[i], b = names[j];
    const w = r.winner;
    const margin = r.cells[0] - r.cells[1];
    if (w === 0) { wins[a].w++; wins[b].l++; }
    else if (w === 1) { wins[b].w++; wins[a].l++; }
    else { wins[a].d++; wins[b].d++; }
    wins[a].margin += margin; wins[b].margin -= margin;
    console.log((a + ' (P0) vs ' + b + ' (P1)').padEnd(38) +
      ' winner=' + (w === null ? 'DRAW' : 'P' + w) +
      ' cells=' + r.cells.join('/') + ' moves=' + r.moves);
  }
}
console.log('\nStandings (each strategy played ' + (2 * (names.length - 1)) + ' games):');
for (const n of names) {
  const s = wins[n];
  console.log('  ' + n.padEnd(13) + ' W' + s.w + ' L' + s.l + ' D' + s.d + '  total cell margin ' + (s.margin >= 0 ? '+' : '') + s.margin);
}
