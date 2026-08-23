const MN=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const EC=['Moradia','Alimentação','Transporte','Saúde','Lazer','Educação','Assinaturas','Vestuário','Faturas','Outros'];
const IC=['Salário','Freelance','Investimentos','Extra','Outros'];
const IT=['Renda Fixa','Ações','FIIs','Criptomoedas','Tesouro Direto','CDB/LCI/LCA','Poupança','Outros'];
const CL={'Moradia':'#0a84ff','Alimentação':'#34c759','Transporte':'#ffd60a','Saúde':'#ff9f0a','Lazer':'#bf5af2','Educação':'#ff375f','Assinaturas':'#64d2ff','Faturas':'#191970','Vestuário':'#ff6961','Outros':'#6b6b72','Salário':'#34c759','Freelance':'#30d158','Investimentos':'#0a84ff','Extra':'#ffd60a','Renda Fixa':'#0a84ff','Ações':'#34c759','FIIs':'#bf5af2','Criptomoedas':'#ffd60a','Tesouro Direto':'#32d0c4','CDB/LCI/LCA':'#ff9f0a','Poupança':'#64d2ff'};
const IC2={'Moradia':'🏠','Alimentação':'🛒','Transporte':'🚗','Saúde':'💊','Lazer':'🎮','Educação':'📚','Assinaturas':'📡','Faturas':'💳','Vestuário':'👕','Outros':'📌','Salário':'💼','Freelance':'💻','Investimentos':'📈','Extra':'⚡','Renda Fixa':'🔒','Ações':'📊','FIIs':'🏢','Criptomoedas':'₿','Tesouro Direto':'🏛','CDB/LCI/LCA':'🏦','Poupança':'💰'};
const RECUR_MONTHS=11; // quantos meses futuros recebem cópia de lançamentos recorrentes

let cm=new Date().getMonth(),cy=new Date().getFullYear();
let mtype='',curPage='overview',hfilt='all',hquery='';
let editId=null;            // id do item em edição (null = criar novo)
let catCI=null,histCI=null,invCI=null,netCI=null;

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const mk=(m,y)=>`mvf3_${y??cy}_${m??cm}`;
// ===== MODO DEMO (read-only, dados fake em memória, não toca localStorage/KV) =====
const DEMO = new URLSearchParams(location.search).has('demo');
const DEMO_STORE = {};
function demoDate(off){const d=new Date();d.setDate(d.getDate()+off);return d.toISOString().slice(0,10);}
function seedDemo(){
  DEMO_STORE[mk()] = JSON.stringify({
    salary:5800,
    income:[
      {id:'d_sal',name:'Salário',value:5800,cat:'Salário',_salary:true},
      {id:'d_free',name:'Projeto freelance',value:1450,cat:'Freelance'}
    ],
    expenses:[
      {id:'d_e1',name:'Mercado do mês',value:842.30,cat:'Alimentação'},
      {id:'d_e2',name:'Transporte (app + ônibus)',value:168.90,cat:'Transporte'},
      {id:'d_e3',name:'Streaming',value:54.80,cat:'Assinaturas'},
      {id:'d_e4',name:'Farmácia',value:96.40,cat:'Saúde'}
    ],
    bills:[
      {id:'d_b1',name:'Aluguel',value:1650,cat:'Moradia',dueDate:demoDate(7),paid:false,recur:true},
      {id:'d_b2',name:'Energia',value:214.70,cat:'Faturas',dueDate:demoDate(-3),paid:true},
      {id:'d_b3',name:'Internet',value:99.90,cat:'Assinaturas',dueDate:demoDate(11),paid:false,recur:true}
    ]
  });
  let pm=cm-1,py=cy;if(pm<0){pm=11;py--;}
  DEMO_STORE[mk(pm,py)]=JSON.stringify({salary:5800,income:[{id:'d_s2',name:'Salário',value:5800,cat:'Salário',_salary:true}],expenses:[{id:'d_x1',name:'Mercado',value:910.20,cat:'Alimentação'},{id:'d_x2',name:'Cinema + bar',value:243.50,cat:'Lazer'}],bills:[{id:'d_y1',name:'Aluguel',value:1650,cat:'Moradia',dueDate:'',paid:true}]});
  DEMO_STORE['mvf3_goals']=JSON.stringify([
    {id:'d_g1',name:'Reserva de emergência',target:15000,current:6200,category:'Segurança',deadline:''},
    {id:'d_g2',name:'Notebook novo',target:7000,current:2100,category:'Equipamento',deadline:demoDate(120)}
  ]);
  DEMO_STORE['mvf3_invest']=JSON.stringify([
    {id:'d_i1',name:'Tesouro IPCA+ 2029',type:'Tesouro Direto',invested:3000,value:3284.50,institution:'Tesouro Direto',date:''},
    {id:'d_i2',name:'HGLG11',type:'FIIs',invested:1200,value:1043.80,institution:'Clear',date:''},
    {id:'d_i3',name:'Bitcoin',type:'Criptomoedas',invested:800,value:1126.40,institution:'Binance',date:''}
  ]);
  DEMO_STORE['mvf3_budgets']=JSON.stringify({'Alimentação':1000,'Transporte':400,'Lazer':300,'Assinaturas':150});
}
const rawGet=k=>DEMO?(DEMO_STORE[k]??null):localStorage.getItem(k);
function demoRO(){toast('Demonstração: somente leitura.');}

function gd(m,y){const r=rawGet(mk(m,y));return r?JSON.parse(r):{salary:0,income:[],expenses:[],bills:[]}}
function sd(d,m,y){if(DEMO)return demoRO();localStorage.setItem(mk(m,y),JSON.stringify(d));syncPush();}
function gg(){return JSON.parse(rawGet('mvf3_goals')||'[]')}
function sg(g){if(DEMO)return demoRO();localStorage.setItem('mvf3_goals',JSON.stringify(g));syncPush();}
function gi(){return JSON.parse(rawGet('mvf3_invest')||'[]')}
function si(i){if(DEMO)return demoRO();localStorage.setItem('mvf3_invest',JSON.stringify(i));syncPush();}
function gb(){return JSON.parse(rawGet('mvf3_budgets')||'{}')}
function sb(b){if(DEMO)return demoRO();localStorage.setItem('mvf3_budgets',JSON.stringify(b));syncPush();}

const brl=v=>'R$ '+parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const ppct=v=>(v>=0?'+':'')+parseFloat(v||0).toFixed(2)+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
