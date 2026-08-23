// Carrega scripts externos sob demanda (Chart.js, xlsx) — evita baixar libs
// pesadas em toda visita quando o usuário não abre um gráfico/exportação.
const _loadedScripts = {};
function loadScript(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
  return _loadedScripts[src];
}
