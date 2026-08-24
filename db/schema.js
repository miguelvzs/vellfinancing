// Schema relacional (Drizzle ORM, dialeto Postgres). Substitui o blob único
// `data:<username>` no KV por tabelas normalizadas — ver ROADMAP.md §6.
//
// Dinheiro é sempre armazenado como inteiro em centavos (nunca float) pra
// evitar erro de arredondamento em soma de valores monetários.
//
// transactions/goals/investments usam id TEXT gerado pelo client (a mesma
// função `uid()` que o frontend já usa hoje pra chave de item na lista) em
// vez de serial do banco. Isso é o que permite o frontend continuar gerando
// o id no momento da criação (offline-first) e a camada de sync em
// js/state.js fazer diff local→servidor por id sem depender de round-trip
// pra descobrir o id definitivo.
const { pgTable, serial, text, integer, boolean, date, timestamp, uniqueIndex, index, pgEnum } = require('drizzle-orm/pg-core');

const categoryKind = pgEnum('category_kind', ['income', 'expense']);
const txType = pgEnum('tx_type', ['income', 'expense', 'bill']);

// passHash/question/ansHash são opcionais pra permitir contas só-Google (sem
// senha nem pergunta de segurança). googleId identifica a conta Google
// (sub do token, imutável); email é só informativo (também vira o username).
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passHash: text('pass_hash'),
  question: text('question'),
  ansHash: text('ans_hash'),
  googleId: text('google_id').unique(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Categorias por usuário — seedadas a partir das listas fixas (EC/IC) que o
// app já usa hoje, e editáveis a partir daqui (feature do §5: gestão de
// categorias). `kind` separa categorias de receita e despesa/conta.
const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: categoryKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_user_name_kind_idx').on(t.userId, t.name, t.kind)],
);

// Receitas, despesas e contas a pagar unificadas numa tabela só — os três
// compartilham a mesma forma (nome, valor, categoria, mês/ano) e só bills
// usam due_date/paid. Ter uma tabela em vez de três facilita relatório e
// busca cross-tipo (histórico já mistura os três hoje).
const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(), // gerado pelo client (uid())
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: txType('type').notNull(),
    name: text('name').notNull(),
    valueCents: integer('value_cents').notNull(),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(), // 0-11, mesma convenção do frontend (Date#getMonth)
    dueDate: date('due_date'), // só bills
    paid: boolean('paid'), // só bills
    recur: boolean('recur').notNull().default(false),
    isSalary: boolean('is_salary').notNull().default(false), // marca a entrada de renda mensal (equivalente ao _salary do blob)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transactions_user_year_month_idx').on(t.userId, t.year, t.month),
    index('transactions_user_type_idx').on(t.userId, t.type),
    index('transactions_user_category_idx').on(t.userId, t.categoryId),
  ],
);

const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    limitCents: integer('limit_cents').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('budgets_user_category_idx').on(t.userId, t.categoryId)],
);

const goals = pgTable(
  'goals',
  {
    id: text('id').primaryKey(), // gerado pelo client (uid())
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetCents: integer('target_cents').notNull(),
    currentCents: integer('current_cents').notNull().default(0),
    category: text('category'), // rótulo livre (ex: "Viagem") — não é uma categoria de transação
    deadline: date('deadline'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('goals_user_idx').on(t.userId)],
);

const investments = pgTable(
  'investments',
  {
    id: text('id').primaryKey(), // gerado pelo client (uid())
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // ex: "Ações", "FIIs" — lista fixa no frontend, não vale a pena virar FK
    investedCents: integer('invested_cents').notNull(),
    valueCents: integer('value_cents').notNull(),
    institution: text('institution'),
    date: date('date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('investments_user_idx').on(t.userId)],
);

// Substitui mvf3_extrato_hashes (localStorage) — dedup de import de extrato
// agora é por linha no banco, uma por usuário+hash.
const importHashes = pgTable(
  'import_hashes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('import_hashes_user_hash_idx').on(t.userId, t.hash)],
);

module.exports = { categoryKind, txType, users, categories, transactions, budgets, goals, investments, importHashes };
