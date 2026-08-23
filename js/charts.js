async function renderNetChart(){
  const ctx=document.getElementById('netChart');if(!ctx)return;
  await loadScript('/vendor/chart.umd.js');
  const labels=[],vals=[];let run=0;
  for(let i=11;i>=0;i--){let m=cm-i,y=cy;while(m<0){m+=12;y--;}const d=gd(m,y);
    const inc=d.income.reduce((a,b)=>a+parseFloat(b.value),0);
    const out=d.expenses.reduce((a,b)=>a+parseFloat(b.value),0)+d.bills.filter(b=>b.paid).reduce((a,b)=>a+parseFloat(b.value),0);
    run+=inc-out;labels.push(MN[m].slice(0,3));vals.push(Math.round(run*100)/100);}
  if(netCI){netCI.destroy();netCI=null;}
  netCI=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Saldo acumulado',data:vals,borderColor:'#0a84ff',backgroundColor:'rgba(10,132,255,.12)',fill:true,tension:.3,pointRadius:3,pointBackgroundColor:'#0a84ff'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b6b72',font:{family:'DM Sans',size:11},boxWidth:7,usePointStyle:true}},tooltip:{callbacks:{label:c=>' '+brl(c.parsed.y)}}},scales:{x:{grid:{display:false},ticks:{color:'#6b6b72',font:{family:'DM Sans',size:10}}},y:{grid:{color:'rgba(125,125,135,.12)'},ticks:{color:'#6b6b72',font:{family:'DM Mono',size:10},callback:v=>'R$'+v.toLocaleString('pt-BR')}}}}});
}

async function renderCatChart(data){
  await loadScript('/vendor/chart.umd.js');
  const map={};
  [...data.expenses,...data.bills.filter(b=>b.paid)].forEach(e=>{map[e.cat]=(map[e.cat]||0)+parseFloat(e.value);});
  const lb=Object.keys(map),vl=lb.map(k=>map[k]),cl=lb.map(k=>CL[k]||'#6b6b72');
  const ctx=document.getElementById('catChart');
  if(catCI){catCI.destroy();catCI=null;}if(!lb.length)return;
  catCI=new Chart(ctx,{type:'doughnut',data:{labels:lb,datasets:[{data:vl,backgroundColor:cl,borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom',labels:{color:'#6b6b72',font:{family:'DM Sans',size:10},boxWidth:7,boxHeight:7,padding:10,usePointStyle:true}},tooltip:{callbacks:{label:c=>' '+brl(c.parsed)}}}}});
}

async function renderHistChart(){
  await loadScript('/vendor/chart.umd.js');
  const months=[],incs=[],exps=[];
  for(let i=5;i>=0;i--){let m=cm-i,y=cy;if(m<0){m+=12;y--;}const d=gd(m,y);months.push(MN[m].slice(0,3));incs.push(d.income.reduce((a,b)=>a+parseFloat(b.value),0));exps.push(d.expenses.reduce((a,b)=>a+parseFloat(b.value),0)+d.bills.filter(b=>b.paid).reduce((a,b)=>a+parseFloat(b.value),0));}
  const ctx=document.getElementById('histChart');if(histCI){histCI.destroy();histCI=null;}
  histCI=new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{label:'Receita',data:incs,backgroundColor:'rgba(52,199,89,.6)',borderRadius:4},{label:'Gastos',data:exps,backgroundColor:'rgba(255,69,58,.6)',borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b6b72',font:{family:'DM Sans',size:11},boxWidth:7,usePointStyle:true}}},scales:{x:{grid:{display:false},ticks:{color:'#6b6b72',font:{family:'DM Sans',size:11}}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#6b6b72',font:{family:'DM Mono',size:10},callback:v=>'R$'+v.toLocaleString('pt-BR')}}}}});
}

async function renderInvChart(){
  await loadScript('/vendor/chart.umd.js');
  const invs=gi();const ctx=document.getElementById('invChart');if(invCI){invCI.destroy();invCI=null;}if(!invs.length)return;
  const map={};invs.forEach(i=>{map[i.type]=(map[i.type]||0)+parseFloat(i.value);});
  const lb=Object.keys(map),vl=lb.map(k=>map[k]),cl=lb.map(k=>CL[k]||'#6b6b72');
  invCI=new Chart(ctx,{type:'doughnut',data:{labels:lb,datasets:[{data:vl,backgroundColor:cl,borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right',labels:{color:'#6b6b72',font:{family:'DM Sans',size:11},boxWidth:7,padding:12,usePointStyle:true}},tooltip:{callbacks:{label:c=>' '+brl(c.parsed)}}}}});
}
