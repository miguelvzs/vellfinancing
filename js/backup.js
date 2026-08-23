// BACKUP / RESTORE
// Lê direto do servidor (GET /api/export) em vez de varrer o localStorage:
// o cache local agora é parcial (só meses já visitados — ver js/state.js),
// então um backup baseado nele podia sair incompleto.
async function exportBackup() {
  if (DEMO) return demoRO();
  let data;
  try {
    const j = await api('account?action=export', 'GET');
    data = j.data;
  } catch (e) {
    toast('Não foi possível gerar o backup: ' + e.message);
    return;
  }
  const theme = localStorage.getItem('mvf3_theme');
  if (theme) data.mvf3_theme = theme;
  const payload = { _app: 'mvfinancing', _version: 2, _exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mvfinancing_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast('Backup baixado com sucesso.');
}
function importBackup(input) {
  if (DEMO) {
    demoRO();
    input.value = '';
    return;
  }
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch {
      toast('Arquivo inválido.');
      input.value = '';
      return;
    }
    const data = parsed.data || parsed;
    const keys = Object.keys(data).filter((k) => k.startsWith('mvf3_'));
    if (!keys.length) {
      toast('Nenhum dado do MV Financing no arquivo.');
      input.value = '';
      return;
    }
    confirm2(
      'Restaurar backup',
      `Importar ${keys.length} registro(s)? Isso substitui os dados atuais correspondentes.`,
      async () => {
        try {
          await api('account?action=restore', 'POST', { data });
          if (data['mvf3_theme']) {
            localStorage.setItem('mvf3_theme', data['mvf3_theme']);
            refreshTheme();
          }
          resetCache();
          await pullData();
          goToday();
          toast('Backup restaurado.');
        } catch (err) {
          toast('Não foi possível restaurar: ' + err.message);
        }
      },
      false,
    );
    input.value = '';
  };
  reader.readAsText(file);
}
function refreshTheme() {
  applyTheme(localStorage.getItem('mvf3_theme') || 'dark');
}
