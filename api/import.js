const crypto = require('node:crypto');
const { and, eq, inArray } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');
const { centsFromReais, resolveCategoryId } = require('../lib/resources');
const { categorizeExtrato, hashStr } = require('../js/extrato');

// Import de extrato bancário (OFX/CSV): o parsing do arquivo continua no
// client (precisa de FileReader), mas dedup e categorização são feitos aqui
// — server é a fonte da verdade pro hash, então reimportar o mesmo extrato
// em outro dispositivo não duplica nada (o problema que o dedup só-local em
// localStorage tinha, ver ROADMAP.md §2/§6).
const MAX_BATCH = 2000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });

  const txns = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
  if (!txns.length) return res.status(400).json({ error: 'Nenhuma transação enviada.' });
  if (txns.length > MAX_BATCH) return res.status(400).json({ error: `Máximo de ${MAX_BATCH} transações por importação.` });

  const db = getDb();
  const withHash = txns
    .map((t) => {
      if (!t || !t.date || !t.name || t.value == null || !['income', 'expense'].includes(t.kind)) return null;
      const iso = new Date(t.date).toISOString();
      return { ...t, iso, hash: hashStr(iso + '|' + t.name + '|' + t.value + '|' + t.kind) };
    })
    .filter(Boolean);
  if (!withHash.length) return res.status(400).json({ error: 'Nenhuma transação válida no envio.' });

  const hashes = withHash.map((t) => t.hash);
  const already = await db
    .select({ hash: schema.importHashes.hash })
    .from(schema.importHashes)
    .where(and(eq(schema.importHashes.userId, user.id), inArray(schema.importHashes.hash, hashes)));
  const alreadySet = new Set(already.map((r) => r.hash));

  const novos = withHash.filter((t) => !alreadySet.has(t.hash));
  const duplicadas = withHash.length - novos.length;
  if (!novos.length) return res.status(200).json({ imported: 0, duplicated: duplicadas, items: [] });

  const created = [];
  for (const t of novos) {
    const d = new Date(t.iso);
    const year = d.getFullYear();
    const month = d.getMonth();
    const cat = categorizeExtrato(t.name, t.kind);
    const categoryId = await resolveCategoryId(user.id, cat, t.kind);
    const id = crypto.randomUUID();
    const [row] = await db
      .insert(schema.transactions)
      .values({
        id,
        userId: user.id,
        type: t.kind,
        name: String(t.name).trim().slice(0, 200),
        valueCents: centsFromReais(t.value),
        categoryId,
        year,
        month,
      })
      .returning();
    await db.insert(schema.importHashes).values({ userId: user.id, hash: t.hash }).onConflictDoNothing();
    created.push({ id: row.id, type: row.type, name: row.name, value: t.value, cat, year, month });
  }

  return res.status(200).json({ imported: created.length, duplicated: duplicadas, items: created });
};
