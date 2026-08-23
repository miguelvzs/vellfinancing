// ===== AUTH + SYNC NA NUVEM =====
const AUTH = { token: localStorage.getItem('mvf3_token') || '', user: localStorage.getItem('mvf3_user') || '' };
const escAuth = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (AUTH.token) h['Authorization'] = 'Bearer ' + AUTH.token;
  return h;
}
async function api(path, method, body) {
  const r = await fetch('/api/' + path, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try {
    j = await r.json();
  } catch {
    /* resposta sem corpo JSON (ex: 204/405) */
  }
  if (!r.ok) throw new Error(j.error || 'Erro ' + r.status);
  return j;
}
function authErr(m) {
  const e = document.getElementById('authErr');
  if (e) e.textContent = m || '';
}
function setTab(m) {
  document.getElementById('tabLogin').classList.toggle('on', m === 'login');
  document.getElementById('tabReg').classList.toggle('on', m === 'register');
}

function authMode(m) {
  authErr('');
  if (m === 'login' || m === 'register') setTab(m);
  const b = document.getElementById('authBody');
  if (m === 'login') {
    b.innerHTML = `<div class="fld"><label>Usuário</label><input id="a-user" autocomplete="username"></div>
    <div class="fld"><label>Senha</label><input id="a-pass" type="password" autocomplete="current-password"></div>
    <button class="auth-btn" onclick="doLogin()">Entrar</button>
    <button class="auth-link" onclick="authMode('forgot')">Esqueci minha senha</button>`;
  } else if (m === 'register') {
    b.innerHTML = `<div class="fld"><label>Usuário</label><input id="a-user" autocomplete="username"></div>
    <div class="fld"><label>Senha (mín. 6)</label><input id="a-pass" type="password" autocomplete="new-password"></div>
    <div class="fld"><label>Pergunta de segurança</label><input id="a-q" placeholder="Ex: Nome do meu primeiro pet?"></div>
    <div class="fld"><label>Resposta</label><input id="a-a"></div>
    <button class="auth-btn" onclick="doRegister()">Criar conta</button>`;
  } else if (m === 'forgot') {
    b.innerHTML = `<div class="auth-sub">Informe seu usuário para ver a pergunta de segurança.</div>
    <div class="fld"><label>Usuário</label><input id="a-user"></div>
    <button class="auth-btn" onclick="doForgot()">Continuar</button>
    <button class="auth-link" onclick="authMode('login')">Voltar ao login</button>`;
  }
  bindEnter();
  setTimeout(() => document.getElementById('a-user')?.focus(), 50);
}
function bindEnter() {
  const b = document.getElementById('authBody');
  b.querySelectorAll('input').forEach((i) =>
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        b.querySelector('.auth-btn')?.click();
      }
    }),
  );
}

async function doLogin() {
  authErr('');
  const username = document.getElementById('a-user').value.trim();
  const password = document.getElementById('a-pass').value;
  if (!username || !password) {
    authErr('Preencha usuário e senha.');
    return;
  }
  try {
    const j = await api('auth?action=login', 'POST', { username, password });
    await onAuthed(j);
  } catch (e) {
    authErr(e.message);
  }
}
async function doRegister() {
  authErr('');
  const username = document.getElementById('a-user').value.trim();
  const password = document.getElementById('a-pass').value;
  const question = document.getElementById('a-q').value.trim();
  const answer = document.getElementById('a-a').value.trim();
  if (!username || !password || !question || !answer) {
    authErr('Preencha todos os campos.');
    return;
  }
  try {
    const j = await api('auth?action=register', 'POST', { username, password, question, answer });
    await onAuthed(j);
    toast('Conta criada com sucesso.');
  } catch (e) {
    authErr(e.message);
  }
}
async function doForgot() {
  authErr('');
  const username = document.getElementById('a-user').value.trim();
  if (!username) {
    authErr('Informe o usuário.');
    return;
  }
  try {
    const j = await api('auth?action=forgot', 'POST', { username });
    const b = document.getElementById('authBody');
    b.innerHTML = `<div class="auth-sub"><strong>${escAuth(j.question)}</strong></div>
    <input type="hidden" id="a-user" value="${escAuth(username)}">
    <div class="fld"><label>Resposta de segurança</label><input id="a-a"></div>
    <div class="fld"><label>Nova senha (mín. 6)</label><input id="a-pass" type="password"></div>
    <button class="auth-btn" onclick="doReset()">Redefinir senha</button>
    <button class="auth-link" onclick="authMode('login')">Voltar ao login</button>`;
    bindEnter();
    setTimeout(() => document.getElementById('a-a')?.focus(), 50);
  } catch (e) {
    authErr(e.message);
  }
}
async function doReset() {
  authErr('');
  const username = document.getElementById('a-user').value;
  const answer = document.getElementById('a-a').value.trim();
  const password = document.getElementById('a-pass').value;
  if (!answer || !password) {
    authErr('Preencha resposta e nova senha.');
    return;
  }
  try {
    const j = await api('auth?action=reset', 'POST', { username, answer, password });
    await onAuthed(j);
    toast('Senha redefinida.');
  } catch (e) {
    authErr(e.message);
  }
}

async function onAuthed(j) {
  AUTH.token = j.token;
  AUTH.user = j.username;
  localStorage.setItem('mvf3_token', j.token);
  localStorage.setItem('mvf3_user', j.username);
  await pullData();
  document.body.classList.add('authed');
  const fu = document.getElementById('footUser');
  if (fu) fu.textContent = '@' + AUTH.user;
  render();
}
async function changePass() {
  const current = document.getElementById('ch-cur').value;
  const password = document.getElementById('ch-new').value;
  if (!current || !password) {
    toast('Preencha senha atual e nova.');
    return;
  }
  try {
    await api('auth?action=change', 'POST', { current, password });
    document.getElementById('ch-cur').value = '';
    document.getElementById('ch-new').value = '';
    toast('Senha alterada com sucesso.');
  } catch (e) {
    toast(e.message);
  }
}
function logout() {
  if (DEMO) return;
  localStorage.removeItem('mvf3_token');
  localStorage.removeItem('mvf3_user');
  AUTH.token = '';
  AUTH.user = '';
  Object.keys(localStorage)
    .filter((k) => k.startsWith('mvf3_') && k !== 'mvf3_theme')
    .forEach((k) => localStorage.removeItem(k));
  resetCache();
  _statsCache = null;
  document.body.classList.remove('authed');
  authMode('login');
}
// Popula o cache local a partir da API: metas/investimentos/orçamentos
// (coleções pequenas, tudo de uma vez) + o mês corrente (os demais meses são
// buscados sob demanda por ensureMonthLoaded, ver js/state.js e js/ui.js).
async function pullData() {
  resetCache();
  await Promise.all([hydrateCollections(), ensureMonthLoaded(cm, cy)]);
  refreshTheme();
}

function showDemoBanner() {
  const b = document.createElement('div');
  b.id = 'demoBanner';
  b.innerHTML = 'Modo demonstração · dados fictícios · somente leitura';
  document.body.appendChild(b);
}
async function boot() {
  refreshTheme();
  if (DEMO) {
    seedDemo();
    document.body.classList.add('authed', 'demo');
    const fu = document.getElementById('footUser');
    if (fu) fu.textContent = '@demo';
    showDemoBanner();
    render();
    return;
  }
  authMode('login');
  if (AUTH.token) {
    try {
      await pullData();
      document.body.classList.add('authed');
      const fu = document.getElementById('footUser');
      if (fu) fu.textContent = '@' + AUTH.user;
      render();
    } catch (e) {
      logout();
    }
  }
}
boot();
