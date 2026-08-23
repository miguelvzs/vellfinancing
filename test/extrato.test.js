const { test } = require('node:test');
const assert = require('node:assert/strict');
const { categorizeExtrato, hashStr, ofxTag, ofxDate, parseOfxExtrato, csvDate, csvValue, parseCsvExtrato } = require('../js/extrato');

test('categorizeExtrato reconhece regras de despesa por palavra-chave', () => {
  assert.equal(categorizeExtrato('COMPRA SUPERMERCADO EXTRA', 'expense'), 'Alimentação');
  assert.equal(categorizeExtrato('UBER *TRIP', 'expense'), 'Transporte');
  assert.equal(categorizeExtrato('NETFLIX.COM', 'expense'), 'Assinaturas');
  assert.equal(categorizeExtrato('ALGO SEM REGRA NENHUMA', 'expense'), 'Outros');
});

test('categorizeExtrato reconhece regras de receita', () => {
  assert.equal(categorizeExtrato('PAGAMENTO SALARIO', 'income'), 'Salário');
  assert.equal(categorizeExtrato('PIX RECEBIDO CLIENTE X', 'income'), 'Freelance');
  assert.equal(categorizeExtrato('ALGO SEM REGRA', 'income'), 'Extra');
});

test('categorizeExtrato é case-insensitive', () => {
  assert.equal(categorizeExtrato('mercado do bairro', 'expense'), 'Alimentação');
});

test('hashStr é determinístico e sensível ao conteúdo', () => {
  const a = hashStr('2024-01-01|Mercado|10.5|expense');
  const b = hashStr('2024-01-01|Mercado|10.5|expense');
  const c = hashStr('2024-01-01|Mercado|10.6|expense');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('ofxTag extrai o valor de uma tag OFX simples', () => {
  const block = '<STMTTRN><TRNAMT>-42.50</TRNAMT><NAME>Loja X</NAME></STMTTRN>';
  assert.equal(ofxTag(block, 'TRNAMT'), '-42.50');
  assert.equal(ofxTag(block, 'NAME'), 'Loja X');
  assert.equal(ofxTag(block, 'MEMO'), '');
});

test('ofxDate parseia YYYYMMDD', () => {
  const d = ofxDate('20240315120000');
  assert.equal(d.getFullYear(), 2024);
  assert.equal(d.getMonth(), 2); // março = índice 2
  assert.equal(d.getDate(), 15);
});

test('parseOfxExtrato extrai transações e classifica sinal do valor', () => {
  const ofx = `
    <OFX>
    <STMTTRN>
      <DTPOSTED>20240110000000
      <TRNAMT>-89.90
      <NAME>Mercado Livre
    </STMTTRN>
    <STMTTRN>
      <DTPOSTED>20240112000000
      <TRNAMT>2500.00
      <MEMO>Salario Mensal
    </STMTTRN>
    </OFX>
  `;
  const txns = parseOfxExtrato(ofx);
  assert.equal(txns.length, 2);
  assert.equal(txns[0].kind, 'expense');
  assert.equal(txns[0].value, 89.9);
  assert.equal(txns[0].name, 'Mercado Livre');
  assert.equal(txns[1].kind, 'income');
  assert.equal(txns[1].value, 2500);
  assert.equal(txns[1].name, 'Salario Mensal');
});

test('parseOfxExtrato ignora blocos sem data ou valor válidos', () => {
  const ofx = '<STMTTRN><NAME>Sem valor nem data</NAME></STMTTRN>';
  assert.equal(parseOfxExtrato(ofx).length, 0);
});

test('csvDate aceita ISO e dd/mm/yyyy', () => {
  assert.equal(csvDate('2024-03-15').toISOString().slice(0, 10), '2024-03-15');
  assert.equal(csvDate('15/03/2024').toISOString().slice(0, 10), '2024-03-15');
  assert.equal(csvDate('15/03/24').toISOString().slice(0, 10), '2024-03-15');
});

test('csvValue interpreta formato monetário brasileiro', () => {
  assert.equal(csvValue('R$ 1.234,56'), 1234.56);
  assert.equal(csvValue('-89,90'), -89.9);
  assert.equal(csvValue('1234.56'), 123456); // formato BR: ponto é separador de milhar
});

test('parseCsvExtrato lê cabeçalho em português, delimitador ; e valor com vírgula decimal', () => {
  // valores com vírgula decimal exigem delimitador ; (vírgula como separador
  // de coluna colidiria com a vírgula decimal do próprio valor)
  const csv = 'Data;Descricao;Valor\n2024-01-05;Mercado;-120,50\n2024-01-06;Salario;3000,00';
  const txns = parseCsvExtrato(csv);
  assert.equal(txns.length, 2);
  assert.equal(txns[0].kind, 'expense');
  assert.equal(txns[0].name, 'Mercado');
  assert.equal(txns[0].value, 120.5);
  assert.equal(txns[1].kind, 'income');
});

test('parseCsvExtrato com delimitador vírgula exige valores sem vírgula decimal (limitação conhecida)', () => {
  // quando o delimitador é ',', um valor como "-120,50" seria cortado em
  // duas colunas — por isso arquivos separados por vírgula só funcionam
  // corretamente com valores inteiros ou em formato que sobrevive ao
  // replace(/\./g,'') de csvValue (ele sempre trata '.' como milhar)
  const csv = 'Data,Descricao,Valor\n2024-01-05,Mercado,-120\n2024-01-06,Salario,3000';
  const txns = parseCsvExtrato(csv);
  assert.equal(txns.length, 2);
  assert.equal(txns[0].value, 120);
  assert.equal(txns[1].value, 3000);
});

test('parseCsvExtrato detecta delimitador ; quando não há vírgula no cabeçalho', () => {
  const csv = 'Data;Descrição;Valor\n15/03/2024;Uber;-25,00';
  const txns = parseCsvExtrato(csv);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].name, 'Uber');
  assert.equal(txns[0].value, 25);
});

test('parseCsvExtrato retorna vazio sem colunas de data/valor reconhecíveis', () => {
  const csv = 'Coluna1,Coluna2\nfoo,bar';
  assert.equal(parseCsvExtrato(csv).length, 0);
});

test('parseCsvExtrato pula linhas com data ou valor inválidos', () => {
  const csv = 'Data,Descricao,Valor\nnao-e-data,Mercado,-10,00\n2024-01-06,Ok,50.00';
  const txns = parseCsvExtrato(csv);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].name, 'Ok');
});
