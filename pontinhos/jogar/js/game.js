(function () {
  'use strict';

  // A ordem de AVATARS é combinada com a lista ANIMAIS de online.js (mesmos 15 nomes, mesma
  // ordem) e PENS numera as cores das salas: não mexer nestas duas listas sem mexer lá também.
  const AVATARS = ['🐱','🐶','🐰','🦊','🐼','🐨','🦄','🐸','🐯','🐵','🐧','🐢','🐷','🦁','🤖'];
  const ROBOT_AV = AVATARS.indexOf('🤖');
  const PENS = ['#4F9BEB','#F07AA6','#34B58F','#A98BEA','#F59A47','#EF6E6E'];

  // Bichinhos extras da vitrine (ver MONETIZACAO.md §4). Ficam depois dos 15 básicos em
  // AV_ALL, então os índices do básico continuam valendo para o online.
  const AV_EXTRA = ['🐙','🦈','🐬','🐠','🦀','🐮','🐔','🐴','🐑','🦆'];
  const AV_ALL = AVATARS.concat(AV_EXTRA);

  // Só 4 bichinhos vêm liberados; os outros são ❓ e custam um vídeo premiado cada
  // (o 🤖 é do robô e nunca fica travado). Desbloqueio permanente, cosmético e só nos
  // modos sozinho/com amigo — o online segue usando apenas os 15 básicos.
  const AV_FREE = [0, 1, 2, 3];   // 🐱 🐶 🐰 🦊

  // Agrupamento visual da vitrine: os índices são de AV_ALL e nunca mudam de significado.
  // O nome visível sai de I18n ('cat.<key>'); a `key` é a identidade e nunca muda.
  const AV_CATS = [
    { key: 'casa',     idx: [0, 1, 2, 3] },
    { key: 'floresta', idx: [4, 5, 7, 11, 10] },
    { key: 'selva',    idx: [8, 13, 9] },
    { key: 'sitio',    idx: [12, 20, 21, 22, 23, 24] },
    { key: 'mar',      idx: [15, 16, 17, 18, 19] },
    { key: 'especial', idx: [6, 14] }
  ];
  const catName = c => I18n.t('cat.' + c.key);

  // Canetas de bônus (um vídeo premiado cada). As com `fx` são as VIP: desenham com um
  // gradiente animado — o brilho corre pelo risquinho — em vez de cor chapada. O `hex` de
  // uma caneta fx é só a cor de apoio (var --penN: cards, placar, textos); quem pinta o
  // tabuleiro é `url(#gl-<fx>)`. Ver a seção "Canetas com glitter" no CLAUDE.md.
  // ⚠️ A chave `key` vira `pen:<key>` no localStorage — nunca renomear, senão a criança
  // perde o que já desbloqueou. Reordenar a lista é seguro (nada guarda índice de caneta).
  const PEN_BONUS = [
    { key: 'ouro',    hex: '#E8B33D', fx: 'ouro' },
    { key: 'arco',    hex: '#F0679F', fx: 'arco' },
    { key: 'galaxia', hex: '#7B5BE8', fx: 'galaxia' },
    { key: 'rosa',    hex: '#FF4FA3', fx: 'rosa' },
    { key: 'prata',   hex: '#A8B4C4', fx: 'prata' },
    { key: 'limao',   hex: '#8BC93A' }
  ];
  // Nome visível da caneta bônus. A `key` continua sendo a identidade em pt_unlocks.
  const penName = b => I18n.t('pen.' + b.key);
  const PEN_ALL = PENS.concat(PEN_BONUS.map(p => p.hex));
  // fx da caneta de índice i em PEN_ALL (null = cor chapada, como as 6 grátis)
  const penFx = i => (i >= PENS.length && PEN_BONUS[i - PENS.length].fx) || null;
  // tinta que o SVG usa: gradiente animado nas VIP, hex nas comuns
  const penPaint = i => { const f = penFx(i); return f ? 'url(#gl-' + f + ')' : PEN_ALL[i]; };

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const appEl = document.querySelector('.app');
  const show = id => {
    document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
    if (window.Ads) Ads.setScreen(id);   // banner só nas telas fora do jogo
  };

  let toastT = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ---- desbloqueáveis (localStorage) ----
  function unlocks() { try { return JSON.parse(localStorage.getItem('pt_unlocks') || '{}'); } catch (e) { return {}; } }
  const isUnlocked = key => unlocks()[key] === true;
  function unlock(key) {
    const u = unlocks(); u[key] = true;
    try { localStorage.setItem('pt_unlocks', JSON.stringify(u)); } catch (e) {}
  }
  // Antes o desbloqueio era por pacote de 5 bichinhos; agora é um a um. Quem já tinha ganho
  // um pacote recebe os 5 bichinhos dele — senão perderia o que já era seu.
  (function migrateUnlocks() {
    const OLD = { 'av:mar': [15, 16, 17, 18, 19], 'av:sitio': [20, 21, 22, 23, 24] };
    const u = unlocks(); let changed = false;
    Object.keys(OLD).forEach(k => {
      if (u[k] === true) OLD[k].forEach(i => { if (!u['av#' + i]) { u['av#' + i] = true; changed = true; } });
    });
    if (changed) try { localStorage.setItem('pt_unlocks', JSON.stringify(u)); } catch (e) {}
  })();

  // sem anúncios (navegador/PWA) não existe como destravar → nada fica travado
  const bonusVisible = () => !!(window.Ads && Ads.available());
  const isFreeAv = i => i === ROBOT_AV || AV_FREE.indexOf(i) >= 0;
  const avLocked = i => bonusVisible() && !isFreeAv(i) && !isUnlocked('av#' + i);
  const penLocked = i => i >= PENS.length && !isUnlocked('pen:' + PEN_BONUS[i - PENS.length].key);
  const nextLockedAv = () => {
    for (const c of AV_CATS) for (const i of c.idx) if (avLocked(i)) return i;
    return -1;
  };

  // ---- config state ----
  let mode = 'solo';         // 'solo' | 'friend' | 'online'
  let diff = 'facil';
  let size = 5;
  let includeRobot = false;  // friend mode: add robot as 3rd player
  let av1 = 0, av2 = 2, av3 = ROBOT_AV;
  let penIdx = { 1: 0, 2: 1, 3: 2 };   // pen color index per player slot

  const activeSlots = () => (mode === 'friend' && includeRobot) ? [1, 2, 3] : [1, 2];

  function applyColors() {
    appEl.style.setProperty('--pen1', PEN_ALL[penIdx[1]]);
    appEl.style.setProperty('--pen2', PEN_ALL[penIdx[2]]);
    appEl.style.setProperty('--pen3', PEN_ALL[penIdx[3]]);
  }
  function penRow(container, mine, others, setFn) {
    container.innerHTML = '';
    PEN_ALL.forEach((hex, i) => {
      const locked = penLocked(i);
      if (locked && !bonusVisible()) return;
      const bonus = i >= PENS.length ? PEN_BONUS[i - PENS.length] : null;
      const b = document.createElement('button');
      const fx = penFx(i);
      b.className = 'pen-dot' + (i === mine ? ' on' : '') + (locked ? ' locked' : '') + (fx ? ' fx-' + fx : '');
      // nas VIP quem pinta é a classe (gradiente animado); inline background venceria dela
      if (!fx) b.style.background = hex;
      b.setAttribute('aria-label', locked ? I18n.t('a11y.penLocked', { name: penName(bonus) })
        : bonus ? penName(bonus) : I18n.t('a11y.color', { n: i + 1 }));
      const choose = () => { setFn(i); applyColors(); renderPens(); };
      if (locked) { b.textContent = '🔒'; b.onclick = () => offerPen(bonus, choose); }
      else {
        if (others.includes(i)) b.disabled = true;   // cor já usada por outro jogador
        b.onclick = choose;
      }
      container.appendChild(b);
    });
  }
  function offerPen(bonus, after) {
    // A promessa tem que bater com o que aparece no tabuleiro: prometer "dourada" e
    // entregar um risquinho amarelo comum frustra. As fx dizem que brilham, e brilham.
    const nome = penName(bonus);
    Ads.offerReward({
      title: I18n.t('ad.penTitle', { name: nome }) + (bonus.fx ? ' ✨' : ' 🖍️'),
      text: I18n.t(bonus.fx ? 'ad.penTextFx' : 'ad.penText', { name: nome })
    }, () => {
      unlock('pen:' + bonus.key);
      toast(I18n.t('toast.penUnlocked', { name: nome, emo: bonus.fx ? '✨' : '🎉' }));
      after();
    });
  }
  function renderPens() {
    const slots = activeSlots();
    slots.forEach(s => {
      const others = slots.filter(x => x !== s).map(x => penIdx[x]);
      penRow($('pen' + s + 'row'), penIdx[s], others, v => penIdx[s] = v);
    });
    // ⚠️ Rotulagem obrigatória (programa Famílias): a legenda só faz sentido — e só pode
    // aparecer — quando existe caneta travada, que é quando o 🔒 abre um anúncio.
    const temLock = bonusVisible() && PEN_ALL.some((h, i) => penLocked(i));
    $('penLegend').style.display = temLock ? '' : 'none';
  }

  // O canto do ❓ na vitrine mostra a 1ª letra do selo traduzido (Anúncio/Ad/Iklan/…).
  // Fica numa variável CSS porque `content` não lê texto do DOM; refeita a cada troca de idioma.
  function refreshAdInitial() {
    appEl.style.setProperty('--ad-initial', JSON.stringify(I18n.t('ad.badge').slice(0, 1)));
  }

  // ---- navigation ----
  $('btnSolo').onclick = () => openSetup('solo');
  $('btnFriend').onclick = () => openSetup('friend');
  $('backBtn').onclick = () => show('scr-menu');
  // Roda a ação do botão na hora e deixa o anúncio (se couber nos limites) subir por cima —
  // assim o jogo nunca fica preso esperando um anúncio que não veio. Ver MONETIZACAO.md §3.1.
  const afterGameAd = act => { if (window.Ads) Ads.afterGame(act); else act(); };

  const toMenu = () => { clearTimeout(winTimer); $('win').classList.remove('show'); if (mode === 'online' && net) { net.onExit(); return; } show('scr-menu'); };
  // Desistir no meio da partida nunca dá anúncio; sair pelo fim de jogo pode dar (com limites).
  $('menuBtn').onclick = toMenu;
  $('winMenu').onclick = () => afterGameAd(toMenu);

  function updateDiffVisibility() {
    const showDiff = mode === 'solo' || (mode === 'friend' && includeRobot);
    $('diffBox').style.display = showDiff ? '' : 'none';
  }

  function openSetup(m) {
    mode = m;
    includeRobot = false;
    $('setupTitle').textContent = I18n.t(m === 'solo' ? 'setup.titleSolo' : 'setup.titleFriend');
    $('roboToggleWrap').style.display = m === 'friend' ? '' : 'none';
    $('roboChk').checked = false;
    $('slot3').style.display = 'none';
    if (m === 'solo') { $('nm1').value = I18n.t('setup.you'); $('nm2').value = I18n.t('setup.robot'); $('nm2').disabled = true; $('tip2').textContent = I18n.t('setup.tipRobot'); av2 = ROBOT_AV; }
    else { $('nm1').value = I18n.t('setup.player', { n: 1 }); $('nm2').value = I18n.t('setup.player', { n: 2 }); $('nm2').disabled = false; $('tip2').textContent = I18n.t('setup.tipPen2'); av2 = 2; }
    av1 = 0; av3 = ROBOT_AV;
    $('nm3').value = I18n.t('setup.robot');
    penIdx = { 1: 0, 2: 1, 3: 2 };
    $('ava1').textContent = AV_ALL[av1]; $('ava2').textContent = AV_ALL[av2]; $('ava3').textContent = AV_ALL[av3];
    updateDiffVisibility();
    applyColors(); renderPens();
    show('scr-setup');
  }

  $('roboChk').onchange = () => {
    includeRobot = $('roboChk').checked;
    $('slot3').style.display = includeRobot ? '' : 'none';
    updateDiffVisibility();
    renderPens();
  };
  $('ava1').onclick = () => openAvaPicker(1);
  $('ava2').onclick = () => openAvaPicker(2);
  $('ava3').onclick = () => openAvaPicker(3);
  $('avaCancel').onclick = () => $('avaModal').classList.remove('show');

  // ---- seletor de idioma (só no menu: fora de partida nada precisa ser remontado à força) ----
  // A lista mostra cada idioma escrito NELE MESMO — quem abriu o app numa língua que não
  // entende tem de conseguir achar a sua. Sem bandeiras: idioma não é país.
  function renderLangList() {
    const box = $('langList');
    box.innerHTML = '';
    I18n.LANGS.forEach(l => {
      const b = document.createElement('button');
      b.className = 'lang-opt' + (l === I18n.lang ? ' on' : '');
      b.innerHTML = '<span></span><span class="check">✓</span>';
      b.firstChild.textContent = I18n.name(l);
      b.onclick = () => { I18n.setLang(l); renderLangList(); $('langModal').classList.remove('show'); };
      box.appendChild(b);
    });
  }
  $('langBtn').onclick = () => { renderLangList(); $('langModal').classList.add('show'); };
  $('langCancel').onclick = () => $('langModal').classList.remove('show');

  // I18n.apply() já refez o HTML estático; aqui vem o que é montado por JS.
  document.addEventListener('langchange', () => {
    document.title = I18n.t('app.name');
    refreshAdInitial();                  // inicial do selo de anúncio no canto do ❓
    if (window.Sound) Sound.refresh();   // aria-label do botão de som
    // O HUD e o banner de turno são montados por JS, então I18n.apply() não os alcança.
    // Os NOMES dos jogadores ficam como estão — podem ter sido digitados pela criança;
    // o que muda é o texto ao redor ("Vez de", "pensando…").
    if (players) {
      buildHud();
      render();        // repinta o tabuleiro e, por dentro, o placar
      updateTurn();    // "Vez de {nome}" no idioma novo
      $('winAgain').textContent = I18n.t(mode === 'online' ? 'win.backRoom' : 'win.again');
      $('winMenu').textContent = I18n.t(mode === 'online' ? 'win.leaveRoom' : 'win.menu');
      // o card de anúncio da vitória também é montado por JS — sem isto o selo e o texto
      // ficariam no idioma anterior, e um selo não traduzido não rotula nada
      if ($('adOffer').style.display !== 'none') renderAdOffer();
    }
  });

  const avOf = s => s === 1 ? av1 : s === 2 ? av2 : av3;
  function setAv(s, i) {
    if (s === 1) av1 = i; else if (s === 2) av2 = i; else av3 = i;
    $('ava' + s).textContent = AV_ALL[i];
  }

  // Vitrine de bichinhos, separada por categoria: os 4 de "Seus amigos" (e o 🤖 do robô) são
  // grátis; os outros aparecem como ❓ e cada um custa um vídeo premiado, sempre opcional —
  // ver MONETIZACAO.md §4. Fora do app nativo não há como destravar, então tudo fica livre.
  function openAvaPicker(slot) {
    const pad = $('avaPad'); pad.innerHTML = '';
    refreshAdInitial();
    $('avaLegend').style.display = (bonusVisible() && nextLockedAv() >= 0) ? '' : 'none';
    const cur = avOf(slot);
    const padBtn = i => {
      const locked = avLocked(i);
      const b = document.createElement('button');
      b.className = 'pad-btn' + (i === cur ? ' on' : '') + (locked ? ' locked' : '');
      b.textContent = locked ? '❓' : AV_ALL[i];
      b.setAttribute('aria-label', I18n.t(locked ? 'a11y.avaLocked' : 'a11y.choose'));
      // ao ganhar, o ❓ vira o bichinho já escolhido e o modal fica aberto para ver a surpresa
      b.onclick = locked
        ? () => offerAv(i, () => { setAv(slot, i); openAvaPicker(slot); })
        : () => { setAv(slot, i); $('avaModal').classList.remove('show'); };
      return b;
    };
    AV_CATS.forEach(c => {
      const livres = c.idx.filter(i => !avLocked(i)).length;
      const head = document.createElement('div');
      head.className = 'pad-head';
      head.textContent = catName(c);
      const tag = document.createElement('span');
      tag.className = 'pad-count';
      tag.textContent = livres === c.idx.length ? '✨' : livres + '/' + c.idx.length;
      head.appendChild(tag);
      pad.appendChild(head);
      c.idx.forEach(i => pad.appendChild(padBtn(i)));
    });
    $('avaModal').classList.add('show');
  }

  function offerAv(i, after) {
    const cat = AV_CATS.find(c => c.idx.indexOf(i) >= 0);
    Ads.offerReward({
      title: I18n.t('ad.avaTitle'),
      text: I18n.t('ad.avaText', { cat: catName(cat) })
    }, () => { unlock('av#' + i); toast(I18n.t('toast.avaWon', { av: AV_ALL[i] })); after(); });
  }
  document.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { diff = b.dataset.diff; sel('[data-diff]', b); });
  document.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { size = +b.dataset.size; sel('[data-size]', b); });
  function sel(q, el) { document.querySelectorAll(q).forEach(x => x.classList.toggle('on', x === el)); }

  $('startBtn').onclick = startGame;
  $('restartBtn').onclick = () => newBoard();
  $('winAgain').onclick = () => {
    const act = () => { $('win').classList.remove('show'); if (mode === 'online' && net) { net.onAgain(); return; } newBoard(); };
    if (mode === 'online') { act(); return; }   // online: nada de anúncio entre revanches
    afterGameAd(act);
  };

  // ---- game ----
  let R, C, H, V, box, turn, over, busy, players, last, nPlayers;
  let net = null;   // camada de rede (modo online): { sendMove, onAgain, onExit, onEnd }
  let winTimer = null;                 // handle do setTimeout que revela o overlay de fim de jogo
  const WIN_REVEAL_DELAY = 2000;       // tempo pra ver a última jogada antes do overlay
  const M = 18, AREA = 288;
  let S;
  const X = i => M + i * S, Y = i => M + i * S;
  const svg = $('board');

  function startGame() {
    R = C = size;
    applyColors();
    nPlayers = (mode === 'friend' && includeRobot) ? 3 : 2;
    players = {
      1: { name: $('nm1').value || I18n.t('setup.player', { n: 1 }), av: AV_ALL[av1], pen: PEN_ALL[penIdx[1]], paint: penPaint(penIdx[1]), fx: penFx(penIdx[1]), kind: 'local' },
      2: { name: $('nm2').value || I18n.t(mode === 'solo' ? 'setup.robot' : 'setup.player', { n: 2 }), av: AV_ALL[av2], pen: PEN_ALL[penIdx[2]], paint: penPaint(penIdx[2]), fx: penFx(penIdx[2]), kind: mode === 'friend' ? 'local' : 'cpu' }
    };
    if (nPlayers === 3) players[3] = { name: $('nm3').value || I18n.t('setup.robot'), av: AV_ALL[av3], pen: PEN_ALL[penIdx[3]], paint: penPaint(penIdx[3]), fx: penFx(penIdx[3]), kind: 'cpu' };

    buildHud();
    $('winAgain').textContent = I18n.t('win.again');
    $('winMenu').textContent = I18n.t('win.menu');

    // No modo com amigo não há "reiniciar" — cada partida vai até o fim.
    $('restartBtn').style.display = mode === 'friend' ? 'none' : '';
    // Tabuleiro grande ocupa o máximo (margens reduzidas).
    $('boardWrap').classList.toggle('big', size === 6);

    show('scr-game');
    newBoard();
    requestAnimationFrame(fitBoard);
  }

  // monta os cards e a barra de progresso conforme nPlayers (2 a 4) e aplica as canetas
  function buildHud() {
    const top = $('gTop'), prog = $('progress');
    top.innerHTML = ''; prog.innerHTML = '';
    for (let i = 1; i <= nPlayers; i++) {
      appEl.style.setProperty('--pen' + i, players[i].pen);
      const card = document.createElement('div');
      card.className = 'pcard p' + i + (players[i].fx ? ' fx-' + players[i].fx : ''); card.id = 'card' + i;
      if (nPlayers % 2 !== 0 && i === nPlayers) card.classList.add('span2');   // último card sozinho na linha: ocupa a largura toda
      card.innerHTML = `<div class="av" id="av${i}"></div><div class="pcard-info"><div class="nm" id="cn${i}"></div><div class="sc"><span id="s${i}">0</span></div></div>`;
      card.querySelector('#av' + i).textContent = players[i].av;
      card.querySelector('#cn' + i).textContent = players[i].name;
      top.appendChild(card);
      const seg = document.createElement('div');
      seg.className = 's' + i + (players[i].fx ? ' fx-' + players[i].fx : ''); seg.id = 'seg' + i; seg.style.width = '0%';
      prog.appendChild(seg);
    }
    // As paradas do gradiente só animam se alguém estiver mesmo com caneta VIP: animar
    // stop-color custa recálculo de estilo todo quadro, e a maioria das partidas não usa.
    document.body.classList.toggle('fx-on', Object.keys(players).some(k => players[k].fx));
  }

  function newBoard() {
    S = (AREA - 2 * M) / C;
    H = Array.from({ length: R + 1 }, () => new Array(C).fill(0));
    V = Array.from({ length: R }, () => new Array(C + 1).fill(0));
    box = Array.from({ length: R }, () => new Array(C).fill(0));
    turn = 1; over = false; busy = false; last = null;
    clearTimeout(winTimer); winTimer = null;
    $('win').classList.remove('show');
    render(); updateTurn();
  }

  const boxSides = (r, c) => (H[r][c] ? 1 : 0) + (H[r + 1][c] ? 1 : 0) + (V[r][c] ? 1 : 0) + (V[r][c + 1] ? 1 : 0);
  function adj(t, r, c) { const o = []; if (t === 'H') { if (r > 0) o.push([r - 1, c]); if (r < R) o.push([r, c]); } else { if (c > 0) o.push([r, c - 1]); if (c < C) o.push([r, c]); } return o; }
  const setE = (t, r, c, w) => { if (t === 'H') H[r][c] = w; else V[r][c] = w; };

  function drawEdge(t, r, c, who) {
    // aresta já ocupada → jogada inválida (essencial para input vindo da rede)
    if (t === 'H' ? H[r][c] : V[r][c]) return -1;
    setE(t, r, c, who); last = [t, r, c]; let done = 0;
    for (const [br, bc] of adj(t, r, c)) if (box[br][bc] === 0 && boxSides(br, bc) === 4) { box[br][bc] = who; done++; }
    return done;
  }
  function counts() {
    const a = new Array(nPlayers + 1).fill(0);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const o = box[r][c]; if (o) a[o]++; }
    return a;
  }
  const totalClaimed = a => { let s = 0; for (let i = 1; i <= nPlayers; i++) s += a[i]; return s; };
  function allEdges() { const e = []; for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) if (!H[r][c]) e.push(['H', r, c]); for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) if (!V[r][c]) e.push(['V', r, c]); return e; }
  const getVar = n => getComputedStyle(root).getPropertyValue(n).trim();

  // dimensiona o tabuleiro para o maior quadrado que cabe no espaço disponível
  function fitBoard() {
    const wrap = $('boardWrap');
    if (!wrap) return;
    const cs = getComputedStyle(wrap);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = wrap.clientWidth - padX;
    const availH = wrap.clientHeight - padY;
    const side = Math.max(60, Math.min(availW, availH));
    svg.style.width = side + 'px';
    svg.style.height = side + 'px';
  }
  window.addEventListener('resize', fitBoard);

  function render() {
    const P = {};
    // `paint` é o gradiente animado das canetas VIP; o online monta players sem ele e cai
    // no hex (lá só existem as 6 cores básicas).
    for (let i = 1; i <= nPlayers; i++) P[i] = players[i].paint || players[i].pen;
    const fs = (S * 0.5).toFixed(1);
    let s = '';
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (box[r][c]) {
      const who = box[r][c];
      s += `<rect x="${X(c)}" y="${Y(r)}" width="${S}" height="${S}" fill="${P[who]}" opacity="0.14" rx="4"/>`;
      s += `<text x="${X(c) + S / 2}" y="${Y(r) + S / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}">${players[who].av}</text>`;
    }
    const isLast = (t, r, c) => last && last[0] === t && last[1] === r && last[2] === c;
    for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) if (H[r][c]) {
      const coord = `x1="${X(c)}" y1="${Y(r)}" x2="${X(c + 1)}" y2="${Y(r)}"`;
      if (isLast('H', r, c)) s += `<line class="edge-halo" ${coord} stroke="${P[H[r][c]]}"/>`;
      s += `<line class="edge-drawn" ${coord} stroke="${P[H[r][c]]}" stroke-width="5.5"/>`;
    }
    for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) if (V[r][c]) {
      const coord = `x1="${X(c)}" y1="${Y(r)}" x2="${X(c)}" y2="${Y(r + 1)}"`;
      if (isLast('V', r, c)) s += `<line class="edge-halo" ${coord} stroke="${P[V[r][c]]}"/>`;
      s += `<line class="edge-drawn" ${coord} stroke="${P[V[r][c]]}" stroke-width="5.5"/>`;
    }
    const canPlay = !over && !busy && players[turn].kind === 'local';
    for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) if (!H[r][c]) { if (canPlay) s += `<line class="hit" data-t="H" data-r="${r}" data-c="${c}" x1="${X(c)}" y1="${Y(r)}" x2="${X(c + 1)}" y2="${Y(r)}" stroke="transparent" stroke-width="20"/>`; s += `<line class="edge-faint" x1="${X(c)}" y1="${Y(r)}" x2="${X(c + 1)}" y2="${Y(r)}"/>`; }
    for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) if (!V[r][c]) { if (canPlay) s += `<line class="hit" data-t="V" data-r="${r}" data-c="${c}" x1="${X(c)}" y1="${Y(r)}" x2="${X(c)}" y2="${Y(r + 1)}" stroke="transparent" stroke-width="20"/>`; s += `<line class="edge-faint" x1="${X(c)}" y1="${Y(r)}" x2="${X(c)}" y2="${Y(r + 1)}"/>`; }
    for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) s += `<circle cx="${X(c)}" cy="${Y(r)}" r="3.4" fill="${getVar('--dot')}"/>`;
    svg.innerHTML = s;

    const cnt = counts(), tot = R * C;
    for (let i = 1; i <= nPlayers; i++) {
      $('s' + i).textContent = cnt[i];
      $('seg' + i).style.width = (cnt[i] / tot * 100) + '%';
    }
    fitBoard();
  }

  function updateTurn() {
    for (let i = 1; i <= nPlayers; i++) { const c = $('card' + i); if (c) c.classList.toggle('turn', turn === i && !over); }
    const who = players[turn], cls = 'who' + turn;
    // o nome vai embrulhado no span da cor, então a chave é interpolada com HTML pronto
    const nomeHtml = `<span class="${cls}">${who.name}</span>`;
    const chave = who.kind === 'local' ? 'turn.local' : who.kind === 'cpu' ? 'turn.cpu' : 'turn.remote';
    $('turnBanner').innerHTML = who.av + ' ' + I18n.t(chave, { p: nomeHtml });
    if (net && net.onTurn) net.onTurn(turn);
    if (net && !over && players[turn].kind === 'local') Sound.turn();   // "sua vez!" só no online
  }

  function endIfDone() {
    const cnt = counts();
    if (totalClaimed(cnt) < R * C) return false;
    over = true; render();   // trava o board e mostra a última jogada (brilho) na hora
    // jogadores que saíram no meio (online) não disputam a vitória
    let max = -1; for (let i = 1; i <= nPlayers; i++) if (!players[i].dropped) max = Math.max(max, cnt[i]);
    const winners = []; for (let i = 1; i <= nPlayers; i++) if (!players[i].dropped && cnt[i] === max) winners.push(i);
    if (net && net.onEnd) net.onEnd(winners);   // sincroniza a rede já, sem esperar a revelação
    let title, cup;
    if (winners.length > 1) { title = I18n.t('win.tie'); cup = '🤝'; }
    else { const w = winners[0]; title = players[w].av + ' ' + I18n.t('win.other', { p: players[w].name }); cup = '🏆'; }
    const parts = []; for (let i = 1; i <= nPlayers; i++) parts.push(cnt[i]);
    const scoreText = I18n.t('win.score', { s: parts.join(' × ') });
    clearTimeout(winTimer);
    winTimer = setTimeout(() => showWinOverlay(cup, title, scoreText, winners), WIN_REVEAL_DELAY);
    return true;
  }

  // Mostra o overlay de vitória (placar, confete, som) — chamado com atraso para dar tempo
  // do jogador ver a última jogada em destaque no tabuleiro antes do overlay cobrir a tela.
  function showWinOverlay(cup, title, scoreText, winners) {
    winTimer = null;
    $('winCup').textContent = cup; $('winTitle').textContent = title;
    $('winScore').textContent = scoreText;
    if (window.Ads) Ads.noteGameEnd();   // só partida terminada conta para o intersticial
    renderAdOffer();
    $('win').classList.add('show'); confetti();
    Sound.win(winners.length > 1);
  }

  // Card opcional de vídeo premiado no fim da partida — só no app e só enquanto
  // ainda houver algum prêmio para ganhar.
  function renderAdOffer() {
    const el = $('adOffer');
    const av = bonusVisible() ? nextLockedAv() : -1;
    const pen = bonusVisible() ? PEN_BONUS.find(p => !isUnlocked('pen:' + p.key)) : null;
    if (av < 0 && !pen) { el.style.display = 'none'; return; }
    el.style.display = '';
    // ⚠️ O selo vem ANTES de qualquer emoji ou promessa: é o que impede o card de ser lido
    // como recompensa do jogo (foi essa leitura que reprovou o versionCode 7).
    const selo = '<span class="ad-tag">' + I18n.t('ad.badge') + '</span>';
    if (av >= 0) {
      el.innerHTML = selo + '<span class="em">❓</span>' + I18n.t('ad.offerAva');
      el.onclick = () => offerAv(av, renderAdOffer);
    } else {
      // nas VIP o card mostra a própria caneta brilhando, para o prêmio não ser abstrato
      const oferta = I18n.t('ad.offerPen', { name: penName(pen) });
      el.innerHTML = selo + (pen.fx
        ? '<span class="em pen-em fx-' + pen.fx + '"></span>' + oferta + ' ✨'
        : '<span class="em">🖍️</span>' + oferta);
      el.onclick = () => offerPen(pen, renderAdOffer);
    }
  }

  const nextTurn = () => {
    let t = turn;
    for (let i = 0; i < nPlayers; i++) { t = t % nPlayers + 1; if (!players[t].dropped) return t; }
    return turn;
  };
  function maybeCpu() {
    if (!over && players[turn].kind === 'cpu') { busy = true; render(); setTimeout(cpuStep, 560); }
  }

  // Toque tolerante: em vez de confiar no alvo exato do evento (o tracinho e os pontinhos
  // ficam por cima dos .hit e engoliam o toque), converte o ponto para as coordenadas do
  // viewBox e escolhe a aresta LIVRE mais próxima. Fração do passo S que ainda conta como
  // toque na aresta — dedo de criança erra; subir aperta menos, baixar aperta mais.
  const SNAP = 0.45;
  function edgeAt(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    const k = AREA / rect.width;                  // fitBoard() mantém o SVG sempre quadrado
    const px = (clientX - rect.left) * k, py = (clientY - rect.top) * k;
    let best = null, bestD = S * SNAP;
    for (const [t, r, c] of allEdges()) {
      const x1 = X(c), y1 = Y(r);
      const x2 = t === 'H' ? X(c + 1) : x1, y2 = t === 'H' ? y1 : Y(r + 1);
      // distância do ponto ao segmento — sempre horizontal ou vertical, então dá para
      // medir eixo a eixo (0 quando o ponto já está dentro da faixa do segmento)
      const d = Math.hypot(Math.max(x1 - px, 0, px - x2), Math.max(y1 - py, 0, py - y2));
      if (d < bestD) { bestD = d; best = [t, r, c]; }
    }
    return best;
  }

  // pointerdown, não click: marca no instante do toque e não se perde com um arrastinho
  // do dedo (a tela de jogo não rola — #scr-game é overflow:hidden — então é seguro)
  svg.addEventListener('pointerdown', e => {
    if (e.button > 0 || !players || over || busy || players[turn].kind !== 'local') return;
    const mv = edgeAt(e.clientX, e.clientY); if (!mv) return;
    const [t, r, c] = mv;
    if (net) { net.sendMove(t, r, c); return; }   // online: aplica só quando a jogada volta pelo listener
    const done = drawEdge(t, r, c, turn);
    if (done < 0) return;
    afterMove(done);
  });

  function afterMove(done) {
    if (done > 0) Sound.box(done); else Sound.pop(players[turn].kind);
    if (endIfDone()) return;              // se acabou, endIfDone já renderiza
    if (done === 0) turn = nextTurn();    // avança ANTES de renderizar: os alvos de toque dependem de quem é a vez
    render();
    updateTurn();
    maybeCpu();
  }

  // ======================= o robô =======================
  //
  // O "fácil" segue ingênuo de propósito. O "difícil" joga a teoria de verdade do jogo,
  // que gira toda em torno de CONTROLE:
  //
  //  - no fim das contas o tabuleiro vira um punhado de CADEIAS (fileiras de quadradinhos
  //    que se abrem em série) e LAÇOS (cadeias fechadas em círculo);
  //  - quem é obrigado a abrir uma cadeia entrega ela inteira para o adversário;
  //  - por isso quem está comendo uma cadeia costuma parar 2 quadradinhos antes do fim e
  //    ENTREGAR esses 2 de propósito (o "double-cross"): perde 2 agora e obriga o outro a
  //    abrir a próxima cadeia, que quase sempre vale bem mais. É exatamente a jogada que
  //    faltava aqui — o robô antigo comia tudo sempre e depois se sacrificava a esmo.
  //
  // Duas camadas:
  //  1. no fim da partida (poucas arestas livres) roda uma BUSCA EXATA e joga perfeito;
  //  2. antes disso, o modelo de controle sobre a decomposição em cadeias/laços.
  //
  // Nada disso vale para 3+ jogadores: aí não existe "controle" (a teoria é de 2), então
  // o robô cai numa versão simples — gulosa, mas que ainda abre sempre a menor cadeia.

  const idOf = (r, c) => r * C + c;
  const twoPlayerGame = () => nPlayers === 2 && !players[1].dropped && !players[2].dropped;

  // separa as arestas livres em: fecha quadradinho / segura / entrega o 3º lado
  function classify(edges) {
    const caps = [], safe = [], bad = [];
    for (const e of edges) {
      const [t, r, c] = e;
      setE(t, r, c, turn); let comp = false, three = false;
      for (const [br, bc] of adj(t, r, c)) { const sd = boxSides(br, bc); if (sd === 4) comp = true; else if (sd === 3) three = true; }
      setE(t, r, c, 0);
      if (comp) caps.push(e); else if (three) bad.push(e); else safe.push(e);
    }
    return { caps, safe, bad };
  }

  // arestas livres de um quadradinho: [t, r, c, quadradinho vizinho ou -1 se for a borda]
  function boxEdges(r, c) {
    const o = [];
    if (!H[r][c])     o.push(['H', r, c, r > 0     ? idOf(r - 1, c) : -1]);
    if (!H[r + 1][c]) o.push(['H', r + 1, c, r < R - 1 ? idOf(r + 1, c) : -1]);
    if (!V[r][c])     o.push(['V', r, c, c > 0     ? idOf(r, c - 1) : -1]);
    if (!V[r][c + 1]) o.push(['V', r, c + 1, c < C - 1 ? idOf(r, c + 1) : -1]);
    return o;
  }

  // Decompõe o que sobrou em componentes ligadas: cada quadradinho aberto é um nó e dois
  // nós são vizinhos quando a aresta entre eles ainda está livre. `loop` = não encosta na
  // borda (cadeia fechada); `open` = já tem quadradinho a um risquinho de fechar.
  function components() {
    const seen = new Uint8Array(R * C), comps = [];
    for (let r0 = 0; r0 < R; r0++) for (let c0 = 0; c0 < C; c0++) {
      if (seen[idOf(r0, c0)] || boxSides(r0, c0) === 4) continue;
      seen[idOf(r0, c0)] = 1;
      const stack = [[r0, c0]], boxes = [];
      let n = 0, ground = 0, minDeg = 9;
      while (stack.length) {
        const [r, c] = stack.pop(); n++; boxes.push([r, c]);
        const es = boxEdges(r, c);
        if (es.length < minDeg) minDeg = es.length;
        for (const e of es) {
          const nb = e[3];
          if (nb < 0) { ground++; continue; }
          if (!seen[nb]) { seen[nb] = 1; stack.push([(nb / C) | 0, nb % C]); }
        }
      }
      comps.push({ n, boxes, loop: ground === 0, open: minDeg <= 1 });
    }
    return comps;
  }

  // menor primeiro: é sempre essa que se abre quando não há mais jogada segura
  const cmpComp = (a, b) => (a.n - b.n) || ((a.loop ? 1 : 0) - (b.loop ? 1 : 0));

  // Diferença de quadradinhos para quem é OBRIGADO a abrir agora, dadas as componentes
  // fechadas que restam (menor primeiro). Quem abre entrega a cadeia; quem come escolhe
  // entre levar tudo (e ter de abrir a próxima) ou devolver `cost` e manter o controle.
  function openValue(comps, i) {
    i = i || 0;
    if (i >= comps.length) return 0;
    const k = comps[i], cost = k.loop ? 4 : 2, rest = openValue(comps, i + 1);
    // quem come escolhe o que for pior para quem abriu: levar tudo (e passar a ter de
    // abrir a próxima) ou devolver `cost` e deixar a obrigação de abrir com o outro
    return Math.min(-(k.n + rest), 2 * cost - k.n + rest);
  }

  const eKey = e => e[0] + e[1] + ',' + e[2];
  function freeEdgesOf(boxes) {
    const seen = {}, out = [];
    for (const [r, c] of boxes) for (const e of boxEdges(r, c)) {
      const k = eKey(e); if (!seen[k]) { seen[k] = 1; out.push([e[0], e[1], e[2]]); }
    }
    return out;
  }

  // ---------- camada 1: busca exata no fim da partida ----------
  // Negamax com poda alfa-beta e tabela de transposição. A chave da tabela é a máscara de
  // bits das arestas ainda livres — como só roda com poucas arestas, ela cabe num inteiro
  // e não há colisão: todas as ordens de jogada que levam à mesma posição se fundem numa
  // entrada só, que é o que torna a busca viável. Fechar quadradinho não passa a vez.
  // O limite é de TEMPO, não de nós: assim o aparelho rápido busca fundo e o fraco
  // simplesmente desiste mais cedo e cai na heurística, sem nunca travar a tela.
  // A chave da tabela é a máscara das arestas livres partida em duas metades de 26 bits e
  // recombinada num único número (hi * 2^26 + lo). 52 bits cabem exatos num double, então
  // continua sendo chave sem colisão e com UMA busca no Map — e deixou de estar presa aos
  // 31 bits de um inteiro com sinal, que era o teto antigo de 30 arestas.
  // ⚠️ O teto REAL não é mais a chave, é o custo: medido neste motor, resolver 27 arestas
  // leva ~165 ms e 28 leva ~5,6 s — cerca de 30× POR ARESTA. Por isso não adianta dar mais
  // tempo ao robô: 6× mais orçamento compra ~1 aresta. Um nível "impossível" teria de vir
  // de heurística melhor (regra das cadeias longas), não de busca mais funda.
  const SPLIT = 26, SPLIT_POW = 1 << SPLIT;
  const EXACT_EDGES = 30;        // acima disso nem tenta; entre 28 e 30 costuma estourar o tempo
  const TIME_BUDGET = 250;       // ms
  const MAX_TT = 1500000;        // teto de entradas: acima disso para de guardar (memória)

  function exactPick(edges, maxEdges, budget) {
    maxEdges = maxEdges || EXACT_EDGES;
    budget = budget || TIME_BUDGET;
    const n = edges.length;
    if (!n || n > maxEdges) return null;
    const sides = new Int8Array(R * C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) sides[idOf(r, c)] = boxSides(r, c);
    const b1 = new Int16Array(n), b2 = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const a = adj(edges[i][0], edges[i][1], edges[i][2]);
      b1[i] = idOf(a[0][0], a[0][1]);
      b2[i] = a.length > 1 ? idOf(a[1][0], a[1][1]) : -1;
    }
    // máscara em duas metades: lo = arestas 0..25, hi = arestas 26..51
    let lo = n <= SPLIT ? (1 << n) - 1 : (1 << SPLIT) - 1;
    let hi = n <= SPLIT ? 0 : (1 << (n - SPLIT)) - 1;
    let nodes = 0, aborted = false;
    const deadline = performance.now() + budget;
    const TT = new Map();
    const gain = i => (sides[b1[i]] === 3 ? 1 : 0) + (b2[i] >= 0 && sides[b2[i]] === 3 ? 1 : 0);
    const free = i => (i < SPLIT ? lo & (1 << i) : hi & (1 << (i - SPLIT)));
    const play = i => {
      if (i < SPLIT) lo &= ~(1 << i); else hi &= ~(1 << (i - SPLIT));
      sides[b1[i]]++; if (b2[i] >= 0) sides[b2[i]]++;
    };
    const undo = i => {
      if (i < SPLIT) lo |= (1 << i); else hi |= (1 << (i - SPLIT));
      sides[b1[i]]--; if (b2[i] >= 0) sides[b2[i]]--;
    };

    function nega(alpha, beta) {
      if (lo === 0 && hi === 0) return 0;
      // olhar o relógio custa: só de vez em quando (e 4095 é uma máscara barata)
      if ((++nodes & 4095) === 0 && performance.now() > deadline) aborted = true;
      if (aborted) return 0;
      const key = hi * SPLIT_POW + lo;
      const hit = TT.get(key);
      if (hit !== undefined) {
        const v = (hit >> 2) - 64, f = hit & 3;
        if (f === 0) return v;
        if (f === 1) { if (v >= beta) return v; if (v > alpha) alpha = v; }
        else { if (v <= alpha) return v; if (v < beta) beta = v; }
        if (alpha >= beta) return v;
      }
      const a0 = alpha, b0 = beta;
      let best = -Infinity;
      // capturas primeiro (passe 0): é a ordenação que faz a poda render
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          if (!free(i)) continue;
          const g = gain(i);
          if ((g > 0) !== (pass === 0)) continue;
          play(i);
          const v = g > 0 ? g + nega(alpha - g, beta - g) : -nega(-beta, -alpha);
          undo(i);
          if (aborted) return 0;
          if (v > best) best = v;
          if (best > alpha) alpha = best;
          if (alpha >= beta) { pass = 2; break; }
        }
      }
      // teto de memória: cheia a tabela, para de guardar em vez de crescer sem limite
      if (TT.size < MAX_TT) TT.set(key, ((best + 64) << 2) | (best <= a0 ? 2 : best >= b0 ? 1 : 0));
      return best;
    }

    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    order.sort((x, y) => gain(y) - gain(x));
    let bestMove = null, bestV = -Infinity, alpha = -Infinity;
    for (const i of order) {
      const g = gain(i);
      play(i);
      const v = g > 0 ? g + nega(alpha - g, Infinity) : -nega(-Infinity, -alpha);
      undo(i);
      if (aborted) return null;
      if (v > bestV) { bestV = v; bestMove = edges[i]; alpha = v; }
    }
    return bestMove;
  }

  // ---------- camada 2: heurística de controle ----------
  function smartPick(edges) {
    const { caps, safe, bad } = classify(edges);
    if (caps.length) return capturePick(caps);
    if (safe.length) return safePick(safe);
    return openPick(bad);
  }

  // Estou comendo uma cadeia: levo tudo ou paro e faço o double-cross?
  function capturePick(caps) {
    const comps = components();
    const open = comps.find(k => k.open);
    const rest = comps.filter(k => k !== open && !k.open).sort(cmpComp);
    if (!open || !rest.length) return caps[0];          // não há controle a preservar: come tudo
    const cost = open.loop ? 4 : 2;
    if (open.n > cost) return caps[0];                  // ainda não chegou a hora de decidir
    const restV = openValue(rest);
    const takeAll = open.n + restV;                     // levo tudo e sou eu quem abre a próxima
    const dcross = open.n - 2 * cost - restV;           // devolvo `cost` e ele é quem abre
    if (dcross <= takeAll) return caps[0];
    // o double-cross é a aresta da cadeia aberta que NÃO fecha quadradinho: ela deixa os
    // últimos dois de bandeja para o adversário e devolve a obrigação de abrir para ele
    const capKeys = {}; caps.forEach(e => { capKeys[eKey(e)] = 1; });
    return freeEdgesOf(open.boxes).find(e => !capKeys[eKey(e)]) || caps[0];
  }

  // Esgota as jogadas seguras para descobrir QUEM fica sem saída primeiro — é essa
  // paridade que decide quem é obrigado a abrir a primeira cadeia, e com ela o jogo.
  // Uma passada basta: risquinho só acrescenta lado, então jogada que virou insegura
  // nunca volta a ser segura.
  function safeRollout() {
    const played = [];
    for (const e of allEdges()) {
      const [t, r, c] = e;
      setE(t, r, c, turn);
      let ruim = false;
      for (const [br, bc] of adj(t, r, c)) if (boxSides(br, bc) >= 3) { ruim = true; break; }
      if (ruim) setE(t, r, c, 0); else played.push(e);
    }
    const comps = components().filter(k => !k.open).sort(cmpComp);
    for (const e of played) setE(e[0], e[1], e[2], 0);
    return { k: played.length, comps };
  }

  // Ainda dá para jogar sem entregar nada: escolhe a segura que deixa o ADVERSÁRIO com a
  // obrigação de abrir a primeira cadeia.
  function safePick(safe) {
    let bestV = -Infinity, ties = [];
    for (const mv of safe) {
      setE(mv[0], mv[1], mv[2], turn);
      const { k, comps } = safeRollout();
      // depois da minha jogada é a vez dele; se sobram k seguras, quem abre é ele se k é par
      const v = (k % 2 === 0 ? -1 : 1) * openValue(comps);
      setE(mv[0], mv[1], mv[2], 0);
      if (v > bestV) { bestV = v; ties = [mv]; } else if (v === bestV) ties.push(mv);
    }
    return ties[(Math.random() * ties.length) | 0];
  }

  // Sem jogada segura: sou obrigado a abrir. Abro a MENOR cadeia, pela ponta.
  function openPick(bad) {
    const comps = components().sort(cmpComp);
    const k = comps[0];
    if (!k) return bad[(Math.random() * bad.length) | 0];
    const es = freeEdgesOf(k.boxes);
    const inside = {}; k.boxes.forEach(([r, c]) => { inside[idOf(r, c)] = 1; });
    // "ponta" da cadeia = aresta na borda do tabuleiro (só encosta num quadradinho).
    // Aresta livre entre dois quadradinhos sempre liga dois abertos, nunca é ponta.
    const isGround = e => adj(e[0], e[1], e[2]).length === 1;
    // cadeia de 2: abrir pelo meio é o "hard-hearted handout" — entrega os 2 de uma vez e
    // tira do adversário a chance de fazer o double-cross de volta
    if (!k.loop && k.n === 2) {
      const mid = es.find(e => { const a = adj(e[0], e[1], e[2]); return a.length === 2 && a.every(([r, c]) => inside[idOf(r, c)]); });
      if (mid) return mid;
    }
    return es.find(isGround) || es[0] || bad[(Math.random() * bad.length) | 0];
  }

  // ---------- versão simples: fácil e médio, e qualquer partida de 3+ jogadores ----------
  // É o robô "de antes": fecha quadradinho quando dá, senão joga seguro ao acaso, e quando
  // não há mais jogada segura abre uma qualquer. Não enxerga cadeia nem faz double-cross —
  // de propósito: é o nível que uma criança aprende a ganhar, e por isso vira o Médio.
  // Não trocar o `bad` aleatório do fim por `openPick`: abrir a menor cadeia é justamente
  // o que separa o Médio do Difícil.
  function simplePick(edges, sloppy) {
    const { caps, safe, bad } = classify(edges);
    if (caps.length) return caps[0];
    // no fácil, às vezes entrega um quadradinho mesmo tendo jogada segura
    if (sloppy && safe.length && bad.length && Math.random() < 0.5) return bad[(Math.random() * bad.length) | 0];
    if (safe.length) return safe[(Math.random() * safe.length) | 0];
    return bad[(Math.random() * bad.length) | 0];
  }

  function cpuPick() {
    const edges = allEdges();
    if (!edges.length) return null;
    // só o difícil (e só em jogo de 2) usa o motor de verdade; 'facil' e 'medio' vão no simples
    if (diff !== 'dificil' || !twoPlayerGame()) return simplePick(edges, diff === 'facil');
    return exactPick(edges) || smartPick(edges);
  }

  function cpuStep() {
    if (over) { busy = false; return; }
    const mv = cpuPick(); if (!mv) { busy = false; return; }
    busy = false;
    const done = drawEdge(mv[0], mv[1], mv[2], turn);
    if (done < 0) return;
    afterMove(done);   // se o robô fechou, o turno não muda e maybeCpu o reagenda
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cols = ['#4F9BEB','#F07AA6','#58CBA9','#F6C64B','#A98BEA','#FFB07C'];
    const host = $('win');
    for (let i = 0; i < 28; i++) {
      const d = document.createElement('div'); d.className = 'confetti';
      d.style.left = Math.random() * 100 + '%';
      d.style.background = cols[(Math.random() * cols.length) | 0];
      d.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      d.style.animationDelay = (Math.random() * 0.4) + 's';
      host.appendChild(d);
      setTimeout(() => d.remove(), 3400);
    }
  }

  // ---- API para o modo online (usada por js/online.js) ----

  // Inicia uma partida online. cfg = { size, nPlayers, players: {seat:{name,av,pen,kind}}, net }
  // net = { sendMove(t,r,c), onAgain(), onExit(), onEnd() }
  function startOnline(cfg) {
    mode = 'online';
    net = cfg.net;
    R = C = cfg.size;
    nPlayers = cfg.nPlayers;
    players = cfg.players;
    buildHud();
    $('winAgain').textContent = I18n.t('win.backRoom');
    $('winMenu').textContent = I18n.t('win.leaveRoom');
    $('restartBtn').style.display = 'none';
    $('boardWrap').classList.toggle('big', cfg.size === 6);
    show('scr-game');
    newBoard();
    requestAnimationFrame(fitBoard);
  }

  // Aplica uma jogada vinda da rede (inclusive o eco da jogada local). Ignora jogadas inválidas.
  function applyMove(t, r, c, by) {
    if (over || !players[by] || by !== turn) return false;
    const done = drawEdge(t, r, c, by);
    if (done < 0) return false;
    afterMove(done);
    return true;
  }

  // Remove um jogador que caiu/saiu; arestas e quadradinhos dele permanecem.
  function dropPlayer(seat) {
    if (mode !== 'online' || over || !players[seat] || players[seat].dropped) return;
    players[seat].dropped = true;
    const card = $('card' + seat); if (card) card.classList.add('out');
    const alive = []; for (let i = 1; i <= nPlayers; i++) if (!players[i].dropped) alive.push(i);
    if (alive.length === 1) {   // sobrou só um → vence quem ficou
      over = true; render();
      const w = alive[0];
      if (net && net.onEnd) net.onEnd([w]);
      clearTimeout(winTimer);
      winTimer = setTimeout(() => showWinOverlay(
        '🏆',
        players[w].av + ' ' + I18n.t('win.other', { p: players[w].name }),
        I18n.t('win.othersLeft'),
        [w]
      ), WIN_REVEAL_DELAY);
      return;
    }
    if (turn === seat) { turn = nextTurn(); render(); }
    updateTurn();
  }

  function leaveOnline() {
    net = null; mode = 'solo';
    clearTimeout(winTimer); winTimer = null;
    $('win').classList.remove('show');
    $('winAgain').textContent = I18n.t('win.again');
    $('winMenu').textContent = I18n.t('win.menu');
  }

  window.Game = {
    show, startOnline, applyMove, dropPlayer, leaveOnline,
    AVATARS, PENS,
    isOver: () => over,
    curTurn: () => turn,
    refit: fitBoard,
    // jogada automática (tempo esgotado no online): usa a cabeça do robô no modo esperto
    pickMove: () => { const d = diff; diff = 'dificil'; const mv = cpuPick(); diff = d; return mv; }
  };

  // Traduz o HTML estático uma vez, antes de qualquer tela aparecer. As telas montadas
  // por JS (cards, vitrine, sala) já pedem o texto direto ao I18n na hora de montar.
  I18n.apply();
  refreshAdInitial();
  document.title = I18n.t('app.name');

  // ---- PWA: instalável / funciona offline (só no navegador) ----
  // No app nativo (Capacitor) os arquivos já são locais, então pulamos o SW.
  if ('serviceWorker' in navigator && !window.Capacitor) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
