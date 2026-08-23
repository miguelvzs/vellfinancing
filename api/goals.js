const { and, eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, reaisFromCents } = require('../lib/resources');

const MAX_NAME = 200;

function rowToClient(row) {
  return {
    id: row.id,
    name: row.name,
    target: reaisFromCents(row.targetCents),
    current: reaisFromCents(row.currentCents),
    category: row.category || '',
    deadline: row.deadline || '',
  };
}

module.exports = async (req, res) => {
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  if (req.method === 'GET') {
    const rows = await db.select().from(schema.goals).where(eq(schema.goals.userId, user.id));
    return res.status(200).json({ goals: rows.map(rowToClient) });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.id || !b.name || b.target == null) return res.status(400).json({ error: 'Preencha nome e valor alvo.' });
    const [row] = await db
      .insert(schema.goals)
      .values({
        id: String(b.id).slice(0, 40),
        userId: user.id,
        name: String(b.name).trim().slice(0, MAX_NAME),
        targetCents: centsFromReais(b.target),
        currentCents: centsFromReais(b.current || 0),
        category: b.category ? String(b.category).trim().slice(0, 100) : null,
        deadline: b.deadline || null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await getById(db, user.id, b.id);
      if (!existing) return res.status(409).json({ error: 'Conflito ao salvar a meta.' });
      return res.status(200).json(rowToClient(existing));
    }
    return res.status(201).json(rowToClient(row));
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (!b.id) return res.status(400).json({ error: 'Informe o id.' });
    const patch = { updatedAt: new Date() };
    if (b.name != null) patch.name = String(b.name).trim().slice(0, MAX_NAME);
    if (b.target != null) patch.targetCents = centsFromReais(b.target);
    if (b.current != null) patch.currentCents = centsFromReais(b.current);
    if (b.category !== undefined) patch.category = b.category ? String(b.category).trim().slice(0, 100) : null;
    if (b.deadline !== undefined) patch.deadline = b.deadline || null;
    const [row] = await db
      .update(schema.goals)
      .set(patch)
      .where(and(eq(schema.goals.id, b.id), eq(schema.goals.userId, user.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Meta não encontrada.' });
    return res.status(200).json(rowToClient(row));
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id);
    if (!id) return res.status(400).json({ error: 'Informe o id.' });
    await db.delete(schema.goals).where(and(eq(schema.goals.id, id), eq(schema.goals.userId, user.id)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
};

async function getById(db, userId, id) {
  const rows = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)))
    .limit(1);
  return rows[0] || null;
}
