// Trace a game move by move to see HOW rush wins.
// Usage: node /tmp/trace.js [game.js path] [P0strat] [P1strat]
'use strict';
const path = process.argv[2] || '/home/hatch/workspace/taskmarket-game/public/game.js';
const H = require(path);
const S0 = process.argv[3] || 'rush';
const S1 = process.argv[4] || 'claimHigh';

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
  const caps = moves.filter((m) => m.type === 'capture').sort((a, b) => state.resources[b.row][b.col] - state.resources[a.row][a.col]);
  const claims = moves.filter((m) => m.type === 'claim').sort((a, b) => state.resources[b.row][b.col] - state.resources[a.row][a.col]);
  const harvest = { type: 'harvest' };
  const pts = state.players[player].points;
  switch (name) {
    case 'captureFirst': return caps[0] || claims[0] || harvest;
    case 'claimHigh': return claims[0] || caps[0] || harvest;
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
    default: throw new Error('unknown ' + name);
  }
}

const state = H.createGame(2);
const strats = [S0, S1];
let lastPrint = 0;
console.log('== start ==');
console.log(H.boardToString(state));
while (state.status === 'playing') {
  const p = state.turn;
  const mv = choose(strats[p], state, p);
  const res = H.applyMove(state, p, mv);
  if (state.moveNumber % 10 === 0 || state.status === 'finished') {
    console.log('== after move ' + state.moveNumber + ' (' + strats[p] + ' ' + mv.type +
      (mv.row !== undefined ? ' ' + mv.row + ',' + mv.col : '') + ') cells=' +
      state.players.map((pl) => pl.cells).join('/') + ' pts=' +
      state.players.map((pl) => pl.points).join('/') + ' ==');
    console.log(H.boardToString(state));
  }
}
console.log('RESULT winner=' + state.winner + ' ' + state.winReason + ' moves=' + state.moveNumber);
