#!/usr/bin/env node
// Migração única: lê os blobs `user:*` e `data:*` do KV e importa pras
// tabelas relacionadas no Postgres. Ver a salvaguarda no IMPROVE.md §6 e em
// ROADMAP.md antes de rodar isso contra dados reais.
//
// Uso:
//   node scripts/migrate-kv-to-pg.js            # dry-run: só faz o backup e mostra o que faria
//   node scripts/migrate-kv-to-pg.js --apply     # aplica de verdade (idempotente, seguro de rodar de novo)
//
// Garantias:
//   1. NUNCA escreve nem apaga nada no KV — só lê.
//   2. Sempre grava um backup local (JSON) de tudo que leu do KV antes de
//      tocar no Postgres, e verifica que o backup é legível de volta.
//   3. Idempotente: se o usuário já existe no Postgres, pula ele inteiro
//      (não duplica nada em uma segunda execução).
const fs = require('node:fs');
const path = require('node:path');
const { kv } = require('../lib/auth');
const { getUserByUsername, createUser } = require('../lib/users');
const { getDb, schema } = require('../db/client');
const { centsFromReais, resolveCategoryId } = require('../lib/resources');

const APPLY = process.argv.includes('--apply');

async function scanKeys(pattern) {
  const keys = [];
  let cursor = 0;
  do {
    const [next, batch] = await kv.scan(cursor, { match: pattern, count: 200 });
    keys.push(...batch);
    cursor = Number(next);
  } while (cursor !== 0);
  return keys;
}

async function backupKv() {
  const userKeys = await scanKeys('user:*');
  const dataKeys = await scanKeys('data:*');
  const dump = { _exportedAt: new Date().toISOString(), users: {}, data: {} };
  for (const k of userKeys) dump.users[k] = await kv.get(k);
  for (const k of dataKeys) dump.data[k] = await kv.get(k);

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `kv-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), 'utf8');

  // verifica que o backup é legível e bate com o que foi lido, antes de
  // seguir — se isso falhar, a migração para aqui e nada é tocado no PG.
  const reread = JSON.parse(fs.readFileSync(file, 'utf8'));
  const okUsers = Object.keys(reread.users).length === userKeys.length;
  const okData = Object.keys(reread.data).length === dataKeys.length;
  if (!okUsers || !okData) {
    throw new Error(`Backup em ${file} não bateu com o que foi lido do KV — abortando sem tocar no Postgres.`);
  }
  console.log(`Backup verificado: ${file} (${userKeys.length} usuários, ${dataKeys.length} blobs de dados)`);
  return dump;
}

async function migrateOneUser(username, userRec, blob) {
  const existing = await getUserByUsername(username);
  if (existing) {
    console.log(`  [pula] ${username} já existe no Postgres`);
    return { skipped: true };
  }
  if (!APPLY) {
    console.log(`  [dry-run] migraria ${username}`);
    return { wouldMigrate: true };
  }

  const user = await createUser({
    username,
    passHash: userRec.passHash,
    question: userRec.question,
    ansHash: userRec.ansHash,
  });
  if (!user) {
    console.log(`  [erro] ${username}: createUser retornou null (corrida de unicidade?) — pulando, rode a migração de novo depois`);
    return { error: true };
  }

  const db = getDb();
  let txCount = 0,
    goalCount = 0,
    invCount = 0,
    budgetCount = 0,
    hashCount = 0;

  for (const [key, rawVal] of Object.entries(blob || {})) {
    const val = typeof rawVal === 'string' ? safeJson(rawVal) : rawVal;
    if (val == null) continue;

    const monthMatch = key.match(/^mvf3_(\d+)_(\d+)$/);
    if (monthMatch) {
      const year = parseInt(monthMatch[1], 10);
      const month = parseInt(monthMatch[2], 10);
      for (const item of val.income || []) {
        await insertTx(db, user.id, 'income', item, year, month);
        txCount++;
      }
      for (const item of val.expenses || []) {
        await insertTx(db, user.id, 'expense', item, year, month);
        txCount++;
      }
      for (const item of val.bills || []) {
        await insertTx(db, user.id, 'bill', item, year, month);
        txCount++;
      }
      continue;
    }
    if (key === 'mvf3_goals' && Array.isArray(val)) {
      for (const g of val) {
        await db
          .insert(schema.goals)
          .values({
            id: String(g.id || cryptoId()),
            userId: user.id,
            name: String(g.name || '').slice(0, 200),
            targetCents: centsFromReais(g.target),
            currentCents: centsFromReais(g.current || 0),
            category: g.category || null,
            deadline: g.deadline || null,
          })
          .onConflictDoNothing();
        goalCount++;
      }
      continue;
    }
    if (key === 'mvf3_invest' && Array.isArray(val)) {
      for (const i of val) {
        await db
          .insert(schema.investments)
          .values({
            id: String(i.id || cryptoId()),
            userId: user.id,
            name: String(i.name || '').slice(0, 200),
            type: i.type || 'Outros',
            investedCents: centsFromReais(i.invested != null ? i.invested : i.value),
            valueCents: centsFromReais(i.value),
            institution: i.institution || null,
            date: i.date || null,
          })
          .onConflictDoNothing();
        invCount++;
      }
      continue;
    }
    if (key === 'mvf3_budgets' && val && typeof val === 'object') {
      for (const [cat, limit] of Object.entries(val)) {
        const categoryId = await resolveCategoryId(user.id, cat, 'expense');
        if (!categoryId) continue;
        await db
          .insert(schema.budgets)
          .values({ userId: user.id, categoryId, limitCents: centsFromReais(limit) })
          .onConflictDoNothing();
        budgetCount++;
      }
      continue;
    }
    if (key === 'mvf3_extrato_hashes' && val && typeof val === 'object') {
      for (const hash of Object.keys(val)) {
        await db.insert(schema.importHashes).values({ userId: user.id, hash }).onConflictDoNothing();
        hashCount++;
      }
      continue;
    }
    // mvf3_theme e outras chaves desconhecidas: preferência de UI local, não migra.
  }

  console.log(
    `  [ok] ${username}: ${txCount} lançamentos, ${goalCount} metas, ${invCount} ativos, ${budgetCount} orçamentos, ${hashCount} hashes`,
  );
  return { migrated: true };
}

async function insertTx(db, userId, type, item, year, month) {
  const categoryId = item.cat ? await resolveCategoryId(userId, item.cat, type === 'income' ? 'income' : 'expense') : null;
  await db
    .insert(schema.transactions)
    .values({
      id: String(item.id || cryptoId()),
      userId,
      type,
      name: String(item.name || '').slice(0, 200),
      valueCents: centsFromReais(item.value),
      categoryId,
      year,
      month,
      dueDate: type === 'bill' ? item.dueDate || null : null,
      paid: type === 'bill' ? !!item.paid : null,
      recur: !!item.recur,
      isSalary: !!item._salary,
    })
    .onConflictDoNothing();
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function cryptoId() {
  return require('node:crypto').randomUUID();
}

async function main() {
  console.log(APPLY ? 'Rodando migração (--apply)...' : 'Dry-run (passe --apply pra aplicar de verdade). Fazendo backup mesmo assim...');
  const dump = await backupKv();

  const usernames = Object.keys(dump.users)
    .map((k) => k.slice('user:'.length))
    .filter(Boolean);
  console.log(`\n${usernames.length} usuário(s) encontrados no KV.\n`);

  const summary = { migrated: 0, skipped: 0, wouldMigrate: 0, error: 0 };
  for (const username of usernames) {
    const userRec = dump.users['user:' + username];
    const blob = dump.data['data:' + username] || {};
    const result = await migrateOneUser(username, userRec, blob);
    if (result.migrated) summary.migrated++;
    else if (result.skipped) summary.skipped++;
    else if (result.wouldMigrate) summary.wouldMigrate++;
    else if (result.error) summary.error++;
  }

  console.log('\nResumo:', summary);
  if (!APPLY) console.log('\nDry-run concluído. Rode com --apply pra migrar de verdade (backup já foi salvo em backups/).');
  console.log('\nO KV NÃO foi alterado. Verifique os dados no Postgres antes de considerar remover as chaves do KV.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Migração abortada:', e);
    process.exit(1);
  });
