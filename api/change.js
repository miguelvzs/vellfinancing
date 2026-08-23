const bcrypt = require('bcryptjs');
const { verify, readBody, rateLimit } = require('../lib/auth');
const { getUserByUsername, updateUserPassword } = require('../lib/users');

// Troca de senha do usuário autenticado (precisa da senha atual).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const auth = verify(req);
  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });

  const allowed = await rateLimit(req, 'change', auth.u, 10, 600); // 10 tentativas / 10min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const { current, password } = body;
  const rec = await getUserByUsername(auth.u);
  if (!rec) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const ok = await bcrypt.compare(String(current || ''), rec.passHash);
  if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });
  if (String(password || '').length < 6 || String(password || '').length > 128)
    return res.status(400).json({ error: 'Nova senha precisa ter entre 6 e 128 caracteres.' });
  const passHash = await bcrypt.hash(String(password), 10);
  await updateUserPassword(rec.id, passHash);
  return res.status(200).json({ ok: true });
};
