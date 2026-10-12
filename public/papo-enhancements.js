(() => {
  'use strict';

  const PREF_KEY = 'papo.extras.v1';
  const basePrefs = { kombi: true, kombiIntro: true, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, gifts: true, giftAudio: true, hidden: {} };
  let prefs;
  try { prefs = { ...basePrefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { prefs = { ...basePrefs }; }
  prefs.hidden = prefs.hidden || {};
  const persist = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  const q = s => document.querySelector(s);
  const style = document.createElement('style');
  style.id = 'papo-enhancements-style';
  style.textContent = `
    .box input[type=text],.box textarea{width:100%}.box textarea{resize:vertical;min-height:76px;background:var(--bg0);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:10px;font:inherit}
    #app{min-height:100dvh}#side{min-width:190px}#mem{min-width:190px}.m{padding:6px 8px;border-radius:12px;transition:background .16s}.m:hover{background:#ffffff08}
    #tabs{align-content:flex-start;border-bottom:1px solid var(--bd);padding:6px 0}#tabs button{border:1px solid transparent;border-radius:10px;padding:8px 11px}#tabs button.on{box-shadow:0 5px 16px #7c3aed35}
    #settingsSearch{width:100%;margin:14px 0 8px;background:var(--bg0);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:10px;font:inherit}
    .papo-preview{display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg0);border:1px solid var(--bd);border-radius:14px;color:var(--tx)}.papo-preview small{display:block;color:var(--mu)}
    .papo-context{position:fixed;z-index:40;min-width:220px;max-width:min(320px,calc(100vw - 16px));max-height:min(75vh,540px);overflow:auto;padding:7px;background:var(--bg2);border:1px solid var(--bd);border-radius:14px;box-shadow:0 18px 55px #0009;animation:rise .14s var(--ease)}
    .papo-context button.papo-item{display:flex;width:100%;justify-content:flex-start;gap:9px;background:transparent;color:var(--tx);text-align:left;border-radius:9px;padding:9px 10px}.papo-context button.papo-item:hover{background:#7c3aed2c}
    .papo-context .papo-sep{height:1px;background:var(--bd);margin:5px 4px}.papo-context .vp{position:static;display:flex;width:auto;margin:4px 0 6px;background:var(--bg0)}
    .mm,.vm{position:relative}.papo-trigger{position:absolute;z-index:5;top:7px;left:7px;width:32px;height:30px;padding:0;display:grid;place-items:center;background:#090711bb;color:#fff;opacity:0;transition:opacity .15s}.mm .papo-trigger,.vm .papo-trigger{position:static;width:28px;height:28px;opacity:1;margin-left:auto;flex:none;background:transparent;color:var(--mu)}
    .tile:hover>.papo-trigger,.tile:focus-within>.papo-trigger{opacity:1}.tile.vid .papo-trigger{left:auto;right:54px}
    .papo-audio-state{position:absolute;z-index:4;right:8px;bottom:8px;padding:4px 7px;border-radius:8px;background:#090711d9;color:#fff;font-size:11px;line-height:1.2;pointer-events:none}.mm .papo-audio-state,.vm .papo-audio-state{position:static;flex:none;padding:3px 5px;font-size:10px;background:#ef444433;color:var(--tx)}
    .papo-hidden-user>.av,.papo-hidden-user>.lb{visibility:hidden}.papo-hidden-user>video{opacity:.08;filter:blur(10px)}.papo-hidden-user::after{content:'Participante oculto para você';position:absolute;inset:0;display:grid;place-items:center;color:var(--mu);font-size:13px;pointer-events:none}
    .papo-bloom{position:absolute;z-index:8;left:50%;top:45%;width:104px;height:120px;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 8px 18px #e879f966);animation:papoBloomOut 3.6s ease forwards}.papo-bloom svg{width:100%;height:100%;overflow:visible}.papo-bloom .stem{stroke:#4ade80;stroke-width:4;stroke-linecap:round;stroke-dasharray:55;stroke-dashoffset:55;animation:papoStem .5s .05s ease forwards}.papo-bloom .petal{fill:#f9a8d4;stroke:#fce7f3;stroke-width:1.5;transform-box:fill-box;transform-origin:center;transform:scale(.08);animation:papoPetal .55s cubic-bezier(.2,.9,.3,1.3) forwards}.papo-bloom .p2{animation-delay:.12s;fill:#f472b6;rotate:72deg}.papo-bloom .p3{animation-delay:.18s;fill:#fbcfe8;rotate:144deg}.papo-bloom .p4{animation-delay:.24s;fill:#ec4899;rotate:216deg}.papo-bloom .p5{animation-delay:.30s;fill:#f9a8d4;rotate:288deg}.papo-bloom .center{fill:#fef08a;transform-box:fill-box;transform-origin:center;transform:scale(0);animation:papoPetal .4s .36s ease forwards}.papo-particle{position:absolute;z-index:8;width:7px;height:11px;border-radius:80% 10% 80% 10%;background:#f9a8d4;pointer-events:none;animation:papoFloat 1.8s ease-out forwards}.papo-gift-toast{position:fixed;z-index:50;right:18px;bottom:18px;width:min(360px,calc(100vw - 36px));padding:14px;background:var(--bg2);border:1px solid var(--bd);border-radius:16px;box-shadow:0 18px 55px #0009;display:grid;gap:8px;animation:rise .2s var(--ease)}.papo-gift-player{position:fixed;z-index:51;right:18px;bottom:18px;width:min(320px,calc(100vw - 24px));padding:10px;background:var(--bg2);border:1px solid var(--bd);border-radius:16px;box-shadow:0 18px 55px #0009}.papo-gift-player iframe{display:block;width:100%;height:200px;border:0;border-radius:10px}.papo-gift-player .papo-player-controls{display:flex;align-items:center;gap:8px;margin-top:8px}.papo-gift-player input[type=range]{min-width:70px;flex:1}.papo-gift-player button{padding:6px 9px}
    body.papo-kombi,body.papo-kombi button,body.papo-kombi a,body.papo-kombi .ch,body.papo-kombi .mm,body.papo-kombi .vm{cursor:url('/kombi-cursor.svg') 8 8,auto}body.papo-kombi input,body.papo-kombi textarea{cursor:text}body.papo-kombi input[type=range],body.papo-kombi select{cursor:pointer}
    html.papo-reduce-motion *,html.papo-reduce-motion *::before,html.papo-reduce-motion *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}
    .papo-update-notice{position:fixed;z-index:48;left:50%;bottom:18px;transform:translateX(-50%);width:min(560px,calc(100vw - 28px));padding:12px 14px;display:flex;gap:12px;align-items:center;justify-content:space-between;background:var(--bg2);color:var(--tx);border:1px solid var(--ac2);border-radius:14px;box-shadow:0 16px 48px #0008}.papo-update-notice span{font-size:13px}.papo-version-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.papo-diagnostics{white-space:pre-wrap;word-break:break-word;background:var(--bg0);border:1px solid var(--bd);border-radius:10px;padding:10px;color:var(--mu);font:12px/1.5 ui-monospace,monospace}
    @keyframes papoStem{to{stroke-dashoffset:0}}@keyframes papoPetal{to{transform:scale(1)}}@keyframes papoBloomOut{0%,65%{opacity:1}100%{opacity:0;transform:translate(-50%,-65%) scale(1.08)}}@keyframes papoFloat{0%{opacity:0;transform:translate(0,0) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),-70px) rotate(180deg)}}
    @media(max-width:820px){#side{width:75vw;max-width:300px;min-width:0}#mem{display:none}.papo-trigger{opacity:1}#tabs{overflow:auto;flex-wrap:nowrap}#tabs button{white-space:nowrap}.wide{width:min(640px,96vw)}.papo-context{min-width:200px}}
    @media(max-width:520px){#side{width:70vw}#top{padding:0 10px}#msgs{padding:12px 10px}#cform{padding:0 10px 12px}.papo-gift-player{right:8px;bottom:8px}.papo-gift-toast{right:8px;bottom:8px}}
  `;
  document.head.append(style);

  const settings = q('#m2 .box');
  if (settings) {
    const search = document.createElement('input');
    search.id = 'settingsSearch'; search.type = 'search'; search.placeholder = 'Pesquisar configurações'; search.setAttribute('aria-label', 'Pesquisar configurações');
    const header = settings.firstElementChild;
    header.insertAdjacentElement('afterend', search);
    const addCheck = (pane, id, text, value, update) => {
      const label = document.createElement('label'); label.className = 'cb'; label.htmlFor = id;
      const input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.checked = value;
      input.addEventListener('change', () => { update(input.checked); persist(); });
      label.append(input, document.createTextNode(text)); pane.append(label);
    };
    const appearance = q('.pane[data-t="p"]');
    if (appearance) {
      addCheck(appearance, 'papoKombiCursor', 'Usar cursor da Kombi branca e roxa', prefs.kombi, v => { prefs.kombi = v; applyLocalLook(); });
      addCheck(appearance, 'papoKombiIntro', 'Mostrar a abertura da Kombi uma vez por sessão', prefs.kombiIntro, v => { prefs.kombiIntro = v; persist(); });
      addCheck(appearance, 'papoReduceMotion', 'Reduzir animações', prefs.reduceMotion, v => { prefs.reduceMotion = v; applyLocalLook(); });
    }
    const tabs = q('#tabs');
    const giftTab = document.createElement('button'); giftTab.dataset.t = 'g'; giftTab.textContent = 'Presentes';
    const giftPane = document.createElement('div'); giftPane.className = 'pane'; giftPane.dataset.t = 'g';
    giftPane.innerHTML = '<h4>Presentes na chamada</h4><p style="color:var(--mu);font-size:13px">A flor pode aparecer sem som. A música nunca toca para outra pessoa sem ela aceitar.</p>';
    addCheck(giftPane, 'papoGifts', 'Exibir animações de presentes', prefs.gifts, v => { prefs.gifts = v; });
    addCheck(giftPane, 'papoGiftAudio', 'Permitir convite para ouvir música de presente', prefs.giftAudio, v => { prefs.giftAudio = v; });
    tabs.append(giftTab); settings.append(giftPane);
    const appTab = document.createElement('button'); appTab.dataset.t = 'app'; appTab.textContent = 'Aplicativo';
    const appPane = document.createElement('div'); appPane.className = 'pane'; appPane.dataset.t = 'app';
    appPane.innerHTML = '<h4>Versão e diagnóstico</h4><div class="papo-version-row"><b>Versão do site</b><span id="papoVersionValue">Verificando…</span><button type="button" id="papoCheckVersion">Verificar agora</button><a href="/downloads">Versões publicadas</a></div><p id="papoVersionStatus" role="status" style="color:var(--mu);font-size:13px">O site recebe atualizações pelo servidor. Se uma nova versão entrar no ar, você poderá recarregar para aplicá-la.</p><section id="papoDesktopUpdate" hidden><h4>Aplicativo desktop</h4><p id="papoDesktopVersion">Versão instalada: verificando…</p><p id="papoDesktopStatus" role="status">Pronto para verificar atualizações.</p><progress id="papoDesktopProgress" max="100" value="0" hidden></progress><div class="row"><button type="button" id="papoDesktopCheck">Verificar atualização desktop</button><button type="button" id="papoDesktopInstall" class="ac" hidden>Instalar e reiniciar</button></div></section><h4>Diagnóstico local</h4><pre id="papoDiagnostics" class="papo-diagnostics">Pronto para coletar o estado da conexão.</pre><button type="button" id="papoCopyDiagnostics">Copiar diagnóstico</button>';
    tabs.append(appTab); settings.append(appPane);
    const activate = b => {
      tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      settings.querySelectorAll('.pane').forEach(p => p.style.display = p.dataset.t === b.dataset.t ? 'block' : 'none');
      if (b.dataset.t === 'c') loadSess(); if (b.dataset.t !== 'v') stopPrev();
    };
    giftTab.addEventListener('click', () => activate(giftTab));
    appTab.addEventListener('click', () => { activate(appTab); checkVersion(true); checkDesktopUpdates(); refreshDiagnostics(); });
    search.addEventListener('input', () => {
      const term = search.value.trim().toLocaleLowerCase('pt-BR');
      const buttons = [...tabs.querySelectorAll('button')];
      const visible = buttons.filter(b => !term || (settings.querySelector(`.pane[data-t="${b.dataset.t}"]`)?.textContent || b.textContent).toLocaleLowerCase('pt-BR').includes(term));
      buttons.forEach(b => b.hidden = !visible.includes(b));
      if (term && visible.length) activate(visible[0]);
      else if (!term) activate(buttons.find(b => b.dataset.t === 'a'));
    });
  }

  function applyLocalLook() {
    document.body.classList.toggle('papo-kombi', !!prefs.kombi);
    document.documentElement.classList.toggle('papo-reduce-motion', !!prefs.reduceMotion);
    const c = q('#papoKombiCursor'); if (c) c.checked = !!prefs.kombi;
    const m = q('#papoReduceMotion'); if (m) m.checked = !!prefs.reduceMotion;
  }
  applyLocalLook();

  const pageBuild = q('meta[name="papo-build"]')?.content || '';
  let lastVersion = null;
  function showReloadNotice(version) {
    if (q('#papoUpdateNotice')) return;
    const bar = document.createElement('div'); bar.id = 'papoUpdateNotice'; bar.className = 'papo-update-notice'; bar.setAttribute('role','status');
    const text = document.createElement('span'); text.textContent = `O Papo ${version} foi atualizado no servidor. Recarregue para aplicar.`;
    const reload = document.createElement('button'); reload.type = 'button'; reload.className = 'ac'; reload.textContent = 'Recarregar'; reload.onclick = () => location.reload();
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Depois'; close.setAttribute('aria-label','Fechar aviso de atualização'); close.onclick = () => bar.remove();
    bar.append(text,reload,close); document.body.append(bar);
  }
  async function checkVersion(manual) {
    const value = q('#papoVersionValue'), note = q('#papoVersionStatus'), button = q('#papoCheckVersion');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/version',{cache:'no-store',credentials:'same-origin'});
      if (!response.ok) throw new Error('Não consegui consultar o servidor.');
      const current = await response.json(); lastVersion = current;
      if (value) value.textContent = `${current.version} · ${current.build}`;
      if (note) note.textContent = current.build !== pageBuild ? 'Há uma versão nova do site. Recarregue a página para aplicá-la.' : (manual ? 'O site está atualizado.' : 'A versão do site está atual.');
      if (current.build !== pageBuild) showReloadNotice(current.version);
      return current;
    } catch (error) {
      if (note) note.textContent = error.message || 'Não consegui verificar agora. Tente novamente.';
      return null;
    } finally { if (button) button.disabled = false; }
  }
  function refreshDiagnostics() {
    const output = q('#papoDiagnostics'); if (!output) return;
    const states = typeof pcs === 'undefined' ? [] : Object.values(pcs).map(c => c.pc.connectionState);
    const socketState = typeof ws === 'undefined' || !ws ? 'desconectado' : ['conectando','conectado','fechando','fechado'][ws.readyState] || 'desconhecido';
    const data = {versao:lastVersion?.version||'consultando', navegador:navigator.userAgent, tela:`${innerWidth}×${innerHeight}`, servidor:socketState, participantes:typeof room==='undefined'?0:room.peers().length, conexoesWebRTC:states};
    output.textContent = JSON.stringify(data,null,2);
  }
  q('#papoCheckVersion')?.addEventListener('click',()=>checkVersion(true));
  const nativeUpdates=window.papo?.updates;
  function updateDesktopState(info){const status=q('#papoDesktopStatus'),progress=q('#papoDesktopProgress'),install=q('#papoDesktopInstall');if(!status||!info)return;const messages={checking:'Procurando uma versão nova…',available:'Nova versão encontrada. O download começou.',downloading:'Baixando atualização…',downloaded:'Atualização pronta para instalar.',notAvailable:'O aplicativo desktop está atualizado.',unsupported:'Atualizações nativas estão disponíveis apenas no aplicativo desktop instalado.',error:'Não consegui atualizar: '+(info.message||'tente novamente mais tarde.')};status.textContent=messages[info.state]||'Estado da atualização recebido.';if(info.state==='downloading')status.textContent+=' '+Math.round(info.percent||0)+'%';if(info.state==='downloaded'&&info.version)status.textContent='Versão '+info.version+' pronta para instalar.';if(progress){progress.hidden=info.state!=='downloading';if(info.state==='downloading')progress.value=info.percent||0}if(install)install.hidden=info.state!=='downloaded'}
  async function checkDesktopUpdates(){if(!nativeUpdates)return;const panel=q('#papoDesktopUpdate');if(panel)panel.hidden=false;try{const version=await window.papo.appVersion();q('#papoDesktopVersion').textContent='Versão instalada: '+version}catch{}try{await nativeUpdates.check()}catch(error){updateDesktopState({state:'error',message:error.message})}}
  if(nativeUpdates){nativeUpdates.onState(updateDesktopState);q('#papoDesktopCheck')?.addEventListener('click',checkDesktopUpdates);q('#papoDesktopInstall')?.addEventListener('click',()=>nativeUpdates.install())}
  q('#papoCopyDiagnostics')?.addEventListener('click',async()=>{refreshDiagnostics();try{await navigator.clipboard.writeText(q('#papoDiagnostics').textContent);toast('Diagnóstico copiado. Nenhuma conversa ou credencial foi incluída.')}catch{toast('Não consegui copiar. Selecione o texto do diagnóstico e copie manualmente.')}});
  checkVersion(false); refreshDiagnostics();
  setInterval(()=>{if(!document.hidden)checkVersion(false)},300000);
  document.addEventListener('pointerover',event=>{const b=event.target.closest?.('button');if(!b)return;const label=(b.textContent||'').trim().replace(/\s+/g,' ');if(label&&!b.title)b.title=label;if(label&&!b.getAttribute('aria-label'))b.setAttribute('aria-label',label)},true);

  function toast(text) {
    const n = document.createElement('div'); n.className = 'papo-gift-toast'; n.setAttribute('role', 'status');
    const t = document.createElement('div'); t.textContent = text; n.append(t); document.body.append(n);
    setTimeout(() => n.remove(), 3500);
  }
  function initBio() {
    const name = q('#pname'), status = q('#pst'); if (!name || !status) return;
    let bio = q('#pbio');
    if (!bio) { bio = document.createElement('textarea'); bio.id = 'pbio'; bio.maxLength = 160; bio.rows = 3; bio.placeholder = 'Biografia (até 160 caracteres)'; status.insertAdjacentElement('afterend', bio); }
    let preview = q('#papoProfilePreview');
    if (!preview) { preview = document.createElement('div'); preview.id = 'papoProfilePreview'; preview.className = 'papo-preview'; preview.innerHTML = '<div class="av" aria-hidden="true"></div><div><b></b><small></small><small class="bio"></small></div>'; bio.insertAdjacentElement('afterend', preview); }
    const paint = () => { const p = preview.querySelector('.av'); p.textContent = draft?.avatar ? '' : (name.value || '?')[0].toUpperCase(); p.style.background = draft?.avatar ? `url(${draft.avatar}) center/cover` : q('#pcol').value; preview.querySelector('b').textContent = name.value || 'Seu nome'; preview.querySelector('small').textContent = status.value || 'Sem status'; preview.querySelector('.bio').textContent = bio.value || 'Sua biografia aparecerá aqui'; };
    new MutationObserver(paint).observe(q('#pav'),{attributes:true,attributeFilter:['style']});
    ['input','change'].forEach(ev => [name,status,bio,q('#pcol')].forEach(e => e?.addEventListener(ev, paint)));
    q('#bp')?.addEventListener('click', () => setTimeout(() => { const p = pr(myId); bio.value = p.bio || ''; paint(); }, 0));
    q('#psave').onclick = () => {
      const clean = { name: (name.value || 'Sem nome').trim().slice(0,24), status: status.value.trim().slice(0,60), bio: bio.value.trim().slice(0,160), color: q('#pcol').value, avatar: draft?.avatar || '' };
      db.doc('profiles/' + myId).set(clean); q('#m1').style.display = 'none'; draft = null; toast('Perfil salvo.');
    };
  }
  initBio();

  let menu = null;
  function closeMenu() { menu?.remove(); menu = null; }
  function item(parent, label, action) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role','menuitem'); b.className = 'papo-item'; b.textContent = label; b.addEventListener('click', ev => { ev.stopPropagation(); action(b); }); parent.append(b); return b;
  }
  function separator(parent) { const d = document.createElement('div'); d.className = 'papo-sep'; parent.append(d); }
  function openMenu(x, y, entries) {
    closeMenu(); menu = document.createElement('div'); menu.className = 'papo-context'; menu.setAttribute('role','menu');
    entries.forEach((entry,i) => { if (entry === '-') separator(menu); else item(menu,entry.label,entry.run); });
    document.body.append(menu);
    const r = menu.getBoundingClientRect(); menu.style.left = Math.max(8,Math.min(x,innerWidth-r.width-8))+'px'; menu.style.top = Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
    menu.querySelector('button')?.focus({preventScroll:true});
  }
  function copy(text) { navigator.clipboard?.writeText(text).then(()=>toast('Copiado.')).catch(()=>toast('Não consegui copiar neste navegador.')); }
  function findPeer(uid) { return room.peers().find(x => x.presence?.id === uid); }
  function addVolume(parent, kind, uid) { const p = volPanel(kind,uid); p.classList.add('open'); parent.append(p); }
  function mutedLocally(kind,uid) { const v=cfg.pvol[kind+':'+uid];return !!v?.m||Number(v?.v)===0; }
  function toggleLocalMute(kind,uid) { const key=kind+':'+uid,old=cfg.pvol[key]||{v:100,m:false},wasMuted=mutedLocally(kind,uid);cfg.pvol[key]={v:wasMuted&&Number(old.v)===0?100:(old.v==null?100:old.v),m:!wasMuted};saveCfg();Object.keys(R).forEach(id=>{if(R[id].uid===uid&&R[id].kind===kind)applyVol(id)});syncTargets(); }
  function updateAudioBadge(el,uid) { if(!uid)return;const states=[];if(mutedLocally('voice',uid))states.push('Voz silenciada');if(el.dataset.videoTile==='1'&&mutedLocally('share',uid))states.push('Transmissão silenciada');let badge=el.querySelector(':scope > .papo-audio-state');if(!states.length){badge?.remove();return}if(!badge){badge=document.createElement('span');badge.className='papo-audio-state';badge.setAttribute('aria-label','Áudio silenciado localmente');const trigger=el.querySelector(':scope > .papo-trigger');el.insertBefore(badge,trigger||null)}badge.textContent='🄇 '+states.join(' · ');badge.title=states.join(' · '); }
  function viewProfile(uid) {
    const p = pr(uid); const modal = document.createElement('div'); modal.className = 'modal'; modal.style.display='grid'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Perfil de '+p.name);
    const box = document.createElement('div'); box.className='box'; const av = document.createElement('div'); av.className='av'; av.style.width='72px'; av.style.height='72px'; av.style.background=p.avatar?`url(${p.avatar}) center/cover`:p.color||'var(--ac)'; if(!p.avatar)av.textContent=(p.name||'?')[0].toUpperCase();
    const title=document.createElement('h3');title.textContent=p.name||'Usuário';const status=document.createElement('p');status.textContent=p.status||'Sem status';const bio=document.createElement('p');bio.textContent=p.bio||'Sem biografia';const close=document.createElement('button');close.className='ac';close.textContent='Fechar';close.onclick=()=>modal.remove();box.append(av,title,status,bio,close);modal.append(box);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});modal.addEventListener('keydown',e=>{if(e.key==='Escape')modal.remove()});document.body.append(modal);close.focus();
  }
  function addUserActions(entries, uid, target) {
    if (!uid) return entries;
    if (uid === myId) { entries.push({label:'Editar meu perfil',run:()=>{closeMenu();openProfile(false)}}); return entries; }
    const p = pr(uid); entries.push({label:'Abrir perfil',run:()=>{closeMenu();viewProfile(uid)}}); entries.push({label:'Copiar nome de usuário',run:()=>{closeMenu();copy(p.name||'')}}); entries.push({label:'Copiar identificador público',run:()=>{closeMenu();copy(uid)}}); entries.push('-');
    entries.push({label:'Ajustar volume da voz',run:button=>addVolume(menu,'voice',uid)});
    entries.push({label:mutedLocally('voice',uid)?'Ativar voz para mim':'Silenciar voz para mim',run:()=>{toggleLocalMute('voice',uid);closeMenu()}});
    const hasShare = Object.values(R).some(r=>r.uid===uid&&r.kind==='share'&&r.stream?.getAudioTracks().length);
    if(hasShare){entries.push({label:'Ajustar áudio da transmissão',run:()=>addVolume(menu,'share',uid)});entries.push({label:mutedLocally('share',uid)?'Ativar áudio da transmissão':'Silenciar áudio da transmissão',run:()=>{toggleLocalMute('share',uid);closeMenu()}})}
    entries.push({label:'Restaurar volumes para 100%',run:()=>{Object.keys(cfg.pvol||{}).filter(k=>k.endsWith(':'+uid)).forEach(k=>delete cfg.pvol[k]);saveCfg();Object.keys(R).filter(k=>R[k].uid===uid).forEach(applyVol);syncTargets();closeMenu();toast('Volumes restaurados.')}});
    if(target?.dataset.videoTile==='1')entries.push({label:'Abrir transmissão em tela cheia',run:()=>{closeMenu();target.requestFullscreen?.().catch(()=>toast('Tela cheia não está disponível.'))}});
    if(myVc&&findPeer(uid)?.presence?.vc===myVc)entries.push({label:'𞼸 Enviar presente',run:()=>sendGift(uid)});
    const hidden=!!prefs.hidden[uid];entries.push({label:hidden?'Mostrar participante':'Ocultar visual para mim',run:()=>{prefs.hidden[uid]=!hidden;persist();applyHidden();closeMenu()}});
    return entries;
  }
  function sendGift(uid) { send({t:'gift',to:uid});closeMenu();if(prefs.giftAudio)startMusic('sent'); }
  function addGiftButton(el) {
    if(el.querySelector(':scope > .papo-trigger'))return;
    const b=document.createElement('button');b.type='button';b.className='papo-trigger';b.textContent='⋯';b.title='Mais opções';b.setAttribute('aria-label','Mais opções');
    b.addEventListener('click',e=>{e.stopPropagation();const r=b.getBoundingClientRect();showContext(el,r.left,r.bottom)});el.append(b);
  }
  function syncTargets() {
    if (!myVc) stopMusic();
    const unique=[],seen=new Set();room.peers().forEach(p=>{const uid=p.presence?.id;if(uid&&!seen.has(uid)){seen.add(uid);unique.push(p)}});
    document.querySelectorAll('#mem .mm').forEach((e,i)=>{if(unique[i])e.dataset.uid=unique[i].presence.id;addGiftButton(e)});
    document.querySelectorAll('#chs .vm').forEach(e=>{const p=room.peers().find(x=>x.peer===e.dataset.p);if(p)e.dataset.uid=p.presence.id;addGiftButton(e)});
    els.forEach((e,key)=>{if(key.startsWith('u:')){const p=room.peers().find(x=>x.peer===key.slice(2));if(p)e.dataset.uid=p.presence.id;addGiftButton(e)}else if(key.startsWith('v:')){const sid=key.slice(2);const c=Object.values(pcs).find(x=>x.streams.has(sid));const p=c&&room.peers().find(x=>x.peer===c.pid);if(p)e.dataset.uid=p.presence.id;addGiftButton(e)}});
    document.querySelectorAll('#chs .ch').forEach((e,i)=>{if(CH[i]){e.dataset.channelId=CH[i].id;e.dataset.channelType=CH[i].t}});document.querySelectorAll('.mm,.vm,.tile[data-uid]').forEach(e=>updateAudioBadge(e,e.dataset.uid));applyHidden();
  }
  function applyHidden() { document.querySelectorAll('.tile[data-uid]').forEach(e=>e.classList.toggle('papo-hidden-user',!!prefs.hidden[e.dataset.uid])); }
  const observer=new MutationObserver(()=>syncTargets());observer.observe(document.body,{childList:true,subtree:true});setInterval(syncTargets,1200);
  function showContext(target,x,y) {
    const peerEl=target.closest('.mm,.vm,.tile');
    if(peerEl){const uid=peerEl.dataset.uid||'';if(uid){openMenu(x,y,addUserActions([],uid,peerEl));return}}
    const msg=target.closest('.m');
    if(msg){const entries=[{label:'Copiar texto',run:()=>{closeMenu();copy(msg.querySelector('.t')?.textContent||'')}},{label:'Responder',run:()=>{msg.querySelector('.act [aria-label="Responder"]')?.click();closeMenu()}},{label:'Reagir com 🁍',run:()=>{msg.querySelector('.act [aria-label="Reagir"]')?.click();closeMenu()}}];if(msg.dataset.author===myId){entries.push('-', {label:'Editar mensagem',run:()=>{msg.querySelector('.act [aria-label="Editar"]')?.click();closeMenu()}},{label:'Excluir mensagem',run:()=>{msg.querySelector('.act [aria-label="Excluir"]')?.click();closeMenu()}})}openMenu(x,y,entries);return}
    const ch=target.closest('.ch');if(ch){const id=ch.dataset.channelId,voice=ch.dataset.channelType==='v';const entries=[{label:voice?(myVc===id?'Sair da sala':'Entrar na sala'):'Abrir canal',run:()=>{closeMenu();if(voice&&myVc&&myVc!==id)stopMusic();voice?joinVc(id):openCh(id)}},{label:'Copiar nome do canal',run:()=>{closeMenu();copy(ch.textContent.replace(/^# |^🄊 /,'').replace(/\d+$/,''))}}];if(!voice&&unread[id])entries.push({label:'Marcar como lida',run:()=>{unread[id]=0;drawChs();closeMenu()}});openMenu(x,y,entries);return}
    const video=target.closest('.tile.vid');if(video){const uid=video.dataset.uid,entries=[];if(uid)addUserActions(entries,uid,video);entries.push({label:'Tela cheia',run:()=>{closeMenu();video.requestFullscreen?.().catch(()=>toast('Tela cheia não está disponível.'))}});openMenu(x,y,entries)}
  }
  document.addEventListener('contextmenu',e=>{const target=e.target.closest('.mm,.vm,.tile,.m,.ch');if(!target)return;e.preventDefault();showContext(target,e.clientX,e.clientY)});
  document.addEventListener('click',e=>{const ch=e.target.closest('#chs .ch[data-channel-type="v"]');if(ch&&myVc&&ch.dataset.channelId!==myVc)stopMusic()},true);
  document.addEventListener('click',e=>{if(menu&&!menu.contains(e.target))closeMenu()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();stopMusic()}});

  const flowerSvg='<svg viewBox="0 0 100 120" aria-hidden="true"><path class="stem" d="M50 64 Q48 86 50 108 M49 87 Q34 76 27 82 M50 94 Q64 80 72 82" fill="none"/><ellipse class="petal p1" cx="50" cy="39" rx="12" ry="25"/><ellipse class="petal p2" cx="50" cy="39" rx="12" ry="25" transform="rotate(72 50 50)"/><ellipse class="petal p3" cx="50" cy="39" rx="12" ry="25" transform="rotate(144 50 50)"/><ellipse class="petal p4" cx="50" cy="39" rx="12" ry="25" transform="rotate(216 50 50)"/><ellipse class="petal p5" cx="50" cy="39" rx="12" ry="25" transform="rotate(288 50 50)"/><circle class="center" cx="50" cy="50" r="9"/></svg>';
  function animateGift(uid) {
    if(!prefs.gifts)return;let target=[...document.querySelectorAll('.tile[data-user-tile],.tile[data-uid],.mm,.vm')].find(e=>e.dataset.uid===uid);if(!target)return;
    target.querySelectorAll('.papo-bloom,.papo-particle').forEach(e=>e.remove());const bloom=document.createElement('div');bloom.className='papo-bloom';bloom.innerHTML=flowerSvg;target.append(bloom);
    for(let i=0;i<7;i++){const p=document.createElement('i');p.className='papo-particle';p.style.left=(35+Math.random()*35)+'%';p.style.top='45%';p.style.setProperty('--dx',(Math.random()*90-45)+'px');target.append(p);setTimeout(()=>p.remove(),1900)}setTimeout(()=>bloom.remove(),3700);
  }
  let player=null,playerTimer=0,apiPromise=null,playerToken=0;
  function loadYT() {
    if(window.YT?.Player)return Promise.resolve(window.YT);
    if(apiPromise)return apiPromise;
    apiPromise=new Promise((resolve,reject)=>{const old=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{old?.();resolve(window.YT)};const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.onerror=reject;document.head.append(s);setTimeout(()=>reject(new Error('timeout')),12000)});return apiPromise;
  }
  function stopMusic() { clearTimeout(playerTimer);playerTimer=0;playerToken++;if(player){try{player.stopVideo();player.destroy()}catch{}player=null}q('#papoGiftPlayer')?.remove(); }
  async function startMusic(mode) {
    stopMusic();const token=playerToken;const wrap=document.createElement('section');wrap.id='papoGiftPlayer';wrap.className='papo-gift-player';wrap.setAttribute('aria-label','Música do presente');
    const play=document.createElement('button');play.textContent='Iniciar';play.setAttribute('aria-label','Iniciar áudio do presente');play.onclick=()=>{try{player?.playVideo();state.textContent='Equalize — Pitty';}catch{}};
    const title=document.createElement('b');title.textContent='Equalize — Pitty · até 30 segundos';const frame=document.createElement('div');frame.id='papoGiftYoutube';const controls=document.createElement('div');controls.className='papo-player-controls';const state=document.createElement('span');state.textContent='Carregando player oficial do YouTube…';const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value='70';volume.setAttribute('aria-label','Volume da música do presente');const close=document.createElement('button');close.textContent='Parar';close.onclick=stopMusic;controls.append(state,play,volume,close);wrap.append(title,frame,controls);document.body.append(wrap);
    try{const YT=await loadYT();if(token!==playerToken)return;player=new YT.Player(frame.id,{width:'300',height:'200',videoId:'x7WHL-o5tMo',playerVars:{autoplay:1,controls:1,playsinline:1,enablejsapi:1,origin:location.origin},events:{onReady:e=>{if(token!==playerToken)return;e.target.setVolume(+volume.value);e.target.playVideo();state.textContent=mode==='sent'?'Você enviou um presente':'Áudio do presente';},onStateChange:e=>{if(e.data===YT.PlayerState.PLAYING&&!playerTimer)playerTimer=setTimeout(stopMusic,30000);else if(e.data===YT.PlayerState.ENDED)stopMusic()},onAutoplayBlocked:()=>{state.textContent='O navegador bloqueou a reprodução. Use Iniciar ou o controle do vídeo.'}}});volume.oninput=()=>{try{player?.setVolume(+volume.value)}catch{}};}
    catch{if(token===playerToken){state.textContent='Não foi possível carregar o player.';const link=document.createElement('a');link.href='https://www.youtube.com/watch?v=x7WHL-o5tMo';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir no YouTube';wrap.append(link)}}
  }
  function receiveGift(m) {
    animateGift(m.to);if(m.from===myId||m.to!==myId||!prefs.giftAudio)return;
    const who=pr(m.from).name;const toastEl=document.createElement('div');toastEl.className='papo-gift-toast';toastEl.setAttribute('role','dialog');toastEl.setAttribute('aria-label','Presente recebido');const text=document.createElement('b');text.textContent=who+' enviou uma flor para você.';const note=document.createElement('span');note.textContent='Quer ouvir Equalize por até 30 segundos?';const buttons=document.createElement('div');buttons.className='row';const accept=document.createElement('button');accept.className='ac';accept.textContent='Aceitar e ouvir';accept.onclick=()=>{toastEl.remove();startMusic('received')};const dismiss=document.createElement('button');dismiss.textContent='Agora não';dismiss.onclick=()=>toastEl.remove();buttons.append(accept,dismiss);toastEl.append(text,note,buttons);document.body.append(toastEl);
  }
  const hookedSockets = new WeakSet();
  function hookSocket() {
    if (typeof ws === 'undefined' || !ws || hookedSockets.has(ws)) return;
    hookedSockets.add(ws);
    ws.addEventListener('message', e => { try { const m=JSON.parse(e.data); if(m?.t==='gift')receiveGift(m); } catch {} });
  }
  setInterval(hookSocket, 400);
  document.addEventListener('click',e=>{if(e.target.closest('#bleave,#bleave2'))stopMusic()},true);addEventListener('pagehide',stopMusic);
  if(typeof room!=='undefined'&&room.onPeers)room.onPeers(syncTargets);
})();
