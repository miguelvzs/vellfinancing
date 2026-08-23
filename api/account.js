// Consolida stats/export/restore/clear-all num único endpoint, dispatch
// por ?action= — mesmo motivo do api/auth.js: limite de 12 Serverless
// Functions do plano Hobby. Lógica de cada ação idêntica à de quando eram
// arquivos separados.
const { eq, sql } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, reaisFromCents, resolveCategoryId } = require('../lib/resources');

const MAX_KEYS = 500;

async function doStats(req, res, user) {
  const db = getDb();
  const [months] = await db
    .select({ n: sql`count(distinct (${schema.transactions.year}, ${schema.transactions.month}))` })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, user.id));
  const counts = await db
    .select({ type: schema.transactions.type, n: sql`count(*)` })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, user.id))
    .groupBy(schema.transactions.type);
  const byType = { income: 0, expense: 0, bill: 0 };
  for (const c of counts) byType[c.type] = Number(c.n);
  return res.status(200).json({ months: Number(months?.n || 0), income: byType.income, expenses: byType.expense, bills: byType.bill });
}

async function doExport(req, res, user) {
  const db = getDb();
  const [txRows, goalRows, invRows, budgetRows] = await Promise.all([
    db
      .select({ tx: schema.transactions, categoryName: schema.categories.name })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .where(eq(schema.transactions.userId, user.id)),
    db.select().from(schema.goals).where(eq(schema.goals.userId, user.id)),
    db.select().from(schema.investments).where(eq(schema.investments.userId, user.id)),
    db
      .select({ limitCents: schema.budgets.limitCents, categoryName: schema.categories.name })
      .from(schema.budgets)
      .innerJoin(schema.categories, eq(schema.budgets.categoryId, schema.categories.id))
      .where(eq(schema.budgets.userId, user.id)),
  ]);

  const months = {};
  for (const { tx, categoryName } of txRows) {
    const key = `mvf3_${tx.year}_${tx.month}`;
    if (!months[key]) months[key] = { salary: 0, income: [], expenses: [], bills: [] };
    const item = { id: tx.id, name: tx.name, value: reaisFromCents(tx.valueCents), cat: categoryName || '' };
    if (tx.recur) item.recur = true;
    if (tx.type === 'income') {
      if (tx.isSalary) {
        item._salary = true;
        months[key].salary = item.value;
      }
      months[key].income.push(item);
    } else if (tx.type === 'expense') {
      months[key].expenses.push(item);
    } else {
      item.dueDate = tx.dueDate || '';
      item.paid = !!tx.paid;
      months[key].bills.push(item);
    }
  }

  const data = { ...months };
  data.mvf3_goals = goalRows.map((g) => ({
    id: g.id,
    name: g.name,
    target: reaisFromCents(g.targetCents),
    current: reaisFromCents(g.currentCents),
    category: g.category || '',
    deadline: g.deadline || '',
  }));
  data.mvf3_invest = invRows.map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    invested: reaisFromCents(i.investedCents),
    value: reaisFromCents(i.valueCents),
    institution: i.institution || '',
    date: i.date || '',
  }));
  data.mvf3_budgets = {};
  for (const b of budgetRows) data.mvf3_budgets[b.categoryName] = reaisFromCents(b.limitCents);

  return res.status(200).json({ data });
}

async function doRestore(req, res, user, body) {
  const data = body && typeof body.data === 'object' ? body.data : null;
  if (!data) return res.status(400).json({ error: 'Envie { data: {...} }.' });
  const keys = Object.keys(data);
  if (keys.length > MAX_KEYS) return res.status(400).json({ error: 'Backup grande demais.' });

  const db = getDb();
  let restored = 0;

  for (const key of keys) {
    // backups antigos (formato do blob no KV, anterior à migração pro
    // Postgres — ver ROADMAP.md §6) guardavam cada valor como string JSON;
    // o export atual já manda objeto direto. Aceita os dois formatos.
    const raw = data[key];
    const val = typeof raw === 'string' ? safeJson(raw) : raw;
    if (val == null) continue;

    const monthMatch = key.match(/^mvf3_(\d+)_(\d+)$/);
    if (monthMatch) {
      const year = parseInt(monthMatch[1], 10);
      const month = parseInt(monthMatch[2], 10);
      for (const item of val.income || []) {
        await upsertTx(db, user.id, 'income', item, year, month);
        restored++;
      }
      for (const item of val.expenses || []) {
        await upsertTx(db, user.id, 'expense', item, year, month);
        restored++;
      }
      for (const item of val.bills || []) {
        await upsertTx(db, user.id, 'bill', item, year, month);
        restored++;
      }
      continue;
    }
    if (key === 'mvf3_goals' && Array.isArray(val)) {
      for (const g of val) {
        if (!g.id) continue;
        await db
          .insert(schema.goals)
          .values({
            id: String(g.id).slice(0, 40),
            userId: user.id,
            name: String(g.name || '').slice(0, 200),
            targetCents: centsFromReais(g.target),
            currentCents: centsFromReais(g.current || 0),
            category: g.category || null,
            deadline: g.deadline || null,
          })
          .onConflictDoUpdate({
            target: schema.goals.id,
            set: {
              name: String(g.name || '').slice(0, 200),
              targetCents: centsFromReais(g.target),
              currentCents: centsFromReais(g.current || 0),
              category: g.category || null,
              deadline: g.deadline || null,
              updatedAt: new Date(),
            },
          });
        restored++;
      }
      continue;
    }
    if (key === 'mvf3_invest' && Array.isArray(val)) {
      for (const i of val) {
        if (!i.id) continue;
        const values = {
          id: String(i.id).slice(0, 40),
          userId: user.id,
          name: String(i.name || '').slice(0, 200),
          type: i.type || 'Outros',
          investedCents: centsFromReais(i.invested != null ? i.invested : i.value),
          valueCents: centsFromReais(i.value),
          institution: i.institution || null,
          date: i.date || null,
        };
        await db
          .insert(schema.investments)
          .values(values)
          .onConflictDoUpdate({
            target: schema.investments.id,
            set: {
              name: values.name,
              type: values.type,
              investedCents: values.investedCents,
              valueCents: values.valueCents,
              institution: values.institution,
              date: values.date,
              updatedAt: new Date(),
            },
          });
        restored++;
      }
      continue;
    }
    if (key === 'mvf3_budgets' && val && typeof val === 'object') {
      for (const [cat, limit] of Object.entries(val)) {
        const categoryId = await resolveCategoryId(user.id, cat, 'expense');
        if (!categoryId) continue;
        const limitCents = centsFromReais(limit);
        await db
          .insert(schema.budgets)
          .values({ userId: user.id, categoryId, limitCents })
          .onConflictDoUpdate({ target: [schema.budgets.userId, schema.budgets.categoryId], set: { limitCents, updatedAt: new Date() } });
        restored++;
      }
      continue;
    }
    // mvf3_theme e outras chaves desconhecidas: preferência local, ignorada.
  }

  return res.status(200).json({ ok: true, restored });
}

async function doClearAll(req, res, user) {
  const db = getDb();
  await Promise.all([
    db.delete(schema.transactions).where(eq(schema.transactions.userId, user.id)),
    db.delete(schema.goals).where(eq(schema.goals.userId, user.id)),
    db.delete(schema.investments).where(eq(schema.investments.userId, user.id)),
    db.delete(schema.budgets).where(eq(schema.budgets.userId, user.id)),
    db.delete(schema.importHashes).where(eq(schema.importHashes.userId, user.id)),
  ]);
  return res.status(200).json({ ok: true });
}

async function upsertTx(db, userId, type, item, year, month) {
  if (!item.id) return;
  const categoryId = item.cat ? await resolveCategoryId(userId, item.cat, type === 'income' ? 'income' : 'expense') : null;
  const values = {
    id: String(item.id).slice(0, 40),
    userId,
    type,
    name: String(item.name || '').slice(0, 200),
    valueCents: centsFromReais(item.value),
    categoryId,
    year,
    month,
    dueDate: type === 'bill' ? item.dueDate || null : null,
    paid: type === 'bill' ? !!item.paid : null,
    recur: !!item.recur,
    isSalary: !!item._salary,
  };
  await db
    .insert(schema.transactions)
    .values(values)
    .onConflictDoUpdate({
      target: schema.transactions.id,
      set: {
        name: values.name,
        valueCents: values.valueCents,
        categoryId: values.categoryId,
        dueDate: values.dueDate,
        paid: values.paid,
        recur: values.recur,
        isSalary: values.isSalary,
        updatedAt: new Date(),
      },
    });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const action = req.query.action;

  if (action === 'stats') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
    return doStats(req, res, user);
  }
  if (action === 'export') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
    return doExport(req, res, user);
  }
  if (action === 'restore') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    return doRestore(req, res, user, req.body || {});
  }
  if (action === 'clear-all') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
    return doClearAll(req, res, user);
  }
  return res.status(400).json({ error: 'Ação inválida.' });
};
