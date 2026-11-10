// Hex Harvest — shared game logic (pure JS, no dependencies).
// Works in Node (module.exports) and in the browser (window.HexHarvest).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.HexHarvest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SIZE = 8;
  var WIN_CELLS = 39; // 60% of 64, rounded up
  var MAX_MOVES = 160;
  var CAPTURE_COST = 5; // A capture is a 2-cell swing, so it must cost real
  // tempo: no resource refund on capture (claiming still gains the cell's
  // resource). At cost 3 with a refund, "capture everything" was a dominant
  // strategy and mirror games stalled to the move cap (QC 2026-11-10).
  var CONTESTED_CLAIM_COST = 2; // Claiming a cell next to an enemy cell
  // costs 2 points ("contested ground"). Pushing into the middle is no longer
  // free, so an attacker cannot bank points for captures while expanding
  // toward the enemy — and a defender who stays home banks points for free.
  // Balance-tested 2026-11-10 (see BALANCE.md): cost 5 alone still let
  // "rush" sweep 12/12; with contested claims it is 9-3, capture-first no
  // longer sweeps claim-high (36-28 / 34-30), and no game reaches the cap.
  // Cost 8 was also tried: it did not stop "rush" (expand toward the enemy
  // and capture whenever possible) from sweeping, because points come bundled
  // with claims — saving for a capture costs no tempo. See BALANCE.md.
  var HARVEST_GAIN = 3;
  var COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
  var NAMES = ['Ruby', 'Azure', 'Emerald', 'Amber'];
  var CORNERS = [[0, 0], [7, 7], [0, 7], [7, 0]];

  // Fixed hand-designed resource map: values 1-3, no repeating row/column
  // pattern, high-value cells spread across the board so expansion choices matter.
  var RESOURCE_MAP = [
    [1, 2, 3, 1, 2, 3, 2, 1],
    [3, 1, 2, 2, 3, 1, 3, 2],
    [2, 3, 1, 3, 1, 2, 1, 3],
    [1, 2, 2, 1, 3, 3, 2, 1],
    [3, 1, 3, 2, 1, 2, 3, 2],
    [2, 3, 1, 1, 2, 3, 1, 3],
    [1, 2, 3, 3, 1, 1, 2, 2],
    [2, 1, 2, 1, 3, 2, 3, 1]
  ];
  function resourceAt(r, c) { return RESOURCE_MAP[r][c]; }
  function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function adjacent(r, c) {
    var out = [];
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      var nr = r + d[0], nc = c + d[1];
      if (inBounds(nr, nc)) out.push([nr, nc]);
    });
    return out;
  }
  function countCells(board, p) {
    var n = 0;
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (board[r][c] === p) n++;
    return n;
  }
  function touchesOwn(board, player, r, c) {
    return adjacent(r, c).some(function (xy) { return board[xy[0]][xy[1]] === player; });
  }
  function touchesEnemy(board, player, r, c) {
    return adjacent(r, c).some(function (xy) {
      var o = board[xy[0]][xy[1]];
      return o !== -1 && o !== player;
    });
  }

  function createGame(playerCount, opts) {
    opts = opts || {};
    if (playerCount < 2 || playerCount > 4) throw new Error('playerCount must be 2-4');
    var board = [], resources = [];
    for (var r = 0; r < SIZE; r++) {
      board.push([]); resources.push([]);
      for (var c = 0; c < SIZE; c++) { board[r].push(-1); resources[r].push(resourceAt(r, c)); }
    }
    var players = [];
    for (var p = 0; p < playerCount; p++) {
      var corner = CORNERS[p];
      board[corner[0]][corner[1]] = p;
      players.push({ id: p, name: opts.names ? opts.names[p] : NAMES[p], color: COLORS[p], points: 2, cells: 1 });
    }
    return {
      size: SIZE, winCells: WIN_CELLS, board: board, resources: resources,
      players: players, playerCount: playerCount, turn: 0, moveNumber: 0,
      status: 'playing', winner: null, winReason: null, log: []
    };
  }

  function legalMoves(state, player) {
    if (state.status !== 'playing' || state.turn !== player) return [];
    var moves = [{ type: 'harvest' }];
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
      if (state.board[r][c] !== -1) continue;
      if (!touchesOwn(state.board, player, r, c)) continue;
      if (touchesEnemy(state.board, player, r, c)) {
        // Contested ground: costs points, so it is only listed when affordable.
        if (state.players[player].points >= CONTESTED_CLAIM_COST) {
          moves.push({ type: 'claim', row: r, col: c, cost: CONTESTED_CLAIM_COST });
        }
      } else {
        moves.push({ type: 'claim', row: r, col: c });
      }
    }
    if (state.players[player].points >= CAPTURE_COST) {
      for (var r2 = 0; r2 < SIZE; r2++) for (var c2 = 0; c2 < SIZE; c2++) {
        var owner = state.board[r2][c2];
        if (owner === -1 || owner === player) continue;
        if (touchesOwn(state.board, player, r2, c2)) moves.push({ type: 'capture', row: r2, col: c2 });
      }
    }
    return moves;
  }

  function checkWin(state) {
    var alive = [];
    state.players.forEach(function (pl, i) { if (pl.cells > 0) alive.push(i); });
    if (alive.length === 1) return { winner: alive[0], reason: 'eliminated all opponents' };
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].cells >= WIN_CELLS) return { winner: i, reason: 'controls ' + state.players[i].cells + ' cells (60% of the board)' };
    }
    var neutral = 0;
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (state.board[r][c] === -1) neutral++;
    if (neutral === 0 || state.moveNumber >= MAX_MOVES) {
      var best = 0, bestCells = -1, bestPoints = -1, tie = false;
      state.players.forEach(function (pl, idx) {
        if (pl.cells > bestCells || (pl.cells === bestCells && pl.points > bestPoints)) { best = idx; bestCells = pl.cells; bestPoints = pl.points; tie = false; }
        else if (pl.cells === bestCells && pl.points === bestPoints) tie = true;
      });
      if (tie) return { winner: null, reason: 'draw — tied on cells and points' };
      return { winner: best, reason: neutral === 0 ? 'board full — most territory wins' : 'move limit reached — most territory wins' };
    }
    return null;
  }

  function advanceTurn(state) {
    if (state.status !== 'playing') return;
    var next = state.turn;
    for (var i = 0; i < state.playerCount; i++) {
      next = (next + 1) % state.playerCount;
      if (state.players[next].cells > 0) { state.turn = next; return; }
    }
  }

  // action: {type:'claim'|'capture'|'harvest', row?, col?}
  // Returns {ok:true} or {ok:false, error}. Mutates state on success.
  function applyMove(state, player, action) {
    if (state.status !== 'playing') return { ok: false, error: 'game is finished' };
    if (player !== state.turn) return { ok: false, error: 'not player ' + player + ' turn (turn: ' + state.turn + ')' };
    if (state.players[player].cells <= 0) return { ok: false, error: 'player eliminated' };
    if (!action || !action.type) return { ok: false, error: 'action.type required' };
    var pl = state.players[player];
    var note = '';
    if (action.type === 'harvest') {
      pl.points += HARVEST_GAIN; note = 'harvested +' + HARVEST_GAIN + ' points';
    } else if (action.type === 'claim' || action.type === 'capture') {
      var r = action.row, c = action.col;
      if (!inBounds(r, c)) return { ok: false, error: 'cell out of bounds' };
      var owner = state.board[r][c];
      if (action.type === 'claim' && owner !== -1) return { ok: false, error: 'claim target must be neutral' };
      if (action.type === 'capture' && (owner === -1 || owner === player)) return { ok: false, error: 'capture target must be an opponent cell' };
      if (!touchesOwn(state.board, player, r, c)) return { ok: false, error: 'target must be adjacent to your territory' };
      if (action.type === 'capture') {
        if (pl.points < CAPTURE_COST) return { ok: false, error: 'capture costs ' + CAPTURE_COST + ' points, you have ' + pl.points };
        pl.points -= CAPTURE_COST;
        var victim = state.players[owner]; victim.cells -= 1;
        note = 'captured ' + victim.name + ' cell at (' + r + ',' + c + ') for ' + CAPTURE_COST + ' points';
      } else {
        // A claim next to an enemy cell is contested ground: it costs points.
        if (touchesEnemy(state.board, player, r, c)) {
          if (pl.points < CONTESTED_CLAIM_COST) return { ok: false, error: 'contested claim costs ' + CONTESTED_CLAIM_COST + ' points, you have ' + pl.points };
          pl.points -= CONTESTED_CLAIM_COST;
          note = 'claimed contested (' + r + ',' + c + ') for ' + CONTESTED_CLAIM_COST + ' points';
        } else {
          note = 'claimed (' + r + ',' + c + ')';
        }
      }
      state.board[r][c] = player;
      pl.cells += 1;
      if (action.type === 'claim') {
        // Claiming gains the cell's resource; capturing does not (the
        // captured cell's resource is spent, not refunded to the attacker).
        pl.points += state.resources[r][c];
        note += ', +' + state.resources[r][c] + ' points (resource ' + state.resources[r][c] + ')';
      }
    } else {
      return { ok: false, error: 'unknown action type: ' + action.type };
    }
    state.moveNumber += 1;
    state.log.push({ n: state.moveNumber, player: player, action: action.type, row: action.row, col: action.col, note: note, points: pl.points, cells: pl.cells });
    var win = checkWin(state);
    if (win) {
      state.status = 'finished'; state.winner = win.winner; state.winReason = win.reason;
      state.log.push({ n: state.moveNumber, player: player, action: 'game-over', note: win.winner === null ? 'Draw: ' + win.reason : state.players[win.winner].name + ' wins — ' + win.reason });
    } else {
      advanceTurn(state);
    }
    return { ok: true, note: note };
  }

  function boardToString(state) {
    var lines = [];
    for (var r = 0; r < SIZE; r++) {
      var row = '';
      for (var c = 0; c < SIZE; c++) row += state.board[r][c] === -1 ? '.' : String(state.board[r][c]);
      lines.push(row);
    }
    return lines.join('\n');
  }

  return {
    SIZE: SIZE, WIN_CELLS: WIN_CELLS, MAX_MOVES: MAX_MOVES,
    CAPTURE_COST: CAPTURE_COST, HARVEST_GAIN: HARVEST_GAIN,
    CONTESTED_CLAIM_COST: CONTESTED_CLAIM_COST, touchesEnemy: touchesEnemy,
    createGame: createGame, legalMoves: legalMoves, applyMove: applyMove,
    boardToString: boardToString, countCells: countCells
  };
});
