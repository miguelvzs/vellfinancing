const { and, eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, reaisFromCents, resolveCategoryId } = require('../lib/resources');

// Orçamento é um mapa categoria->limite (não uma coleção com id própria,
// mesmo formato que `mvf3_budgets` já usava) — daí GET devolver um objeto
// em vez de array, e PUT fazer upsert-ou-remove por nome de categoria.
module.exports = async (req, res) => {
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  if (req.method === 'GET') {
    const rows = await db
      .select({ limitCents: schema.budgets.limitCents, categoryName: schema.categories.name })
      .from(schema.budgets)
      .innerJoin(schema.categories, eq(schema.budgets.categoryId, schema.categories.id))
      .where(eq(schema.budgets.userId, user.id));
    const budgets = {};
    for (const r of rows) budgets[r.categoryName] = reaisFromCents(r.limitCents);
    return res.status(200).json({ budgets });
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (!b.category) return res.status(400).json({ error: 'Informe a categoria.' });
    const categoryId = await resolveCategoryId(user.id, b.category, 'expense');
    if (!categoryId) return res.status(400).json({ error: 'Categoria inválida.' });
    const limitCents = centsFromReais(b.limit || 0);

    if (limitCents <= 0) {
      await db.delete(schema.budgets).where(and(eq(schema.budgets.userId, user.id), eq(schema.budgets.categoryId, categoryId)));
      return res.status(200).json({ ok: true, removed: true });
    }
    await db
      .insert(schema.budgets)
      .values({ userId: user.id, categoryId, limitCents })
      .onConflictDoUpdate({ target: [schema.budgets.userId, schema.budgets.categoryId], set: { limitCents, updatedAt: new Date() } });
    return res.status(200).json({ ok: true, category: b.category, limit: reaisFromCents(limitCents) });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
};
