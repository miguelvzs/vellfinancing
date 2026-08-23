const bcrypt = require('bcryptjs');
const { readBody, norm, rateLimit, sign } = require('../lib/auth');
const { getUserByUsername, createUser } = require('../lib/users');

const MAX_USER = 32;
const MAX_PASSWORD = 128;
const MAX_QA = 200;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const { username, password, question, answer } = body;
  const u = norm(username);

  const allowed = await rateLimit(req, 'register', u || 'anon', 5, 3600); // 5 registros / hora por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde e tente novamente.' });

  if (!u || !password || !question || !answer) return res.status(400).json({ error: 'Preencha todos os campos.' });
  if (u.length < 3 || u.length > MAX_USER) return res.status(400).json({ error: `Usuário precisa ter entre 3 e ${MAX_USER} caracteres.` });
  if (!/^[a-z0-9._-]+$/.test(u)) return res.status(400).json({ error: 'Usuário só pode ter letras, números, ponto, hífen e underscore.' });
  if (String(password).length < 6 || String(password).length > MAX_PASSWORD)
    return res.status(400).json({ error: `Senha precisa ter entre 6 e ${MAX_PASSWORD} caracteres.` });
  if (String(question).trim().length > MAX_QA || String(answer).trim().length > MAX_QA)
    return res.status(400).json({ error: 'Pergunta ou resposta muito longa.' });

  const exists = await getUserByUsername(u);
  if (exists) return res.status(409).json({ error: 'Esse usuário já existe.' });

  const passHash = await bcrypt.hash(String(password), 10);
  const ansHash = await bcrypt.hash(norm(answer), 10);
  const user = await createUser({ username: u, passHash, question: String(question).trim().slice(0, MAX_QA), ansHash });
  if (!user) return res.status(409).json({ error: 'Esse usuário já existe.' });

  return res.status(200).json({ token: sign(u), username: u });
};
