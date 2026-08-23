// Camada de acesso a usuários no Postgres — substitui os registros
// `user:<username>` que viviam no KV (ver ROADMAP.md §6).
const { eq } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');

// Mesmas listas que o frontend usa (js/state.js: IC, EC) — replicadas aqui
// só pra seed inicial de categorias por usuário. Categoria é dado do
// usuário a partir daqui (editável via API), não uma constante compartilhada
// entre client e server, então não vale a pena extrair pra um módulo comum.
const DEFAULT_INCOME_CATEGORIES = ['Salário', 'Freelance', 'Investimentos', 'Extra', 'Outros'];
const DEFAULT_EXPENSE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Lazer',
  'Educação',
  'Assinaturas',
  'Vestuário',
  'Faturas',
  'Outros',
];

async function getUserByUsername(username) {
  const db = getDb();
  const rows = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
  return rows[0] || null;
}

async function getUserById(id) {
  const db = getDb();
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0] || null;
}

// Cria o usuário e semeia as categorias padrão. Sem transação de verdade
// (o driver neon-http é stateless/HTTP puro — não suporta BEGIN/COMMIT
// multi-statement, só `drizzle-orm/neon-serverless` com Pool WebSocket
// suportaria; ficamos no HTTP por simplicidade em função serverless, ver
// ROADMAP.md §6). Não é grave: se o insert de categorias falhar depois do
// usuário criado, `resolveCategoryId` (lib/resources.js) cria a categoria
// sob demanda no primeiro lançamento/orçamento que a referenciar.
// Retorna null se o username já existir (violação de unicidade) em vez de
// lançar, pra manter o mesmo formato de erro que os endpoints já tratavam.
async function createUser({ username, passHash, question, ansHash }) {
  const db = getDb();
  let user;
  try {
    [user] = await db.insert(schema.users).values({ username, passHash, question, ansHash }).returning();
  } catch (e) {
    if (String(e.message || '').includes('users_username_unique')) return null;
    throw e;
  }
  const categoryRows = [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ userId: user.id, name, kind: 'income' })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ userId: user.id, name, kind: 'expense' })),
  ];
  await db.insert(schema.categories).values(categoryRows);
  return user;
}

async function updateUserPassword(userId, passHash) {
  const db = getDb();
  await db.update(schema.users).set({ passHash }).where(eq(schema.users.id, userId));
}

module.exports = { getUserByUsername, getUserById, createUser, updateUserPassword, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES };
