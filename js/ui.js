// SIDEBAR (mobile)
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('scrim').classList.add('on');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('on');
}

// NAV
document.querySelectorAll('.nv[data-page]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.nv').forEach((n) => n.classList.remove('on'));
    b.classList.add('on');
    showPage(b.dataset.page);
    closeSidebar();
  });
});

function showPage(id) {
  curPage = id;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('on'));
  document.getElementById('page-' + id)?.classList.add('on');
  const titles = {
    overview: 'Visão Geral',
    bills: 'A Pagar',
    budget: 'Orçamento',
    goals: 'Metas',
    invest: 'Investimentos',
    history: 'Histórico',
    settings: 'Configurações',
  };
  document.getElementById('pgTitle').textContent = titles[id] || id;
  render();
}

function chMon(d) {
  cm += d;
  if (cm > 11) {
    cm = 0;
    cy++;
  }
  if (cm < 0) {
    cm = 11;
    cy--;
  }
  render();
}
function goToday() {
  cm = new Date().getMonth();
  cy = new Date().getFullYear();
  render();
}

// THEME
function applyTheme(t) {
  const light = t === 'light';
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  localStorage.setItem('mvf3_theme', light ? 'light' : 'dark');
  const b = document.getElementById('themeBtn');
  if (b) b.innerHTML = light ? '&#9790;' : '&#9728;';
}
function toggleTheme() {
  applyTheme(localStorage.getItem('mvf3_theme') === 'light' ? 'dark' : 'light');
}
