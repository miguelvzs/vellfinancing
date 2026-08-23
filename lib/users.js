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

// Cria o usuário e semeia as categorias padrão numa única transação.
// Retorna null se o username já existir (violação de unicidade) em vez de
// lançar, pra manter o mesmo formato de erro que os endpoints já tratavam.
async function createUser({ username, passHash, question, ansHash }) {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(schema.users).values({ username, passHash, question, ansHash }).returning();
      const categoryRows = [
        ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ userId: user.id, name, kind: 'income' })),
        ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ userId: user.id, name, kind: 'expense' })),
      ];
      await tx.insert(schema.categories).values(categoryRows);
      return user;
    });
  } catch (e) {
    if (String(e.message || '').includes('users_username_unique')) return null;
    throw e;
  }
}

async function updateUserPassword(userId, passHash) {
  const db = getDb();
  await db.update(schema.users).set({ passHash }).where(eq(schema.users.id, userId));
}

module.exports = { getUserByUsername, getUserById, createUser, updateUserPassword, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES };
