# STREET SURVIVAL β6.0 Effects HUD

## コンセプト

iPhoneでバイブが使えなくても、光る・揺れる・鳴るで状況が伝わる版。

## 追加したもの

- 🔊 効果音システム
  - SAFE：高めのピロン音
  - LIVE：明るい通知音
  - BOSS：低い警告音
  - FINAL：重い警告音
  - MISSION：黄色系の通知音
- ✨ 画面フラッシュ
  - SAFE：緑
  - BOSS：赤
  - FINAL：強い赤
  - MISSION：黄色
- 📡 レーダー波紋エフェクト
- ❤️ HP回復時の音と +2 演出
- 🔊 FXボタン追加
- 📳 バイブテストを「演出テスト」に変更

## 注意

iPhone Safariでは `navigator.vibrate()` が基本的に動かないため、
β6.0ではバイブに依存せず、画面演出と効果音で知らせる設計に変更しています。

## 更新方法

GitHubのトップに以下4ファイルを上書きしてください。

- index.html
- style.css
- app.js
- README.md
