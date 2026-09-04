// Anúncios do Pontinhos (AdMob) — fachada única `window.Ads`.
// Estratégia, limites e regras de compliance: ver MONETIZACAO.md na raiz do repo.
//
// Só funciona no app nativo (Capacitor + @capacitor-community/admob). No navegador/PWA
// tudo vira no-op silencioso, então dá para desenvolver e testar o jogo sem AdMob nenhum.
//
// Público infantil (8–12): o SDK é inicializado em modo "voltado a crianças", com conteúdo
// só de classificação G, e TODA requisição vai com `npa` (anúncios não personalizados).
// (`tagForChildDirectedTreatment` e `maxAdContentRating` chegam ao lado nativo do plugin
// mesmo não aparecendo nos tipos TypeScript dele — ver AdMob.java, setRequestConfiguration.)
(function () {
  'use strict';

  const CFG = window.ADMOB_CONFIG || {};
  const plugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const ON = !!(plugin && isNative && CFG.banner);

  // ---- telas que ganham banner (hoje todas; ver MONETIZACAO.md §3.2) ----
  // O banner é nativo e fica no rodapé da tela, fora do layout da WebView; quem reserva o
  // espaço é a classe `.has-ad` + a var `--ad-h` no CSS, então ele nunca cobre o tabuleiro.
  const BANNER_SCREENS = ['scr-menu', 'scr-setup', 'scr-game', 'scr-lobby', 'scr-room'];

  // ---- limites do intersticial (ver MONETIZACAO.md §3.1) ----
  const MIN_GAP_MS = 3 * 60 * 1000;   // nunca dois anúncios a menos de 3 min
  const GAMES_PER_AD = 2;             // no máximo 1 a cada 2 partidas concluídas

  const opts = extra => Object.assign({ isTesting: !!CFG.testing, npa: true }, extra);

  // ---- estado ----
  let sessionGames = 0;      // partidas concluídas nesta sessão (a 1ª nunca dá anúncio)
  let bannerOn = false;
  let interReady = false;
  let rewardReady = false;
  let started = false;   // init() já foi disparado
  let ready = false;     // o SDK terminou de inicializar (só então dá para pedir anúncio)
  const appEl = document.querySelector('.app');

  function loadState() {
    try { return JSON.parse(localStorage.getItem('pt_ads') || '{}'); } catch (e) { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem('pt_ads', JSON.stringify(s)); } catch (e) {}
  }
  let st = loadState();
  if (typeof st.gamesSinceAd !== 'number') st.gamesSinceAd = 0;
  if (typeof st.lastAdAt !== 'number') st.lastAdAt = 0;

  // ================= inicialização =================

  async function init() {
    if (!ON || started) return;
    started = true;
    try {
      await plugin.initialize({
        initializeForTesting: !!CFG.testing,
        tagForChildDirectedTreatment: true,   // app para crianças (COPPA)
        maxAdContentRating: 'General'         // só conteúdo classificação G
      });
    } catch (e) { started = false; return; }
    ready = true;

    // o banner adaptativo avisa a altura real dele; reservamos esse espaço no layout
    listen('bannerAdSizeChanged', ev => {
      const h = (ev && (ev.height != null ? ev.height : (ev.size && ev.size.height))) || 0;
      if (h > 0) appEl.style.setProperty('--ad-h', h + 'px');
      if (window.Game && Game.refit) Game.refit();
    });
    // ⚠️ O plugin DESTRÓI o banner quando um carregamento falha (BannerExecutor.java,
    // onAdFailedToLoad: removeView + mAdView.destroy() + mAdView = null). Como o banner
    // se atualiza sozinho de tempos em tempos, UMA falha de refresh apaga o banner pelo
    // resto da sessão — e falha é comum aqui, porque `npa` + público infantil estreitam
    // muito o leilão. Por isso pedimos de novo, com espera crescente.
    listen('bannerAdFailedToLoad', () => { markBanner(false); retryBanner(); });
    listen('bannerAdLoaded', () => { retryDelay = RETRY_MIN; markBanner(true); });

    listen('interstitialAdDismissed', () => { interReady = false; prepareInterstitial(); });
    listen('interstitialAdFailedToShow', () => { interReady = false; prepareInterstitial(); });

    prepareInterstitial();
    prepareReward();
    // A tela inicial já vem com .active no HTML e nunca passa pelo show(), então
    // setScreen() ainda não rodou e bannerOn estava false — sem isto o init() caía no
    // ramo do hideBanner e o banner só aparecia na 1ª navegação.
    bannerOn = BANNER_SCREENS.indexOf(currentScreen()) >= 0;
    applyBanner();
  }

  // ⚠️ Rotulagem exigida pelo programa Famílias: o banner nunca pode aparecer sem a palavra
  // "Anúncio" acima dele (foi "Unclear ads/offers" que reprovou o versionCode 7). Por isso
  // ninguém mexe em `has-ad` direto: classe e rótulo ligam e desligam pela mesma função.
  const adLabel = () => document.getElementById('adSlotLabel');
  function markBanner(on) {
    appEl.classList.toggle('has-ad', !!on);
    const el = adLabel();
    if (el) el.hidden = !on;
  }

  const currentScreen = () => {
    const el = document.querySelector('.scr.active');
    return el ? el.id : 'scr-menu';
  };

  function listen(ev, fn) { try { plugin.addListener(ev, fn); } catch (e) {} }

  // ================= banner =================

  // Espera antes de tentar de novo depois que o plugin destrói o banner. Começa curta
  // (o caso comum é uma falha isolada de refresh) e dobra, para não martelar o AdMob
  // quando simplesmente não há anúncio para entregar.
  const RETRY_MIN = 15 * 1000, RETRY_MAX = 5 * 60 * 1000;
  let retryDelay = RETRY_MIN, retryT = null;

  function retryBanner() {
    if (!bannerOn || retryT) return;
    retryT = setTimeout(() => {
      retryT = null;
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX);
      if (bannerOn) applyBanner();
    }, retryDelay);
  }

  // A AdView é nativa e vive fora da WebView: o plugin nunca consulta WindowInsets, então
  // no edge-to-edge (obrigatório a partir do Android 15) ela cola no fundo físico da tela,
  // embaixo da barra de navegação. Medimos a mesma inset que a WebView já recebe do sistema
  // (a `.app.has-ad` já soma ela ao espaço reservado) e mandamos como `margin` — é o mesmo
  // valor, então o banner termina bem onde a página deixou de espaço para ele.
  let safeAreaProbe = null;
  function safeAreaBottomDp() {
    if (!safeAreaProbe) {
      safeAreaProbe = document.createElement('div');
      safeAreaProbe.style.cssText =
        'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-bottom:env(safe-area-inset-bottom);';
      document.body.appendChild(safeAreaProbe);
    }
    return Math.round(parseFloat(getComputedStyle(safeAreaProbe).paddingBottom)) || 0;
  }

  async function applyBanner() {
    if (!ON || !ready) return;   // ainda inicializando: init() reaplica no fim
    if (bannerOn) {
      try {
        // ⚠️ O plugin só lê `margin` quando CRIA a AdView (mAdView == null): uma vez criada,
        // showBanner() de novo só refaz o loadAd e NÃO reaplica margem. Por isso a inset
        // precisa estar certa desde a 1ª criação — o que já é garantido pelo próprio fluxo de
        // retry (onAdFailedToLoad destrói a AdView, e a próxima showBanner() cria de novo).
        await plugin.showBanner(opts({
          adId: CFG.banner,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: safeAreaBottomDp()
        }));
        markBanner(true);
      } catch (e) { markBanner(false); retryBanner(); }
    } else {
      markBanner(false);
      // removeBanner, não hideBanner: o hide só põe a view em GONE e mantém o mAdView,
      // e aí um showBanner posterior cai no updateExistingAdView e NUNCA volta a
      // visibilidade — o banner ficaria invisível para sempre.
      try { await plugin.removeBanner(); } catch (e) {}
    }
    if (window.Game && Game.refit) Game.refit();
  }

  // chamado pelo show() do game.js a cada troca de tela
  function setScreen(id) {
    const want = BANNER_SCREENS.indexOf(id) >= 0;
    if (!want && !bannerOn) return;
    bannerOn = want;
    // Reafirma sempre, sem consultar `has-ad`: essa classe é sinal NOSSO e não reflete o
    // estado nativo — o plugin pode ter destruído o banner sem a gente saber.
    applyBanner();
  }

  // ================= intersticial =================

  async function prepareInterstitial() {
    if (!ON || !ready || interReady) return;
    try { await plugin.prepareInterstitial(opts({ adId: CFG.interstitial })); interReady = true; }
    catch (e) { interReady = false; }
  }

  // Uma partida terminou de verdade (não conta desistência).
  function noteGameEnd() {
    sessionGames++;
    st.gamesSinceAd++;
    saveState(st);
  }

  function canShowInterstitial() {
    if (!ON || !interReady) return false;
    if (sessionGames < 2) return false;                       // a 1ª partida da sessão é sagrada
    if (st.gamesSinceAd < GAMES_PER_AD) return false;
    if (Date.now() - st.lastAdAt < MIN_GAP_MS) return false;
    return true;
  }

  // Chamado nos botões do overlay de vitória. A ação do botão acontece IMEDIATAMENTE e o
  // anúncio sobe por cima — assim o jogo nunca fica preso esperando um anúncio que não veio.
  function afterGame(action) {
    if (typeof action === 'function') action();
    if (!canShowInterstitial()) return;
    st.gamesSinceAd = 0; st.lastAdAt = Date.now(); saveState(st);
    interReady = false;
    plugin.showInterstitial().catch(() => { prepareInterstitial(); });
  }

  // ================= premiado (rewarded) =================

  async function prepareReward() {
    if (!ON || !ready || rewardReady) return;
    try { await plugin.prepareRewardVideoAd(opts({ adId: CFG.rewarded })); rewardReady = true; }
    catch (e) { rewardReady = false; }
  }

  // Vídeo premiado é SEMPRE opcional e com aviso antes (regra "Voltado para famílias").
  // `onReward` só roda se o Google confirmar que o vídeo foi assistido até o fim.
  function offerReward(o, onReward) {
    if (!ON) return;
    confirmModal(o.title, o.text, async () => {
      if (!rewardReady) await prepareReward();
      if (!rewardReady) { toast(I18n.t('ads.noVideo')); return; }

      // Atenção: `showRewardVideoAd()` só resolve quando a recompensa é ganha — se a criança
      // fechar o vídeo antes do fim, a promessa fica pendurada para sempre. Por isso corremos
      // contra o evento de "fechou", senão o premiado nunca mais seria recarregado.
      let got = false, offDismiss = null;
      const offReward = listenOnce('onRewardedVideoAdReward', () => { got = true; });
      const dismissed = new Promise(res => { offDismiss = listenOnce('onRewardedVideoAdDismissed', res); });

      rewardReady = false;
      let quemGanhou = null;
      try {
        quemGanhou = await Promise.race([
          plugin.showRewardVideoAd().then(() => 'premiado'),
          dismissed.then(() => 'fechou')
        ]);
      } catch (e) { /* não deu para mostrar — cai no aviso abaixo */ }
      if (offReward) offReward();
      if (offDismiss) offDismiss();

      // as duas pistas de que a recompensa foi ganha (o evento e a resolução da promessa)
      if (got || quemGanhou === 'premiado') onReward();
      else toast(I18n.t('ads.notFinished'));
      prepareReward();
    });
  }

  function listenOnce(ev, fn) {
    let h = null;
    try { h = plugin.addListener(ev, fn); } catch (e) { return null; }
    return () => { try { Promise.resolve(h).then(x => x && x.remove && x.remove()); } catch (e) {} };
  }

  // ================= UI auxiliar (modal de confirmação + toast) =================

  function confirmModal(title, text, onYes) {
    const m = document.getElementById('adModal');
    document.getElementById('adModalTitle').textContent = title;
    document.getElementById('adModalText').textContent = text;
    const go = document.getElementById('adGo'), no = document.getElementById('adNo');
    const close = () => { m.classList.remove('show'); go.onclick = null; no.onclick = null; };
    go.onclick = () => { close(); onYes(); };
    no.onclick = close;
    m.classList.add('show');
  }

  let toastT = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ================= API =================

  window.Ads = {
    // true = dá para oferecer vídeo premiado / mostrar anúncios (só no app nativo)
    available: () => ON,
    setScreen,
    noteGameEnd,
    afterGame,
    offerReward,
    toast
  };

  window.addEventListener('load', init);
  // Voltar do segundo plano é outra hora em que o banner pode ter morrido sem ninguém
  // avisar (mesma causa: um refresh que falhou enquanto o app estava fora de vista).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && bannerOn) applyBanner(); });
})();
