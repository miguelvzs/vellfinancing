// Dispatcher de eventos delegado — substitui onclick/onchange/oninput/onkeydown
// inline (o CSP em vercel.json usa script-src 'self' sem 'unsafe-inline', que
// bloqueia atributos de evento inline; ver commit que introduziu este arquivo).
// Elemento marca a ação com data-click/data-change/data-input/data-keydown
//="nomeDaFuncaoGlobal" e, opcionalmente, data-<evento>-args com um array JSON
// (montar com argsAttr() pra escapar aspas/&). "$value"/"$checked"/"$this" nos
// args viram o valor do elemento no momento do evento (equivalente a this.value/
// this.checked/this no onchange="fn(this)" de antes).
function argsAttr(arr) {
  return JSON.stringify(arr).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dispatchAction(type, e) {
  const attr = 'data-' + type;
  const el = e.target.closest('[' + attr + ']');
  if (!el) return;
  if (type === 'keydown' && e.key !== (el.getAttribute('data-keydown-key') || 'Enter')) return;
  const fn = window[el.getAttribute(attr)];
  if (typeof fn !== 'function') return;
  const raw = el.getAttribute(attr + '-args');
  const args = raw ? JSON.parse(raw).map((a) => (a === '$value' ? el.value : a === '$checked' ? el.checked : a === '$this' ? el : a)) : [];
  fn.apply(null, args);
}

['click', 'change', 'input', 'keydown'].forEach((type) => document.addEventListener(type, (e) => dispatchAction(type, e)));
