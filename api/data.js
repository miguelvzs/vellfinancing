const { kv, verify, readBody } = require('../lib/auth');

// Sincronização dos dados financeiros do usuário autenticado.
// GET  -> { data: { <chave mvf3_*>: <valor string>, ... } }
// PUT  -> grava o blob enviado em { data: {...} }
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4MB pro blob inteiro
const MAX_KEY_BYTES = 1 * 1024 * 1024; // 1MB por chave individual
const MAX_KEYS = 500;
const KEY_RE = /^mvf3_[a-z0-9_]+$/;

function validateData(data) {
  const keys = Object.keys(data);
  if (keys.length > MAX_KEYS) return 'Número de chaves excede o limite.';
  let total = 0;
  for (const k of keys) {
    if (!KEY_RE.test(k)) return `Chave inválida: ${k}`;
    const v = data[k];
    if (typeof v !== 'string') return `Valor inválido para ${k}.`;
    const sz = Buffer.byteLength(v, 'utf8');
    if (sz > MAX_KEY_BYTES) return `Valor de ${k} excede o limite por chave.`;
    total += sz;
    if (total > MAX_TOTAL_BYTES) return 'Payload total excede o limite.';
  }
  return null;
}

module.exports = async (req, res) => {
  const auth = verify(req);
  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });
  const key = 'data:' + auth.u;

  if (req.method === 'GET') {
    const d = await kv.get(key);
    return res.status(200).json({ data: d || {} });
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    let body;
    try { body = await readBody(req, MAX_TOTAL_BYTES + 16 * 1024); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const data = body && typeof body.data === 'object' && body.data ? body.data : {};
    const err = validateData(data);
    if (err) return res.status(400).json({ error: err });
    await kv.set(key, data);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Método não permitido.' });
};
