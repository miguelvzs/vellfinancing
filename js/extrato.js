// ===== IMPORTAR EXTRATO BANCÁRIO (OFX/CSV) =====
const EXP_RULES = {
  Alimentação: ['mercado', 'supermercado', 'hortifruti', 'restaurante', 'ifood', 'padaria', 'acougue', 'ceasa', 'atacad'],
  Transporte: ['posto', 'combust', 'uber', '99app', '99 ', 'estacionamento', 'pedagio', 'shell', 'ipiranga', 'petrobras'],
  Moradia: ['aluguel', 'condominio', 'iptu', 'imobiliaria'],
  Saúde: ['farmacia', 'drogaria', 'hospital', 'clinica', 'plano de saude', 'laboratorio'],
  Assinaturas: ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'assinatura', 'youtube premium'],
  Faturas: ['fatura cartao', 'cartao de credito', 'pagamento de fatura'],
  Vestuário: ['renner', 'c&a', 'riachuelo', 'magazine luiza', 'loja de roupa'],
  Educação: ['escola', 'faculdade', 'curso', 'mensalidade escolar'],
  Lazer: ['cinema', 'ingresso', 'viagem', 'hotel', 'bar '],
};
const INC_RULES = {
  Salário: ['salario', 'folha de pagamento'],
  Investimentos: ['rendimento', 'dividendo', 'resgate aplicacao'],
  Freelance: ['freela', 'pix recebido cliente'],
};

function categorizeExtrato(name, kind) {
  const n = name.toLowerCase();
  const rules = kind === 'income' ? INC_RULES : EXP_RULES;
  for (const cat in rules) {
    if (rules[cat].some((k) => n.includes(k))) return cat;
  }
  return kind === 'income' ? 'Extra' : 'Outros';
}

// Usado pelo server (api/import.js reexporta esta função) pra dedup — o
// dedup em si não é mais feito no client (era via mvf3_extrato_hashes no
// localStorage, que não sincronizava entre dispositivos). Ver ROADMAP.md §2.
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) + h + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

function ofxTag(block, tag) {
  const m = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
  return m ? m[1].trim() : '';
}
function ofxDate(raw) {
  const d = raw.trim().slice(0, 8);
  return new Date(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T12:00:00');
}

function parseOfxExtrato(text) {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  return blocks
    .map((b) => {
      const dtposted = ofxTag(b, 'DTPOSTED'),
        trnamt = ofxTag(b, 'TRNAMT'),
        name = ofxTag(b, 'NAME') || ofxTag(b, 'MEMO') || 'Transação';
      if (!dtposted || !trnamt) return null;
      const amount = parseFloat(trnamt.replace(',', '.'));
      if (isNaN(amount)) return null;
      return { date: ofxDate(dtposted), name, value: Math.abs(amount), kind: amount >= 0 ? 'income' : 'expense' };
    })
    .filter(Boolean);
}

function csvDate(raw) {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v + 'T12:00:00');
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return new Date(y + '-' + mo.padStart(2, '0') + '-' + d.padStart(2, '0') + 'T12:00:00');
  }
  return new Date(v);
}
function csvValue(raw) {
  return parseFloat(
    raw
      .trim()
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  );
}

function parseCsvExtrato(text) {
  const delim = text.includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => ['data', 'date', 'dt'].some((k) => h.includes(k)));
  const descIdx = header.findIndex((h) =>
    ['descricao', 'descrição', 'histórico', 'historico', 'description', 'detalhes'].some((k) => h.includes(k)),
  );
  const valIdx = header.findIndex((h) => ['valor', 'value', 'amount', 'montante'].some((k) => h.includes(k)));
  if (dateIdx < 0 || valIdx < 0) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const date = csvDate(cols[dateIdx] || '');
    const value = csvValue(cols[valIdx] || '');
    if (isNaN(date.getTime()) || isNaN(value)) continue;
    out.push({
      date,
      name: (descIdx >= 0 ? cols[descIdx] : 'Transação').trim() || 'Transação',
      value: Math.abs(value),
      kind: value >= 0 ? 'income' : 'expense',
    });
  }
  return out;
}

// Parsing continua no client (precisa de FileReader) — dedup e categorização
// são feitos no server (POST /api/import), que é a fonte da verdade pro
// hash de dedup, então reimportar o mesmo extrato em outro dispositivo não
// duplica nada.
function importExtrato(input) {
  if (DEMO) {
    demoRO();
    input.value = '';
    return;
  }
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const isOfx = /<OFX>/i.test(text) || file.name.toLowerCase().endsWith('.ofx');
    let txns;
    try {
      txns = isOfx ? parseOfxExtrato(text) : parseCsvExtrato(text);
    } catch {
      toast('Não foi possível ler o arquivo.');
      input.value = '';
      return;
    }
    if (!txns.length) {
      toast('Nenhuma transação encontrada no arquivo.');
      input.value = '';
      return;
    }

    const payload = txns.map((t) => ({ date: t.date.toISOString(), name: t.name, value: t.value, kind: t.kind }));
    try {
      const j = await api('import', 'POST', { transactions: payload });
      applyImportedTransactions(j.items || []);
      render();
      const imp = j.imported || 0,
        dup = j.duplicated || 0;
      toast(`${imp} transaç${imp !== 1 ? 'ões' : 'ão'} importada${imp !== 1 ? 's' : ''}` + (dup > 0 ? ` (${dup} já existiam)` : '') + '.');
    } catch (err) {
      toast('Não foi possível importar: ' + err.message);
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function clearMonth() {
  if (DEMO) return demoRO();
  confirm2('Limpar mês', `Apagar todos os lançamentos de ${MN[cm]} de ${cy}? (Metas e investimentos não são afetados.)`, async () => {
    try {
      await api('transactions?year=' + cy + '&month=' + cm, 'DELETE');
      const empty = { salary: 0, income: [], expenses: [], bills: [] };
      const key = mk();
      setMonthCache(key, empty);
      render();
      toast('Mês limpo.');
    } catch (e) {
      toast('Não foi possível limpar o mês: ' + e.message);
    }
  });
}
function clearAll() {
  if (DEMO) return demoRO();
  confirm2(
    'Apagar tudo',
    'Isso apaga TODOS os dados (meses, metas e investimentos) permanentemente. Recomendamos baixar um backup antes. Continuar?',
    async () => {
      try {
        await api('clear-all', 'POST');
        resetCache();
        const keep = ['mvf3_token', 'mvf3_user', 'mvf3_theme'];
        const ks = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('mvf3_') && !keep.includes(k)) ks.push(k);
        }
        ks.forEach((k) => localStorage.removeItem(k));
        goToday();
        toast('Todos os dados foram apagados.');
      } catch (e) {
        toast('Não foi possível apagar os dados: ' + e.message);
      }
    },
  );
}

// Exporta as funções puras (sem dependência de DOM/localStorage) pra teste
// em Node via node:test, e pro server reusar (api/import.js). Em browser,
// `module` não existe e isso é pulado — não afeta o comportamento da página.
if (typeof module !== 'undefined') {
  module.exports = { categorizeExtrato, hashStr, ofxTag, ofxDate, parseOfxExtrato, csvDate, csvValue, parseCsvExtrato };
}
