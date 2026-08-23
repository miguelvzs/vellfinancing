const { kv, sign, readBody, norm, rateLimit, timingSafeCompare } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  let body;
  try { body = await readBody(req); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { username, password } = body;
  const u = norm(username);

  const allowed = await rateLimit(req, 'login', u, 10, 300); // 10 tentativas / 5min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });

  const rec = await kv.get('user:' + u);
  const ok = await timingSafeCompare(password, rec && rec.passHash);
  if (!rec || !ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  return res.status(200).json({ token: sign(u), username: u });
};
