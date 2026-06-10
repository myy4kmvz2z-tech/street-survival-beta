
const DEFAULT_CENTER = { lat: 35.5008, lng: 137.5032 };

const CONFIG = {
  initialHp: 100,
  maxHp: 300,
  minHp: 10,
  drainPerSec: 1,
  chargePerTick: 2,
  chargeTickSec: 5,
  roleDurationSec: 60,
  battleRangeM: 7,
  hunterSenseM: 15,
  runnerAlertM: 30
};

const state = {
  me: {
    id: "me",
    name: "RED",
    hp: 100,
    points: 0,
    role: "runner",
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    roleEndsAt: Date.now() + 60000,
    zone: "FIELD"
  },
  npcs: [
    { id: "dai", name: "DAI", hp: 100, role: "hunter", lat: 35.50095, lng: 137.50325 },
    { id: "shinya", name: "SHINYA", hp: 100, role: "runner", lat: 35.50055, lng: 137.50285 },
    { id: "taro", name: "TARO", hp: 100, role: "runner", lat: 35.5011, lng: 137.50365 }
  ],
  zones: [
    { id: "onn", icon: "🎵", name: "お宿 Onn", effect: "LIVE SAFE / HP CHARGE", lat: 35.5008, lng: 137.5032, radius: 35 },
    { id: "coffee", icon: "☕", name: "喫茶店", effect: "+2HP / 5秒", lat: 35.50125, lng: 137.5020, radius: 25 },
    { id: "food", icon: "🍜", name: "飲食店", effect: "+2HP / 5秒", lat: 35.49975, lng: 137.5040, radius: 25 }
  ],
  log: [],
  map: null,
  meMarker: null,
  accuracyCircle: null,
  zoneLayers: [],
  npcMarkers: [],
  watchId: null,
  lastChargeAt: 0,
  lastDrainAt: 0,
  lastVibeAt: 0,
  lastAlertLevel: ""
};

const $ = id => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function addLog(text) {
  const now = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.log.unshift(`[${now}] ${text}`);
  state.log = state.log.slice(0, 80);
  render();
}

function meters(a, b) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

function alertVibration(level) {
  const now = Date.now();
  let interval = 999999;
  let pattern = 0;

  if (level === "hunterSense") {
    interval = 2000;
    pattern = 250;
  } else if (level === "runner30") {
    interval = 5000;
    pattern = 80;
  } else if (level === "runner20") {
    interval = 3000;
    pattern = 120;
  } else if (level === "runner10") {
    interval = 1200;
    pattern = 180;
  } else if (level === "contact") {
    interval = 700;
    pattern = [120, 80, 120];
  }

  if (pattern && now - state.lastVibeAt >= interval) {
    vibrate(pattern);
    state.lastVibeAt = now;
  }
}

function initMap() {
  state.map = L.map("map").setView([state.me.lat, state.me.lng], 17);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(state.map);
  state.meMarker = L.marker([state.me.lat, state.me.lng]).addTo(state.map).bindPopup("📍 あなた");
  state.accuracyCircle = L.circle([state.me.lat, state.me.lng], { radius: CONFIG.battleRangeM, color: "#f7c948" }).addTo(state.map);
  renderZones();
  renderNpcMarkers();
}

function renderZones() {
  state.zoneLayers.forEach(l => l.remove());
  state.zoneLayers = [];
  state.zones.forEach(z => {
    const c = L.circle([z.lat, z.lng], { radius: z.radius, color: "#59d68d", fillOpacity: .12 }).addTo(state.map);
    c.bindPopup(`<strong>${z.icon} ${z.name}</strong><br>${z.effect}`);
    state.zoneLayers.push(c);
    const m = L.marker([z.lat, z.lng]).addTo(state.map);
    m.bindPopup(`<strong>${z.icon} ${z.name}</strong><br>${z.effect}`);
    state.zoneLayers.push(m);
  });
}

function renderNpcMarkers() {
  state.npcMarkers.forEach(m => m.remove());
  state.npcMarkers = [];
  state.npcs.forEach(p => {
    const marker = L.marker([p.lat, p.lng]).addTo(state.map);
    marker.bindPopup(`${p.role === "hunter" ? "🟢" : "🔵"} ${p.name}<br>HP ${Math.round(p.hp)}`);
    state.npcMarkers.push(marker);
  });
}

function updateMePosition(lat, lng, accuracy = 10, moveMap = true) {
  state.me.lat = lat;
  state.me.lng = lng;
  if (state.meMarker) {
    state.meMarker.setLatLng([lat, lng]);
    state.meMarker.setPopupContent(`${state.me.role === "hunter" ? "🟢 HUNTER" : "🔵 RUNNER"}<br>HP ${Math.round(state.me.hp)}`);
  }
  if (state.accuracyCircle) {
    state.accuracyCircle.setLatLng([lat, lng]);
    state.accuracyCircle.setRadius(CONFIG.battleRangeM);
  }
  if (state.map && moveMap) state.map.setView([lat, lng], Math.max(state.map.getZoom(), 17));
  checkZone();
  render();
}

function startGps() {
  if (!navigator.geolocation) {
    $("gpsStatus").textContent = "このブラウザはGPSに対応していません。";
    return;
  }
  $("gpsStatus").textContent = "GPS取得中…位置情報を許可してください。";
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, accuracy } = pos.coords;
    updateMePosition(latitude, longitude, accuracy, true);
    $("gpsStatus").textContent = `GPS取得中：精度 約${Math.round(accuracy)}m`;
  }, err => {
    $("gpsStatus").textContent = `GPS取得失敗：${err.message}`;
    addLog(`GPS取得失敗：${err.message}`);
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
}

function checkZone() {
  let inZone = null;
  for (const z of state.zones) {
    if (meters(state.me, z) <= z.radius) { inZone = z; break; }
  }
  state.me.zone = inZone ? inZone.name : "FIELD";
  return inZone;
}

function setRole(role) {
  state.me.role = role;
  state.me.roleEndsAt = Date.now() + CONFIG.roleDurationSec * 1000;
  state.lastAlertLevel = "";
  addLog(role === "hunter" ? "🟢 あなたはHUNTERになりました" : "🔵 あなたはRUNNERになりました");
  render();
}

function roleSwap() {
  state.me.role = state.me.role === "hunter" ? "runner" : "hunter";
  state.me.roleEndsAt = Date.now() + CONFIG.roleDurationSec * 1000;
  state.lastAlertLevel = "";
  addLog("⏰ 1分経過。役割が交代しました");
}

function nearestByRole(role) {
  const targets = state.npcs.filter(p => p.role === role);
  if (!targets.length) return null;
  return targets.sort((a, b) => meters(state.me, a) - meters(state.me, b))[0];
}

function updateAlert(nearest, distance, zone) {
  const box = $("alertStatus");
  document.body.classList.remove("danger-flash");
  box.className = "alert-box";

  if (zone) {
    box.textContent = `🛡 ${zone.name}：SAFE / バイブ停止`;
    box.classList.add("safe");
    return;
  }

  if (state.me.role === "hunter") {
    if (nearest && distance <= CONFIG.hunterSenseM) {
      box.textContent = `📳 ランナーの気配あり：${distance.toFixed(1)}m以内`;
      box.classList.add("level2");
      alertVibration("hunterSense");
    } else {
      box.textContent = "🟢 ハンター：気配なし";
    }
    return;
  }

  if (state.me.role === "runner") {
    if (!nearest) {
      box.textContent = "🔵 ランナー：通常";
      return;
    }

    if (distance <= CONFIG.battleRangeM) {
      box.textContent = `⚔ 接触！HP吸収中：${distance.toFixed(1)}m`;
      box.classList.add("level3");
      document.body.classList.add("danger-flash");
      alertVibration("contact");
    } else if (distance <= 10) {
      box.textContent = `🚨 危険！ハンター接近：${distance.toFixed(1)}m`;
      box.classList.add("level3");
      document.body.classList.add("danger-flash");
      alertVibration("runner10");
    } else if (distance <= 20) {
      box.textContent = `⚠ ハンター接近：${Math.round(distance)}m`;
      box.classList.add("level2");
      alertVibration("runner20");
    } else if (distance <= 30) {
      box.textContent = `👀 気配を感じる：${Math.round(distance)}m`;
      box.classList.add("level1");
      alertVibration("runner30");
    } else {
      box.textContent = "🔵 ランナー：通常";
    }
  }
}

function gameTick() {
  const now = Date.now();
  if (now >= state.me.roleEndsAt) roleSwap();

  state.npcs.forEach(p => {
    p.lat += (Math.random() - .5) * 0.00006;
    p.lng += (Math.random() - .5) * 0.00006;
  });
  renderNpcMarkers();

  const zone = checkZone();

  if (zone) {
    $("battleStatus").textContent = `🛡 ${zone.name}：HP CHARGE中 / 戦闘停止`;
    updateAlert(null, 999, zone);
    if (now - state.lastChargeAt >= CONFIG.chargeTickSec * 1000) {
      const before = state.me.hp;
      state.me.hp = clamp(state.me.hp + CONFIG.chargePerTick, CONFIG.minHp, CONFIG.maxHp);
      state.lastChargeAt = now;
      if (state.me.hp > before) addLog(`❤️ ${zone.name}でHP +${CONFIG.chargePerTick}`);
    }
    render();
    return;
  }

  const targetRole = state.me.role === "hunter" ? "runner" : "hunter";
  const nearest = nearestByRole(targetRole);
  const d = nearest ? meters(state.me, nearest) : 999;

  updateAlert(nearest, d, null);

  if (nearest && d <= CONFIG.battleRangeM) {
    if (now - state.lastDrainAt >= 1000) {
      state.lastDrainAt = now;
      if (state.me.role === "hunter") {
        nearest.hp = clamp(nearest.hp - CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        state.me.hp = clamp(state.me.hp + CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        state.me.points += 1;
        $("battleStatus").textContent = `⚔ ${nearest.name}からHP吸収中！距離 ${d.toFixed(1)}m`;
      } else {
        state.me.hp = clamp(state.me.hp - CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        nearest.hp = clamp(nearest.hp + CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        $("battleStatus").textContent = `⚠ ${nearest.name}にHPを吸収されています！距離 ${d.toFixed(1)}m`;
      }
    }
  } else if (nearest) {
    $("battleStatus").textContent = `通常エリア：最寄り ${nearest.name} ${Math.round(d)}m`;
  }

  render();
}

function render() {
  if (!$("hpText")) return;
  state.me.name = $("playerName")?.value || "RED";
  $("hpText").textContent = `${Math.round(state.me.hp)} / ${CONFIG.maxHp}`;
  $("hpBar").style.width = `${(state.me.hp / CONFIG.maxHp) * 100}%`;
  $("points").textContent = Math.round(state.me.points);
  $("roleTimer").textContent = Math.max(0, Math.ceil((state.me.roleEndsAt - Date.now()) / 1000));
  $("zoneState").textContent = state.me.zone === "FIELD" ? "FIELD" : "SAFE";
  const badge = $("roleBadge");
  badge.textContent = state.me.role === "hunter" ? "HUNTER" : "RUNNER";
  badge.className = `badge ${state.me.role === "hunter" ? "hunter" : "runner"}`;
  $("roleBtn").textContent = state.me.role === "hunter" ? "🔵 ランナーにする" : "🟢 ハンターにする";
  renderShops();
  renderPlayers();
  $("log").innerHTML = state.log.map(line => `<div>${line}</div>`).join("");
}

function renderShops() {
  $("shops").innerHTML = state.zones.map(z => `<div class="item"><strong>${z.icon} ${z.name}</strong><small>${z.effect}</small><br><small>半径 ${z.radius}m / チャージ ${CONFIG.chargePerTick}HP/${CONFIG.chargeTickSec}秒</small></div>`).join("");
}

function renderPlayers() {
  const rows = [
    `<div class="item"><strong>${state.me.role === "hunter" ? "🟢" : "🔵"} ${state.me.name}（あなた）</strong><small>HP ${Math.round(state.me.hp)} / ${CONFIG.maxHp}</small><br><small>${state.me.zone}</small></div>`
  ].concat(state.npcs.map(p => `<div class="item"><strong>${p.role === "hunter" ? "🟢" : "🔵"} ${p.name}</strong><small>HP ${Math.round(p.hp)} / ${CONFIG.maxHp}</small><br><small>距離 ${Math.round(meters(state.me, p))}m</small></div>`));
  $("players").innerHTML = rows.join("");
}

function move(direction) {
  const step = .00018;
  let lat = state.me.lat, lng = state.me.lng;
  if (direction === "up") lat += step;
  if (direction === "down") lat -= step;
  if (direction === "left") lng -= step;
  if (direction === "right") lng += step;
  updateMePosition(lat, lng, 10, true);
  addLog(`テスト移動：${direction}`);
}

function reset() {
  state.me.hp = CONFIG.initialHp;
  state.me.points = 0;
  state.me.role = "runner";
  state.me.roleEndsAt = Date.now() + CONFIG.roleDurationSec * 1000;
  state.me.lat = DEFAULT_CENTER.lat;
  state.me.lng = DEFAULT_CENTER.lng;
  state.log = [];
  state.lastVibeAt = 0;
  updateMePosition(state.me.lat, state.me.lng, 10, true);
  addLog("ゲームをリセットしました");
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();

  document.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => move(btn.dataset.move)));

  window.addEventListener("keydown", e => {
    if (e.key === "ArrowUp") move("up");
    if (e.key === "ArrowDown") move("down");
    if (e.key === "ArrowLeft") move("left");
    if (e.key === "ArrowRight") move("right");
  });

  $("gpsBtn").addEventListener("click", startGps);
  $("resetBtn").addEventListener("click", reset);
  $("roleBtn").addEventListener("click", () => setRole(state.me.role === "hunter" ? "runner" : "hunter"));
  $("vibeBtn").addEventListener("click", () => {
    vibrate([120, 80, 120]);
    addLog("📳 バイブテスト");
  });

  addLog("STREET SURVIVAL β0.4 起動");
  render();
  setInterval(gameTick, 1000);
});
