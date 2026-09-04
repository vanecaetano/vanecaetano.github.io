// Som do Pontinhos — música e efeitos REAIS (arquivos em www/audio/), tocados via
// WebAudio para loop perfeito da música e variação de tom nos efeitos.
//
// Créditos (ver AUDIO-CREDITS.md na raiz do repo):
//  - Música: "Fluffing a Duck" — Kevin MacLeod (incompetech.com), CC BY 4.0.
//  - Efeitos: Google Sound Library (actions.google.com/sounds), uso liberado em apps.
//
// O contexto de áudio só nasce no primeiro toque (regra de autoplay); os arquivos
// são locais, então tudo funciona offline.
(function () {
  'use strict';

  const FILES = {
    music: 'audio/music.m4a',   // trilha alegre em loop
    flick: 'audio/flick.m4a',   // risquinho no tabuleiro / tique do relógio / botão
    pop:   'audio/pop.m4a',     // fechou quadradinho
    bell:  'audio/bell.m4a',    // "sua vez!" (online)
    cheer: 'audio/cheer.m4a',   // vitória (torcida)
    wah:   'audio/wah.m4a',     // empate (apito cômico)
    roll:  'audio/roll.m4a',    // dado voando (rufar de tambor)
    boing: 'audio/boing.m4a',   // dado pousando
    bugle: 'audio/bugle.m4a'    // corneta: tirou o 1º lugar no dado
  };
  const MUSIC_VOL = 0.32;       // música bem ao fundo, sem brigar com os efeitos

  let ctx = null, master = null, musicGain = null, musicSrc = null;
  let buffers = {}, loadStarted = false;
  let muted = localStorage.getItem('pt_mute') === '1';

  function ensureCtx() {
    if (!ctx && (window.AudioContext || window.webkitAudioContext)) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = MUSIC_VOL;
        musicGain.connect(master);
      } catch (e) { ctx = null; }
    }
    return !!ctx;
  }

  function loadAll() {
    if (loadStarted || !ctx) return;
    loadStarted = true;
    Object.keys(FILES).forEach(name => {
      fetch(FILES[name])
        .then(r => r.arrayBuffer())
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => { buffers[name] = buf; if (name === 'music') startMusic(); })
        .catch(() => {});
    });
  }

  // efeito: tocar um buffer com volume/velocidade próprios (rate muda o tom — "juice")
  function play(name, vol, rate, when) {
    if (muted || !ctx || ctx.state !== 'running' || !buffers[name]) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name];
    src.playbackRate.value = rate || 1;
    g.gain.value = vol == null ? 1 : vol;
    src.connect(g); g.connect(master);
    src.start(ctx.currentTime + (when || 0));
  }

  // música em loop contínuo (AudioBufferSource com loop = emenda perfeita)
  function startMusic() {
    if (musicSrc || muted || !ctx || ctx.state !== 'running' || !buffers.music) return;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = buffers.music;
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicSrc.start();
  }
  function stopMusic() {
    if (musicSrc) { try { musicSrc.stop(); } catch (e) {} musicSrc = null; }
  }

  // segundo plano: pausa tudo (e a bateria agradece); voltou → retoma
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().then(() => { if (!muted) startMusic(); }).catch(() => {});
  });

  // 1º toque: cria o contexto, carrega os arquivos e liga a música
  document.addEventListener('pointerdown', () => {
    if (!ensureCtx()) return;
    const go = () => { loadAll(); if (!muted) startMusic(); };
    if (ctx.state === 'running') go();
    else ctx.resume().then(go).catch(() => {});
  }, { capture: true });

  // clique sutil em qualquer botão (os alvos do tabuleiro têm som próprio)
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('button')) play('flick', 0.22, 1.55);
  }, true);

  // ---------- mudo ----------
  function updateButtons() {
    document.querySelectorAll('.sound-toggle').forEach(b => {
      b.textContent = muted ? '🔇' : '🔊';
      b.setAttribute('aria-label', I18n.t(muted ? 'a11y.soundOn' : 'a11y.soundOff'));
    });
  }
  function toggle() {
    muted = !muted;
    localStorage.setItem('pt_mute', muted ? '1' : '0');
    if (master) master.gain.value = muted ? 0 : 1;
    if (muted) stopMusic();
    else if (ensureCtx()) ctx.resume().then(() => { loadAll(); startMusic(); }).catch(() => {});
    updateButtons();
  }
  window.addEventListener('load', () => {
    updateButtons();
    document.querySelectorAll('.sound-toggle').forEach(b => b.addEventListener('click', toggle));
  });

  // ---------- API usada por game.js / online.js ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  window.Sound = {
    isMuted: () => muted,
    refresh: updateButtons,   // reescreve o aria-label depois de trocar de idioma
    toggle,
    // risquinho desenhado (remoto/robô um tiquinho mais grave e baixo)
    pop: kind => play('flick', kind === 'local' ? 0.9 : 0.6, kind === 'local' ? rnd(0.95, 1.1) : rnd(0.8, 0.9)),
    // fechou quadradinho(s): pop gostoso, subindo o tom no combo
    box: n => {
      play('pop', 1, 1 + (Math.min(n, 3) - 1) * 0.18);
      if (n > 1) play('pop', 0.8, 1.35, 0.12);
    },
    turn: () => play('bell', 0.8),                                   // sua vez! (online)
    win: draw => draw ? play('wah', 0.9) : play('cheer', 1),         // fim de jogo
    tick: () => play('flick', 0.5, 1.25),                            // relógio: últimos segundos
    roll: () => play('roll', 0.9),                                   // dado voando (rufar)
    thud: () => play('boing', 1),                                    // dado pousou
    tada: first => { if (first) play('bugle', 1, 1, 0.1); else play('bell', 0.8, 1.15, 0.1); }
  };
})();
