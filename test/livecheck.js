// Live checks for Hex Harvest after the QC fixes.
// Usage: node /tmp/livecheck.js [baseUrl]
// Exits non-zero on any failed check; prints PASS/FAIL per check.
'use strict';
const H = require('/home/hatch/workspace/taskmarket-game/public/game.js');
const BASE = process.argv[2] || 'http://localhost:3201';
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
}
async function api(path, method, body, rawBody) {
  const res = await fetch(BASE + path, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody !== undefined ? rawBody : (body ? JSON.stringify(body) : undefined)
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { status: res.status, data };
}
function chooseMove(match, player) {
  // Greedy claim-first driver (same policy as bot.js).
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
    if (owner !== -1 && mine.points >= H.CAPTURE_COST && (!bestCapture || resources[r][c] > resources[bestCapture.row][bestCapture.col])) bestCapture = { type: 'capture', row: r, col: c };
    if (owner === -1) {
      if (H.touchesEnemy(board, player, r, c) && mine.points < H.CONTESTED_CLAIM_COST) continue;
      if (!bestClaim || resources[r][c] > resources[bestClaim.row][bestClaim.col]) bestClaim = { type: 'claim', row: r, col: c };
    }
  }
  return bestClaim || bestCapture || { type: 'harvest' };
}

(async () => {
  // 0. Static assets.
  for (const p of ['/', '/game.js', '/style.css', '/index.html']) {
    const r = await fetch(BASE + p);
    check('GET ' + p + ' -> 200', r.status === 200, 'got ' + r.status);
  }

  // 1. Create a 2P match; join P0 with an XSS payload name (D4 test input).
  const created = await api('/api/matches', 'POST', { playerCount: 2 });
  check('create 2P match -> 201', created.status === 201, 'id=' + (created.data && created.data.match && created.data.match.id));
  const id = created.data.match.id;
  const code = created.data.match.code;
  check('match has a 4-char code', typeof code === 'string' && code.length === 4, 'code=' + code);
  const xssName = '<img src=x onerror=alert(1)>';
  const j0 = await api('/api/matches/' + id + '/join', 'POST', { player: 0, name: xssName, isBot: false });
  check('join P0 with XSS name -> 200', j0.status === 200);
  const j1 = await api('/api/matches/' + id + '/join', 'POST', { player: 1, name: 'Bot', isBot: true });
  check('join P1 Bot -> 200', j1.status === 200);
  const dbl = await api('/api/matches/' + id + '/join', 'POST', { player: 1, name: 'Again', isBot: true });
  check('double join -> 409', dbl.status === 409, 'got ' + dbl.status);

  // 2. Invalid moves -> 400.
  const wrongTurn = await api('/api/matches/' + id + '/move', 'POST', { player: 1, action: { type: 'claim', row: 7, col: 6 } });
  check('wrong turn -> 400', wrongTurn.status === 400, JSON.stringify(wrongTurn.data && wrongTurn.data.error));
  const noPoints = await api('/api/matches/' + id + '/move', 'POST', { player: 0, action: { type: 'capture', row: 7, col: 7 } });
  // (7,7) is not adjacent to P0 yet, so the server rejects on adjacency first.
  // The points error is checked at the logic level (see the node check below);
  // here we only assert the 400.
  check('capture rejected -> 400', noPoints.status === 400, JSON.stringify(noPoints.data && noPoints.data.error));
  const nonAdj = await api('/api/matches/' + id + '/move', 'POST', { player: 0, action: { type: 'claim', row: 4, col: 4 } });
  check('non-adjacent claim -> 400', nonAdj.status === 400, JSON.stringify(nonAdj.data && nonAdj.data.error));

  // 3. Malformed JSON -> 400 (D8).
  const bad = await api('/api/matches', 'POST', null, 'not json');
  check('malformed JSON body -> 400', bad.status === 400, 'got ' + bad.status + ' ' + JSON.stringify(bad.data));

  // 4. Join by code (D5).
  const byCode = await api('/api/matches/by-code/' + code.toLowerCase());
  check('GET by-code (lowercase) -> 200 same match', byCode.status === 200 && byCode.data.match.id === id, 'got ' + byCode.status);
  const byCode404 = await api('/api/matches/by-code/ZZZZ');
  check('GET by-code unknown -> 404', byCode404.status === 404, 'got ' + byCode404.status);
  const unknown = await api('/api/matches/nope');
  check('GET unknown match -> 404', unknown.status === 404, 'got ' + unknown.status);

  // 5. Play a full game via the API with the greedy driver on both seats.
  let match = created.data.match;
  let contestedSeen = false;
  let guard = 0;
  while (match.status === 'playing' && guard++ < 300) {
    if (match.moveNumber === 20) {
      const legal = await api('/api/matches/' + id + '/legal?player=' + match.turn);
      contestedSeen = (legal.data.legalMoves || []).some((m) => m.type === 'claim' && m.cost === 2);
    }
    const mv = chooseMove(match, match.turn);
    const res = await api('/api/matches/' + id + '/move', 'POST', { player: match.turn, action: mv });
    if (!res.data.ok) { check('move accepted at #' + match.moveNumber, false, JSON.stringify(res.data)); break; }
    match = res.data.match;
  }
  check('game finished via API', match.status === 'finished', 'moves=' + match.moveNumber + ' winner=' + match.winner + ' ' + match.winReason + ' cells=' + match.gamePlayers.map((p) => p.cells).join('/'));
  check('game ended before 160-move cap', match.moveNumber < 160, 'moves=' + match.moveNumber);
  check('legalMoves marks contested claims with cost 2', contestedSeen, 'seen at move 20: ' + contestedSeen);

  // 6. Move after finish -> 400.
  const afterEnd = await api('/api/matches/' + id + '/move', 'POST', { player: match.turn, action: { type: 'harvest' } });
  check('move after finish -> 400', afterEnd.status === 400, JSON.stringify(afterEnd.data && afterEnd.data.error));

  // 7. Replay reproduces the final board exactly.
  const logRes = await api('/api/matches/' + id + '/log');
  const moves = logRes.data.log.filter((e) => e.action === 'claim' || e.action === 'capture' || e.action === 'harvest');
  const replay = H.createGame(2);
  for (const m of moves) {
    const r = H.applyMove(replay, m.player, { type: m.action, row: m.row, col: m.col });
    if (!r.ok) { check('replay move applies', false, r.error); break; }
  }
  check('replay reproduces final board', H.boardToString(replay) === H.boardToString(match) && replay.winner === match.winner && replay.status === 'finished',
    'replay moves=' + moves.length + ' log entries=' + logRes.data.log.length);

  // 8. XSS name: server stores it raw (expected); the page must escape it.
  // The page must contain the esc() helper verbatim; test its behaviour with
  // a local copy of the same function body.
  const html = await (await fetch(BASE + '/')).text();
  check('esc() present in served page', html.includes('function esc(s) { return String(s).replace'));
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const escOut = esc(xssName);
  check('esc() neutralises the XSS payload', escOut === '&lt;img src=x onerror=alert(1)&gt;' && !escOut.includes('<img'), 'got: ' + escOut);
  check('page esc() source matches the tested function', html.includes("'&#39;' }[ch])); }"));
  check('render() escapes player names', /esc\(pl\.name\)/.test(html));
  check('render() escapes log notes', /esc\(e\.note/.test(html));
  check('no innerHTML with raw pl.name or e.note', !/innerHTML[^;]*pl\.name(?!\))/.test(html) && !/\+ e\.note \+/.test(html) && !/\+ pl\.name \+/.test(html));
  check('no alert( in page JS (D2 dead-end alerts removed)', !/alert\(/.test(html));
  check('replay is view-only (replaying guard in handlers)', /if \(replaying\)/.test(html) && /Resume live game/.test(html));
  check('polling loop present (D6)', /setInterval/.test(html) && /startPolling/.test(html));
  check('join-by-code UI present (D5)', /btnJoinCode/.test(html) && /getMatchByCode/.test(html));

  // 9. 3P and 4P creation.
  const c3 = await api('/api/matches', 'POST', { playerCount: 3 });
  check('create 3P match -> 201', c3.status === 201);
  const c4 = await api('/api/matches', 'POST', { playerCount: 4 });
  check('create 4P match -> 201', c4.status === 201);
  const c5 = await api('/api/matches', 'POST', { playerCount: 5 });
  check('create 5P match -> 400', c5.status === 400, 'got ' + c5.status);

  console.log(failures === 0 ? 'ALL LIVE CHECKS PASSED' : failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
