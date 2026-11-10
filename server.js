// Hex Harvest — game server. Plain Node.js http, zero npm dependencies.
// Run: node server.js   (default port 3000, override with PORT env var)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGame, applyMove, legalMoves } = require('./public/game.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC = path.join(__dirname, 'public');

// In-memory matches: id -> { id, code, playerCount, state, players:[{name,isBot}], createdAt }
const matches = new Map();
let counter = 0;
function newId() { counter += 1; return 'm' + Date.now().toString(36) + counter.toString(36); }
function newCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function publicState(m) {
  return {
    id: m.id, code: m.code, playerCount: m.playerCount,
    players: m.players, createdAt: m.createdAt,
    size: m.state.size, board: m.state.board, resources: m.state.resources,
    gamePlayers: m.state.players, turn: m.state.turn, moveNumber: m.state.moveNumber,
    status: m.state.status, winner: m.state.winner, winReason: m.state.winReason
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    // --- API ---
    if (p === '/api/matches' && req.method === 'POST') {
      const body = await readBody(req);
      const playerCount = body.playerCount || 2;
      if (playerCount < 2 || playerCount > 4) return sendJson(res, 400, { ok: false, error: 'playerCount must be 2-4' });
      const state = createGame(playerCount);
      const m = { id: newId(), code: newCode(), playerCount, state, players: [], createdAt: new Date().toISOString() };
      for (let i = 0; i < playerCount; i++) m.players.push({ slot: i, name: state.players[i].name, isBot: false, joined: false });
      matches.set(m.id, m);
      return sendJson(res, 201, { ok: true, match: publicState(m) });
    }
    if (p === '/api/matches' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, matches: [...matches.values()].map((m) => ({ id: m.id, code: m.code, playerCount: m.playerCount, status: m.state.status, players: m.players })) });
    }
    const matchRoute = p.match(/^\/api\/matches\/([^/]+)(\/(join|move|log|legal))?$/);
    if (matchRoute) {
      const m = matches.get(matchRoute[1]);
      if (!m) return sendJson(res, 404, { ok: false, error: 'match not found' });
      const sub = matchRoute[3];
      if (!sub && req.method === 'GET') return sendJson(res, 200, { ok: true, match: publicState(m) });
      if (sub === 'log' && req.method === 'GET') return sendJson(res, 200, { ok: true, matchId: m.id, log: m.state.log });
      if (sub === 'legal' && req.method === 'GET') {
        const player = parseInt(url.searchParams.get('player') || '0', 10);
        return sendJson(res, 200, { ok: true, player, legalMoves: legalMoves(m.state, player) });
      }
      if (sub === 'join' && req.method === 'POST') {
        const body = await readBody(req);
        const slot = body.player;
        if (typeof slot !== 'number' || slot < 0 || slot >= m.playerCount) return sendJson(res, 400, { ok: false, error: 'player must be 0..' + (m.playerCount - 1) });
        if (m.players[slot].joined) return sendJson(res, 409, { ok: false, error: 'slot ' + slot + ' already taken' });
        m.players[slot] = { slot, name: body.name || m.players[slot].name, isBot: !!body.isBot, joined: true };
        return sendJson(res, 200, { ok: true, match: publicState(m) });
      }
      if (sub === 'move' && req.method === 'POST') {
        const body = await readBody(req);
        if (typeof body.player !== 'number') return sendJson(res, 400, { ok: false, error: 'player (number) required' });
        if (!body.action || !body.action.type) return sendJson(res, 400, { ok: false, error: 'action.type required (claim|capture|harvest)' });
        const result = applyMove(m.state, body.player, body.action);
        if (!result.ok) return sendJson(res, 400, { ok: false, error: result.error, match: publicState(m) });
        return sendJson(res, 200, { ok: true, note: result.note, match: publicState(m) });
      }
      return sendJson(res, 405, { ok: false, error: 'method not allowed for this route' });
    }

    // --- Static files ---
    let file = p === '/' ? '/index.html' : p;
    const filePath = path.join(PUBLIC, decodeURIComponent(file));
    if (!filePath.startsWith(PUBLIC)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    return sendJson(res, 404, { ok: false, error: 'not found: ' + p });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => console.log('Hex Harvest server running at http://localhost:' + PORT));
module.exports = server;
