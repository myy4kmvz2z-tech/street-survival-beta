# STREET SURVIVAL β10.0 Cleanup / 六斎市実戦軽量版

β9.1 Ultimate Pushをベースに、7/5(日) 六斎市の実戦運用向けに軽量化した版です。

## 残した機能

- Firebaseリアルタイム受信
- プッシュ通知許可
- BOSS / LIVE / RADIO / ALERT / SAFE / FINAL
- HPシステム
- GPS / RADAR
- ログ表示
- Service Worker / PWA

## 軽量化内容

- ログ表示を最新30件中心に整理
- 古い演出DOMを自動整理
- render処理を軽量化
- localStorageポーリングを少し低頻度化
- デバッグ表示を整理
- 六斎市実戦用の軽量表示を追加

## アップロードするファイル

`street-survival-beta` に以下を上書きしてください。

- index.html
- app.js
- style.css
- sw.js
- manifest.webmanifest
- icon-192.png
- icon-512.png

`firebase-config.js` は今動いているものを残してください。

## 開くURL

https://myy4kmvz2z-tech.github.io/street-survival-beta/?v=100
