const MN = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const EC = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Assinaturas', 'Vestuário', 'Faturas', 'Outros'];
const IC = ['Salário', 'Freelance', 'Investimentos', 'Extra', 'Outros'];
const IT = ['Renda Fixa', 'Ações', 'FIIs', 'Criptomoedas', 'Tesouro Direto', 'CDB/LCI/LCA', 'Poupança', 'Outros'];
const CL = {
  Moradia: '#0a84ff',
  Alimentação: '#34c759',
  Transporte: '#ffd60a',
  Saúde: '#ff9f0a',
  Lazer: '#bf5af2',
  Educação: '#ff375f',
  Assinaturas: '#64d2ff',
  Faturas: '#191970',
  Vestuário: '#ff6961',
  Outros: '#6b6b72',
  Salário: '#34c759',
  Freelance: '#30d158',
  Investimentos: '#0a84ff',
  Extra: '#ffd60a',
  'Renda Fixa': '#0a84ff',
  Ações: '#34c759',
  FIIs: '#bf5af2',
  Criptomoedas: '#ffd60a',
  'Tesouro Direto': '#32d0c4',
  'CDB/LCI/LCA': '#ff9f0a',
  Poupança: '#64d2ff',
};
const IC2 = {
  Moradia: '🏠',
  Alimentação: '🛒',
  Transporte: '🚗',
  Saúde: '💊',
  Lazer: '🎮',
  Educação: '📚',
  Assinaturas: '📡',
  Faturas: '💳',
  Vestuário: '👕',
  Outros: '📌',
  Salário: '💼',
  Freelance: '💻',
  Investimentos: '📈',
  Extra: '⚡',
  'Renda Fixa': '🔒',
  Ações: '📊',
  FIIs: '🏢',
  Criptomoedas: '₿',
  'Tesouro Direto': '🏛',
  'CDB/LCI/LCA': '🏦',
  Poupança: '💰',
};
const RECUR_MONTHS = 11; // quantos meses futuros recebem cópia de lançamentos recorrentes

let cm = new Date().getMonth(),
  cy = new Date().getFullYear();
let mtype = '',
  curPage = 'overview',
  hfilt = 'all',
  hquery = '',
  hglobal = false; // "buscar em todo o histórico" (cross-mês, via GET /api/search) em vez de só o mês corrente
let editId = null; // id do item em edição (null = criar novo)
let catCI = null,
  histCI = null,
  invCI = null,
  netCI = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const mk = (m, y) => `mvf3_${y ?? cy}_${m ?? cm}`;
// ===== MODO DEMO (read-only, dados fake em memória, não toca localStorage/API) =====
const DEMO = new URLSearchParams(location.search).has('demo');
const DEMO_STORE = {};
function demoDate(off) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
}
function seedDemo() {
  DEMO_STORE[mk()] = JSON.stringify({
    salary: 5800,
    income: [
      { id: 'd_sal', name: 'Salário', value: 5800, cat: 'Salário', _salary: true },
      { id: 'd_free', name: 'Projeto freelance', value: 1450, cat: 'Freelance' },
    ],
    expenses: [
      { id: 'd_e1', name: 'Mercado do mês', value: 842.3, cat: 'Alimentação' },
      { id: 'd_e2', name: 'Transporte (app + ônibus)', value: 168.9, cat: 'Transporte' },
      { id: 'd_e3', name: 'Streaming', value: 54.8, cat: 'Assinaturas' },
      { id: 'd_e4', name: 'Farmácia', value: 96.4, cat: 'Saúde' },
    ],
    bills: [
      { id: 'd_b1', name: 'Aluguel', value: 1650, cat: 'Moradia', dueDate: demoDate(7), paid: false, recur: true },
      { id: 'd_b2', name: 'Energia', value: 214.7, cat: 'Faturas', dueDate: demoDate(-3), paid: true },
      { id: 'd_b3', name: 'Internet', value: 99.9, cat: 'Assinaturas', dueDate: demoDate(11), paid: false, recur: true },
    ],
  });
  let pm = cm - 1,
    py = cy;
  if (pm < 0) {
    pm = 11;
    py--;
  }
  DEMO_STORE[mk(pm, py)] = JSON.stringify({
    salary: 5800,
    income: [{ id: 'd_s2', name: 'Salário', value: 5800, cat: 'Salário', _salary: true }],
    expenses: [
      { id: 'd_x1', name: 'Mercado', value: 910.2, cat: 'Alimentação' },
      { id: 'd_x2', name: 'Cinema + bar', value: 243.5, cat: 'Lazer' },
    ],
    bills: [{ id: 'd_y1', name: 'Aluguel', value: 1650, cat: 'Moradia', dueDate: '', paid: true }],
  });
  DEMO_STORE['mvf3_goals'] = JSON.stringify([
    { id: 'd_g1', name: 'Reserva de emergência', target: 15000, current: 6200, category: 'Segurança', deadline: '' },
    { id: 'd_g2', name: 'Notebook novo', target: 7000, current: 2100, category: 'Equipamento', deadline: demoDate(120) },
  ]);
  DEMO_STORE['mvf3_invest'] = JSON.stringify([
    {
      id: 'd_i1',
      name: 'Tesouro IPCA+ 2029',
      type: 'Tesouro Direto',
      invested: 3000,
      value: 3284.5,
      institution: 'Tesouro Direto',
      date: '',
    },
    { id: 'd_i2', name: 'HGLG11', type: 'FIIs', invested: 1200, value: 1043.8, institution: 'Clear', date: '' },
    { id: 'd_i3', name: 'Bitcoin', type: 'Criptomoedas', invested: 800, value: 1126.4, institution: 'Binance', date: '' },
  ]);
  DEMO_STORE['mvf3_budgets'] = JSON.stringify({ Alimentação: 1000, Transporte: 400, Lazer: 300, Assinaturas: 150 });
}
function demoRO() {
  toast('Demonstração: somente leitura.');
}

// ===== CACHE + SINCRONIZAÇÃO GRANULAR COM A API =====
// localStorage deixou de ser a fonte da verdade (era o blob mvf3_* inteiro,
// sincronizado inteiro a cada mudança — ver ROADMAP.md §6). Agora é só um
// cache offline: a fonte da verdade é o Postgres, acessado por recurso via
// api/transactions.js, api/goals.js, api/investments.js, api/budgets.js.
//
// Pra não precisar reescrever render.js/actions.js/charts.js/export.js
// (que chamam gd/sd/gg/sg/gi/si/gb/sb de forma síncrona em dezenas de
// pontos), essas funções mantêm a MESMA assinatura síncrona de antes: leem
// de um cache em memória (populado via ensureMonthLoaded/hydrateCollections)
// e, ao escrever, atualizam o cache na hora e disparam em segundo plano um
// diff contra o último estado conhecido do servidor pra decidir o que
// criar/atualizar/remover via API — sem esperar a resposta (mesmo
// comportamento "melhor esforço" que o antigo syncPush debounced tinha).
const _cache = { months: {}, goals: null, invest: null, budgets: null };
const _synced = { months: {}, goals: null, invest: null, budgets: null };
const _loading = { months: {} };

function emptyMonth() {
  return { salary: 0, income: [], expenses: [], bills: [] };
}
function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

async function ensureMonthLoaded(m, y) {
  if (DEMO) return;
  const key = mk(m, y);
  if (_cache.months[key]) return;
  if (_loading.months[key]) return _loading.months[key];
  _loading.months[key] = (async () => {
    try {
      const j = await api(`transactions?year=${y}&month=${m}`, 'GET');
      const data = { salary: j.salary || 0, income: j.income || [], expenses: j.expenses || [], bills: j.bills || [] };
      _cache.months[key] = data;
      _synced.months[key] = cloneJson(data);
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      const local = localStorage.getItem(key);
      const data = local ? JSON.parse(local) : emptyMonth();
      _cache.months[key] = data;
      _synced.months[key] = cloneJson(data);
    }
    delete _loading.months[key];
  })();
  return _loading.months[key];
}
async function ensureMonthsLoaded(pairs) {
  if (DEMO) return;
  await Promise.all(pairs.map(([m, y]) => ensureMonthLoaded(m, y)));
}

async function hydrateCollections() {
  if (DEMO) return;
  try {
    const j = await api('goals', 'GET');
    _cache.goals = j.goals || [];
    _synced.goals = cloneJson(_cache.goals);
    localStorage.setItem('mvf3_goals', JSON.stringify(_cache.goals));
  } catch {
    _cache.goals = JSON.parse(localStorage.getItem('mvf3_goals') || '[]');
    _synced.goals = cloneJson(_cache.goals);
  }
  try {
    const j = await api('investments', 'GET');
    _cache.invest = j.investments || [];
    _synced.invest = cloneJson(_cache.invest);
    localStorage.setItem('mvf3_invest', JSON.stringify(_cache.invest));
  } catch {
    _cache.invest = JSON.parse(localStorage.getItem('mvf3_invest') || '[]');
    _synced.invest = cloneJson(_cache.invest);
  }
  try {
    const j = await api('budgets', 'GET');
    _cache.budgets = j.budgets || {};
    _synced.budgets = { ..._cache.budgets };
    localStorage.setItem('mvf3_budgets', JSON.stringify(_cache.budgets));
  } catch {
    _cache.budgets = JSON.parse(localStorage.getItem('mvf3_budgets') || '{}');
    _synced.budgets = { ..._cache.budgets };
  }
}
function resetCache() {
  _cache.months = {};
  _cache.goals = null;
  _cache.invest = null;
  _cache.budgets = null;
  _synced.months = {};
  _synced.goals = null;
  _synced.budgets = null;
  _synced.invest = null;
}

// Substitui o cache de um mês por um valor já sabido-sincronizado com o
// servidor (ex: depois de "Limpar mês"), sem passar pelo diff de sd().
function setMonthCache(key, data) {
  _cache.months[key] = data;
  _synced.months[key] = cloneJson(data);
  localStorage.setItem(key, JSON.stringify(data));
}

// Mescla o resultado de POST /api/import (js/extrato.js) no cache — só
// quando o mês já estava carregado (senão a próxima ensureMonthLoaded busca
// o mês inteiro, já com o import incluído, e não corre risco de sobrescrever
// o cache com uma visão parcial de um mês nunca carregado).
function applyImportedTransactions(items) {
  if (!items || !items.length) return;
  const byMonth = {};
  for (const it of items) {
    const key = mk(it.month, it.year);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(it);
  }
  for (const key of Object.keys(byMonth)) {
    if (!_cache.months[key]) continue;
    const data = cloneJson(_cache.months[key]);
    for (const it of byMonth[key]) {
      const entry = { id: it.id, name: it.name, value: it.value, cat: it.cat };
      if (it.type === 'income') data.income.push(entry);
      else data.expenses.push(entry);
    }
    setMonthCache(key, data);
  }
}

function txFields(t, kind) {
  const f = { name: t.name || '', value: parseFloat(t.value) || 0, cat: t.cat || '', recur: !!t.recur };
  if (kind === 'bill') {
    f.dueDate = t.dueDate || '';
    f.paid = !!t.paid;
  }
  return f;
}
function txSig(t, kind) {
  return JSON.stringify(txFields(t, kind));
}
async function syncTx(method, kind, t, y, m) {
  try {
    if (method === 'DELETE') {
      await api('transactions?id=' + encodeURIComponent(t.id), 'DELETE');
      return;
    }
    const body = { id: t.id, type: kind, name: t.name, value: t.value, cat: t.cat, year: y, month: m, recur: !!t.recur };
    if (kind === 'bill') {
      body.dueDate = t.dueDate || '';
      body.paid = !!t.paid;
    }
    if (kind === 'income' && t._salary) body._salary = true;
    await api('transactions', method, body);
  } catch {
    /* melhor esforço: falha de rede não trava a UI, a próxima edição tenta de novo */
  }
}
async function syncMonth(key, data, m, y) {
  const old = _synced.months[key] || emptyMonth();
  _synced.months[key] = cloneJson(data);
  const groups = [
    ['income', old.income || [], data.income || []],
    ['expense', old.expenses || [], data.expenses || []],
    ['bill', old.bills || [], data.bills || []],
  ];
  for (const [kind, oldArr, newArr] of groups) {
    const oldById = {};
    oldArr.forEach((t) => (oldById[t.id] = t));
    const newIds = new Set(newArr.map((t) => t.id));
    for (const t of newArr) {
      const prev = oldById[t.id];
      if (!prev) await syncTx('POST', kind, t, y, m);
      else if (txSig(t, kind) !== txSig(prev, kind)) await syncTx('PUT', kind, t, y, m);
    }
    for (const t of oldArr) {
      if (!newIds.has(t.id)) await syncTx('DELETE', kind, t, y, m);
    }
  }
}

function goalSig(g) {
  return JSON.stringify({
    name: g.name || '',
    target: parseFloat(g.target) || 0,
    current: parseFloat(g.current) || 0,
    category: g.category || '',
    deadline: g.deadline || '',
  });
}
async function syncGoals(newArr) {
  const old = _synced.goals || [];
  _synced.goals = cloneJson(newArr);
  const oldById = {};
  old.forEach((g) => (oldById[g.id] = g));
  const newIds = new Set(newArr.map((g) => g.id));
  for (const g of newArr) {
    const prev = oldById[g.id];
    try {
      if (!prev) await api('goals', 'POST', g);
      else if (goalSig(g) !== goalSig(prev)) await api('goals', 'PUT', g);
    } catch {
      /* melhor esforço */
    }
  }
  for (const g of old) {
    if (!newIds.has(g.id)) {
      try {
        await api('goals?id=' + encodeURIComponent(g.id), 'DELETE');
      } catch {
        /* melhor esforço */
      }
    }
  }
}

function invSig(i) {
  return JSON.stringify({
    name: i.name || '',
    type: i.type || '',
    invested: parseFloat(i.invested) || 0,
    value: parseFloat(i.value) || 0,
    institution: i.institution || '',
    date: i.date || '',
  });
}
async function syncInvest(newArr) {
  const old = _synced.invest || [];
  _synced.invest = cloneJson(newArr);
  const oldById = {};
  old.forEach((i) => (oldById[i.id] = i));
  const newIds = new Set(newArr.map((i) => i.id));
  for (const i of newArr) {
    const prev = oldById[i.id];
    try {
      if (!prev) await api('investments', 'POST', i);
      else if (invSig(i) !== invSig(prev)) await api('investments', 'PUT', i);
    } catch {
      /* melhor esforço */
    }
  }
  for (const i of old) {
    if (!newIds.has(i.id)) {
      try {
        await api('investments?id=' + encodeURIComponent(i.id), 'DELETE');
      } catch {
        /* melhor esforço */
      }
    }
  }
}

async function syncBudgets(newMap) {
  const old = _synced.budgets || {};
  _synced.budgets = { ...newMap };
  const cats = new Set([...Object.keys(old), ...Object.keys(newMap)]);
  for (const cat of cats) {
    const ov = parseFloat(old[cat]) || 0,
      nv = parseFloat(newMap[cat]) || 0;
    if (ov !== nv) {
      try {
        await api('budgets', 'PUT', { category: cat, limit: nv });
      } catch {
        /* melhor esforço */
      }
    }
  }
}

const rawGet = (k) => (DEMO ? (DEMO_STORE[k] ?? null) : localStorage.getItem(k));

function gd(m, y) {
  if (DEMO) {
    const r = rawGet(mk(m, y));
    return r ? JSON.parse(r) : emptyMonth();
  }
  return _cache.months[mk(m, y)] || emptyMonth();
}
function sd(d, m, y) {
  if (DEMO) return demoRO();
  const key = mk(m, y);
  _cache.months[key] = d;
  localStorage.setItem(key, JSON.stringify(d));
  syncMonth(key, d, m ?? cm, y ?? cy);
}
function gg() {
  if (DEMO) return JSON.parse(rawGet('mvf3_goals') || '[]');
  return _cache.goals || [];
}
function sg(g) {
  if (DEMO) return demoRO();
  _cache.goals = g;
  localStorage.setItem('mvf3_goals', JSON.stringify(g));
  syncGoals(g);
}
function gi() {
  if (DEMO) return JSON.parse(rawGet('mvf3_invest') || '[]');
  return _cache.invest || [];
}
function si(i) {
  if (DEMO) return demoRO();
  _cache.invest = i;
  localStorage.setItem('mvf3_invest', JSON.stringify(i));
  syncInvest(i);
}
function gb() {
  if (DEMO) return JSON.parse(rawGet('mvf3_budgets') || '{}');
  return _cache.budgets || {};
}
function sb(b) {
  if (DEMO) return demoRO();
  _cache.budgets = b;
  localStorage.setItem('mvf3_budgets', JSON.stringify(b));
  syncBudgets(b);
}

const brl = (v) => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ppct = (v) => (v >= 0 ? '+' : '') + parseFloat(v || 0).toFixed(2) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
