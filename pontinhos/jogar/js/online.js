// Modo online — lobby, salas e partida sincronizada via Firebase Realtime Database.
// Conversa com o motor do jogo apenas por window.Game (definido em js/game.js).
//
// Sincronização: nenhum estado de tabuleiro trafega pela rede — só um log de jogadas
// (games/{id}/moves). Cada aparelho aplica as jogadas com o motor local determinístico,
// então todos convergem; reconectar = reaplicar o log num tabuleiro zerado.
//
// Identidade kid-safe (política "Voltado para famílias"): NENHUM texto digitado.
// O apelido é sorteado de listas fixas ("Raposa Foguete") e só os ÍNDICES (a, b)
// trafegam pelo banco — cada cliente monta o nome localmente. Amigos se encontram
// por um código falável de 3 bichinhos; salas podem ser secretas (só por código).
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const DROP_MS = 40000;                    // tolerância de reconexão na partida
  const TURN_MS = 30000;                    // tempo por jogada (estourou → jogada automática)
  const ROOM_TTL = 24 * 60 * 60 * 1000;     // salas mais velhas que isso são ignoradas

  // Os nomes vêm do I18n, na mesma ordem de Game.AVATARS ('🐱','🐶','🐰','🦊','🐼','🐨','🦄',
  // '🐸','🐯','🐵','🐧','🐢','🐷','🦁','🤖'). Só o par de índices (a, b) trafega: cada aparelho
  // monta o apelido no próprio idioma, e as regras do banco seguem validando só as faixas.
  // ⚠️ Consultadas a cada uso, nunca guardadas: o seletor de idioma troca as listas em
  // tempo de execução e uma cópia velha mostraria o apelido no idioma anterior.
  const ANIMAIS = { get length() { return I18n.animals().length; } };
  const ADJS = { get length() { return I18n.adjs().length; } };
  const animalNome = i => I18n.animals()[i];
  const nickOf = (a, b) => I18n.nick(a, b);
  const emojiOf = a => Game.AVATARS[a % Game.AVATARS.length];

  // ---- estado ----
  let db = null, uid = null, entered = false;
  let myA = 0, myB = 0;                     // minha identidade (animal, "sobrenome")
  let timeOffset = 0;                       // .info/serverTimeOffset
  let roomId = null, room = null;           // sala atual (snapshot mais recente)
  let inGame = false, lastStartedAt = 0;
  let order = null, mySeatNum = 0;
  let droppedSeats = new Set();
  let openRoomsCache = {};                  // último snapshot de salas abertas (p/ código único)

  let lobbyPeopleRef = null, lobbyRoomsRef = null, roomRef = null, movesRef = null, dropsRef = null;
  let connWatchOn = false, booted = false, resuming = false;

  // ---- helpers ----
  const now = () => Date.now() + timeOffset;
  const penOf = (u, r) => { const pens = (r && r.pens) || {}; for (const k of Object.keys(pens)) if (pens[k] === u) return +k; return -1; };
  const nickIn = (r, u) => { const p = r.players[u]; return p ? nickOf(p.a || 0, p.b || 0) : '???'; };

  let toastT = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const errToast = () => toast('Ops, algo deu errado 😕');

  function configured() {
    const c = window.FIREBASE_CONFIG;
    return !!(window.firebase && c && c.apiKey && !/COLE/.test(c.apiKey) && c.databaseURL);
  }

  // ================= ENTRADA / AUTENTICAÇÃO =================

  $('btnOnline').onclick = () => {
    if (!configured()) { toast(I18n.t('net.notConfigured')); return; }
    if (!navigator.onLine) { toast(I18n.t('net.offline')); return; }
    Game.show('scr-lobby');
    boot();
  };

  function boot() {
    if (booted) return;
    booted = true;
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.database();
    db.ref('.info/serverTimeOffset').on('value', s => { timeOffset = s.val() || 0; });
    $('lobbyStatus').textContent = I18n.t('lobby.connecting');
    firebase.auth().onAuthStateChanged(u => {
      if (!u) return;
      uid = u.uid;
      $('lobbyStatus').textContent = '';
    });
    firebase.auth().signInAnonymously().catch(() => {
      $('lobbyStatus').textContent = I18n.t('lobby.connectFail');
      booted = false;
    });
  }

  // reconexão: re-arma presença e o aviso de queda de todos os pontos
  function watchConn() {
    if (connWatchOn) return;
    connWatchOn = true;
    db.ref('.info/connected').on('value', s => {
      if (!s.val() || !uid) return;
      if (entered) {
        const me = db.ref('lobby/' + uid);
        me.onDisconnect().remove();
        me.set({ a: myA, b: myB, ts: TS() });
      }
      if (roomId) {
        const p = db.ref('rooms/' + roomId + '/players/' + uid);
        p.onDisconnect().update({ connected: false, lastSeen: TS() });
        p.update({ connected: true });
        if (room && room.owner === uid && room.status === 'open') db.ref('rooms/' + roomId).onDisconnect().remove();
      }
    });
  }

  // ================= PERSONAGEM (apelido sorteado, sem digitação) =================

  myA = (+localStorage.getItem('pt_a') || 0) % ANIMAIS.length;
  myB = localStorage.getItem('pt_b') === null ? (Math.random() * ADJS.length) | 0 : (+localStorage.getItem('pt_b') || 0) % ADJS.length;
  if (localStorage.getItem('pt_a') === null) myA = (Math.random() * ANIMAIS.length) | 0;

  function saveMe() {
    localStorage.setItem('pt_a', myA);
    localStorage.setItem('pt_b', myB);
    $('lobbyAva').textContent = emojiOf(myA);
    $('genNick').textContent = nickOf(myA, myB);
  }
  saveMe();

  // o apelido é montado a partir dos índices (a, b): trocar de idioma reescreve o nome
  document.addEventListener('langchange', () => { if ($('genNick')) saveMe(); });

  $('lobbyAva').onclick = () => { myA = (myA + 1) % ANIMAIS.length; saveMe(); };
  $('diceBtn').onclick = () => {
    myA = (Math.random() * ANIMAIS.length) | 0;
    myB = (Math.random() * ADJS.length) | 0;
    saveMe();
  };

  $('nickBtn').onclick = () => {
    if (!uid) { toast(I18n.t('net.retry')); boot(); return; }
    entered = true;
    enterLobby();
  };

  $('lobbyBack').onclick = () => {
    if (entered && uid && db) {
      db.ref('lobby/' + uid).onDisconnect().cancel();
      db.ref('lobby/' + uid).remove();
    }
    if (lobbyPeopleRef) { lobbyPeopleRef.off(); lobbyPeopleRef = null; }
    if (lobbyRoomsRef) { lobbyRoomsRef.off(); lobbyRoomsRef = null; }
    entered = false;
    $('lobbyGate').style.display = '';
    $('lobbyMain').style.display = 'none';
    Game.show('scr-menu');
  };

  // ================= LOBBY =================

  function enterLobby() {
    $('lobbyGate').style.display = 'none';
    $('lobbyMain').style.display = '';
    const me = db.ref('lobby/' + uid);
    me.onDisconnect().remove();
    me.set({ a: myA, b: myB, ts: TS() });
    if (lobbyPeopleRef) lobbyPeopleRef.off();
    if (lobbyRoomsRef) lobbyRoomsRef.off();
    lobbyPeopleRef = db.ref('lobby');
    lobbyPeopleRef.on('value', s => renderPeople(s.val() || {}));
    lobbyRoomsRef = db.ref('rooms').orderByChild('status').equalTo('open');
    lobbyRoomsRef.on('value', s => { openRoomsCache = s.val() || {}; renderRooms(openRoomsCache); });
    watchConn();
    tryResume();
  }

  function renderPeople(all) {
    const box = $('peopleList');
    box.innerHTML = '';
    const ids = Object.keys(all).sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0));
    if (!ids.length) { box.innerHTML = '<div class="empty">' + I18n.t('lobby.nobody') + '</div>'; return; }
    ids.forEach(id => {
      const p = all[id];
      const chip = document.createElement('span');
      chip.className = 'chip' + (id === uid ? ' me' : '');
      chip.textContent = emojiOf(p.a || 0) + ' ' + nickOf(p.a || 0, p.b || 0) + (id === uid ? I18n.t('lobby.me') : '');
      box.appendChild(chip);
    });
  }

  const roomAlive = r => r && r.cfg && r.players && r.owner && (now() - (r.createdAt || 0) < ROOM_TTL);

  function renderRooms(all) {
    const box = $('roomList');
    box.innerHTML = '';
    const ids = Object.keys(all)
      .filter(id => roomAlive(all[id]) && !all[id].secret)
      .sort((a, b) => (all[a].createdAt || 0) - (all[b].createdAt || 0));
    if (!ids.length) {
      box.innerHTML = '<div class="empty">' + I18n.t('lobby.noRooms') + '</div>';
      return;
    }
    ids.forEach(id => {
      const r = all[id], n = Object.keys(r.players).length, host = r.players[r.owner];
      const full = n >= r.cfg.maxPlayers, banned = !!(r.kicked && r.kicked[uid]);
      const item = document.createElement('div'); item.className = 'room-item';
      const av = document.createElement('div'); av.className = 'ri-av';
      av.textContent = emojiOf((host && host.a) || 0);
      const txt = document.createElement('div'); txt.className = 'ri-txt';
      const t1 = document.createElement('div'); t1.className = 'ri-nm';
      t1.textContent = I18n.t('lobby.roomOf', { p: host ? nickOf(host.a || 0, host.b || 0) : '???' });
      const t2 = document.createElement('div'); t2.className = 'ri-meta';
      t2.textContent = I18n.t('lobby.roomLine', { n: n, max: r.cfg.maxPlayers, s: r.cfg.size });
      txt.appendChild(t1); txt.appendChild(t2);
      const btn = document.createElement('button');
      btn.textContent = I18n.t(full ? 'lobby.full' : 'lobby.join');
      btn.disabled = full || banned;
      btn.onclick = () => joinRoom(id);
      item.appendChild(av); item.appendChild(txt); item.appendChild(btn);
      box.appendChild(item);
    });
  }

  // volta para uma partida em andamento se o app caiu/fechou no meio dela
  function tryResume() {
    const saved = localStorage.getItem('pt_room');
    if (!saved) return;
    db.ref('rooms/' + saved).once('value').then(s => {
      const r = s.val();
      if (!r || !r.players || !r.players[uid]) { localStorage.removeItem('pt_room'); return; }
      if (r.status === 'playing' && r.order && r.order.indexOf(uid) >= 0) {
        const seat = r.order.indexOf(uid) + 1;
        db.ref('games/' + saved + '/drops/' + seat).once('value').then(ds => {
          if (ds.exists()) { localStorage.removeItem('pt_room'); return; }
          toast(I18n.t('net.rejoin'));
          resuming = true;   // sem dado de abertura no retorno — direto para o tabuleiro
          attachRoom(saved);
        });
      } else if (r.status === 'open') {
        attachRoom(saved);
      } else {
        localStorage.removeItem('pt_room');
      }
    }).catch(() => {});
  }

  // ================= CRIAR SALA (modal) =================

  let mpSel = 2, szSel = 5;
  $('createRoomBtn').onclick = () => $('createModal').classList.add('show');
  $('createCancel').onclick = () => $('createModal').classList.remove('show');
  document.querySelectorAll('#mpRow .pill').forEach(b => b.onclick = () => {
    mpSel = +b.dataset.mp;
    document.querySelectorAll('#mpRow .pill').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('#szRow .pill').forEach(b => b.onclick = () => {
    szSel = +b.dataset.sz;
    document.querySelectorAll('#szRow .pill').forEach(x => x.classList.toggle('on', x === b));
  });
  $('createGo').onclick = () => {
    $('createModal').classList.remove('show');
    createRoom(mpSel, szSel, $('secretChk').checked);
  };

  const playerNode = seat => ({ a: myA, b: myB, seat, ready: false, joinedAt: TS(), connected: true });

  // código falável de 3 bichinhos, único entre as salas abertas
  function newCode() {
    for (let tries = 0; tries < 20; tries++) {
      const c = [0, 0, 0].map(() => (Math.random() * ANIMAIS.length) | 0).join('-');
      let clash = false;
      for (const id of Object.keys(openRoomsCache)) if (roomAlive(openRoomsCache[id]) && openRoomsCache[id].code === c) { clash = true; break; }
      if (!clash) return c;
    }
    return [0, 0, 0].map(() => (Math.random() * ANIMAIS.length) | 0).join('-');
  }

  function createRoom(maxPlayers, size, secret) {
    const ref = db.ref('rooms').push();
    ref.set({
      owner: uid, status: 'open', createdAt: TS(),
      cfg: { size, maxPlayers },
      code: newCode(),
      secret: !!secret,
      players: { [uid]: playerNode(1) },
      pens: { 0: uid }
    }).catch(errToast);
    ref.onDisconnect().remove();   // se o dono cair com a sala aberta, a sala some
    attachRoom(ref.key);
  }

  function joinRoom(id) {
    db.ref('rooms/' + id).once('value').then(s => {
      const r = s.val();
      if (!r || r.status !== 'open') { toast(I18n.t('room.alreadyClosed')); return; }
      if (r.kicked && r.kicked[uid]) { toast(I18n.t('room.banned')); return; }
      const ps = r.players || {};
      if (ps[uid]) { attachRoom(id); return; }
      if (Object.keys(ps).length >= r.cfg.maxPlayers) { toast(I18n.t('room.gotFull')); return; }
      const seats = Object.values(ps).map(p => p.seat);
      let seat = 1; while (seats.indexOf(seat) >= 0) seat++;
      db.ref('rooms/' + id + '/players/' + uid).set(playerNode(seat))
        .then(() => attachRoom(id))
        .catch(() => toast(I18n.t('room.joinFail')));
    }).catch(errToast);
  }

  // ================= ENTRAR COM CÓDIGO (teclado de bichinhos) =================

  let codeTaps = [];
  $('codeBtn').onclick = () => { codeTaps = []; renderCodeModal(); $('codeModal').classList.add('show'); };
  $('codeCancel').onclick = () => $('codeModal').classList.remove('show');

  (function buildCodePad() {
    const pad = $('codePad');
    Game.AVATARS.forEach((em, i) => {
      const b = document.createElement('button');
      b.className = 'pad-btn';
      b.textContent = em;
      b.setAttribute('aria-label', animalNome(i));
      b.onclick = () => {
        if (codeTaps.length >= 3) return;
        codeTaps.push(i);
        renderCodeModal();
        if (codeTaps.length === 3) joinByCode(codeTaps.join('-'));
      };
      pad.appendChild(b);
    });
  })();

  $('codeDel').onclick = () => { codeTaps.pop(); renderCodeModal(); };

  function renderCodeModal() {
    for (let i = 0; i < 3; i++) {
      const slot = $('codeSlot' + i);
      slot.textContent = codeTaps[i] !== undefined ? Game.AVATARS[codeTaps[i]] : '';
      slot.classList.toggle('filled', codeTaps[i] !== undefined);
    }
    $('codeHint').textContent = codeTaps.length === 3 ? I18n.t('code.searching')
      : codeTaps.map(i => animalNome(i).toLowerCase()).join(' · ') || I18n.t('code.example');
  }

  function joinByCode(code) {
    db.ref('rooms').orderByChild('code').equalTo(code).once('value').then(s => {
      const all = s.val() || {};
      const id = Object.keys(all).find(k => roomAlive(all[k]) && all[k].status === 'open');
      if (!id) {
        toast(I18n.t('code.notFound'));
        codeTaps = []; renderCodeModal();
        return;
      }
      $('codeModal').classList.remove('show');
      joinRoom(id);
    }).catch(() => { errToast(); codeTaps = []; renderCodeModal(); });
  }

  // ================= SALA =================

  function attachRoom(id) {
    roomId = id;
    localStorage.setItem('pt_room', id);
    const p = db.ref('rooms/' + id + '/players/' + uid);
    p.onDisconnect().update({ connected: false, lastSeen: TS() });
    p.update({ connected: true });
    roomRef = db.ref('rooms/' + id);
    roomRef.on('value', onRoomValue);
    Game.show('scr-room');
  }

  function onRoomValue(s) {
    if (!roomId) return;
    const r = s.val();
    room = r;
    // sala sumiu ou fui removido
    if (!r || !r.players || !r.players[uid]) {
      const kicked = !!(r && r.kicked && r.kicked[uid]);
      const wasGame = inGame;
      cleanupRoom();
      if (wasGame) Game.leaveOnline();
      toast(I18n.t(kicked ? 'room.kicked' : 'room.closed'));
      Game.show('scr-lobby');
      return;
    }
    ensurePen(r);
    // partida começou (ou retomada após reconexão)
    if (r.status === 'playing' && r.startedAt && r.startedAt !== lastStartedAt && r.order) {
      lastStartedAt = r.startedAt;
      startGameFromRoom(r);
      return;
    }
    if (inGame) { watchDisconnects(r); return; }
    renderRoom(r);
  }

  // garante que eu sempre tenha uma cor (claim atômico via transaction)
  function ensurePen(r) {
    if (penOf(uid, r) >= 0) return;
    const used = r.pens || {};
    for (let i = 0; i < Game.PENS.length; i++) {
      if (used[i] === undefined) {
        db.ref('rooms/' + roomId + '/pens/' + i).transaction(cur => (cur === null ? uid : undefined));
        return;
      }
    }
  }

  function claimPen(i) {
    const old = penOf(uid, room);
    if (old === i || !roomId) return;
    db.ref('rooms/' + roomId + '/pens/' + i)
      .transaction(cur => (cur === null ? uid : undefined))
      .then(res => { if (res.committed && old >= 0) db.ref('rooms/' + roomId + '/pens/' + old).remove(); })
      .catch(() => {});
  }

  function renderRoom(r) {
    const amOwner = r.owner === uid;
    $('roomTitle').textContent = amOwner ? I18n.t('room.mine') : I18n.t('room.of', { p: nickIn(r, r.owner) });
    $('roomInfo').textContent = I18n.t('room.info', { n: Object.keys(r.players).length, max: r.cfg.maxPlayers, s: r.cfg.size }) +
      (r.secret ? I18n.t('room.secretTag') : '');

    // código falável da sala
    if (r.code) {
      const idx = r.code.split('-').map(Number);
      $('roomCodeEmojis').textContent = idx.map(i => Game.AVATARS[i]).join(' ');
      $('roomCodeWords').textContent = idx.map(i => animalNome(i).toLowerCase()).join(' · ');
      $('roomCodeBox').style.display = '';
    } else $('roomCodeBox').style.display = 'none';

    // placar da sala (vitórias acumuladas nas revanches)
    const wins = r.wins || {};
    const wus = Object.keys(wins).filter(u => r.players[u] && wins[u] > 0).sort((x, y) => wins[y] - wins[x]);
    if (wus.length) {
      $('roomWins').style.display = '';
      $('roomWins').textContent = I18n.t('room.wins') +
        wus.map(u => emojiOf(r.players[u].a || 0) + ' ' + nickIn(r, u) + ' ' + wins[u]).join('  ·  ');
    } else $('roomWins').style.display = 'none';

    const box = $('roomSlots');
    box.innerHTML = '';
    const uids = Object.keys(r.players).sort((a, b) => r.players[a].seat - r.players[b].seat);
    uids.forEach(u => {
      const p = r.players[u], isMe = u === uid;
      const pi = penOf(u, r), hex = pi >= 0 ? Game.PENS[pi] : 'var(--line)';
      const slot = document.createElement('div');
      slot.className = 'pslot';

      const ava = document.createElement('button');
      ava.className = 'ava-btn';
      ava.textContent = emojiOf(p.a || 0);
      ava.style.borderColor = hex;
      ava.style.background = 'color-mix(in srgb, ' + hex + ' 22%, var(--surface))';
      if (isMe) {
        ava.onclick = () => {
          myA = ((p.a || 0) + 1) % ANIMAIS.length;
          saveMe();
          roomRef.child('players/' + uid).update({ a: myA });
          db.ref('lobby/' + uid + '/a').set(myA);
        };
      } else ava.disabled = true;

      const info = document.createElement('div');
      info.className = 'info';
      const nm = document.createElement('div');
      nm.className = 'rnick';
      nm.textContent = nickOf(p.a || 0, p.b || 0) + (u === r.owner ? ' 👑' : '') + (isMe ? I18n.t('room.you') : '') + (p.connected === false ? I18n.t('room.dropped') : '');
      info.appendChild(nm);
      const pr = document.createElement('div');
      pr.className = 'pen-row';
      Game.PENS.forEach((phex, i) => {
        const b = document.createElement('button');
        b.className = 'pen-dot' + (i === pi ? ' on' : '');
        b.style.background = phex;
        const takenBy = (r.pens || {})[i];
        b.disabled = !isMe || (takenBy !== undefined && takenBy !== u);
        if (isMe && !b.disabled) b.onclick = () => claimPen(i);
        pr.appendChild(b);
      });
      info.appendChild(pr);

      const act = document.createElement('div');
      act.className = 'slot-actions';
      const badge = document.createElement('span');
      if (u === r.owner) { badge.className = 'badge-owner'; badge.textContent = I18n.t('room.owner'); }
      else if (p.ready) { badge.className = 'badge-ready'; badge.textContent = I18n.t('room.ready'); }
      else { badge.className = 'badge-wait'; badge.textContent = I18n.t('room.waiting'); }
      act.appendChild(badge);
      if (amOwner && !isMe) {
        const kb = document.createElement('button');
        kb.className = 'kick-btn';
        kb.textContent = '✕';
        kb.setAttribute('aria-label', 'Remover ' + nickOf(p.a || 0, p.b || 0));
        kb.onclick = () => kick(u);
        act.appendChild(kb);
      }

      slot.appendChild(ava); slot.appendChild(info); slot.appendChild(act);
      box.appendChild(slot);
    });
    for (let i = uids.length; i < r.cfg.maxPlayers; i++) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = I18n.t('room.emptySlot');
      box.appendChild(e);
    }

    if (amOwner) {
      $('readyBtn').style.display = 'none';
      const others = uids.filter(u => u !== r.owner);
      const allReady = others.length >= 1 && others.every(u => r.players[u].ready);
      const btn = $('startMatchBtn');
      btn.style.display = '';
      btn.disabled = !allReady;
      btn.textContent = allReady ? I18n.t('setup.start') : I18n.t(others.length ? 'room.waitAll' : 'room.waitSomeone');
    } else {
      $('startMatchBtn').style.display = 'none';
      const me = r.players[uid];
      const btn = $('readyBtn');
      btn.style.display = '';
      btn.textContent = I18n.t(me.ready ? 'room.notReady' : 'room.imReady');
      btn.classList.toggle('ok', !!me.ready);
    }
  }

  $('readyBtn').onclick = () => {
    if (!roomId || !room || !room.players[uid]) return;
    roomRef.child('players/' + uid + '/ready').set(!room.players[uid].ready).catch(errToast);
  };

  function kick(u) {
    if (!room || room.owner !== uid) return;
    const ups = {};
    ups['players/' + u] = null;
    ups['kicked/' + u] = true;
    const pi = penOf(u, room);
    if (pi >= 0) ups['pens/' + pi] = null;
    roomRef.update(ups).catch(errToast);
  }

  $('roomBack').onclick = () => leaveRoom();

  function cleanupRoom() {
    if (roomRef) { roomRef.off(); roomRef = null; }
    detachGame();
    if (roomId && db) db.ref('rooms/' + roomId + '/players/' + uid).onDisconnect().cancel();
    roomId = null; room = null; lastStartedAt = 0;
    localStorage.removeItem('pt_room');
  }

  function leaveRoom() {
    if (!roomId) { Game.show('scr-lobby'); return; }
    const id = roomId, r = room, wasGame = inGame;
    cleanupRoom();
    if (r) {
      if (r.owner === uid && r.status === 'open') {
        db.ref('rooms/' + id).onDisconnect().cancel();
        db.ref('rooms/' + id).remove().catch(() => {});
      } else {
        const ups = {};
        ups['players/' + uid] = null;
        const pi = penOf(uid, r);
        if (pi >= 0) ups['pens/' + pi] = null;
        db.ref('rooms/' + id).update(ups).catch(() => {});
      }
    }
    if (wasGame) Game.leaveOnline();
    Game.show('scr-lobby');
  }

  // ================= PARTIDA =================

  $('startMatchBtn').onclick = () => {
    const r = room;
    if (!r || r.owner !== uid || !roomId) return;
    const uids = Object.keys(r.players).sort((a, b) => r.players[a].seat - r.players[b].seat);
    if (uids.length < 2) return;
    roomRef.onDisconnect().cancel();   // durante o jogo a sala não morre se o dono cair
    // sorteio da ordem: cada jogador "tira" um dado (valores distintos) — o maior começa
    const faces = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5).slice(0, uids.length);
    const rolls = {};
    uids.forEach((u, i) => { rolls[u] = faces[i]; });
    const order = uids.slice().sort((a, b) => rolls[b] - rolls[a]);
    const seats = {};
    order.forEach((u, i) => { seats[u] = i + 1; });
    const ups = {};
    ups['rooms/' + roomId + '/status'] = 'playing';
    ups['rooms/' + roomId + '/rolls'] = rolls;
    ups['rooms/' + roomId + '/order'] = order;
    ups['rooms/' + roomId + '/seats'] = seats;   // usado pelas regras p/ validar o "by" das jogadas
    ups['rooms/' + roomId + '/startedAt'] = Date.now();
    ups['games/' + roomId] = { cfg: { size: r.cfg.size, nPlayers: order.length } };
    db.ref().update(ups).catch(errToast);
  };

  function startGameFromRoom(r) {
    order = r.order;
    mySeatNum = order.indexOf(uid) + 1;
    if (!mySeatNum) { leaveRoom(); return; }
    droppedSeats = new Set();
    const gp = {};
    order.forEach((u, i) => {
      const p = r.players[u] || { a: 0, b: 0 };
      const pi = penOf(u, r);
      gp[i + 1] = {
        name: nickOf(p.a || 0, p.b || 0),
        av: emojiOf(p.a || 0),
        pen: pi >= 0 ? Game.PENS[pi] : Game.PENS[i],
        kind: u === uid ? 'local' : 'remote'
      };
    });
    inGame = true;
    Game.startOnline({
      size: r.cfg.size,
      nPlayers: order.length,
      players: gp,
      net: {
        sendMove: (t, ro, c) => db.ref('games/' + roomId + '/moves').push({ t, r: ro, c, by: mySeatNum }).catch(() => {}),
        onAgain: backToRoom,
        onExit: leaveRoom,
        onEnd: onGameEnd,
        onTurn: resetTurnTimer
      }
    });
    movesRef = db.ref('games/' + roomId + '/moves');
    movesRef.on('child_added', s => {
      const m = s.val();
      if (m && (m.t === 'H' || m.t === 'V')) Game.applyMove(m.t, +m.r, +m.c, +m.by);
    });
    dropsRef = db.ref('games/' + roomId + '/drops');
    dropsRef.on('child_added', s => {
      const seat = +s.key;
      droppedSeats.add(seat);
      if (seat === mySeatNum) { toast(I18n.t('net.tooLong')); leaveRoom(); return; }
      Game.dropPlayer(seat);
    });
    watchDisconnects(r);
    // dado de abertura (o tabuleiro já está montado por baixo do overlay)
    const myRoll = (r.rolls || {})[uid];
    if (!resuming && myRoll) showDiceIntro(myRoll, mySeatNum);
    resuming = false;
  }

  function detachGame() {
    if (movesRef) { movesRef.off(); movesRef = null; }
    if (dropsRef) { dropsRef.off(); dropsRef = null; }
    stopDropTimer();
    stopTurnTimer();
    hideNetBanner();
    inGame = false;
  }

  function backToRoom() {
    detachGame();
    Game.leaveOnline();
    if (room) renderRoom(room);
    Game.show('scr-room');
  }

  // fim de jogo: o dono anota a vitória no placar e reabre a sala
  function onGameEnd(winners) {
    stopDropTimer();
    stopTurnTimer();
    hideNetBanner();
    localStorage.removeItem('pt_room');
    if (!room || room.owner !== uid || !roomId) return;
    const ups = { status: 'open' };
    if (winners && winners.length === 1 && order) {
      const wuid = order[winners[0] - 1];
      if (wuid) ups['wins/' + wuid] = (((room.wins || {})[wuid]) || 0) + 1;
    }
    Object.keys(room.players).forEach(u => {
      if (u === uid) return;
      const p = room.players[u];
      if (p.connected === false) {
        ups['players/' + u] = null;
        const pi = penOf(u, room);
        if (pi >= 0) ups['pens/' + pi] = null;
      } else {
        ups['players/' + u + '/ready'] = false;
      }
    });
    roomRef.update(ups)
      .then(() => roomRef.onDisconnect().remove())
      .catch(() => {});
  }

  // ================= QUEDAS NA PARTIDA =================

  function watchDisconnects(r) {
    if (!inGame || Game.isOver()) { stopDropTimer(); hideNetBanner(); return; }
    const down = [];
    order.forEach((u, i) => {
      const seat = i + 1;
      if (u === uid || droppedSeats.has(seat)) return;
      const p = r.players[u];
      if (!p) { dropNow(seat); return; }                 // saiu da sala → sai do jogo na hora
      if (p.connected === false) down.push({ seat, nick: nickOf(p.a || 0, p.b || 0), since: p.lastSeen || now() });
    });
    if (down.length) startDropTimer(down);
    else { stopDropTimer(); hideNetBanner(); }
  }

  function dropNow(seat) {
    if (droppedSeats.has(seat)) return;
    db.ref('games/' + roomId + '/drops/' + seat)
      .transaction(cur => (cur === null ? { by: uid, ts: TS() } : undefined))
      .catch(() => {});
  }

  let dropInt = null;
  function startDropTimer(down) {
    stopDropTimer();
    const tick = () => {
      if (!inGame || Game.isOver()) { stopDropTimer(); hideNetBanner(); return; }
      const msgs = [];
      down.forEach(d => {
        if (droppedSeats.has(d.seat)) return;
        const left = Math.ceil((d.since + DROP_MS - now()) / 1000);
        if (left <= 0) dropNow(d.seat);
        else msgs.push('🔌 ' + d.nick + ' caiu — esperando ' + left + 's');
      });
      if (msgs.length) showNetBanner(msgs.join('  ·  '));
      else hideNetBanner();
    };
    tick();
    dropInt = setInterval(tick, 1000);
  }
  function stopDropTimer() { if (dropInt) { clearInterval(dropInt); dropInt = null; } }
  function showNetBanner(msg) { const b = $('netBanner'); b.textContent = msg; b.style.display = ''; }
  function hideNetBanner() { $('netBanner').style.display = 'none'; }

  // ================= RELÓGIO DE 30s POR JOGADA =================
  // Todos exibem a contagem (últimos 10s); quem estourar tem uma jogada automática
  // feita pelo próprio aparelho (só o cliente da vez pode enviar jogadas).

  let turnDeadline = 0, turnSeat = 0, turnInt = null, lastTickSec = 0;

  function resetTurnTimer(seat) {
    if (!inGame || Game.isOver()) { stopTurnTimer(); return; }
    turnSeat = seat;
    turnDeadline = Date.now() + TURN_MS;
    lastTickSec = 0;
    if (!turnInt) turnInt = setInterval(turnTick, 250);
    turnTick();
  }
  function bumpTurnTimer(ms) { if (turnDeadline) turnDeadline += ms; }
  function stopTurnTimer() {
    if (turnInt) { clearInterval(turnInt); turnInt = null; }
    turnDeadline = 0;
    hideTurnBadge();
  }

  function turnTick() {
    if (!inGame || Game.isOver()) { stopTurnTimer(); return; }
    const rem = turnDeadline - Date.now();
    if (rem <= 0) {
      hideTurnBadge();
      const mine = turnSeat === mySeatNum;
      turnDeadline = Date.now() + TURN_MS;   // evita disparo duplo; a jogada aplicada reinicia via onTurn
      if (mine) {
        const mv = Game.pickMove();
        if (mv) {
          toast(I18n.t('net.autoMove'));
          db.ref('games/' + roomId + '/moves').push({ t: mv[0], r: mv[1], c: mv[2], by: mySeatNum }).catch(() => {});
        }
      }
      return;
    }
    if (rem <= 10400) {
      const s = Math.ceil(rem / 1000);
      showTurnBadge(s);
      if (turnSeat === mySeatNum && s <= 5 && s !== lastTickSec) { lastTickSec = s; Sound.tick(); }
    } else hideTurnBadge();
  }

  function showTurnBadge(s) {
    const el = $('turnTimer');
    el.textContent = '⏰ ' + s + 's';
    el.classList.toggle('urgent', s <= 5);
    if (el.style.display === 'none') { el.style.display = ''; Game.refit(); }
  }
  function hideTurnBadge() {
    const el = $('turnTimer');
    if (el.style.display !== 'none') { el.style.display = 'none'; Game.refit(); }
  }

  // ================= DADO 3D DE ABERTURA (sorteio de quem começa) =================
  // (sons vêm do módulo compartilhado window.Sound — js/sound.js)

  // --- cubo: monta as 6 faces com as bolinhas ---
  (function buildDice() {
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const FACES = [[1, ''], [6, 'rotateY(180deg)'], [2, 'rotateY(90deg)'], [5, 'rotateY(-90deg)'], [3, 'rotateX(90deg)'], [4, 'rotateX(-90deg)']];
    const cube = $('diceCube');
    FACES.forEach(([v, rot]) => {
      const f = document.createElement('div');
      f.className = 'dice-face';
      f.style.transform = rot + ' translateZ(48px)';
      for (let i = 0; i < 9; i++) {
        const c = document.createElement('span');
        if (PIPS[v].indexOf(i) >= 0) c.className = 'pip';
        f.appendChild(c);
      }
      cube.appendChild(f);
    });
  })();

  // rotação que deixa cada valor de frente para o jogador
  const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
  const ordinal = pos => I18n.t('ord.' + pos);

  function showDiceIntro(value, pos) {
    const ov = $('diceOverlay'), cube = $('diceCube'), fly = $('diceFly'), res = $('diceResult');
    res.textContent = '';
    res.classList.remove('pop');
    ov.classList.add('show');
    bumpTurnTimer(4300);   // o relógio da 1ª jogada só vale depois do dado
    // posição inicial (longe, no alto) e giro final que revela o número sorteado
    fly.classList.remove('fly', 'land');
    cube.style.transition = 'none';
    cube.style.transform = 'rotateX(-30deg) rotateY(35deg)';
    void fly.offsetWidth;
    fly.classList.add('fly');
    const F = FACE_ROT[value] || [0, 0];
    requestAnimationFrame(() => requestAnimationFrame(() => {
      cube.style.transition = 'transform 2.2s cubic-bezier(.15,.72,.25,1)';
      cube.style.transform = 'rotateX(' + (F[0] + 1080) + 'deg) rotateY(' + (F[1] + 720) + 'deg)';
    }));
    Sound.roll();   // rufar de tambor enquanto o dado voa
    // pouso: quique + resultado
    setTimeout(() => {
      Sound.thud();
      fly.classList.add('land');
      res.innerHTML = I18n.t('dice.rolled', { v: value }) + ' ' +
        (pos === 1 ? I18n.t('dice.youStart') : I18n.t('dice.youNth', { n: ordinal(pos) }));
      res.classList.add('pop');
      Sound.tada(pos === 1);
    }, 2300);
    setTimeout(() => ov.classList.remove('show'), 4200);
  }
})();
