// BACKUP / RESTORE
function exportBackup(){
  const dump={};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('mvf3_'))dump[k]=localStorage.getItem(k);}
  const payload={_app:'mvfinancing',_version:1,_exportedAt:new Date().toISOString(),data:dump};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mvfinancing_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
  toast('Backup baixado com sucesso.');
}
function importBackup(input){
  if(DEMO){demoRO();input.value='';return;}
  const file=input.files&&input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    let parsed;
    try{parsed=JSON.parse(e.target.result);}catch(err){toast('Arquivo inválido.');input.value='';return;}
    const data=parsed.data||parsed;
    const keys=Object.keys(data).filter(k=>k.startsWith('mvf3_'));
    if(!keys.length){toast('Nenhum dado do MV Financing no arquivo.');input.value='';return;}
    confirm2('Restaurar backup',`Importar ${keys.length} registro(s)? Isso substitui os dados atuais correspondentes.`,()=>{
      keys.forEach(k=>localStorage.setItem(k,data[k]));
      if(data['mvf3_theme'])refreshTheme();
      syncPush();goToday();toast('Backup restaurado.');
    },false);
    input.value='';
  };
  reader.readAsText(file);
}
function refreshTheme(){applyTheme(localStorage.getItem('mvf3_theme')||'dark');}
