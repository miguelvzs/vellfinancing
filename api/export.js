const { eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { reaisFromCents } = require('../lib/resources');

// Dump completo dos dados do usuário no mesmo formato de chaves mvf3_* do
// backup antigo (blob no KV) — mantém o botão "Baixar backup" funcionando
// igual, só que agora lendo do Postgres em vez do localStorage (que passou
// a ser só cache, pode estar incompleto — ver js/state.js).
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
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
};
