const bcrypt = require('bcryptjs');
const { readBody, norm, rateLimit, sign, timingSafeCompare } = require('../lib/auth');
const { getUserByUsername, updateUserPassword } = require('../lib/users');

// Passo 2 do "esqueci a senha": valida resposta de segurança e troca a senha.
// Retorna a mesma mensagem genérica pra usuário inexistente e resposta
// incorreta, pra não confirmar existência de conta.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const { answer, password } = body;
  const u = norm(body.username);

  const allowed = await rateLimit(req, 'reset', u, 8, 600); // 8 tentativas / 10min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });

  const rec = await getUserByUsername(u);
  const ok = await timingSafeCompare(norm(answer), rec && rec.ansHash);
  if (!rec || !ok) return res.status(401).json({ error: 'Usuário ou resposta de segurança inválidos.' });
  if (String(password || '').length < 6 || String(password || '').length > 128)
    return res.status(400).json({ error: 'Nova senha precisa ter entre 6 e 128 caracteres.' });
  const passHash = await bcrypt.hash(String(password), 10);
  await updateUserPassword(rec.id, passHash);
  return res.status(200).json({ token: sign(u), username: u });
};
