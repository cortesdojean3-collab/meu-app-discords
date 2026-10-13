(() => {
  'use strict';
  let overlay=null, config=null, revision=0, busy=false, dirty=false, launcher=null, previousInert=[];
  const featureNames={garden:'Jardim interativo',letters:'30 cartas diárias',delivery:'Entrega da Kombi',heart:'Surpresa do coração',constellation:'Constelação',special:'Flor especial',finale:'Encerramento voluntário',intro:'Abertura comemorativa',decorations:'Decorações do evento'};
  const messageNames={delivery:'Entrega especial',heart:'Três cliques no coração',constellation:'Constelação de corações',special:'Carta da flor especial',finale:'Carta de encerramento'};
  const $=selector=>overlay?.querySelector(selector);
  const el=(tag,attrs={},content)=>{const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')node.className=v;else node.setAttribute(k,v)}if(content!==undefined)node.textContent=content;return node};
  const status=(message,error=false)=>{const target=$('.pea-status');if(target){target.textContent=message;target.dataset.error=String(error)}};
  function zonedParts(value,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
  function localDateTime(value,zone){if(!value)return '';const p=zonedParts(value,zone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
  // Convert an administrator's wall-clock input in the selected IANA zone.
  function toInstant(value,zone){
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw new Error('Preencha as datas de início e término.');
    const [year,month,day,hour,minute]=value.match(/\d+/g).map(Number), wall=Date.UTC(year,month-1,day,hour,minute);let instant=wall;
    for(let i=0;i<4;i++){const p=zonedParts(instant,zone), observed=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);instant+=wall-observed;}
    if(localDateTime(instant,zone)!==value)throw new Error('Essa hora não existe no fuso escolhido. Escolha outro horário.');
    return new Date(instant).toISOString();
  }
  function field(parent,label,key,value,kind='text',wide=false){
    const wrap=el('label',{class:'pea-field'+(wide?' pea-wide':'')});wrap.append(el('span',{},label));
    const control=el(kind==='textarea'?'textarea':'input',{'data-field':key,'aria-label':label});
    if(kind!=='textarea')control.type=kind;
    if(kind==='textarea')control.rows=key==='mainText'||key==='messages.special'||key==='messages.finale'?7:3;
    control.value=value??'';if(kind==='text')control.maxLength=key==='title'?160:1000;
    wrap.append(control);parent.append(wrap);return control;
  }
  function checkbox(parent,label,key,value){const wrap=el('label',{class:'pea-check'}),control=el('input',{type:'checkbox','data-field':key});control.checked=!!value;wrap.append(control,el('span',{},label));parent.append(wrap);}
  function section(form,title){const box=el('fieldset');box.append(el('legend',{},title));form.append(box);return box;}
  function get(obj,key){return key.split('.').reduce((o,k)=>o?.[k],obj);}
  function set(obj,key,value){const parts=key.split('.'),last=parts.pop();let cursor=obj;for(const part of parts)cursor=cursor[part]??=(/^\d+$/.test(last)?[]:{});cursor[last]=value;}
  function render(){
    const body=$('.pea-body');body.replaceChildren();const form=el('form',{id:'papoEventAdminForm'});body.append(form);
    const timing=section(form,'Datas e publicação'), grid=el('div',{class:'pea-grid'});timing.append(grid);
    field(grid,'Início do evento','startsAt',localDateTime(config.startsAt,config.timeZone),'datetime-local');
    field(grid,'Término do evento','endsAt',localDateTime(config.endsAt,config.timeZone),'datetime-local');
    const zoneWrap=el('label',{class:'pea-field'});zoneWrap.append(el('span',{},'Fuso horário'));const zones=el('select',{'data-field':'timeZone','aria-label':'Fuso horário'});
    for(const zone of [...new Set([config.timeZone,'America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Recife','Europe/Lisbon','UTC'])])zones.append(el('option',{value:zone},zone));zones.value=config.timeZone;zoneWrap.append(zones);grid.append(zoneWrap);
    field(grid,'Data em que vocês se conheceram','meetingDate',config.meetingDate,'date');
    timing.append(el('p',{class:'pea-help'},'O término é exclusivo: à hora indicada, o tema normal volta automaticamente. São necessários 30 ou 31 dias de calendário para as 30 cartas. Alterar o relógio do computador não libera cartas.'));
    checkbox(timing,'Evento habilitado (as datas ainda controlam a ativação)','enabled',config.enabled);
    checkbox(timing,'Publicar a data do encontro e o contador de dias','publishMeetingDate',config.publishMeetingDate);
    const names=section(form,'Nomes opcionais'), nameGrid=el('div',{class:'pea-grid'});names.append(nameGrid);
    field(nameGrid,'Seu nome','names.you',config.names?.you);field(nameGrid,'Nome da pessoa especial','names.partner',config.names?.partner);
    checkbox(names,'Quero publicar esses nomes no evento','publishNames',config.publishNames);
    names.append(el('p',{class:'pea-help'},'Os nomes ficam privados até você marcar a publicação.'));
    const text=section(form,'Textos principais'), textGrid=el('div',{class:'pea-grid'});text.append(textGrid);
    field(textGrid,'Título','title',config.title,'text',true);field(textGrid,'Subtítulo','subtitle',config.subtitle,'textarea',true);field(textGrid,'Mensagem principal','mainText',config.mainText,'textarea',true);
    const look=section(form,'Cores e recursos'), colorGrid=el('div',{class:'pea-grid'});look.append(colorGrid);
    for(const[key,label]of Object.entries({primary:'Roxo principal',pink:'Rosa suave',gold:'Dourado'}))field(colorGrid,label,'colors.'+key,config.colors?.[key],'color');
    const flags=el('div',{class:'pea-grid'});look.append(flags);for(const[key,label]of Object.entries(featureNames))checkbox(flags,label,'features.'+key,config.features?.[key]!==false);
    for(const[key,label]of Object.entries({petals:'Pétalas decorativas',stars:'Estrelas decorativas',flowers:'Flores nas bordas'}))checkbox(flags,label,'decorations.'+key,config.decorations?.[key]!==false);
    checkbox(look,'Permitir reabrir as lembranças após o término (sem o tema ou efeitos do evento)','allowMemories',config.allowMemories);
    const flowers=el('details');flowers.append(el('summary',{},'Flores e suas mensagens'));const flowerGrid=el('div',{class:'pea-grid'});flowers.append(flowerGrid);form.append(flowers);
    (config.flowers||[]).forEach((flower,i)=>{field(flowerGrid,flower.name,`flowers.${i}.text`,flower.text,'textarea');});
    const surprises=el('details');surprises.append(el('summary',{},'Mensagens das surpresas e do encerramento'));const msgGrid=el('div',{class:'pea-grid'});surprises.append(msgGrid);form.append(surprises);
    for(const[key,label]of Object.entries(messageNames))field(msgGrid,label,'messages.'+key,config.messages?.[key],'textarea',key==='special'||key==='finale');
    const letters=el('details');letters.append(el('summary',{},'Editar as 30 cartas'));const letterGrid=el('div',{class:'pea-letters'});letters.append(letterGrid);form.append(letters);
    (config.letters||[]).forEach((letter,i)=>field(letterGrid,'Dia '+(i+1),`letters.${i}.text`,typeof letter==='string'?letter:letter.text,'textarea'));
    form.addEventListener('input',()=>{dirty=true;status('Há alterações ainda não salvas.');});
    form.addEventListener('change',event=>{if(event.target.matches('[data-field="timeZone"]')){status('As horas serão interpretadas no novo fuso. Confira as datas antes de salvar.');}});
    form.addEventListener('submit',event=>{event.preventDefault();save();});
    status('Somente sua conta administradora pode salvar estas configurações.');
  }
  async function api(url,options){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options}),body=await response.json();if(!response.ok)throw Object.assign(new Error(body.erro||'Não foi possível acessar o evento.'),{status:response.status});return body;}
  async function save(){
    if(busy||!config)return;const restoreSaveFocus=document.activeElement===$('.pea-save');busy=true;$('.pea-save').disabled=true;status('Salvando no banco de dados…');
    try{
      const next=structuredClone(config);
      overlay.querySelectorAll('[data-field]').forEach(control=>{const key=control.dataset.field;if(key==='startsAt'||key==='endsAt')return;set(next,key,control.type==='checkbox'?control.checked:control.value.trim());});
      for(const key of ['startsAt','endsAt']){const value=$(`[data-field="${key}"]`).value;next[key]=value?toInstant(value,next.timeZone):null;}
      const result=await api('/api/event/admin',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:next,revision})});
      config=result.config||next;revision=result.revision??revision+1;dirty=false;
      await window.PapoEvent?.refresh();status('Configurações salvas. O evento segue as datas definidas.');
    }catch(error){status(error.status===409?'Outra aba alterou o evento. Feche e abra o painel para carregar a versão atual; copie seus textos antes.':error.message,true);}
    finally{busy=false;if(overlay){$('.pea-save').disabled=false;if(restoreSaveFocus)$('.pea-save').focus({preventScroll:true});}}
  }
  function close(force=false){
    if(!overlay||busy)return;
    if(dirty&&!force&&!confirm('Descartar as alterações que ainda não foram salvas?'))return;
    overlay.remove();overlay=null;config=null;dirty=false;
    for(const[node,value]of previousInert)if(node.isConnected)node.inert=value;previousInert=[];
    document.removeEventListener('keydown',keys,true);if(launcher?.isConnected)launcher.focus({preventScroll:true});
  }
  function keys(event){
    if(!overlay)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
    if(event.key==='Tab'){const focusable=[...overlay.querySelectorAll('button,input,textarea,select,summary')].filter(node=>!node.disabled&&node.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement))){event.preventDefault();first?.focus();}}
  }
  async function open(){
    if(overlay)return;launcher=document.activeElement;overlay=el('div',{id:'papoEventAdmin'});
    const dialog=el('section',{class:'pea-dialog',role:'dialog','aria-modal':'true','aria-labelledby':'peaTitle'}),header=el('header',{class:'pea-header'}),titleBox=el('div');
    titleBox.append(el('span',{class:'pea-eyebrow'},'Seu pequeno infinito'),el('h2',{id:'peaTitle'},'Configurar o evento'));const closeButton=el('button',{class:'pea-close',type:'button','aria-label':'Fechar configurações'},'×');closeButton.onclick=()=>close();header.append(titleBox,closeButton);
    const body=el('div',{class:'pea-body'});body.append(el('p',{class:'pea-loading'},'Carregando configurações…'));
    const footer=el('footer',{class:'pea-footer'}),saveButton=el('button',{class:'pea-save',type:'submit',form:'papoEventAdminForm'},'Salvar configurações');saveButton.disabled=true;footer.append(el('p',{class:'pea-status',role:'status','aria-live':'polite'}),saveButton);
    dialog.append(header,body,footer);overlay.append(dialog);document.body.append(overlay);previousInert=[...document.body.children].filter(node=>node!==overlay&&node.tagName!=='SCRIPT'&&node.tagName!=='LINK').map(node=>[node,node.inert]);previousInert.forEach(([node])=>{node.inert=true;});document.addEventListener('keydown',keys,true);closeButton.focus();
    try{const result=await api('/api/event/admin');if(!overlay)return;config=result.config;revision=result.revision;render();saveButton.disabled=false;}
    catch(error){if(!overlay)return;body.replaceChildren(el('p',{class:'pea-loading'},error.message));status('O painel está disponível somente para a conta administradora.',true);}
  }
  window.PapoEventAdmin={open,close};
  document.addEventListener('papo:event-admin',open);
  window.addEventListener('pagehide',()=>close(true),{once:true});
})();
