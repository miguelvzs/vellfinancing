const { test } = require('node:test');
const assert = require('node:assert/strict');
const { centsFromReais, reaisFromCents } = require('../lib/resources');

test('centsFromReais converte reais pra centavos inteiros', () => {
  assert.equal(centsFromReais(10), 1000);
  assert.equal(centsFromReais('10.5'), 1050);
  assert.equal(centsFromReais(0.1 + 0.2), 30); // 0.30000000000000004 arredonda certo
  assert.equal(centsFromReais(-42.99), -4299);
});

test('centsFromReais devolve 0 pra entrada inválida em vez de NaN', () => {
  assert.equal(centsFromReais(undefined), 0);
  assert.equal(centsFromReais('abc'), 0);
  assert.equal(centsFromReais(null), 0);
});

test('reaisFromCents é o inverso de centsFromReais pra valores exatos', () => {
  assert.equal(reaisFromCents(1050), 10.5);
  assert.equal(reaisFromCents(-4299), -42.99);
  assert.equal(reaisFromCents(0), 0);
});

test('round-trip centsFromReais/reaisFromCents preserva valores monetários comuns', () => {
  for (const v of [0.01, 1, 19.9, 100.5, 1234.56, 999999.99]) {
    assert.equal(reaisFromCents(centsFromReais(v)), v);
  }
});
