# STREET SURVIVAL β10.2 Push Once Fix

## 修正内容

プッシュ通知がずっと来る問題を修正しました。

## 原因

Firebaseの `currentCommand` が残っているため、
ページ更新・再接続・Firebase再読込のたびに同じ命令を再通知していました。

## 修正

- 同じ command id は1回だけ通知
- 10分以上古い命令は通知しない
- 通知済みidを localStorage に保存
- Firebase / BOSS / LIVE / RADIO / SAFE / GPS は維持

## アップロードするファイル

`street-survival-beta` に以下を上書きしてください。

- index.html
- app.js
- style.css
- sw.js
- manifest.webmanifest
- icon-192.png
- icon-512.png

`firebase-config.js` は今動いているものを残してOKです。

## 開くURL

https://myy4kmvz2z-tech.github.io/street-survival-beta/?v=102
