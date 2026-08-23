const { readBody, norm, rateLimit } = require('../lib/auth');
const { getUserByUsername } = require('../lib/users');

// Retorna a pergunta de segurança do usuário (passo 1 do "esqueci a senha").
// Sempre responde 200 com uma pergunta — real se o usuário existe, sintética
// (mas estável pro mesmo username) se não existe — pra não permitir
// enumeração de usuários via status code ou ausência do campo.
const FAKE_QUESTIONS = [
  'Qual o nome do seu primeiro animal de estimação?',
  'Qual a cidade onde você nasceu?',
  'Qual o nome de solteira da sua mãe?',
  'Qual foi o modelo do seu primeiro carro?',
  'Qual o nome da sua escola primária?',
];
function fakeQuestionFor(u) {
  let h = 5381;
  for (let i = 0; i < u.length; i++) h = ((h << 5) + h + u.charCodeAt(i)) | 0;
  return FAKE_QUESTIONS[Math.abs(h) % FAKE_QUESTIONS.length];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const u = norm(body.username);
  if (!u) return res.status(400).json({ error: 'Informe o usuário.' });

  const allowed = await rateLimit(req, 'forgot', u, 8, 600); // 8 tentativas / 10min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });

  const rec = await getUserByUsername(u);
  return res.status(200).json({ question: rec ? rec.question : fakeQuestionFor(u) });
};
