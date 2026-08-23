// Helpers compartilhados pelos endpoints de CRUD (api/transactions.js,
// api/goals.js, api/investments.js, api/budgets.js).
const { and, eq } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');

// Dinheiro sempre em centavos no banco — nunca float. O client manda/recebe
// em reais (mesma unidade que os campos <input type="number"> já usam).
function centsFromReais(v) {
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) ? n : 0;
}
function reaisFromCents(c) {
  return Math.round(c) / 100;
}

// Resolve o id de uma categoria pelo nome+tipo pro usuário, criando-a se
// ainda não existir (ex: usuário digitou uma categoria fora da lista padrão
// semeada no registro). Idempotente via a unique index (user_id,name,kind).
async function resolveCategoryId(userId, name, kind) {
  if (!name) return null;
  const db = getDb();
  const clean = String(name).trim().slice(0, 60);
  if (!clean) return null;
  const existing = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.userId, userId), eq(schema.categories.name, clean), eq(schema.categories.kind, kind)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(schema.categories)
    .values({ userId, name: clean, kind })
    .onConflictDoNothing()
    .returning({ id: schema.categories.id });
  if (inserted[0]) return inserted[0].id;
  // corrida: outra requisição criou entre o select e o insert — busca de novo
  const retry = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.userId, userId), eq(schema.categories.name, clean), eq(schema.categories.kind, kind)))
    .limit(1);
  return retry[0] ? retry[0].id : null;
}

module.exports = { centsFromReais, reaisFromCents, resolveCategoryId };
