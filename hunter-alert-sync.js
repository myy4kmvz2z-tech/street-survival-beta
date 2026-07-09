/* HUNTER ALERT SYNC v3.0 - 画面デバッグ必須版 */

(function(){
  const VERSION = 3;
  const STALE_MS = 5 * 60 * 1000;
  const DUMMY_STALE_MS = 30 * 60 * 1000;
  const DANGER_RANGE_M = 10;
  const WARNING_RANGE_DEFAULT = 15;
  const BATTLE_RANGE_DEFAULT = 7;
  const VIBRATE_MIN_MS = 3000;
  const SAVE_MIN_MS = 3000;
  const EVAL_INTERVAL_MS = 2000;
  const BOOT_RETRY_MS = 1000;

  let started = false;
  let playersWatchStarted = false;
  let allPlayers = {};
  let selfPlayer = null;
  let playerRef = null;
  let evalTimer = null;
  let lastAlertLevel = null;
  let lastVibrateAt = 0;
  let lastSaveAt = 0;
  let lastSavedLevel = null;
  let lastDebugText = "";

  function ensureElements(){
    let statusEl = document.getElementById("hunterAlertStatus");
    let debugEl = document.getElementById("hunterAlertDebug");

    const radio = document.getElementById("radioCard");
    const safeBanner = document.getElementById("safeAreaBanner");
    const insertBefore = safeBanner || document.getElementById("safeZoneStatus");
    const parent = (radio && radio.parentNode) ||
      (insertBefore && insertBefore.parentNode) ||
      document.querySelector(".game-hud") ||
      document.getElementById("gameScreen") ||
      document.body;

    if(!statusEl){
      statusEl = document.createElement("div");
      statusEl.id = "hunterAlertStatus";
      statusEl.className = "hunter-alert-status hunter-alert-safe";
      statusEl.textContent = "🟢 周囲安全";
      if(radio && radio.parentNode){
        radio.parentNode.insertBefore(statusEl, radio.nextSibling);
      }else if(insertBefore && insertBefore.parentNode){
        insertBefore.parentNode.insertBefore(statusEl, insertBefore);
      }else if(parent){
        parent.appendChild(statusEl);
      }
    }

    if(!debugEl){
      debugEl = document.createElement("div");
      debugEl.id = "hunterAlertDebug";
      debugEl.className = "hunter-alert-debug";
      debugEl.textContent = "HUNTER警告: 起動待ち";
      if(statusEl && statusEl.parentNode){
        statusEl.parentNode.insertBefore(debugEl, statusEl.nextSibling);
      }else if(parent){
        parent.appendChild(debugEl);
      }
    }

    statusEl.style.display = "block";
    statusEl.style.visibility = "visible";
    statusEl.style.opacity = "1";
    debugEl.style.display = "block";
    debugEl.style.visibility = "visible";
    debugEl.style.opacity = "1";

    return { statusEl: statusEl, debugEl: debugEl };
  }

  function setStatus(text, cssClass){
    const els = ensureElements();
    const el = els.statusEl;
    if(!el) return;

    el.classList.remove(
      "hunter-alert-safe",
      "hunter-alert-warning",
      "hunter-alert-danger",
      "hunter-alert-critical",
      "hidden"
    );
    el.classList.add(cssClass || "hunter-alert-safe");
    el.textContent = text;

    const info = document.getElementById("infoWarning");
    if(info){
      const first = String(text || "").split("\n")[0] || "待機中";
      info.textContent = first.replace(/^[^\s]+\s*/, "").trim() || first;
    }
  }

  function setDebug(text){
    const els = ensureElements();
    const el = els.debugEl;
    if(!el) return;
    const next = String(text || "");
    el.textContent = next;
    if(next !== lastDebugText){
      lastDebugText = next;
      console.log("[hunter-alert-sync]", next);
    }
  }

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }
    console.log("[hunter-alert-sync]", msg);
  }

  function getPlayerId(){
    return localStorage.getItem("street_survival_player_id");
  }

  function getDb(){
    try{
      if(typeof SS_FINAL_DB !== "undefined" && SS_FINAL_DB){
        return SS_FINAL_DB;
      }
    }catch(e){}

    try{
      if(window.firebase && typeof firebase.database === "function"){
        if(firebase.apps && firebase.apps.length){
          return firebase.database();
        }
      }
    }catch(e){}

    return null;
  }

  function getRanges(){
    const settings = window.STREET_SURVIVAL_SETTINGS || {};
    return {
      warningRange: Number(settings.warningRange) > 0 ? Number(settings.warningRange) : WARNING_RANGE_DEFAULT,
      battleRange: Number(settings.battleRange) > 0 ? Number(settings.battleRange) : BATTLE_RANGE_DEFAULT,
      dangerRange: DANGER_RANGE_M
    };
  }

  function getDistanceMeters(lat1, lng1, lat2, lng2){
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(Number(lat2) - Number(lat1));
    const dLng = toRad(Number(lng2) - Number(lng1));
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  window.getDistanceMeters = window.getDistanceMeters || getDistanceMeters;

  function isFresh(player){
    const locTs = player && player.location ? Number(player.location.updatedAt) : 0;
    const playerTs = player ? Number(player.updatedAt) : 0;
    const ts = Math.max(locTs, playerTs);
    if(!ts) return false;
    const maxAge = player && player.isDummy === true ? DUMMY_STALE_MS : STALE_MS;
    return Date.now() - ts <= maxAge;
  }

  function getOwnRole(){
    if(selfPlayer && selfPlayer.role){
      return String(selfPlayer.role).toUpperCase();
    }
    try{
      if(typeof state !== "undefined" && state.me){
        return state.me.role === "hunter" ? "HUNTER" : "RUNNER";
      }
    }catch(e){}
    return "RUNNER";
  }

  function isInSafeZone(){
    if(window.STREET_SURVIVAL_CURRENT_SAFE_ZONE) return true;
    if(selfPlayer && selfPlayer.isSafe === true) return true;
    return false;
  }

  function getOwnLocation(){
    const live = window.STREET_SURVIVAL_CURRENT_LOCATION;
    if(live && Number.isFinite(Number(live.lat)) && Number.isFinite(Number(live.lng))){
      return { lat: Number(live.lat), lng: Number(live.lng), source: "STREET_SURVIVAL_CURRENT_LOCATION" };
    }

    const fallback = window.CURRENT_LOCATION;
    if(fallback && Number.isFinite(Number(fallback.lat)) && Number.isFinite(Number(fallback.lng))){
      return { lat: Number(fallback.lat), lng: Number(fallback.lng), source: "CURRENT_LOCATION" };
    }

    if(selfPlayer && selfPlayer.location){
      const lat = Number(selfPlayer.location.lat);
      const lng = Number(selfPlayer.location.lng);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        return { lat: lat, lng: lng, source: "firebase" };
      }
    }

    return null;
  }

  function findNearestHunter(myLat, myLng, myId){
    let nearest = null;
    let count = 0;

    Object.keys(allPlayers).forEach(playerId => {
      if(playerId === myId) return;

      const player = allPlayers[playerId];
      if(!player || String(player.role || "").toUpperCase() !== "HUNTER") return;
      if(!player.location) return;

      const lat = Number(player.location.lat);
      const lng = Number(player.location.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if(!isFresh(player)) return;

      count += 1;
      const distanceM = Math.round(getDistanceMeters(myLat, myLng, lat, lng));

      if(!nearest || distanceM < nearest.distanceM){
        nearest = {
          playerId: playerId,
          nickname: player.nickname || player.name || playerId,
          distanceM: distanceM,
          lat: lat,
          lng: lng,
          isDummy: player.isDummy === true
        };
      }
    });

    return { nearest: nearest, count: count };
  }

  function computeAlertLevel(distanceM, ranges){
    if(distanceM == null || !Number.isFinite(distanceM)) return "safe";
    if(distanceM <= ranges.battleRange) return "critical";
    if(distanceM <= ranges.dangerRange) return "danger";
    if(distanceM <= ranges.warningRange) return "warning";
    return "safe";
  }

  function buildStatusText(level, nearest, options){
    const isHunter = options.isHunter;
    const inSafe = options.inSafe;
    const lines = [];

    if(isHunter){
      lines.push("自分はHUNTERです");
      if(nearest){
        lines.push("最寄りHUNTER: " + nearest.nickname + " 約" + nearest.distanceM + "m");
      }else{
        lines.push("近くに他のHUNTERはいません");
      }
      return {
        text: lines.join("\n"),
        css: level === "critical" ? "hunter-alert-critical"
          : level === "danger" ? "hunter-alert-danger"
          : level === "warning" ? "hunter-alert-warning"
          : "hunter-alert-safe"
      };
    }

    if(inSafe){
      if(nearest){
        lines.push("🛡 SAFE中 / HUNTERまで 約" + nearest.distanceM + "m");
        lines.push("※ SAFE中のためバイブ停止");
      }else{
        lines.push("🛡 SAFE中");
        lines.push("近くにHUNTERはいません");
        lines.push("※ SAFE中のためバイブ停止");
      }
      return {
        text: lines.join("\n"),
        css: level === "critical" ? "hunter-alert-critical"
          : level === "danger" ? "hunter-alert-danger"
          : level === "warning" ? "hunter-alert-warning"
          : "hunter-alert-safe"
      };
    }

    if(!nearest){
      return {
        text: "🟢 周囲安全",
        css: "hunter-alert-safe"
      };
    }

    if(level === "critical"){
      return {
        text: "🔥 超危険\nHUNTERがすぐ近くです\n約" + nearest.distanceM + "m",
        css: "hunter-alert-critical"
      };
    }

    if(level === "danger"){
      return {
        text: "🚨 HUNTER危険\n約" + nearest.distanceM + "m",
        css: "hunter-alert-danger"
      };
    }

    if(level === "warning"){
      return {
        text: "⚠️ HUNTER接近\n約" + nearest.distanceM + "m",
        css: "hunter-alert-warning"
      };
    }

    return {
      text: "🟢 周囲安全\n最寄りHUNTER 約" + nearest.distanceM + "m",
      css: "hunter-alert-safe"
    };
  }

  function tryVibrate(level, options){
    if(options.isHunter || options.inSafe) return;
    if(options.role !== "RUNNER") return;
    if(level !== "warning" && level !== "danger" && level !== "critical") return;

    const now = Date.now();
    if(now - lastVibrateAt < VIBRATE_MIN_MS) return;

    try{
      if(!navigator.vibrate) return;
      if(level === "warning") navigator.vibrate([120]);
      else if(level === "danger") navigator.vibrate([200, 100, 200]);
      else if(level === "critical") navigator.vibrate([300, 100, 300, 100, 300]);
      lastVibrateAt = now;
    }catch(e){}
  }

  async function saveAlertState(level, nearest){
    if(!playerRef) return;

    const now = Date.now();
    if(lastSavedLevel === level && now - lastSaveAt < SAVE_MIN_MS) return;

    lastSaveAt = now;
    lastSavedLevel = level;

    try{
      await playerRef.update({
        nearestHunterDistanceM: nearest ? nearest.distanceM : null,
        nearestHunterName: nearest ? nearest.nickname : null,
        hunterAlertLevel: level,
        hunterAlertUpdatedAt: now,
        updatedAt: now
      });
    }catch(e){
      console.warn("[hunter-alert-sync] Firebase保存失敗", e);
    }
  }

  function fmtCoord(n){
    return Number(n).toFixed(5);
  }

  window.evaluateHunterAlert = function(){
    ensureElements();

    const myId = getPlayerId();
    if(!myId){
      setStatus("🟢 周囲安全", "hunter-alert-safe");
      setDebug("playerIdなし。登録を確認してください。");
      return null;
    }

    const ownLoc = getOwnLocation();
    if(!ownLoc){
      setStatus("🟢 周囲安全", "hunter-alert-safe");
      setDebug("自分の位置情報なし。位置情報を許可してください。\nplayerId: " + myId);
      return null;
    }

    const role = getOwnRole();
    const inSafe = isInSafeZone();
    const isHunter = role === "HUNTER";
    const ranges = getRanges();
    const found = findNearestHunter(ownLoc.lat, ownLoc.lng, myId);
    const nearest = found.nearest;
    const hunterCount = found.count;
    const level = computeAlertLevel(nearest ? nearest.distanceM : null, ranges);
    const display = buildStatusText(level, nearest, { isHunter: isHunter, inSafe: inSafe });

    setStatus(display.text, display.css);

    if(hunterCount === 0){
      setDebug(
        "HUNTER候補: 0件 / players読込OK\n" +
        "playerId: " + myId + "\n" +
        "role: " + role + "\n" +
        "自分: " + fmtCoord(ownLoc.lat) + "," + fmtCoord(ownLoc.lng) + "\n" +
        "位置source: " + ownLoc.source + "\n" +
        "警告レベル: " + level
      );
    }else{
      setDebug(
        "HUNTER候補: " + hunterCount + "件\n" +
        "最寄り: " + (nearest ? nearest.nickname : "-") + "\n" +
        "距離: " + (nearest ? nearest.distanceM + "m" : "-") + "\n" +
        "自分: " + fmtCoord(ownLoc.lat) + "," + fmtCoord(ownLoc.lng) + "\n" +
        "HUNTER: " + (nearest ? fmtCoord(nearest.lat) + "," + fmtCoord(nearest.lng) : "-") + "\n" +
        "role: " + role + (inSafe ? " / SAFE中" : "") + "\n" +
        "警告レベル: " + level
      );
    }

    if(level !== lastAlertLevel){
      lastAlertLevel = level;
      logMsg("警告レベル: " + level);
    }

    tryVibrate(level, { isHunter: isHunter, inSafe: inSafe, role: role });
    saveAlertState(level, nearest);

    window.STREET_SURVIVAL_NEAREST_HUNTER = nearest;
    window.STREET_SURVIVAL_HUNTER_ALERT_LEVEL = level;

    return { level: level, nearest: nearest, hunterCount: hunterCount, ranges: ranges };
  };

  function watchPlayers(){
    if(playersWatchStarted) return;

    const db = getDb();
    if(!db){
      setDebug("Firebase未接続。再試行中...");
      setTimeout(watchPlayers, BOOT_RETRY_MS);
      return;
    }

    playersWatchStarted = true;
    const playerId = getPlayerId() || "-";
    setDebug("players監視開始 / playerId: " + playerId);
    logMsg("players監視開始 / playerId: " + playerId);

    db.ref("streetSurvival/players").on("value", snap => {
      allPlayers = snap.val() || {};
      const myId = getPlayerId();
      if(myId && allPlayers[myId]){
        selfPlayer = allPlayers[myId];
      }
      window.evaluateHunterAlert();
    }, err => {
      setDebug("players監視エラー: " + (err && err.message ? err.message : String(err)));
    });
  }

  function watchSelfPlayer(){
    if(!playerRef || playerRef.__ssHunterAlertSelfWatch) return;
    playerRef.__ssHunterAlertSelfWatch = true;
    playerRef.on("value", snap => {
      selfPlayer = snap.val();
      window.evaluateHunterAlert();
    });
  }

  function startEvalLoop(){
    if(evalTimer) return;
    evalTimer = setInterval(() => {
      window.evaluateHunterAlert();
    }, EVAL_INTERVAL_MS);
  }

  function boot(){
    ensureElements();

    const playerId = getPlayerId();
    if(!playerId){
      setStatus("🟢 周囲安全", "hunter-alert-safe");
      setDebug("playerIdなし。登録を確認してください。");
      setTimeout(boot, BOOT_RETRY_MS);
      return;
    }

    if(!window.firebase || typeof firebase.database !== "function" || !getDb()){
      setStatus("🟢 周囲安全", "hunter-alert-safe");
      setDebug("Firebase待機中... / playerId: " + playerId);
      setTimeout(boot, BOOT_RETRY_MS);
      return;
    }

    if(started) return;
    started = true;

    setStatus("🟢 周囲安全", "hunter-alert-safe");
    setDebug("hunter-alert-sync.js 起動 / playerId: " + playerId);
    logMsg("hunter-alert-sync.js 起動");
    logMsg("playerId: " + playerId);

    playerRef = getDb().ref("streetSurvival/players/" + playerId);
    watchSelfPlayer();
    watchPlayers();
    startEvalLoop();
    window.evaluateHunterAlert();
  }

  // 先頭で必ず画面に起動表示
  try{
    ensureElements();
    setStatus("🟢 周囲安全", "hunter-alert-safe");
    setDebug("hunter-alert-sync.js 起動中...");
  }catch(e){
    console.warn("[hunter-alert-sync] 初期表示失敗", e);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  }else{
    boot();
  }
  window.addEventListener("load", boot);
  setTimeout(boot, 300);
  setTimeout(boot, 1000);

  window.addEventListener("ss-player-registered", () => {
    started = false;
    playersWatchStarted = false;
    playerRef = null;
    allPlayers = {};
    selfPlayer = null;
    lastAlertLevel = null;
    lastSavedLevel = null;
    lastDebugText = "";
    if(evalTimer){
      clearInterval(evalTimer);
      evalTimer = null;
    }
    setDebug("登録完了。再起動中...");
    setTimeout(boot, 500);
  });

  const originalCheckSafeZones = window.checkSafeZones;
  if(typeof originalCheckSafeZones === "function"){
    window.checkSafeZones = function(){
      const result = originalCheckSafeZones.apply(this, arguments);
      window.evaluateHunterAlert();
      return result;
    };
  }
})();
