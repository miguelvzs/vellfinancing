// Cliente Postgres lazy: só conecta na primeira query, não na importação do
// módulo — evita erro de cold start se DATABASE_URL ainda não estiver
// configurada (ex: primeiro deploy antes de provisionar o banco).
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const schema = require('./schema');

let _db = null;

function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não configurada.');
    }
    const sql = neon(process.env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

module.exports = { getDb, schema };
