// Consolida login/register/forgot/reset/change num único endpoint,
// dispatch por ?action= — o plano Hobby da Vercel limita 12 Serverless
// Functions por deployment (api/*.js vira uma função cada), e o projeto
// passou desse limite depois da migração do §6. Lógica de cada ação
// idêntica à de quando eram arquivos separados, só o roteamento mudou.
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { readBody, norm, rateLimit, sign, verify, timingSafeCompare } = require('../lib/auth');
const { getUserByUsername, createUser, updateUserPassword, getOrCreateGoogleUser } = require('../lib/users');

// Cliente lazy (mesmo motivo do getDb() em db/client.js): não falha na
// importação do módulo se GOOGLE_CLIENT_ID ainda não estiver configurada.
let _googleClient = null;
function getGoogleClient() {
  if (!_googleClient) {
    if (!process.env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID não configurada.');
    _googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return _googleClient;
}

const MAX_USER = 32;
const MAX_PASSWORD = 128;
const MAX_QA = 200;

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

async function doLogin(req, res, body) {
  const { username, password } = body;
  const u = norm(username);
  const allowed = await rateLimit(req, 'login', u, 10, 300); // 10 tentativas / 5min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  const rec = await getUserByUsername(u);
  const ok = await timingSafeCompare(password, rec && rec.passHash);
  if (!rec || !ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  return res.status(200).json({ token: sign(u), username: u });
}

async function doRegister(req, res, body) {
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
}

async function doGoogle(req, res, body) {
  const { credential } = body;
  if (!credential) return res.status(400).json({ error: 'Token do Google ausente.' });
  const allowed = await rateLimit(req, 'google', 'anon', 20, 300); // 20 tentativas / 5min por IP (identidade só se sabe após verificar o token)
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });

  let payload;
  try {
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Token do Google inválido.' });
  }
  if (!payload || !payload.sub || !payload.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Conta Google sem e-mail verificado.' });
  }

  const user = await getOrCreateGoogleUser({ googleId: payload.sub, email: norm(payload.email) });
  return res.status(200).json({ token: sign(user.username), username: user.username });
}

async function doForgot(req, res, body) {
  const u = norm(body.username);
  if (!u) return res.status(400).json({ error: 'Informe o usuário.' });
  const allowed = await rateLimit(req, 'forgot', u, 8, 600); // 8 tentativas / 10min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  const rec = await getUserByUsername(u);
  return res.status(200).json({ question: rec ? rec.question : fakeQuestionFor(u) });
}

async function doReset(req, res, body) {
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
}

async function doChange(req, res, body) {
  const auth = verify(req);
  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });
  const allowed = await rateLimit(req, 'change', auth.u, 10, 600); // 10 tentativas / 10min por IP+usuário
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  const { current, password } = body;
  const rec = await getUserByUsername(auth.u);
  if (!rec) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (!rec.passHash) return res.status(400).json({ error: 'Esta conta usa login com Google e não tem senha própria.' });
  const ok = await bcrypt.compare(String(current || ''), rec.passHash);
  if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });
  if (String(password || '').length < 6 || String(password || '').length > 128)
    return res.status(400).json({ error: 'Nova senha precisa ter entre 6 e 128 caracteres.' });
  const passHash = await bcrypt.hash(String(password), 10);
  await updateUserPassword(rec.id, passHash);
  return res.status(200).json({ ok: true });
}

const ACTIONS = { login: doLogin, register: doRegister, google: doGoogle, forgot: doForgot, reset: doReset, change: doChange };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const handler = ACTIONS[req.query.action];
  if (!handler) return res.status(400).json({ error: 'Ação inválida.' });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  return handler(req, res, body);
};
