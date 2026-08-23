const { eq } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');

// Apaga TODOS os dados financeiros do usuário (mantém a conta e as
// categorias, que são reutilizáveis). Usado por "Apagar tudo" nas
// Configurações — já vem com confirmação no client antes de chegar aqui.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  await Promise.all([
    db.delete(schema.transactions).where(eq(schema.transactions.userId, user.id)),
    db.delete(schema.goals).where(eq(schema.goals.userId, user.id)),
    db.delete(schema.investments).where(eq(schema.investments.userId, user.id)),
    db.delete(schema.budgets).where(eq(schema.budgets.userId, user.id)),
    db.delete(schema.importHashes).where(eq(schema.importHashes.userId, user.id)),
  ]);

  return res.status(200).json({ ok: true });
};
