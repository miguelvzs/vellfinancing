const { and, eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, reaisFromCents, resolveCategoryId } = require('../lib/resources');

const MAX_NAME = 200;

function rowToClient(row, categoryName) {
  const base = { id: row.id, name: row.name, value: reaisFromCents(row.valueCents), cat: categoryName || '' };
  if (row.recur) base.recur = true;
  if (row.type === 'income' && row.isSalary) base._salary = true;
  if (row.type === 'bill') {
    base.dueDate = row.dueDate || '';
    base.paid = !!row.paid;
  }
  return base;
}

module.exports = async (req, res) => {
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  if (req.method === 'GET') {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) return res.status(400).json({ error: 'Informe year e month.' });

    const rows = await db
      .select({ tx: schema.transactions, categoryName: schema.categories.name })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.year, year), eq(schema.transactions.month, month)));

    const income = [],
      expenses = [],
      bills = [];
    let salary = 0;
    for (const { tx, categoryName } of rows) {
      const item = rowToClient(tx, categoryName);
      if (tx.type === 'income') {
        income.push(item);
        if (tx.isSalary) salary = item.value;
      } else if (tx.type === 'expense') expenses.push(item);
      else bills.push(item);
    }
    return res.status(200).json({ salary, income, expenses, bills });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.id || !b.type || !b.name || b.value == null) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    if (!['income', 'expense', 'bill'].includes(b.type)) return res.status(400).json({ error: 'Tipo inválido.' });
    const year = parseInt(b.year, 10),
      month = parseInt(b.month, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) return res.status(400).json({ error: 'Informe year e month.' });

    const categoryId = b.cat ? await resolveCategoryId(user.id, b.cat, b.type === 'income' ? 'income' : 'expense') : null;
    try {
      const [row] = await db
        .insert(schema.transactions)
        .values({
          id: String(b.id).slice(0, 40),
          userId: user.id,
          type: b.type,
          name: String(b.name).trim().slice(0, MAX_NAME),
          valueCents: centsFromReais(b.value),
          categoryId,
          year,
          month,
          dueDate: b.type === 'bill' ? b.dueDate || null : null,
          paid: b.type === 'bill' ? !!b.paid : null,
          recur: !!b.recur,
          isSalary: !!b._salary,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        // já existia (retry idempotente) — devolve o estado atual
        const existing = await getById(db, user.id, b.id);
        if (!existing) return res.status(409).json({ error: 'Conflito ao salvar o lançamento.' });
        return res.status(200).json(rowToClient(existing, b.cat || ''));
      }
      return res.status(201).json(rowToClient(row, b.cat || ''));
    } catch (e) {
      return res.status(400).json({ error: 'Não foi possível salvar o lançamento.', detail: String(e.message || e) });
    }
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (!b.id) return res.status(400).json({ error: 'Informe o id.' });
    const patch = { updatedAt: new Date() };
    if (b.name != null) patch.name = String(b.name).trim().slice(0, MAX_NAME);
    if (b.value != null) patch.valueCents = centsFromReais(b.value);
    if (b.dueDate !== undefined) patch.dueDate = b.dueDate || null;
    if (b.paid !== undefined) patch.paid = !!b.paid;
    if (b.recur !== undefined) patch.recur = !!b.recur;
    let categoryName = b.cat;
    if (b.cat) {
      const current = await getById(db, user.id, b.id);
      patch.categoryId = await resolveCategoryId(user.id, b.cat, current && current.type === 'income' ? 'income' : 'expense');
    }
    const [row] = await db
      .update(schema.transactions)
      .set(patch)
      .where(and(eq(schema.transactions.id, b.id), eq(schema.transactions.userId, user.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Lançamento não encontrado.' });
    if (!categoryName) {
      const cat = row.categoryId
        ? await db.select({ name: schema.categories.name }).from(schema.categories).where(eq(schema.categories.id, row.categoryId)).limit(1)
        : [];
      categoryName = cat[0] ? cat[0].name : '';
    }
    return res.status(200).json(rowToClient(row, categoryName));
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id);
    if (id) {
      await db.delete(schema.transactions).where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, user.id)));
      return res.status(200).json({ ok: true });
    }
    // sem id: apaga o mês inteiro (usado por "Limpar mês atual" nas Configurações)
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (Number.isNaN(year) || Number.isNaN(month)) return res.status(400).json({ error: 'Informe id, ou year e month.' });
    await db
      .delete(schema.transactions)
      .where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.year, year), eq(schema.transactions.month, month)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
};

async function getById(db, userId, id) {
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)))
    .limit(1);
  return rows[0] || null;
}
