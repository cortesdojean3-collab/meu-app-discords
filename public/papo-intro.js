(() => {
  'use strict';
  const root=document.documentElement,screen=document.getElementById('papo-intro');
  if(!root.classList.contains('papo-intro-pending')||!screen)return;
  const van=screen.querySelector('.intro-van'),soundButton=screen.querySelector('[data-intro-sound]'),skipButton=screen.querySelector('[data-intro-skip]'),audio=screen.querySelector('#papoMotorAudio'),soundText=soundButton?.querySelector('span');
  let finished=false;
  function soundState(label,active=false){if(soundText)soundText.textContent=label;if(soundButton){soundButton.setAttribute('aria-label',label);soundButton.setAttribute('aria-pressed',String(active))}}
  function stopSound(){if(!audio)return;audio.pause();try{audio.currentTime=0}catch(error){console.warn('[papo] Não consegui reposicionar o áudio da Kombi:',error)}soundState('Ativar som do motor')}
  async function playSound(automatic=false){
    if(finished||!audio){soundState('Som do motor indisponível');return false}
    try{audio.currentTime=0;await audio.play();soundState('Desativar som do motor',true);return true}
    catch(error){console.warn('[papo] A reprodução do motor não foi iniciada:',error);soundState(automatic?'Toque para ouvir o motor':'Áudio indisponível');return false}
  }
  function finish(){if(finished)return;finished=true;clearTimeout(fallback);stopSound();root.classList.add('papo-intro-reveal');screen.classList.add('papo-intro-out');setTimeout(()=>{root.classList.remove('papo-intro-pending','papo-intro-reveal');screen.remove()},420)}
  const fallback=setTimeout(finish,5100);
  van?.addEventListener('animationend',event=>{if(event.target===van&&event.animationName==='papo-drive')finish()});
  skipButton?.addEventListener('click',finish);
  soundButton?.addEventListener('click',()=>{if(!audio)return;if(!audio.paused){stopSound();return}void playSound(false)});
  audio?.addEventListener('ended',()=>soundState('Ativar som do motor'));
  audio?.addEventListener('error',()=>{console.warn('[papo] O arquivo de áudio da abertura não pôde ser carregado.');soundState('Som do motor indisponível')});
  skipButton?.focus({preventScroll:true});
  try{const preferences=JSON.parse(localStorage.getItem('papo.extras.v1')||'{}');if(preferences.introSound!==false)void playSound(true)}
  catch(error){console.warn('[papo] Não consegui ler a preferência de áudio:',error)}
})();