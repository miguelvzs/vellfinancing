const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const bcrypt = require('bcryptjs');

process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'test-token';

const { norm, readBody, timingSafeCompare, httpError } = require('../lib/auth');

test('norm normaliza espaço e caixa', () => {
  assert.equal(norm('  Miguel.Vzs  '), 'miguel.vzs');
  assert.equal(norm(undefined), '');
  assert.equal(norm(null), '');
});

test('readBody usa req.body quando já parseado pelo Vercel', async () => {
  const body = await readBody({ body: { a: 1 } });
  assert.deepEqual(body, { a: 1 });
});

test('readBody faz parse de req.body string', async () => {
  const body = await readBody({ body: '{"a":2}' });
  assert.deepEqual(body, { a: 2 });
});

test('readBody rejeita string maior que o limite', async () => {
  const big = 'x'.repeat(100);
  await assert.rejects(() => readBody({ body: big }, 10), /grande/);
});

test('readBody lê stream até "end" e faz parse do JSON', async () => {
  const req = new EventEmitter();
  const p = readBody(req);
  req.emit('data', Buffer.from('{"foo":'));
  req.emit('data', Buffer.from('"bar"}'));
  req.emit('end');
  assert.deepEqual(await p, { foo: 'bar' });
});

test('readBody aborta e rejeita quando o stream excede o limite', async () => {
  const req = new EventEmitter();
  req.destroy = () => {};
  const p = readBody(req, 5);
  req.emit('data', Buffer.from('0123456789'));
  await assert.rejects(p, (err) => {
    assert.equal(err.status, 413);
    return true;
  });
});

test('httpError anexa status à mensagem', () => {
  const e = httpError(429, 'muitas tentativas');
  assert.equal(e.status, 429);
  assert.equal(e.message, 'muitas tentativas');
});

test('timingSafeCompare valida contra hash real', async () => {
  const hash = await bcrypt.hash('senha-correta', 4);
  assert.equal(await timingSafeCompare('senha-correta', hash), true);
  assert.equal(await timingSafeCompare('senha-errada', hash), false);
});

test('timingSafeCompare com hash ausente sempre falha (não lança) — usado pra não vazar enumeração de usuário', async () => {
  assert.equal(await timingSafeCompare('qualquer-coisa', undefined), false);
  assert.equal(await timingSafeCompare('qualquer-coisa', null), false);
});
