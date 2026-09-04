// Configuração do Firebase para o modo online.
//
// COMO PREENCHER (uma vez só):
// 1. https://console.firebase.google.com → crie um projeto (Analytics pode ficar desativado).
// 2. Build → Authentication → Get started → Sign-in method → ative "Anonymous".
// 3. Build → Realtime Database → Create database → publique as regras de firebase.rules.json.
// 4. Configurações do projeto (⚙️) → "Seus apps" → ícone Web </> → registre o app
//    e copie o objeto firebaseConfig para cá. Confira se "databaseURL" está presente
//    (se não vier, copie a URL da tela do Realtime Database).
//
// Esses valores NÃO são segredos — a proteção está nas regras do banco.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDroLLpxnRGP5HnJhDH0EeG8x1tMMp2wDQ",
  authDomain: "pontinho-8f712.firebaseapp.com",
  databaseURL: "https://pontinho-8f712-default-rtdb.firebaseio.com",
  projectId: "pontinho-8f712",
  storageBucket: "pontinho-8f712.firebasestorage.app",
  messagingSenderId: "648705326172",
  appId: "1:648705326172:web:9c5c097784c09cca0a3a99"
};