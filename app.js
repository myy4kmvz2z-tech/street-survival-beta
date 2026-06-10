const state = {
  me: {
    id: "me",
    name: "RED",
    hp: 100,
    points: 0,
    kills: 0,
    x: 48,
    y: 52,
    live: false,
    shieldUntil: 0,
    attackBoostUntil: 0
  },
  enemies: [
    { id: "p1", name: "A", hp: 100, x: 34, y: 42, live: false },
    { id: "p2", name: "B", hp: 100, x: 70, y: 58, live: true },
    { id: "p3", name: "C", hp: 100, x: 58, y: 26, live: false }
  ],
  shops: [
    { id: "burger", icon: "🍔", name: "ハンバーガー屋", effect: "HP +20", x: 18, y: 22, type: "heal" },
    { id: "cafe", icon: "☕", name: "カフェ", effect: "30秒バリア", x: 82, y: 30, type: "shield" },
    { id: "ramen", icon: "🍜", name: "ラーメン屋", effect: "吸収速度UP", x: 24, y: 78, type: "boost" },
    { id: "livehouse", icon: "🎵", name: "ライブ会場", effect: "レアポイント", x: 76, y: 78, type: "rare" }
  ],
  log: []
};

const $ = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// テスト用マップでは、9マップ単位をだいたい10m相当として扱う
const ATTACK_RANGE = 9;

function addLog(text) {
  const now = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.log.unshift(`[${now}] ${text}`);
  state.log = state.log.slice(0, 80);
}

function render() {
  state.me.name = $("playerName").value || "RED";
  $("hpText").textContent = `${Math.max(0, Math.round(state.me.hp))} / 100`;
  $("hpBar").style.width = `${clamp(state.me.hp, 0, 100)}%`;
  $("points").textContent = Math.round(state.me.points);
  $("kills").textContent = state.me.kills;
  $("shield").textContent = Date.now() < state.me.shieldUntil ? "ON" : "OFF";
  $("liveBadge").classList.toggle("hidden", !state.me.live);
  $("liveToggle").textContent = state.me.live ? "配信ブースト ON" : "配信ブースト OFF";

  renderMap();
  renderShops();
  renderPlayers();
  $("log").innerHTML = state.log.map(line => `<div>${line}</div>`).join("");
}

function renderMap() {
  const map = $("map");
  map.innerHTML = "";

  const range = document.createElement("div");
  range.className = "range";
  range.style.left = `${state.me.x}%`;
  range.style.top = `${state.me.y}%`;
  map.appendChild(range);

  const meDot = document.createElement("div");
  meDot.className = `dot you ${state.me.live ? "live-ring" : ""}`;
  meDot.style.left = `${state.me.x}%`;
  meDot.style.top = `${state.me.y}%`;
  meDot.textContent = "自";
  map.appendChild(meDot);

  state.enemies.forEach(p => {
    if (p.hp <= 0) return;
    const dot = document.createElement("div");
    dot.className = `dot enemy ${p.live ? "live-ring" : ""}`;
    dot.style.left = `${p.x}%`;
    dot.style.top = `${p.y}%`;
    dot.title = `${p.name} HP:${Math.round(p.hp)}`;
    dot.textContent = p.live ? "📹" : p.name;
    map.appendChild(dot);
  });

  state.shops.forEach(s => {
    const dot = document.createElement("div");
    dot.className = "dot shop";
    dot.style.left = `${s.x}%`;
    dot.style.top = `${s.y}%`;
    dot.title = `${s.name}: ${s.effect}`;
    dot.textContent = s.icon;
    map.appendChild(dot);
  });
}

function renderShops() {
  $("shops").innerHTML = state.shops.map(s => `
    <div class="item">
      <strong>${s.icon} ${s.name}</strong>
      <small>${s.effect}</small>
      <button onclick="checkIn('${s.id}')">QRチェックイン</button>
    </div>
  `).join("");
}

function renderPlayers() {
  const rows = [
    { ...state.me, name: `${state.me.name}（あなた）` },
    ...state.enemies
  ];
  $("players").innerHTML = rows.map(p => `
    <div class="item">
      <strong>${p.live ? "📹 " : ""}${p.name}</strong>
      <small>HP ${Math.max(0, Math.round(p.hp))} / 100</small>
    </div>
  `).join("");
}

function checkIn(shopId) {
  const shop = state.shops.find(s => s.id === shopId);
  if (!shop) return;

  if (shop.type === "heal") {
    state.me.hp = clamp(state.me.hp + 20, 0, 100);
    addLog(`${shop.name}でHPを20回復`);
  }

  if (shop.type === "shield") {
    state.me.shieldUntil = Date.now() + 30_000;
    addLog(`${shop.name}で30秒バリアを獲得`);
  }

  if (shop.type === "boost") {
    state.me.attackBoostUntil = Date.now() + 60_000;
    addLog(`${shop.name}で60秒吸収ブースト`);
  }

  if (shop.type === "rare") {
    state.me.points += 100;
    addLog(`${shop.name}でレアポイント +100`);
  }

  render();
}

function move(direction) {
  const step = 4;
  if (direction === "up") state.me.y -= step;
  if (direction === "down") state.me.y += step;
  if (direction === "left") state.me.x -= step;
  if (direction === "right") state.me.x += step;
  state.me.x = clamp(state.me.x, 2, 98);
  state.me.y = clamp(state.me.y, 2, 98);
  render();
}

function gameTick() {
  // 敵を少し動かす
  state.enemies.forEach(p => {
    if (p.hp <= 0) return;
    p.x = clamp(p.x + (Math.random() - 0.5) * 2.2, 4, 96);
    p.y = clamp(p.y + (Math.random() - 0.5) * 2.2, 4, 96);
  });

  // 近接吸収
  state.enemies.forEach(p => {
    if (p.hp <= 0 || state.me.hp <= 0) return;

    const d = distance(state.me, p);
    if (d <= ATTACK_RANGE) {
      let drain = 1;
      if (state.me.live) drain *= 1.10;
      if (Date.now() < state.me.attackBoostUntil) drain *= 1.15;

      p.hp -= drain;
      state.me.points += drain * (state.me.live ? 1.05 : 1);

      if (Date.now() >= state.me.shieldUntil) {
        state.me.hp -= 0.35;
      }

      if (p.hp <= 0) {
        state.me.kills += 1;
        state.me.points += 50;
        addLog(`${p.name}を撃破。ポイント +50`);
      }
    }
  });

  render();
}

function toggleLive() {
  state.me.live = !state.me.live;
  addLog(state.me.live ? "配信ブースト開始。LIVEマーク表示中" : "配信ブースト終了");
  render();
}

function reset() {
  state.me.hp = 100;
  state.me.points = 0;
  state.me.kills = 0;
  state.me.x = 48;
  state.me.y = 52;
  state.me.live = false;
  state.me.shieldUntil = 0;
  state.me.attackBoostUntil = 0;
  state.enemies = [
    { id: "p1", name: "A", hp: 100, x: 34, y: 42, live: false },
    { id: "p2", name: "B", hp: 100, x: 70, y: 58, live: true },
    { id: "p3", name: "C", hp: 100, x: 58, y: 26, live: false }
  ];
  state.log = [];
  addLog("ゲームをリセットしました");
  render();
}

document.querySelectorAll("[data-move]").forEach(btn => {
  btn.addEventListener("click", () => move(btn.dataset.move));
});

window.addEventListener("keydown", e => {
  if (e.key === "ArrowUp") move("up");
  if (e.key === "ArrowDown") move("down");
  if (e.key === "ArrowLeft") move("left");
  if (e.key === "ArrowRight") move("right");
});

$("liveToggle").addEventListener("click", toggleLive);
$("resetBtn").addEventListener("click", reset);

addLog("STREET SURVIVAL β 起動");
setInterval(gameTick, 1000);
render();
