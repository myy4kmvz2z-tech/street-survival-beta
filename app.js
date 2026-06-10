
const DEFAULT_CENTER = { lat: 35.5008, lng: 137.5032 };

const CONFIG = {
  eventDurationSec: 21600,
  initialHp: 100,
  maxHp: 300,
  minHp: 0,
  drainPerSec: 1,
  chargePerTick: 2,
  chargeTickSec: 5,
  hunterMaxSec: 600,
  invincibleSec: 5,
  battleRangeM: 7,
  hunterSenseM: 15
};

const state = {
  eventStartAt: Date.now(),
  participantCount: 18,
  bossActive: false,
  missionActive: false,
  mapMode: "real",
  me: {
    id: "me", name: "RED", hp: 100, points: 0, role: "runner",
    lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng,
    hunterEndsAt: null, invincibleUntil: 0, zone: "FIELD"
  },
  npcs: [
    { id: "dai", name: "DAI", hp: 100, role: "hunter", lat: 35.50095, lng: 137.50325, hunterEndsAt: Date.now() + 600000 },
    { id: "shinya", name: "SHINYA", hp: 100, role: "runner", lat: 35.50055, lng: 137.50285, hunterEndsAt: null },
    { id: "taro", name: "TARO", hp: 100, role: "runner", lat: 35.5011, lng: 137.50365, hunterEndsAt: null }
  ],
  zones: [
    { id: "onn", icon: "🎵", name: "お宿 Onn", effect: "LIVE SAFE / HP CHARGE", lat: 35.5008, lng: 137.5032, radius: 35 },
    { id: "coffee", icon: "☕", name: "喫茶店", effect: "+2HP / 5秒", lat: 35.50125, lng: 137.5020, radius: 25 },
    { id: "food", icon: "🍜", name: "飲食店", effect: "+2HP / 5秒", lat: 35.49975, lng: 137.5040, radius: 25 }
  ],
  log: [], map: null, meMarker: null, accuracyCircle: null, zoneLayers: [], npcMarkers: [], watchId: null,
  lastChargeAt: 0, lastDrainAt: 0, lastVibeAt: 0
};

const $ = id => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function addLog(text) {
  const now = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.log.unshift(`[${now}] ${text}`);
  state.log = state.log.slice(0, 80);
  render();
}

function setRadio(text) {
  $("radioText").textContent = text;
  addLog("📻 " + text);
}

function meters(a, b) {
  const R = 6371000;
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
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
  let interval = 999999, pattern = 0;
  if (level === "hunterSense") { interval = 2000; pattern = 250; }
  else if (level === "runner30") { interval = 5000; pattern = 80; }
  else if (level === "runner20") { interval = 3000; pattern = 120; }
  else if (level === "runner10") { interval = 1200; pattern = 180; }
  else if (level === "contact") { interval = 700; pattern = [120, 80, 120]; }
  if (pattern && now - state.lastVibeAt >= interval) {
    vibrate(pattern);
    state.lastVibeAt = now;
  }
}

function updateBigStatus(type, title, text) {
  const el = $("bigStatus");
  el.className = "big-status " + type;
  el.innerHTML = `<strong>${title}</strong><span>${text}</span>`;
}

function initMap() {
  state.map = L.map("realMap").setView([state.me.lat, state.me.lng], 17);
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
  state.me.lat = lat; state.me.lng = lng;
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
  state.me.hunterEndsAt = role === "hunter" ? Date.now() + CONFIG.hunterMaxSec * 1000 : null;
  state.me.invincibleUntil = Date.now() + CONFIG.invincibleSec * 1000;
  addLog(role === "hunter" ? "🟢 あなたはHUNTERになりました" : "🔵 あなたはRUNNERになりました");
  setRadio(role === "hunter" ? "ハンター誕生。街の気配を読め。" : "ランナー復帰。SAFE ZONEと街ミッションを活用せよ。");
  render();
}

function swapRolesWith(target) {
  const oldRole = state.me.role;
  state.me.role = target.role;
  target.role = oldRole;
  state.me.hp = CONFIG.initialHp;
  target.hp = CONFIG.initialHp;
  state.me.hunterEndsAt = state.me.role === "hunter" ? Date.now() + CONFIG.hunterMaxSec * 1000 : null;
  target.hunterEndsAt = target.role === "hunter" ? Date.now() + CONFIG.hunterMaxSec * 1000 : null;
  state.me.invincibleUntil = Date.now() + CONFIG.invincibleSec * 1000;
  addLog("🔄 HP0。役割交代！");
  setRadio("役割交代発生！捕まった者が、次は追う側へ。");
  vibrate([200, 80, 200]);
}

function hunterTimeout() {
  if (state.me.role === "hunter" && state.me.hunterEndsAt && Date.now() >= state.me.hunterEndsAt) {
    state.me.role = "runner";
    state.me.hunterEndsAt = null;
    state.me.invincibleUntil = Date.now() + CONFIG.invincibleSec * 1000;
    addLog("⏰ ハンター10分終了。ランナーに戻りました");
    setRadio("ハンター10分終了。ランナーへ復帰。");
  }
}

function nearestByRole(role) {
  const targets = state.npcs.filter(p => p.role === role);
  if (!targets.length) return null;
  return targets.sort((a, b) => meters(state.me, a) - meters(state.me, b))[0];
}

function updateGameMap(alertLevel) {
  const gameMap = $("gameMap");
  const ring = $("dangerRing");
  gameMap.classList.toggle("alert", ["runner10", "contact", "hunterSense"].includes(alertLevel));
  ring.classList.toggle("hidden", !["runner10", "contact", "hunterSense"].includes(alertLevel));
  $("playerIcon").textContent = state.me.role === "hunter" ? "🟢" : "🔵";
  $("bossIcon").classList.toggle("hidden", !state.bossActive);
  $("missionIcon").classList.toggle("hidden", !state.missionActive);
}

function isInvincible() {
  return Date.now() < state.me.invincibleUntil;
}

function updateAlert(nearest, distance, zone) {
  const box = $("alertStatus");
  document.body.classList.remove("danger-flash");
  box.className = "alert-box";
  let level = "none";

  if (zone) {
    box.textContent = `🛡 ${zone.name}：SAFE / バイブ停止`;
    box.classList.add("safe");
    updateBigStatus("safe-status", "🛡 SAFE", `${zone.name}でHPチャージ中`);
    updateGameMap("safe");
    return;
  }

  if (isInvincible()) {
    const s = Math.ceil((state.me.invincibleUntil-Date.now())/1000);
    box.textContent = `🛡 無敵中：${s}秒`;
    box.classList.add("safe");
    updateBigStatus("safe-status", "🛡 INVINCIBLE", `無敵中 ${s}秒`);
    updateGameMap("safe");
    return;
  }

  if (state.bossActive) {
    updateBigStatus("boss-status", "👹 BOSS ACTIVE", "街にレイドボス出現中");
  } else if (state.missionActive) {
    updateBigStatus("mission-status", "🎯 MISSION", "本町へ向かえ！");
  }

  if (state.me.role === "hunter") {
    if (nearest && distance <= CONFIG.hunterSenseM) {
      box.textContent = `📳 ランナーの気配あり：${distance.toFixed(1)}m以内`;
      box.classList.add("level2");
      updateBigStatus("hunter-status", "🟢 HUNTER", `📳 気配あり ${distance.toFixed(1)}m`);
      alertVibration("hunterSense");
      level = "hunterSense";
    } else {
      box.textContent = "🟢 ハンター：気配なし";
      if (!state.bossActive && !state.missionActive) updateBigStatus("hunter-status", "🟢 HUNTER", "気配なし。街を読め。");
    }
    updateGameMap(level);
    return;
  }

  if (!nearest) {
    box.textContent = "🔵 ランナー：通常";
    if (!state.bossActive && !state.missionActive) updateBigStatus("runner-status", "🔵 RUNNER", "気配なし。街を読め。");
    updateGameMap(level);
    return;
  }

  if (distance <= CONFIG.battleRangeM) {
    box.textContent = `⚔ 接触！HP吸収中：${distance.toFixed(1)}m`;
    box.classList.add("level3");
    document.body.classList.add("danger-flash");
    updateBigStatus("battle-status", "⚔ BATTLE", `HP吸収中 ${distance.toFixed(1)}m`);
    alertVibration("contact");
    level = "contact";
  } else if (distance <= 10) {
    box.textContent = `🚨 危険！ハンター接近：${distance.toFixed(1)}m`;
    box.classList.add("level3");
    document.body.classList.add("danger-flash");
    updateBigStatus("battle-status", "🚨 DANGER", `ハンター接近 ${distance.toFixed(1)}m`);
    alertVibration("runner10");
    level = "runner10";
  } else if (distance <= 20) {
    box.textContent = `⚠ ハンター接近：${Math.round(distance)}m`;
    box.classList.add("level2");
    updateBigStatus("runner-status", "⚠ ALERT", `ハンター接近 ${Math.round(distance)}m`);
    alertVibration("runner20");
    level = "runner20";
  } else if (distance <= 30) {
    box.textContent = `👀 気配を感じる：${Math.round(distance)}m`;
    box.classList.add("level1");
    updateBigStatus("runner-status", "👀 SIGN", `気配あり ${Math.round(distance)}m`);
    alertVibration("runner30");
    level = "runner30";
  } else {
    box.textContent = "🔵 ランナー：通常";
    if (!state.bossActive && !state.missionActive) updateBigStatus("runner-status", "🔵 RUNNER", "気配なし。街を読め。");
  }
  updateGameMap(level);
}

function showChargeFloat() {
  const el = $("chargeFloat");
  el.classList.remove("hidden");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  setTimeout(() => el.classList.add("hidden"), 900);
}

function gameTick() {
  const now = Date.now();
  hunterTimeout();

  state.npcs.forEach(p => {
    p.lat += (Math.random() - .5) * 0.00006;
    p.lng += (Math.random() - .5) * 0.00006;
    if (p.role === "hunter" && p.hunterEndsAt && now >= p.hunterEndsAt) {
      p.role = "runner";
      p.hunterEndsAt = null;
    }
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
      if (state.me.hp > before) {
        addLog(`❤️ ${zone.name}でHP +${CONFIG.chargePerTick}`);
        showChargeFloat();
      }
    }
    render();
    return;
  }

  const targetRole = state.me.role === "hunter" ? "runner" : "hunter";
  const nearest = nearestByRole(targetRole);
  const d = nearest ? meters(state.me, nearest) : 999;
  updateAlert(nearest, d, null);

  if (!isInvincible() && nearest && d <= CONFIG.battleRangeM) {
    if (now - state.lastDrainAt >= 1000) {
      state.lastDrainAt = now;
      if (state.me.role === "hunter") {
        nearest.hp = clamp(nearest.hp - CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        state.me.hp = clamp(state.me.hp + CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        state.me.points += 1;
        $("battleStatus").textContent = `⚔ ${nearest.name}からHP吸収中！距離 ${d.toFixed(1)}m`;
        if (nearest.hp <= 0) swapRolesWith(nearest);
      } else {
        state.me.hp = clamp(state.me.hp - CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        nearest.hp = clamp(nearest.hp + CONFIG.drainPerSec, CONFIG.minHp, CONFIG.maxHp);
        $("battleStatus").textContent = `⚠ ${nearest.name}にHPを吸収されています！距離 ${d.toFixed(1)}m`;
        if (state.me.hp <= 0) swapRolesWith(nearest);
      }
    }
  } else if (nearest) {
    $("battleStatus").textContent = `通常エリア：最寄り ${nearest.name} ${Math.round(d)}m`;
  }

  render();
}

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function renderEventClock() {
  const elapsed = (Date.now() - state.eventStartAt) / 1000;
  $("eventTimer").textContent = formatTime(CONFIG.eventDurationSec - elapsed);
}

function renderStreetLevel() {
  const n = state.participantCount;
  let level = 1;
  if (n >= 100) level = 5;
  else if (n >= 60) level = 4;
  else if (n >= 40) level = 3;
  else if (n >= 20) level = 2;
  const stars = "★★★★★".slice(0, level) + "☆☆☆☆☆".slice(0, 5-level);
  $("streetLevel").textContent = stars;
  const next = level === 1 ? 20 : level === 2 ? 40 : level === 3 ? 60 : level === 4 ? 100 : null;
  $("streetLevelText").textContent = next ? `参加者 ${n}人 / 次まで${next-n}人` : `参加者 ${n}人 / MAX`;
}

function render() {
  if (!$("hpText")) return;
  state.me.name = $("playerName")?.value || "RED";
  $("hpText").textContent = `${Math.round(state.me.hp)} / ${CONFIG.maxHp}`;
  $("hpBar").style.width = `${(state.me.hp / CONFIG.maxHp) * 100}%`;
  $("points").textContent = Math.round(state.me.points);

  if (state.me.role === "hunter" && state.me.hunterEndsAt) {
    $("hunterTimer").textContent = Math.max(0, Math.ceil((state.me.hunterEndsAt - Date.now()) / 1000));
  } else {
    $("hunterTimer").textContent = "-";
  }

  $("zoneState").textContent = state.me.zone === "FIELD" ? "FIELD" : "SAFE";

  const badge = $("roleBadge");
  badge.textContent = state.me.role === "hunter" ? "HUNTER" : "RUNNER";
  badge.className = `badge ${state.me.role === "hunter" ? "hunter" : "runner"} ${isInvincible() ? "invincible" : ""}`;
  $("roleBtn").textContent = state.me.role === "hunter" ? "🔵 ランナーにする" : "🟢 ハンターにする";

  renderEventClock();
  renderStreetLevel();
  renderShops();
  renderPlayers();
  updateGameMap("none");
  $("log").innerHTML = state.log.map(line => `<div>${line}</div>`).join("");
}

function renderShops() {
  $("shops").innerHTML = state.zones.map(z => `<div class="item"><strong>${z.icon} ${z.name}</strong><small>${z.effect}</small><br><small>半径 ${z.radius}m / チャージ ${CONFIG.chargePerTick}HP/${CONFIG.chargeTickSec}秒</small></div>`).join("");
}

function renderPlayers() {
  const rows = [
    `<div class="item"><strong>${state.me.role === "hunter" ? "🟢" : "🔵"} ${state.me.name}（あなた）</strong><small>HP ${Math.round(state.me.hp)} / ${CONFIG.maxHp}</small><br><small>${state.me.zone}${isInvincible() ? " / 無敵中" : ""}</small></div>`,
    `<div class="item"><strong>β0.7</strong><small>運営ラジオ・残り時間・状況表示・ボス・ミッション演出を追加。</small></div>`
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
  state.eventStartAt = Date.now();
  state.me.hp = CONFIG.initialHp;
  state.me.points = 0;
  state.me.role = "runner";
  state.me.hunterEndsAt = null;
  state.me.invincibleUntil = 0;
  state.me.lat = DEFAULT_CENTER.lat;
  state.me.lng = DEFAULT_CENTER.lng;
  state.bossActive = false;
  state.missionActive = false;
  state.log = [];
  state.lastVibeAt = 0;
  $("radioText").textContent = "本町・新町・お宿 Onn周辺、ゲーム開始準備中。";
  updateMePosition(state.me.lat, state.me.lng, 10, true);
  addLog("ゲームをリセットしました");
}

function toggleMapMode() {
  state.mapMode = state.mapMode === "real" ? "game" : "real";
  $("realMap").classList.toggle("hidden", state.mapMode === "game");
  $("gameMap").classList.toggle("hidden", state.mapMode === "real");
  $("mapModeBtn").textContent = state.mapMode === "real" ? "🎮 ゲーム地図" : "🗺 現実地図";
  if (state.mapMode === "real" && state.map) setTimeout(() => state.map.invalidateSize(), 150);
}

function triggerBoss() {
  state.bossActive = !state.bossActive;
  if (state.bossActive) {
    setRadio("緊急速報！新町エリアにレイドボス出現！");
    updateBigStatus("boss-status", "👹 BOSS ACTIVE", "新町にレイドボス出現！");
    vibrate([200,80,200,80,300]);
  } else {
    setRadio("レイドボスイベント終了。街は通常状態へ。");
  }
  render();
}

function triggerMission() {
  state.missionActive = !state.missionActive;
  if (state.missionActive) {
    setRadio("街ミッション発令！5分以内に本町エリアへ向かえ！");
    updateBigStatus("mission-status", "🎯 MISSION", "本町へ向かえ！報酬あり");
    vibrate([120,80,120]);
  } else {
    setRadio("街ミッション終了。次の運営速報を待て。");
  }
  render();
}

function triggerLive() {
  setRadio("お宿 Onn前、LIVE SAFE発動！ライブを楽しめ！");
  updateBigStatus("safe-status", "🎵 LIVE SAFE", "お宿 Onn前は戦闘停止");
  vibrate([100,60,100,60,100]);
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
  $("vibeBtn").addEventListener("click", () => { vibrate([120, 80, 120]); addLog("📳 バイブテスト"); });
  $("mapModeBtn").addEventListener("click", toggleMapMode);
  $("bossBtn").addEventListener("click", triggerBoss);
  $("missionBtn").addEventListener("click", triggerMission);
  $("liveBtn").addEventListener("click", triggerLive);

  addLog("STREET SURVIVAL β0.7 起動");
  render();
  setInterval(gameTick, 1000);
  setInterval(render, 1000);
});
