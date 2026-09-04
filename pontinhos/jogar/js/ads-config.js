// Configuração do AdMob — mesma ideia do firebase-config.js: valores públicos,
// preenchidos uma vez. Ver MONETIZACAO.md para a estratégia completa.
//
// COMO PREENCHER (uma vez só):
// 1. https://admob.google.com → Apps → Adicionar app → Android → com.vanecaetano.pontinhos
// 2. Nas configurações do app, marque-o como VOLTADO A CRIANÇAS (child-directed / COPPA)
//    e classificação de conteúdo "G". Isso é obrigatório: o Pontinhos é para 8–12 anos.
// 3. Crie 3 blocos de anúncio (banner, intersticial, premiado) e copie os IDs para cá.
// 4. Copie também o "ID do app" (formato ca-app-pub-XXXX~YYYY) para `appId` — ele vai
//    para o AndroidManifest.xml via scripts/patch-android-ads.sh. Sem ele o app QUEBRA.
// 5. Só então mude `testing` para false.
//
// ⚠️ NUNCA clique nos seus próprios anúncios reais — o Google bane a conta.
//    Enquanto `testing` for true, o app usa os IDs de teste oficiais do Google abaixo.
window.ADMOB_CONFIG = {
  // true = usa os IDs de teste do Google (seguro para desenvolver e testar no aparelho).
  // ⚠️ Em PRODUÇÃO tem de ser false, senão o app mostra anúncio de teste e não rende nada.
  testing: false,

  // IDs REAIS (conta ca-app-pub-2648425065374397).
  appId:        'ca-app-pub-2648425065374397~3311434868',
  banner:       'ca-app-pub-2648425065374397/9489950543',
  interstitial: 'ca-app-pub-2648425065374397/4768941052',
  rewarded:     'ca-app-pub-2648425065374397/3076465299'

  // IDs de TESTE do Google — funcionam sem nenhuma conta configurada. Para voltar a
  // desenvolver, troque os quatro valores acima por estes e ponha `testing: true`:
  // appId:        'ca-app-pub-3940256099942544~3347511713',
  // banner:       'ca-app-pub-3940256099942544/6300978111',
  // interstitial: 'ca-app-pub-3940256099942544/1033173712',
  // rewarded:     'ca-app-pub-3940256099942544/5224354917'
};
