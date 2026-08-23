// EXPORT EXCEL
async function exportExcel() {
  if (typeof XLSX === 'undefined') {
    toast('Carregando biblioteca de exportação...');
    try {
      await loadScript('/vendor/xlsx.full.min.js');
    } catch (e) {
      toast('Não foi possível carregar a biblioteca de exportação.');
      return;
    }
  }
  const data = gd(),
    invs = gi(),
    goals = gg();
  const inc = data.income.reduce((a, b) => a + parseFloat(b.value), 0);
  const exp = data.expenses.reduce((a, b) => a + parseFloat(b.value), 0);
  const bpd = data.bills.filter((b) => b.paid).reduce((a, b) => a + parseFloat(b.value), 0);
  const bpn = data.bills.filter((b) => !b.paid).reduce((a, b) => a + parseFloat(b.value), 0);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['MV Financing — Relatório Mensal'],
      ['Mês', MN[cm] + ' ' + cy],
      [''],
      ['RESUMO'],
      ['Receita total', inc],
      ['Gastos pagos', exp + bpd],
      ['Contas pendentes', bpn],
      ['Saldo disponível', inc - exp - bpd],
    ]),
    'Resumo',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['Nome', 'Categoria', 'Valor'], ...data.income.map((i) => [i.name, i.cat, parseFloat(i.value)])]),
    'Receitas',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['Nome', 'Categoria', 'Valor'], ...data.expenses.map((e) => [e.name, e.cat, parseFloat(e.value)])]),
    'Despesas',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Nome', 'Categoria', 'Valor', 'Vencimento', 'Status'],
      ...data.bills.map((b) => [b.name, b.cat, parseFloat(b.value), b.dueDate || '', b.paid ? 'Pago' : 'Pendente']),
    ]),
    'Contas a Pagar',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Nome', 'Tipo', 'Instituição', 'Valor Investido', 'Valor Atual', 'Rendimento R$', 'Rendimento %'],
      ...invs.map((i) => {
        const iv = parseFloat(i.invested || i.value),
          cv = parseFloat(i.value),
          g = cv - iv,
          gp = iv > 0 ? (g / iv) * 100 : 0;
        return [i.name, i.type, i.institution || '', iv, cv, g, gp];
      }),
    ]),
    'Investimentos',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Nome', 'Categoria', 'Meta R$', 'Guardado R$', 'Restante R$', '%', 'Prazo'],
      ...goals.map((g) => [
        g.name,
        g.category || '',
        parseFloat(g.target),
        parseFloat(g.current),
        Math.max(0, g.target - g.current),
        Math.round((g.current / g.target) * 100),
        g.deadline || '',
      ]),
    ]),
    'Metas',
  );
  XLSX.writeFile(wb, `MV_Financing_${MN[cm]}_${cy}.xlsx`);
  toast('Planilha exportada com sucesso.');
}

// EXPORT PDF REPORT
function exportReport() {
  const data = gd(),
    invs = gi(),
    goals = gg();
  const inc = data.income.reduce((a, b) => a + parseFloat(b.value), 0);
  const exp = data.expenses.reduce((a, b) => a + parseFloat(b.value), 0);
  const bpd = data.bills.filter((b) => b.paid).reduce((a, b) => a + parseFloat(b.value), 0);
  const bpn = data.bills.filter((b) => !b.paid).reduce((a, b) => a + parseFloat(b.value), 0);
  const bal = inc - exp - bpd;
  const invTot = invs.reduce((a, b) => a + parseFloat(b.value), 0);
  const invInv = invs.reduce((a, b) => a + parseFloat(b.invested || b.value), 0);
  const invG = invTot - invInv;
  const catMap = {};
  [...data.expenses, ...data.bills.filter((b) => b.paid)].forEach((e) => {
    catMap[e.cat] = (catMap[e.cat] || 0) + parseFloat(e.value);
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório ${MN[cm]} ${cy}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111;padding:40px;font-size:13px;line-height:1.65}
  .brand{font-size:10px;color:#999;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
  h1{font-size:24px;font-weight:300;letter-spacing:-.02em;margin-bottom:4px}
  .sub{color:#666;margin-bottom:34px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px}
  .card{border:1px solid #e8e8e8;border-radius:10px;padding:15px}
  .cl{font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .cv{font-size:21px;font-weight:300;font-family:monospace}
  .g{color:#16a34a}.r{color:#dc2626}.a{color:#d97706}.b{color:#2563eb}
  h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid #eee}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th{text-align:left;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.05em;padding:6px 8px;border-bottom:1px solid #eee}
  td{padding:8px;border-bottom:1px solid #f5f5f5;font-size:13px}tr:last-child td{border-bottom:none}
  .badge{display:inline-block;font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}
  .badge.g{background:#dcfce7;color:#16a34a}.badge.a{background:#fef3c7;color:#d97706}
  .ptk{height:4px;background:#eee;border-radius:2px;overflow:hidden;margin-top:5px}
  .pfl{height:100%;background:#111;border-radius:2px}
  .foot{margin-top:40px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#999;display:flex;justify-content:space-between}
  @media print{body{padding:24px}}</style></head><body>
  <div class="brand">MV Financing · by MV Corp</div>
  <h1>Relatório Mensal</h1><div class="sub">${MN[cm]} de ${cy}</div>
  <div class="grid">
    <div class="card"><div class="cl">Receita Total</div><div class="cv g">${brl(inc)}</div></div>
    <div class="card"><div class="cl">Gastos Totais</div><div class="cv r">${brl(exp + bpd)}</div></div>
    <div class="card"><div class="cl">Contas Pendentes</div><div class="cv a">${brl(bpn)}</div></div>
    <div class="card"><div class="cl">Saldo Disponível</div><div class="cv ${bal >= 0 ? 'g' : 'r'}">${brl(bal)}</div></div>
  </div>
  <h2>Receitas</h2><table><thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead><tbody>
  ${data.income.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.cat)}</td><td style="text-align:right;font-family:monospace">${brl(i.value)}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#999">Nenhuma receita</td></tr>'}
  </tbody></table>
  <h2>Despesas</h2><table><thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead><tbody>
  ${data.expenses.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.cat)}</td><td style="text-align:right;font-family:monospace">${brl(e.value)}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#999">Nenhuma despesa</td></tr>'}
  </tbody></table>
  <h2>Contas a Pagar</h2><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th style="text-align:right">Valor</th><th>Status</th></tr></thead><tbody>
  ${data.bills.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.cat)}</td><td>${b.dueDate ? new Date(b.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td><td style="text-align:right;font-family:monospace">${brl(b.value)}</td><td><span class="badge ${b.paid ? 'g' : 'a'}">${b.paid ? 'Pago' : 'Pendente'}</span></td></tr>`).join('') || '<tr><td colspan="5" style="color:#999">Nenhuma conta</td></tr>'}
  </tbody></table>
  <h2>Gastos por Categoria</h2><table><thead><tr><th>Categoria</th><th style="text-align:right">Total</th></tr></thead><tbody>
  ${
    Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `<tr><td>${esc(c)}</td><td style="text-align:right;font-family:monospace">${brl(v)}</td></tr>`)
      .join('') || '<tr><td colspan="2" style="color:#999">Sem dados</td></tr>'
  }
  </tbody></table>
  ${
    invs.length
      ? `<h2>Investimentos</h2><table><thead><tr><th>Ativo</th><th>Tipo</th><th style="text-align:right">Valor Atual</th><th style="text-align:right">Rendimento</th></tr></thead><tbody>
  ${invs
    .map((i) => {
      const iv = parseFloat(i.invested || i.value),
        cv = parseFloat(i.value),
        g = cv - iv,
        gp = iv > 0 ? (g / iv) * 100 : 0;
      return `<tr><td>${esc(i.name)}</td><td>${esc(i.type)}</td><td style="text-align:right;font-family:monospace">${brl(cv)}</td><td style="text-align:right;font-family:monospace;color:${g >= 0 ? '#16a34a' : '#dc2626'}">${g >= 0 ? '+' : ''}${brl(g)} (${ppct(gp)})</td></tr>`;
    })
    .join('')}
  </tbody></table><p style="font-size:12px;color:#666;margin:6px 0 0">Total investido: <strong>${brl(invTot)}</strong> &nbsp; Rendimento: <strong style="color:${invG >= 0 ? '#16a34a' : '#dc2626'}">${invG >= 0 ? '+' : ''}${brl(invG)}</strong></p>`
      : ''
  }
  ${
    goals.length
      ? `<h2>Metas de Economia</h2>${goals
          .map((g) => {
            const p = Math.min(100, Math.round((g.current / g.target) * 100));
            return `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span><strong>${esc(g.name)}</strong>${g.category ? ' · ' + esc(g.category) : ''}</span><span style="font-family:monospace;font-size:13px">${brl(g.current)} / ${brl(g.target)}</span></div><div class="ptk"><div class="pfl" style="width:${p}%"></div></div><div style="font-size:11px;color:#999;margin-top:3px">${p}% concluído${g.deadline ? ' · Prazo: ' + new Date(g.deadline + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</div></div>`;
          })
          .join('')}`
      : ''
  }
  <div class="foot"><span>MV Financing · by MV Corp</span><span>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
  <script>window.onload=()=>{window.print();}</script></body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  toast('Relatório aberto — use Ctrl+P para salvar como PDF.');
}
