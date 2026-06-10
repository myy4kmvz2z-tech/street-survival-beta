# STREET SURVIVAL β7.0 PLAYER / ADMIN Split

## コンセプト

参加者はゲームを楽しむ。運営は街を演出する。

## PLAYER画面 `index.html`

- 参加者画面から運営モードを削除
- GPS / ACTION / MENU のみ
- 詳細・ログはMENU内
- 参加者が誤ってBOSSやFINALを押すことを防止

## ADMIN画面 `admin.html`

- 運営専用画面を追加
- ワンタップ発令
  - 🌆 NORMAL
  - ⚠ ALERT
  - 👹 BOSS
  - 🎯 MISSION
  - 🎵 LIVE
  - 🛡 SAFE
  - 🔥 FINAL
  - 🏆 END
- 手動RADIO送信
- 街ステータス表示
- 運営ログ表示

## 重要

現在のβ7.0では、`admin.html` から `index.html` への連携は
同じ端末・同じブラウザ内のデモ用です。

参加者全員へリアルタイム配信する本番仕様には、
Firebaseなどのサーバー連携が必要です。

## 使い方

- 参加者：`index.html`
- 運営：`admin.html`

## 更新方法

GitHubのトップに以下6ファイルをアップロードしてください。

- index.html
- admin.html
- style.css
- app.js
- admin.js
- README.md
