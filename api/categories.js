const { and, eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');

const MAX_NAME = 60;

// Gestão de categorias (§5 do brief): as listas EC/IC fixas no frontend
// continuam sendo a sugestão padrão, mas a partir daqui o usuário pode
// criar/renomear/remover as suas. Transações que referenciam uma categoria
// removida ficam sem categoria (categoryId vira null — ver schema, onDelete
// set null), nunca são apagadas.
module.exports = async (req, res) => {
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  if (req.method === 'GET') {
    const kind = req.query.kind;
    const where = kind
      ? and(eq(schema.categories.userId, user.id), eq(schema.categories.kind, kind))
      : eq(schema.categories.userId, user.id);
    const rows = await db.select().from(schema.categories).where(where);
    return res.status(200).json({ categories: rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind })) });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const name = String(b.name || '')
      .trim()
      .slice(0, MAX_NAME);
    const kind = b.kind === 'income' ? 'income' : 'expense';
    if (!name) return res.status(400).json({ error: 'Informe o nome da categoria.' });
    const [row] = await db.insert(schema.categories).values({ userId: user.id, name, kind }).onConflictDoNothing().returning();
    if (!row) {
      const existing = await db
        .select()
        .from(schema.categories)
        .where(and(eq(schema.categories.userId, user.id), eq(schema.categories.name, name), eq(schema.categories.kind, kind)))
        .limit(1);
      return res.status(200).json({ id: existing[0]?.id, name, kind });
    }
    return res.status(201).json({ id: row.id, name: row.name, kind: row.kind });
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    const id = parseInt(b.id, 10);
    const name = String(b.name || '')
      .trim()
      .slice(0, MAX_NAME);
    if (!id || !name) return res.status(400).json({ error: 'Informe id e nome.' });
    const [row] = await db
      .update(schema.categories)
      .set({ name })
      .where(and(eq(schema.categories.id, id), eq(schema.categories.userId, user.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Categoria não encontrada.' });
    return res.status(200).json({ id: row.id, name: row.name, kind: row.kind });
  }

  if (req.method === 'DELETE') {
    const id = parseInt(req.query.id || (req.body && req.body.id), 10);
    if (!id) return res.status(400).json({ error: 'Informe o id.' });
    await db.delete(schema.categories).where(and(eq(schema.categories.id, id), eq(schema.categories.userId, user.id)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
};
