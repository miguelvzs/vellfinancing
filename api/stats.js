const { eq, sql } = require('drizzle-orm');
const { requireUser } = require('../lib/auth');
const { getDb, schema } = require('../db/client');

// Estatísticas agregadas pra página de Configurações — antes calculadas no
// client varrendo o localStorage inteiro; agora é uma agregação no banco
// (o ponto de mover pra um banco relacional: agregação server-side em vez
// de puxar tudo e somar no client).
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado.' });
  const db = getDb();

  const [months] = await db
    .select({ n: sql`count(distinct (${schema.transactions.year}, ${schema.transactions.month}))` })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, user.id));
  const counts = await db
    .select({ type: schema.transactions.type, n: sql`count(*)` })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, user.id))
    .groupBy(schema.transactions.type);

  const byType = { income: 0, expense: 0, bill: 0 };
  for (const c of counts) byType[c.type] = Number(c.n);

  return res.status(200).json({
    months: Number(months?.n || 0),
    income: byType.income,
    expenses: byType.expense,
    bills: byType.bill,
  });
};
