# STREET SURVIVAL β8.0 Firebase Realtime

## 追加内容

運営画面と参加者画面を Firebase Realtime Database で連携する土台を追加しました。

運営画面で押した指令が、参加者画面へリアルタイム配信されます。

- 📻 RADIO
- 👹 BOSS
- 🎯 MISSION
- 🎵 LIVE
- 🛡 SAFE
- 🔥 FINAL
- 🏆 END

## 追加ファイル

- firebase-config.js

ここにFirebaseの設定を貼ります。

## 重要

最初は Firebase OFF の状態です。

`firebase-config.js` の中で、

```js
window.STREET_SURVIVAL_FIREBASE_ENABLED = false;
```

を

```js
window.STREET_SURVIVAL_FIREBASE_ENABLED = true;
```

に変更するとFirebase連携が有効になります。

その前に Firebase Console で取得した `firebaseConfig` の値を貼り替えてください。

## Firebaseで作るもの

Firebase Consoleで以下を作ります。

1. Project
2. Web App
3. Realtime Database
4. Rulesをテスト用に一時的に設定

テスト用Rules例：

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

※ 本番では必ず認証やパスワード保護が必要です。

## 参加者用

- index.html
- style.css
- app.js
- firebase-config.js

## 運営用

- admin.html
- style.css
- admin.js
- firebase-config.js

## 注意

GitHub Pagesだけでは全員同期はできません。
Firebase Realtime Databaseを使うことで、運営から参加者全員へリアルタイム配信できます。
