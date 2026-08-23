const { and, eq, gte, lte, ilike, desc, sql } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { reaisFromCents } = require('../lib/resources');

const MAX_LIMIT = 500;

// Busca por nome + intervalo de datas cruzando todos os meses — o motivo
// principal de mover pro Postgres (§6): antes, buscar fora do mês corrente
// exigia ter sincronizado o blob inteiro; agora é uma query indexada.
// Parâmetros: q (texto no nome), type (income|expense|bill), from/to
// (YYYY-MM), limit/offset.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  const conditions = [eq(schema.transactions.userId, user.id)];
  if (req.query.type && ['income', 'expense', 'bill'].includes(req.query.type)) {
    conditions.push(eq(schema.transactions.type, req.query.type));
  }
  if (req.query.q) {
    conditions.push(ilike(schema.transactions.name, `%${String(req.query.q).slice(0, 200)}%`));
  }
  const fromYm = parseYearMonth(req.query.from);
  const toYm = parseYearMonth(req.query.to);
  const ymExpr = sql`(${schema.transactions.year} * 12 + ${schema.transactions.month})`;
  if (fromYm != null) conditions.push(gte(ymExpr, fromYm));
  if (toYm != null) conditions.push(lte(ymExpr, toYm));

  const limit = Math.min(parseInt(req.query.limit, 10) || 200, MAX_LIMIT);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const rows = await db
    .select({ tx: schema.transactions, categoryName: schema.categories.name })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(...conditions))
    .orderBy(desc(schema.transactions.year), desc(schema.transactions.month), desc(schema.transactions.createdAt))
    .limit(limit)
    .offset(offset);

  const items = rows.map(({ tx, categoryName }) => ({
    id: tx.id,
    kind: tx.type,
    name: tx.name,
    value: reaisFromCents(tx.valueCents),
    cat: categoryName || '',
    year: tx.year,
    month: tx.month,
    dueDate: tx.dueDate || '',
    paid: !!tx.paid,
  }));

  return res.status(200).json({ items });
};

function parseYearMonth(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10),
    month = parseInt(m[2], 10) - 1; // input é 1-12 (como <input type="month">), armazenamos 0-11
  return year * 12 + month;
}
