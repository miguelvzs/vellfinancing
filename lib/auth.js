// Utilidades compartilhadas de autenticação (CommonJS)
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@vercel/kv');

// Aceita tanto as vars da integração "Vercel KV" (KV_*) quanto as do
// Marketplace Upstash (UPSTASH_*), pra funcionar com qualquer uma.
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const IS_PROD = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
const DEV_SECRET = 'dev-insecure-change-me';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (IS_PROD) {
    throw new Error('JWT_SECRET não configurado em produção. Defina a variável de ambiente antes de aceitar requisições.');
  }
  return DEV_SECRET;
}

function sign(username) {
  return jwt.sign({ u: username }, getSecret(), { expiresIn: '7d' });
}

function verify(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  try {
    return jwt.verify(t, getSecret());
  } catch {
    return null;
  }
}

const MAX_BODY_BYTES = 256 * 1024; // 256KB é generoso pra payloads de auth/JSON simples

// Lê o corpo JSON da requisição (Vercel às vezes já parseia, às vezes não),
// aplicando um limite de tamanho pra evitar DoS por body gigante.
function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        if (Buffer.byteLength(req.body, 'utf8') > maxBytes) return reject(httpError(413, 'Corpo da requisição muito grande.'));
        try {
          return resolve(JSON.parse(req.body || '{}'));
        } catch {
          return resolve({});
        }
      }
      return resolve(req.body);
    }
    let d = '';
    let bytes = 0;
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      bytes += c.length;
      if (bytes > maxBytes) {
        aborted = true;
        req.destroy();
        return reject(httpError(413, 'Corpo da requisição muito grande.'));
      }
      d += c;
    });
    req.on('end', () => {
      if (!aborted) {
        try {
          resolve(JSON.parse(d || '{}'));
        } catch {
          resolve({});
        }
      }
    });
    req.on('error', () => {
      if (!aborted) resolve({});
    });
  });
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

// Trava simples de força bruta baseada em KV: N tentativas por janela de tempo,
// combinando IP + identificador (usuário) pra não travar um usuário legítimo
// só porque outra pessoa no mesmo IP errou, nem deixar um IP varrer usuários.
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function rateLimit(req, bucket, ident, limit, windowSeconds) {
  const key = `rl:${bucket}:${clientIp(req)}:${norm(ident)}`;
  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, windowSeconds);
  return count <= limit;
}

// Compara contra um hash bcrypt sempre, mesmo quando o registro não existe,
// pra não vazar por timing se um usuário/username existe ou não.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Y6/vXKq8VZLpAwZoWkI2z3wZJ6q9K';
async function timingSafeCompare(plain, hash) {
  return bcrypt.compare(String(plain || ''), hash || DUMMY_HASH);
}

module.exports = { kv, sign, verify, readBody, norm, rateLimit, timingSafeCompare, httpError, IS_PROD };
