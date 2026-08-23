const { and, eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, reaisFromCents } = require('../lib/resources');

const MAX_NAME = 200;

function rowToClient(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    invested: reaisFromCents(row.investedCents),
    value: reaisFromCents(row.valueCents),
    institution: row.institution || '',
    date: row.date || '',
  };
}

module.exports = async (req, res) => {
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  if (req.method === 'GET') {
    const rows = await db.select().from(schema.investments).where(eq(schema.investments.userId, user.id));
    return res.status(200).json({ investments: rows.map(rowToClient) });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.id || !b.name || b.invested == null) return res.status(400).json({ error: 'Preencha nome e valor investido.' });
    const [row] = await db
      .insert(schema.investments)
      .values({
        id: String(b.id).slice(0, 40),
        userId: user.id,
        name: String(b.name).trim().slice(0, MAX_NAME),
        type: b.type ? String(b.type).trim().slice(0, 60) : 'Outros',
        investedCents: centsFromReais(b.invested),
        valueCents: centsFromReais(b.value != null ? b.value : b.invested),
        institution: b.institution ? String(b.institution).trim().slice(0, 120) : null,
        date: b.date || null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await getById(db, user.id, b.id);
      if (!existing) return res.status(409).json({ error: 'Conflito ao salvar o ativo.' });
      return res.status(200).json(rowToClient(existing));
    }
    return res.status(201).json(rowToClient(row));
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (!b.id) return res.status(400).json({ error: 'Informe o id.' });
    const patch = { updatedAt: new Date() };
    if (b.name != null) patch.name = String(b.name).trim().slice(0, MAX_NAME);
    if (b.type != null) patch.type = String(b.type).trim().slice(0, 60);
    if (b.invested != null) patch.investedCents = centsFromReais(b.invested);
    if (b.value != null) patch.valueCents = centsFromReais(b.value);
    if (b.institution !== undefined) patch.institution = b.institution ? String(b.institution).trim().slice(0, 120) : null;
    if (b.date !== undefined) patch.date = b.date || null;
    const [row] = await db
      .update(schema.investments)
      .set(patch)
      .where(and(eq(schema.investments.id, b.id), eq(schema.investments.userId, user.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Ativo não encontrado.' });
    return res.status(200).json(rowToClient(row));
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id);
    if (!id) return res.status(400).json({ error: 'Informe o id.' });
    await db.delete(schema.investments).where(and(eq(schema.investments.id, id), eq(schema.investments.userId, user.id)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
};

async function getById(db, userId, id) {
  const rows = await db
    .select()
    .from(schema.investments)
    .where(and(eq(schema.investments.id, id), eq(schema.investments.userId, userId)))
    .limit(1);
  return rows[0] || null;
}
