// index.html usa atributos onclick/onchange/oninput/onkeydown apontando pra
// funções globais definidas em js/*.js (scripts clássicos, ver commit de
// split do monólito). Isso não é verificável por bundler nem por ESLint
// (ver eslint.config.js) — então garantimos aqui que todo handler referenciado
// realmente existe como `function nome(` ou `const nome =` em algum js/*.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');

function readAll(files) {
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

test('toda função referenciada em onclick/onchange/oninput/onkeydown existe em js/*.js', () => {
  const jsFiles = fs.readdirSync(JS_DIR).map((f) => path.join(JS_DIR, f));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const jsSource = readAll(jsFiles);
  const all = html + '\n' + jsSource;

  const handlerRe = /on(?:click|change|input|keydown)="([a-zA-Z_][a-zA-Z0-9_.]*)\(/g;
  const called = new Set();
  let m;
  while ((m = handlerRe.exec(all))) {
    const name = m[1];
    if (name.includes('.')) continue; // ex: document.getElementById(...) — não é handler nosso
    if (name === 'if') continue; // onkeydown="if(event.key==='Enter')..."
    called.add(name);
  }
  assert.ok(called.size > 0, 'nenhum handler encontrado — regex desatualizada?');

  const missing = [...called].filter((name) => {
    const fnDecl = new RegExp(`function\\s+${name}\\s*\\(`);
    const constDecl = new RegExp(`(?:const|let)\\s+${name}\\s*=`);
    return !fnDecl.test(jsSource) && !constDecl.test(jsSource);
  });
  assert.deepEqual(missing, [], `handlers referenciados no HTML mas não definidos em js/*.js: ${missing.join(', ')}`);
});

test('index.html não tem mais <style> nem <script> inline (split em css/js concluído)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/<style>/.test(html), 'index.html ainda tem <style> inline');
  assert.ok(!/<script>[\s\S]*const MN=/.test(html), 'index.html ainda tem JS inline');
});
