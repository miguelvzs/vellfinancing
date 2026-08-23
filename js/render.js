function render(){
  document.getElementById('monLabel').textContent=MN[cm]+' '+cy;
  document.getElementById('pgSub').textContent=curPage==='settings'?'Backup e gerenciamento':MN[cm]+' '+cy;
  const now=new Date();
  document.getElementById('todayBtn').style.visibility=(cm===now.getMonth()&&cy===now.getFullYear())?'hidden':'visible';
  const data=gd();
  document.getElementById('salIn').value=data.salary||'';
  renderSum(data);renderNet(data);
  renderInc(data);renderExp(data);
  renderBills(data);renderBudget(data);renderGoals();renderInvest();renderHist(data);
  renderSettings();
  if(curPage==='overview')setTimeout(()=>renderCatChart(data),40);
  if(curPage==='history')setTimeout(()=>{renderHistChart();renderNetChart();},40);
  if(curPage==='invest')setTimeout(()=>renderInvChart(),40);
}

function renderSum(data){
  const inc=data.income.reduce((a,b)=>a+parseFloat(b.value),0);
  const exp=data.expenses.reduce((a,b)=>a+parseFloat(b.value),0);
  const bpd=data.bills.filter(b=>b.paid).reduce((a,b)=>a+parseFloat(b.value),0);
  const bpn=data.bills.filter(b=>!b.paid).reduce((a,b)=>a+parseFloat(b.value),0);
  const bal=inc-exp-bpd;
  document.getElementById('sumCards').innerHTML=`
    <div class="sc"><div class="sc-lbl">Receita</div><div class="sc-val g">${brl(inc)}</div><div class="sc-sub">${data.income.length} entrada${data.income.length!==1?'s':''}</div></div>
    <div class="sc"><div class="sc-lbl">Gastos pagos</div><div class="sc-val r">${brl(exp+bpd)}</div><div class="sc-sub">${data.expenses.length+data.bills.filter(b=>b.paid).length} lançamento${(data.expenses.length+data.bills.filter(b=>b.paid).length)!==1?'s':''}</div></div>
    <div class="sc"><div class="sc-lbl">A pagar</div><div class="sc-val a">${brl(bpn)}</div><div class="sc-sub">${data.bills.filter(b=>!b.paid).length} pendente${data.bills.filter(b=>!b.paid).length!==1?'s':''}</div></div>
    <div class="sc"><div class="sc-lbl">Saldo livre</div><div class="sc-val ${bal>=0?'g':'r'}">${brl(bal)}</div><div class="sc-sub">${bal>=0?'Disponível':'Atenção: déficit'}</div></div>`;
}

function renderNet(data){
  const el=document.getElementById('netStrip');if(!el)return;
  const inc=data.income.reduce((a,b)=>a+parseFloat(b.value),0);
  const exp=data.expenses.reduce((a,b)=>a+parseFloat(b.value),0);
  const bpd=data.bills.filter(b=>b.paid).reduce((a,b)=>a+parseFloat(b.value),0);
  const cash=inc-exp-bpd;
  const invTot=gi().reduce((a,b)=>a+parseFloat(b.value),0);
  const saved=gg().reduce((a,b)=>a+parseFloat(b.current||0),0);
  const patr=cash+invTot+saved;
  const rate=inc>0?Math.round(((inc-exp-bpd)/inc)*100):0;
  el.innerHTML=`
    <div class="net-it"><span class="net-l">Saldo do mês</span><span class="net-v ${cash>=0?'g':'r'}" style="color:${cash>=0?'var(--gr)':'var(--re)'}">${brl(cash)}</span></div>
    <div class="net-it"><span class="net-l">Investimentos</span><span class="net-v" style="color:var(--bl)">${brl(invTot)}</span></div>
    <div class="net-it"><span class="net-l">Guardado em metas</span><span class="net-v" style="color:var(--pu)">${brl(saved)}</span></div>
    <div class="net-it"><span class="net-l">Taxa de poupança</span><span class="net-v" style="color:${rate>=0?'var(--tx)':'var(--re)'}">${rate}%</span></div>
    <div class="net-it"><span class="net-l">Patrimônio estimado</span><span class="net-v tot">${brl(patr)}</span></div>`;
}

function rowActs(type,id,canEdit){
  return `<div class="rowacts">${canEdit?`<button class="eb" title="Editar" onclick="editItem('${type}','${id}')">&#9998;</button>`:''}<button class="xb" title="Remover" onclick="askDel('${type}','${id}')">&#215;</button></div>`;
}

function renderInc(data){
  const el=document.getElementById('incList');
  if(!data.income.length){el.innerHTML='<div class="emp">Nenhuma receita.<br>Defina sua renda mensal acima ou clique em + Adicionar.</div>';return;}
  el.innerHTML=data.income.map(i=>`<div class="li"><div class="lidot" style="background:${CL[i.cat]||'#6b6b72'}"></div><div class="lii"><div class="lin">${esc(i.name)}${i.recur?'<span class="recpill">mensal</span>':''}</div><div class="lic">${esc(i.cat)}</div></div><div class="lia g">${brl(i.value)}</div>${rowActs('income',i.id,!i._salary)}</div>`).join('');
}

function renderExp(data){
  const el=document.getElementById('expList');
  if(!data.expenses.length){el.innerHTML='<div class="emp">Nenhuma despesa.<br>Clique em + Adicionar para lançar um gasto.</div>';return;}
  el.innerHTML=data.expenses.map(e=>`<div class="li"><div class="lidot" style="background:${CL[e.cat]||'#6b6b72'}"></div><div class="lii"><div class="lin">${esc(e.name)}${e.recur?'<span class="recpill">mensal</span>':''}</div><div class="lic">${esc(e.cat)}</div></div><div class="lia r">${brl(e.value)}</div>${rowActs('expense',e.id,true)}</div>`).join('');
}

function dtag(ds,paid){
  if(paid)return'<span class="tag paid">Pago</span>';
  if(!ds)return'';
  const d=Math.round((new Date(ds+'T12:00:00')-new Date())/86400000);
  if(d<0)return`<span class="tag ov">Vencido ${Math.abs(d)}d</span>`;
  if(d===0)return`<span class="tag sn">Hoje</span>`;
  if(d<=5)return`<span class="tag sn">${d}d</span>`;
  return`<span class="tag ok">${d}d</span>`;
}
function dcl(ds){const d=Math.round((new Date(ds+'T12:00:00')-new Date())/86400000);return d<0?'var(--re)':d<=5?'var(--am)':'var(--gr)';}

function renderBills(data){
  const el=document.getElementById('billsList');
  if(!data.bills.length){el.innerHTML='<div class="emp">Nenhuma conta cadastrada.<br>Clique em + Nova conta para começar.</div>';}
  else{
    const sorted=[...data.bills].sort((a,b)=>{if(a.paid!==b.paid)return a.paid?1:-1;return(a.dueDate||'')>(b.dueDate||'')?1:-1;});
    el.innerHTML=sorted.map(b=>`<div>
      <div class="bill-row">
        <div class="bchk ${b.paid?'on':''}" onclick="togBill('${b.id}')"></div>
        <div class="bico" style="background:${CL[b.cat]||'#6b6b72'}20">${IC2[b.cat]||'📌'}</div>
        <div class="binfo"><div class="bname ${b.paid?'pd':''}">${esc(b.name)}${b.recur?'<span class="recpill">mensal</span>':''}</div><div class="bmeta">${esc(b.cat)}${b.dueDate?' · '+new Date(b.dueDate+'T12:00:00').toLocaleDateString('pt-BR'):''}</div></div>
        ${dtag(b.dueDate,b.paid)}
        <div class="bamt" style="color:${b.paid?'var(--mu)':'var(--tx)'}">${brl(b.value)}</div>
        ${rowActs('bill',b.id,true)}
      </div>
      ${!b.paid&&b.dueDate?`<div class="bprog" style="margin-bottom:8px"><div class="bpfil" style="width:${Math.min(100,Math.max(4,100-Math.round((new Date(b.dueDate+'T12:00:00')-new Date())/86400000)*6))}%;background:${dcl(b.dueDate)}"></div></div>`:''}
    </div>`).join('');
  }

  const bs=document.getElementById('billSum');
  if(bs){
    const tot=data.bills.reduce((a,b)=>a+parseFloat(b.value),0);
    const paid=data.bills.filter(b=>b.paid).reduce((a,b)=>a+parseFloat(b.value),0);
    const pend=data.bills.filter(b=>!b.paid).reduce((a,b)=>a+parseFloat(b.value),0);
    bs.innerHTML=`<div class="sc"><div class="sc-lbl">Total do mês</div><div class="sc-val">${brl(tot)}</div><div class="sc-sub">${data.bills.length} conta${data.bills.length!==1?'s':''}</div></div>
    <div class="sc"><div class="sc-lbl">Pago</div><div class="sc-val g">${brl(paid)}</div><div class="sc-sub">${data.bills.filter(b=>b.paid).length} conta${data.bills.filter(b=>b.paid).length!==1?'s':''}</div></div>
    <div class="sc"><div class="sc-lbl">Pendente</div><div class="sc-val a">${brl(pend)}</div><div class="sc-sub">${data.bills.filter(b=>!b.paid).length} pendente${data.bills.filter(b=>!b.paid).length!==1?'s':''}</div></div>`;
  }
}

function renderGoals(){
  const el=document.getElementById('goalsList');
  const goals=gg();
  if(!goals.length){el.innerHTML='<div class="emp">Nenhuma meta criada.<br>Defina um objetivo de economia com + Nova meta.</div>';return;}
  el.innerHTML=goals.map(g=>{
    const p=g.target>0?Math.min(100,Math.round(g.current/g.target*100)):0;
    const rem=Math.max(0,g.target-g.current);
    return`<div class="goal-it">
      <div class="goal-hd">
        <div><div class="goal-name">${esc(g.name)}</div>${g.deadline?`<div style="font-size:11px;color:var(--mu);margin-top:2px">Prazo: ${new Date(g.deadline+'T12:00:00').toLocaleDateString('pt-BR')}</div>`:''}</div>
        <div style="display:flex;align-items:center;gap:8px">${g.category?`<span class="goal-tag-sm">${esc(g.category)}</span>`:''}<span class="goal-pct">${p}%</span></div>
      </div>
      <div class="ptk"><div class="pfl ${p>=100?'done':''}" style="width:${p}%"></div></div>
      <div class="g-amts"><span>${brl(g.current)} guardado</span><span>${rem>0?'Faltam '+brl(rem):'Meta concluída ✓'}</span><span>Meta: ${brl(g.target)}</span></div>
      <div class="g-acts"><button class="gbtn" onclick="depGoal('${g.id}')">+ Depositar</button><button class="gbtn" onclick="editItem('goal','${g.id}')">Editar</button><button class="gbtn del" onclick="askDel('goal','${g.id}')">Remover</button></div>
    </div>`;
  }).join('');
}

function renderInvest(){
  const invs=gi();
  const el=document.getElementById('invList');
  const es=document.getElementById('invSum');
  if(!invs.length){el.innerHTML='<div class="emp">Nenhum ativo cadastrado.<br>Adicione seus investimentos com + Adicionar ativo.</div>';if(es)es.innerHTML='';return;}
  const tot=invs.reduce((a,b)=>a+parseFloat(b.value),0);
  const totInv=invs.reduce((a,b)=>a+parseFloat(b.invested||b.value),0);
  const gain=tot-totInv;
  const gp=totInv>0?(gain/totInv)*100:0;
  const maxInv=invs.reduce((mx,i)=>parseFloat(i.value)>parseFloat(mx.value)?i:mx,invs[0]);
  if(es)es.innerHTML=`
    <div class="sc"><div class="sc-lbl">Total atual</div><div class="sc-val b">${brl(tot)}</div><div class="sc-sub">${invs.length} ativo${invs.length!==1?'s':''}</div></div>
    <div class="sc"><div class="sc-lbl">Rendimento total</div><div class="sc-val ${gain>=0?'g':'r'}">${gain>=0?'+':''}${brl(gain)}</div><div class="sc-sub">${ppct(gp)}</div></div>
    <div class="sc"><div class="sc-lbl">Maior posição</div><div class="sc-val p">${brl(maxInv.value)}</div><div class="sc-sub">${esc(maxInv.name)}</div></div>`;
  const sorted=[...invs].sort((a,b)=>parseFloat(b.value)-parseFloat(a.value));
  el.innerHTML=sorted.map(i=>{
    const iv=parseFloat(i.invested||i.value),cv=parseFloat(i.value),g=cv-iv,gp2=iv>0?(g/iv)*100:0;
    const sh=tot>0?(cv/tot*100).toFixed(1):0;
    return`<div class="inv-row">
      <div class="inv-ico" style="background:${CL[i.type]||'#6b6b72'}20">${IC2[i.type]||'📌'}</div>
      <div class="inv-inf"><div class="inv-name">${esc(i.name)}</div><div class="inv-type">${esc(i.type)}${i.institution?' · '+esc(i.institution):''} · ${sh}% da carteira</div></div>
      <div class="inv-r"><div class="inv-val">${brl(cv)}</div><div class="inv-gain ${g>=0?'pos':'neg'}">${g>=0?'+':''}${brl(g)} (${ppct(gp2)})</div></div>
      ${rowActs('invest',i.id,true)}
    </div>`;
  }).join('');
}

function renderHist(data){
  const fr=document.getElementById('fltRow');
  fr.innerHTML=['Todos','Receitas','Despesas','Contas'].map((f,i)=>{
    const keys=['all','income','expense','bill'];
    return`<button class="ftag ${hfilt===keys[i]?'on':''}" onclick="setHF('${keys[i]}')">${f}</button>`;
  }).join('')+`<input class="srch" id="histSrch" placeholder="Buscar..." value="${esc(hquery)}" oninput="searchHist(this.value)">`;
  const el=document.getElementById('histList');
  let all=[...data.income.map(i=>({...i,kind:'income'})),...data.expenses.map(e=>({...e,kind:'expense'})),...data.bills.map(b=>({...b,kind:'bill'}))];
  if(hfilt!=='all')all=all.filter(t=>t.kind===hfilt);
  if(hquery.trim()){const q=hquery.trim().toLowerCase();all=all.filter(t=>(t.name||'').toLowerCase().includes(q)||(t.cat||'').toLowerCase().includes(q));}
  const foot=document.getElementById('histFoot');
  if(!all.length){el.innerHTML='<div class="emp">Nenhuma movimentação encontrada</div>';if(foot)foot.innerHTML='';return;}
  let tin=0,tout=0;
  all.forEach(t=>{if(t.kind==='income')tin+=parseFloat(t.value);else tout+=parseFloat(t.value);});
  el.innerHTML=all.map(t=>`<div class="hist-row">
    <div class="hist-ico" style="background:${CL[t.cat]||'#6b6b72'}18">${IC2[t.cat]||'📌'}</div>
    <div class="hist-inf"><div class="hist-n">${esc(t.name)}</div><div class="hist-m">${esc(t.cat)} · ${t.kind==='income'?'Receita':t.kind==='expense'?'Despesa':'Conta'}${t.dueDate?' · '+new Date(t.dueDate+'T12:00:00').toLocaleDateString('pt-BR'):''}${t.kind==='bill'?(t.paid?' · Pago':' · Pendente'):''}</div></div>
    <div class="hist-a" style="color:${t.kind==='income'?'var(--gr)':'var(--re)'}">${t.kind==='income'?'+':'-'}${brl(t.value)}</div>
  </div>`).join('');
  if(foot)foot.innerHTML=`<span>${all.length} item${all.length!==1?'s':''}</span><span>Entradas ${brl(tin)} · Saídas ${brl(tout)}</span>`;
}

function setHF(f){hfilt=f;render();}
function searchHist(v){hquery=v;const data=gd();renderHist(data);setTimeout(()=>{const s=document.getElementById('histSrch');if(s){s.focus();s.setSelectionRange(s.value.length,s.value.length);}},0);}

function renderSettings(){
  const el=document.getElementById('setStats');if(!el)return;
  let months=0,inc=0,exp=0,bills=0;
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^mvf3_\d+_\d+$/.test(k)){months++;const d=JSON.parse(localStorage.getItem(k));inc+=d.income?.length||0;exp+=d.expenses?.length||0;bills+=d.bills?.length||0;}}
  el.innerHTML=`
    <div class="set-stat"><span>Meses com dados</span><span>${months}</span></div>
    <div class="set-stat"><span>Receitas registradas</span><span>${inc}</span></div>
    <div class="set-stat"><span>Despesas registradas</span><span>${exp}</span></div>
    <div class="set-stat"><span>Contas registradas</span><span>${bills}</span></div>
    <div class="set-stat"><span>Metas</span><span>${gg().length}</span></div>
    <div class="set-stat"><span>Ativos</span><span>${gi().length}</span></div>`;
}

function renderBudget(data){
  const el=document.getElementById('budgetList');if(!el)return;
  const budgets=gb();
  const spent={};
  [...data.expenses,...data.bills.filter(b=>b.paid)].forEach(e=>{spent[e.cat]=(spent[e.cat]||0)+parseFloat(e.value);});
  let totB=0,totS=0;
  el.innerHTML=EC.map(c=>{
    const lim=parseFloat(budgets[c]||0),sp=spent[c]||0;totB+=lim;totS+=sp;
    const pct=lim>0?Math.round(sp/lim*100):0;
    const ratio=lim>0?sp/lim:0;
    const col=lim<=0?'var(--mu2)':ratio>1?'var(--re)':ratio>=0.8?'var(--am)':'var(--gr)';
    const tag=lim<=0?'<span class="budget-note">sem limite</span>':ratio>1?`<span class="tag ov">${brl(sp-lim)} acima</span>`:ratio>=0.8?`<span class="tag sn">${pct}%</span>`:`<span class="tag ok">${pct}%</span>`;
    return`<div class="budget-row">
      <div class="bico" style="background:${CL[c]||'#6b6b72'}20">${IC2[c]||'📌'}</div>
      <div class="budget-inf">
        <div class="budget-top"><span class="budget-name">${c}</span>${tag}</div>
        <div class="ptk" style="margin-top:6px"><div class="pfl" style="width:${lim>0?Math.min(100,pct):0}%;background:${col}"></div></div>
        <div class="budget-amts"><span>${brl(sp)} gasto</span><span>${lim>0?'Limite '+brl(lim):'Defina um limite →'}</span></div>
      </div>
      <input class="budget-in" type="number" step="0.01" placeholder="0,00" value="${budgets[c]||''}" onchange="setBudget('${c}',this.value)">
    </div>`;
  }).join('');
  const bs=document.getElementById('budgetSum');
  if(bs){const rem=totB-totS;bs.innerHTML=`
    <div class="sc"><div class="sc-lbl">Orçamento total</div><div class="sc-val">${brl(totB)}</div><div class="sc-sub">limites definidos</div></div>
    <div class="sc"><div class="sc-lbl">Gasto no mês</div><div class="sc-val r">${brl(totS)}</div><div class="sc-sub">despesas + contas pagas</div></div>
    <div class="sc"><div class="sc-lbl">Restante</div><div class="sc-val ${rem>=0?'g':'r'}">${brl(rem)}</div><div class="sc-sub">${totB<=0?'sem orçamento':rem>=0?'dentro do orçamento':'orçamento estourado'}</div></div>`;}
}
function setBudget(cat,v){const b=gb();const n=parseFloat(v)||0;if(n>0)b[cat]=n;else delete b[cat];sb(b);const data=gd();renderBudget(data);}
