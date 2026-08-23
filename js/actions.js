// ACTIONS
function setSalary() {
  if (DEMO) return demoRO();
  const v = parseFloat(document.getElementById('salIn').value) || 0;
  const data = gd();
  data.salary = v;
  const ei = data.income.findIndex((i) => i._salary);
  if (v > 0) {
    const e = { id: uid(), name: 'Salário', value: v, cat: 'Salário', _salary: true };
    if (ei >= 0) {
      e.id = data.income[ei].id;
      data.income[ei] = e;
    } else data.income.unshift(e);
  } else if (ei >= 0) data.income.splice(ei, 1);
  sd(data);
  const ok = document.getElementById('salOk');
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 2200);
  render();
}

function togBill(id) {
  const data = gd();
  const b = data.bills.find((x) => x.id === id);
  if (b) {
    b.paid = !b.paid;
    sd(data);
    render();
  }
}

// DELETE com confirmação
let confCb = null;
function confirm2(title, msg, onYes, danger = true) {
  document.getElementById('confTitle').textContent = title;
  document.getElementById('confMsg').textContent = msg;
  const y = document.getElementById('confYes');
  y.className = 'msave' + (danger ? ' danger' : '');
  confCb = onYes;
  document.getElementById('confOvl').classList.add('open');
}
function closeConf() {
  document.getElementById('confOvl').classList.remove('open');
  confCb = null;
}
document.getElementById('confYes').addEventListener('click', () => {
  const cb = confCb;
  closeConf();
  if (cb) cb();
});
document.getElementById('confOvl').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeConf();
});

function askDel(type, id) {
  let label = 'este item';
  if (type === 'income') {
    const it = gd().income.find((x) => x.id === id);
    label = 'a receita "' + (it?.name || '') + '"';
  } else if (type === 'expense') {
    const it = gd().expenses.find((x) => x.id === id);
    label = 'a despesa "' + (it?.name || '') + '"';
  } else if (type === 'bill') {
    const it = gd().bills.find((x) => x.id === id);
    label = 'a conta "' + (it?.name || '') + '"';
  } else if (type === 'goal') {
    const it = gg().find((x) => x.id === id);
    label = 'a meta "' + (it?.name || '') + '"';
  } else if (type === 'invest') {
    const it = gi().find((x) => x.id === id);
    label = 'o ativo "' + (it?.name || '') + '"';
  }
  confirm2('Remover', `Tem certeza que deseja remover ${label}? Esta ação não pode ser desfeita.`, () => doDel(type, id));
}
function doDel(type, id) {
  if (type === 'goal') {
    sg(gg().filter((g) => g.id !== id));
  } else if (type === 'invest') {
    si(gi().filter((i) => i.id !== id));
  } else {
    const list = type === 'income' ? 'income' : type === 'expense' ? 'expenses' : 'bills';
    const data = gd();
    data[list] = data[list].filter((i) => i.id !== id);
    if (type === 'income') {
      const rm = data.income;
      if (!rm.some((i) => i._salary)) data.salary = 0;
    }
    sd(data);
  }
  render();
  toast('Removido.');
}

function depGoal(id) {
  openModal(
    'deposit',
    gg().find((g) => g.id === id),
  );
}

// EDIT
function editItem(type, id) {
  let item = null;
  if (type === 'income') item = gd().income.find((x) => x.id === id);
  else if (type === 'expense') item = gd().expenses.find((x) => x.id === id);
  else if (type === 'bill') item = gd().bills.find((x) => x.id === id);
  else if (type === 'goal') item = gg().find((x) => x.id === id);
  else if (type === 'invest') item = gi().find((x) => x.id === id);
  if (!item) return;
  openModal(type, item);
}

// MODAL
function openModal(type, item) {
  mtype = type;
  editId = item && item.id && type !== 'deposit' ? item.id : null;
  const isEdit = !!editId;
  const titles = {
    income: 'Receita',
    expense: 'Despesa',
    bill: 'Conta a Pagar',
    goal: 'Meta de Economia',
    invest: 'Ativo',
    deposit: 'Depositar na Meta',
  };
  let tprefix = type === 'deposit' ? '' : (isEdit ? 'Editar ' : 'Nova/o ').replace('Nova/o ', isEdit ? 'Editar ' : 'Adicionar ');
  document.getElementById('mTitle').textContent =
    type === 'deposit' ? 'Depositar na meta' : (isEdit ? 'Editar ' : 'Adicionar ') + (titles[type] || '');
  document.getElementById('mSaveBtn').textContent = type === 'deposit' ? 'Confirmar' : 'Salvar';
  const mm = String(cm + 1).padStart(2, '0');
  const today = `${cy}-${mm}-${String(new Date().getDate()).padStart(2, '0')}`;
  const recRow = (checked) =>
    `<div class="fld"><label>Repetir todo mês</label><select id="f-rec"><option value="0"${!checked ? ' selected' : ''}>Não</option><option value="1"${checked ? ' selected' : ''}>Sim — lançar nos próximos meses</option></select></div>`;
  let h = '';
  if (type === 'income')
    h = `<div class="fld"><label>Descrição</label><input id="f-name" placeholder="Ex: Bônus, Freela..."/></div><div class="frow"><div class="fld"><label>Valor (R$)</label><input id="f-val" type="number" step="0.01" placeholder="0,00"/></div><div class="fld"><label>Categoria</label><select id="f-cat">${IC.map((c) => `<option>${c}</option>`).join('')}</select></div></div>${isEdit ? '' : recRow(false)}`;
  else if (type === 'expense')
    h = `<div class="fld"><label>Descrição</label><input id="f-name" placeholder="Ex: Mercado, Uber..."/></div><div class="frow"><div class="fld"><label>Valor (R$)</label><input id="f-val" type="number" step="0.01" placeholder="0,00"/></div><div class="fld"><label>Categoria</label><select id="f-cat">${EC.map((c) => `<option>${c}</option>`).join('')}</select></div></div>${isEdit ? '' : recRow(false)}`;
  else if (type === 'bill')
    h = `<div class="fld"><label>Descrição</label><input id="f-name" placeholder="Ex: Aluguel, Energia..."/></div><div class="frow"><div class="fld"><label>Valor (R$)</label><input id="f-val" type="number" step="0.01" placeholder="0,00"/></div><div class="fld"><label>Vencimento</label><input id="f-due" type="date" value="${today}"/></div></div><div class="frow"><div class="fld"><label>Categoria</label><select id="f-cat">${EC.map((c) => `<option>${c}</option>`).join('')}</select></div>${isEdit ? '<div class="fld"></div>' : '<div class="fld"><label>Repetir todo mês</label><select id="f-rec"><option value="0">Não</option><option value="1">Sim — copiar pro próximo mês</option></select></div>'}</div>`;
  else if (type === 'goal')
    h = `<div class="fld"><label>Nome da meta</label><input id="f-name" placeholder="Ex: Reserva de emergência..."/></div><div class="frow"><div class="fld"><label>Valor alvo (R$)</label><input id="f-val" type="number" step="0.01" placeholder="0,00"/></div><div class="fld"><label>Já guardei (R$)</label><input id="f-cur" type="number" step="0.01" placeholder="0,00" value="0"/></div></div><div class="frow"><div class="fld"><label>Categoria</label><input id="f-gcat" placeholder="Ex: Emergência, Viagem..."/></div><div class="fld"><label>Prazo (opcional)</label><input id="f-dl" type="date"/></div></div>`;
  else if (type === 'invest')
    h = `<div class="fld"><label>Nome do ativo</label><input id="f-name" placeholder="Ex: Tesouro IPCA+, PETR4..."/></div><div class="fld"><label>Tipo</label><select id="f-type">${IT.map((t) => `<option>${t}</option>`).join('')}</select></div><div class="frow"><div class="fld"><label>Valor investido (R$)</label><input id="f-inv" type="number" step="0.01" placeholder="0,00"/></div><div class="fld"><label>Valor atual (R$)</label><input id="f-val" type="number" step="0.01" placeholder="0,00"/></div></div><div class="frow"><div class="fld"><label>Instituição</label><input id="f-inst" placeholder="Ex: Nubank, XP..."/></div><div class="fld"><label>Data de aplicação</label><input id="f-date" type="date" value="${today}"/></div></div>`;
  else if (type === 'deposit') {
    const g = item;
    const rem = Math.max(0, g.target - g.current);
    h = `<div class="fld"><label>Meta</label><input value="${esc(g.name)}" disabled style="opacity:.6"/><div class="hint">${brl(g.current)} / ${brl(g.target)} · faltam ${brl(rem)}</div></div><div class="frow"><div class="fld"><label>Valor (R$)</label><input id="f-dep" type="number" step="0.01" placeholder="0,00" autofocus/></div><div class="fld"><label>Operação</label><select id="f-dir"><option value="dep">Depositar</option><option value="wd">Retirar</option></select></div></div>`;
    editId = g.id;
  }
  document.getElementById('mBody').innerHTML = h;

  // preencher campos ao editar
  if (isEdit && item) {
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (e != null && v != null) e.value = v;
    };
    set('f-name', item.name);
    if (type === 'goal') {
      set('f-val', item.target);
      set('f-cur', item.current);
      set('f-gcat', item.category);
      set('f-dl', item.deadline);
    } else if (type === 'invest') {
      set('f-type', item.type);
      set('f-inv', item.invested);
      set('f-val', item.value);
      set('f-inst', item.institution);
      set('f-date', item.date);
    } else {
      set('f-val', item.value);
      set('f-cat', item.cat);
      if (type === 'bill') set('f-due', item.dueDate);
    }
  }

  document.getElementById('ovl').classList.add('open');
  setTimeout(() => (document.getElementById('f-dep') || document.getElementById('f-name'))?.focus(), 60);
}

function closeModal() {
  document.getElementById('ovl').classList.remove('open');
  editId = null;
}
document.getElementById('ovl').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeConf();
  }
  if (e.key === 'Enter') {
    if (document.getElementById('ovl').classList.contains('open') && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      saveModal();
    } else if (document.getElementById('confOvl').classList.contains('open')) {
      e.preventDefault();
      const cb = confCb;
      closeConf();
      if (cb) cb();
    }
  }
});

// copia lançamento recorrente para meses futuros
async function recurForward(listKey, base, months) {
  for (let k = 1; k <= months; k++) {
    let nm = cm + k,
      ny = cy;
    while (nm > 11) {
      nm -= 12;
      ny++;
    }
    // o mês alvo pode nunca ter sido carregado (só o mês atual é buscado no
    // boot — ver js/state.js). Precisa garantir que veio do servidor antes
    // de ler+escrever, senão gd() devolve vazio e sd() apagaria o que já
    // existisse lá.
    await ensureMonthLoaded(nm, ny);
    const nd = gd(nm, ny);
    const copy = { ...base, id: uid(), recur: true };
    if (base.dueDate) {
      const dd = new Date(base.dueDate + 'T12:00:00');
      dd.setMonth(dd.getMonth() + k);
      copy.dueDate = dd.toISOString().slice(0, 10);
      copy.paid = false;
    }
    nd[listKey].push(copy);
    sd(nd, nm, ny);
  }
}

async function saveModal() {
  // DEPÓSITO em meta
  if (mtype === 'deposit') {
    const v = parseFloat(document.getElementById('f-dep')?.value);
    if (!v || isNaN(v) || v <= 0) {
      toast('Informe um valor válido.');
      return;
    }
    const dir = document.getElementById('f-dir')?.value || 'dep';
    const goals = gg();
    const g = goals.find((x) => x.id === editId);
    if (g) {
      g.current = Math.max(0, Math.min(g.target, parseFloat(g.current || 0) + (dir === 'dep' ? v : -v)));
      sg(goals);
    }
    closeModal();
    render();
    toast(dir === 'dep' ? 'Depósito registrado.' : 'Retirada registrada.');
    return;
  }

  const name = document.getElementById('f-name')?.value.trim();
  const val = parseFloat(document.getElementById('f-val')?.value);

  if (mtype === 'invest') {
    const inv = parseFloat(document.getElementById('f-inv')?.value) || val || 0;
    if (!name || !inv) {
      toast('Preencha nome e valor investido.');
      return;
    }
    const cv = val || inv;
    const obj = {
      type: document.getElementById('f-type')?.value || 'Outros',
      invested: inv,
      value: cv,
      institution: document.getElementById('f-inst')?.value || '',
      date: document.getElementById('f-date')?.value || '',
      name,
    };
    const invs = gi();
    if (editId) {
      const idx = invs.findIndex((i) => i.id === editId);
      if (idx >= 0) invs[idx] = { ...invs[idx], ...obj };
    } else invs.push({ id: uid(), ...obj });
    si(invs);
    closeModal();
    render();
    toast(editId ? 'Ativo atualizado.' : 'Ativo adicionado.');
    return;
  }
  if (mtype === 'goal') {
    if (!name || !val || isNaN(val)) {
      toast('Preencha nome e valor alvo.');
      return;
    }
    const cur = parseFloat(document.getElementById('f-cur')?.value) || 0;
    const obj = {
      name,
      target: val,
      current: cur,
      category: document.getElementById('f-gcat')?.value || '',
      deadline: document.getElementById('f-dl')?.value || '',
    };
    const goals = gg();
    if (editId) {
      const idx = goals.findIndex((g) => g.id === editId);
      if (idx >= 0) goals[idx] = { ...goals[idx], ...obj };
    } else goals.push({ id: uid(), ...obj });
    sg(goals);
    closeModal();
    render();
    toast(editId ? 'Meta atualizada.' : 'Meta criada.');
    return;
  }

  if (!name || !val || isNaN(val)) {
    toast('Preencha nome e valor.');
    return;
  }
  const data = gd();
  const cat = document.getElementById('f-cat')?.value || 'Outros';
  const rec = document.getElementById('f-rec')?.value === '1';

  if (mtype === 'income') {
    if (editId) {
      const it = data.income.find((i) => i.id === editId);
      if (it) {
        it.name = name;
        it.value = val;
        it.cat = cat;
      }
    } else data.income.push({ id: uid(), name, value: val, cat, recur: rec });
    sd(data);
    if (rec && !editId) recurForward('income', { name, value: val, cat }, RECUR_MONTHS);
    closeModal();
    render();
    toast(editId ? 'Receita atualizada.' : rec ? 'Receita adicionada + próximos meses.' : 'Salvo.');
    return;
  }
  if (mtype === 'expense') {
    if (editId) {
      const it = data.expenses.find((i) => i.id === editId);
      if (it) {
        it.name = name;
        it.value = val;
        it.cat = cat;
      }
    } else data.expenses.push({ id: uid(), name, value: val, cat, recur: rec });
    sd(data);
    if (rec && !editId) recurForward('expenses', { name, value: val, cat }, RECUR_MONTHS);
    closeModal();
    render();
    toast(editId ? 'Despesa atualizada.' : rec ? 'Despesa adicionada + próximos meses.' : 'Salvo.');
    return;
  }
  if (mtype === 'bill') {
    const due = document.getElementById('f-due')?.value || '';
    if (editId) {
      const it = data.bills.find((i) => i.id === editId);
      if (it) {
        it.name = name;
        it.value = val;
        it.cat = cat;
        it.dueDate = due;
      }
      sd(data);
      closeModal();
      render();
      toast('Conta atualizada.');
      return;
    }
    data.bills.push({ id: uid(), name, value: val, cat, dueDate: due, paid: false, recur: rec });
    if (rec) {
      let nm = cm + 1,
        ny = cy;
      if (nm > 11) {
        nm = 0;
        ny++;
      }
      await ensureMonthLoaded(nm, ny);
      const nd = gd(nm, ny);
      let nDue = '';
      if (due) {
        const dd = new Date(due + 'T12:00:00');
        dd.setMonth(dd.getMonth() + 1);
        nDue = dd.toISOString().slice(0, 10);
      }
      nd.bills.push({ id: uid(), name, value: val, cat, dueDate: nDue, paid: false, recur: true });
      sd(nd, nm, ny);
      sd(data);
      closeModal();
      render();
      toast('Conta adicionada + cópia no próximo mês.');
      return;
    }
    sd(data);
    closeModal();
    render();
    toast('Salvo.');
    return;
  }
}

// GESTÃO DE CATEGORIAS (§5)
async function addCategory() {
  if (DEMO) return demoRO();
  const nameEl = document.getElementById('cat-new-name');
  const kindEl = document.getElementById('cat-new-kind');
  const name = nameEl?.value.trim();
  if (!name) {
    toast('Informe o nome da categoria.');
    return;
  }
  try {
    await api('categories', 'POST', { name, kind: kindEl?.value || 'expense' });
    nameEl.value = '';
    toast('Categoria criada.');
    loadCategories();
  } catch (e) {
    toast('Não foi possível criar a categoria: ' + e.message);
  }
}
async function renameCategory(id, name) {
  if (DEMO) return demoRO();
  name = name.trim();
  if (!name) {
    toast('Nome não pode ficar vazio.');
    loadCategories();
    return;
  }
  try {
    await api('categories', 'PUT', { id, name });
    toast('Categoria renomeada.');
    loadCategories();
    render();
  } catch (e) {
    toast('Não foi possível renomear: ' + e.message);
  }
}
function deleteCategory(id) {
  if (DEMO) return demoRO();
  confirm2('Remover categoria', 'Lançamentos que usam essa categoria ficam sem categoria, mas não são apagados. Continuar?', async () => {
    try {
      await api('categories?id=' + id, 'DELETE');
      toast('Categoria removida.');
      loadCategories();
    } catch (e) {
      toast('Não foi possível remover: ' + e.message);
    }
  });
}
