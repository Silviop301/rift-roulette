// Rift Roulette local server.
// Keeps the Riot API key on this machine and answers the site with only what it needs:
// a Riot ID lookup plus that player's champion mastery. It also serves index.html, so the
// tunnel address is itself a working copy of the site.
// No dependencies: needs Node 18 or newer (built-in fetch).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader: KEY=value lines, # comments. Real environment variables win.
try {
  for (const line of readFileSync(join(HERE, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch { /* no .env file */ }

const KEY = (process.env.RIOT_API_KEY || '').trim();
const PORT = +process.env.PORT || 8787;
// Lets tests point at a mock; {host} becomes e.g. "americas" or "br1".
const RIOT_BASE = process.env.RIOT_BASE || 'https://{host}.api.riotgames.com';
const ORIGINS = new Set(['http://localhost:' + PORT, 'http://127.0.0.1:' + PORT].concat(
  (process.env.ALLOWED_ORIGINS || 'https://silviop301.github.io').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)));

// Platform (where mastery lives) -> regional cluster (where Riot accounts live).
const PLATFORMS = {
  br1: 'americas', la1: 'americas', la2: 'americas', na1: 'americas', oc1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  kr: 'asia', jp1: 'asia', ph2: 'asia', sg2: 'asia', th2: 'asia', tw2: 'asia', vn2: 'asia'
};

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

// Per-visitor limit, so a leaked tunnel address can't burn through the Riot key's quota.
const LIMIT = 20, WINDOW_MS = 60 * 1000;
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > LIMIT;
}

class RiotError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

async function riot(host, path) {
  const url = RIOT_BASE.replace('{host}', host) + path;
  let r;
  try {
    r = await fetch(url, { headers: { 'X-Riot-Token': KEY }, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new RiotError(503, 'riot_down');
  }
  if (r.ok) return r.json();
  if (r.status === 404) throw new RiotError(404, 'not_found');
  if (r.status === 401 || r.status === 403) throw new RiotError(503, 'bad_key');
  if (r.status === 429) throw new RiotError(429, 'rate_limited');
  throw new RiotError(503, 'riot_down');
}

async function player(name, tag, platform) {
  const ck = `${platform}|${name.toLowerCase()}|${tag.toLowerCase()}`, hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const acc = await riot(PLATFORMS[platform],
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  const list = await riot(platform,
    `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(acc.puuid)}`);
  // Compact rows: [championId, level, points, lastPlayTime]. The puuid stays here.
  const data = {
    gameName: acc.gameName, tagLine: acc.tagLine, region: platform,
    mastery: (Array.isArray(list) ? list : []).map(m => [m.championId, m.championLevel, m.championPoints, m.lastPlayTime])
  };
  cache.set(ck, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, Object.assign({
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers));
  res.end(json ? JSON.stringify(body) : body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = (req.headers.origin || '').replace(/\/+$/, '');
  const cors = ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', Object.assign({ 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }, cors));
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, cors);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try { return send(res, 200, readFileSync(join(HERE, '..', 'index.html'), 'utf8')); }
    catch { return send(res, 404, 'index.html not found'); }
  }

  if (url.pathname === '/api/health') return send(res, 200, { ok: true, key: !!KEY }, cors);

  if (url.pathname === '/api/player') {
    // Through Cloudflare Tunnel the visitor's address arrives in this header.
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?';
    if (limited(ip)) return send(res, 429, { error: 'rate_limited' }, cors);
    if (!KEY) return send(res, 503, { error: 'no_key' }, cors);

    const name = (url.searchParams.get('name') || '').trim();
    const tag = (url.searchParams.get('tag') || '').trim().replace(/^#/, '');
    const region = (url.searchParams.get('region') || '').toLowerCase();
    if (!name || name.length > 16 || !tag || tag.length > 5 || !/^[\p{L}\p{N}]+$/u.test(tag) || !PLATFORMS[region]) {
      return send(res, 400, { error: 'bad_input' }, cors);
    }
    try {
      return send(res, 200, await player(name, tag, region), cors);
    } catch (e) {
      if (e instanceof RiotError) return send(res, e.status, { error: e.code }, cors);
      console.error(e);
      return send(res, 500, { error: 'server' }, cors);
    }
  }

  send(res, 404, { error: 'not_found' }, cors);
});

server.listen(PORT, () => {
  console.log(`Rift Roulette: servidor rodando em http://localhost:${PORT}`);
  if (!KEY) console.log('Aviso: sem RIOT_API_KEY. Crie o arquivo server/.env (veja server/.env.example).');
  else if (KEY.startsWith('RGAPI-') === false) console.log('Aviso: a chave não começa com RGAPI-. Confira se copiou certo.');
  console.log('Agora abra o túnel em outra janela: cloudflared tunnel --url http://localhost:' + PORT);
});
