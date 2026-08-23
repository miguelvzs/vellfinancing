const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, resolveCategoryId } = require('../lib/resources');

const MAX_KEYS = 500;

// Restaura um backup (mesmo formato de api/export.js) fazendo upsert real —
// diferente da sincronização granular normal (que só cria o que não existe),
// aqui a intenção explícita do usuário é "substituir os dados atuais pelos
// do arquivo", então sobrescreve valores que já existem com id igual.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });

  const data = req.body && typeof req.body.data === 'object' ? req.body.data : null;
  if (!data) return res.status(400).json({ error: 'Envie { data: {...} }.' });
  const keys = Object.keys(data);
  if (keys.length > MAX_KEYS) return res.status(400).json({ error: 'Backup grande demais.' });

  const db = getDb();
  let restored = 0;

  for (const key of keys) {
    // backups antigos (formato do blob no KV, anterior à migração pro
    // Postgres — ver ROADMAP.md §6) guardavam cada valor como string JSON;
    // api/export.js já manda objeto direto. Aceita os dois formatos.
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
};

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
