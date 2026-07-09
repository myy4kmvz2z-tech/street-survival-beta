/* HUNTER ALERT SYNC v2.0 - RUNNER向け HUNTER接近警告（テスト対応） */

(function(){
  const VERSION = 2;
  const STALE_MS = 5 * 60 * 1000;
  const DUMMY_STALE_MS = 10 * 60 * 1000;
  const DANGER_RANGE_M = 10;
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
  let lastLoggedNearestKey = null;

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }
    console.log("[hunter-alert-sync]", msg);
  }

  function debug(msg, data){
    if(data !== undefined){
      console.log("[hunter-alert-sync]", msg, data);
    }else{
      console.log("[hunter-alert-sync]", msg);
    }
  }

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
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

  function canStart(){
    if(!window.firebase || typeof firebase.database !== "function") return false;
    if(!getDb()) return false;
    if(!getPlayerId()) return false;
    return true;
  }

  function getRanges(){
    const settings = window.STREET_SURVIVAL_SETTINGS || {};
    return {
      warningRange: Number(settings.warningRange) > 0 ? Number(settings.warningRange) : 15,
      battleRange: Number(settings.battleRange) > 0 ? Number(settings.battleRange) : 7,
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
    if(window.STREET_SURVIVAL_CURRENT_SAFE_ZONE){
      return true;
    }
    if(selfPlayer && selfPlayer.isSafe === true){
      return true;
    }
    return false;
  }

  function getOwnLocation(){
    const live = window.STREET_SURVIVAL_CURRENT_LOCATION;
    if(live && Number.isFinite(Number(live.lat)) && Number.isFinite(Number(live.lng))){
      return { lat: Number(live.lat), lng: Number(live.lng), source: "live" };
    }

    if(selfPlayer && selfPlayer.location){
      const lat = Number(selfPlayer.location.lat);
      const lng = Number(selfPlayer.location.lng);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        return { lat: lat, lng: lng, source: "firebase" };
      }
    }

    const fallback = window.CURRENT_LOCATION;
    if(fallback && Number.isFinite(Number(fallback.lat)) && Number.isFinite(Number(fallback.lng))){
      return { lat: Number(fallback.lat), lng: Number(fallback.lng), source: "current" };
    }

    return null;
  }

  function countHunterCandidates(myId){
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
    });
    return count;
  }

  function findNearestHunter(myLat, myLng, myId){
    let nearest = null;

    Object.keys(allPlayers).forEach(playerId => {
      if(playerId === myId) return;

      const player = allPlayers[playerId];
      if(!player || String(player.role || "").toUpperCase() !== "HUNTER") return;
      if(!player.location) return;

      const lat = Number(player.location.lat);
      const lng = Number(player.location.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if(!isFresh(player)) return;

      const distanceM = Math.round(getDistanceMeters(myLat, myLng, lat, lng));
      const updatedAt = Number(player.location.updatedAt) || Number(player.updatedAt) || 0;

      if(!nearest || distanceM < nearest.distanceM){
        nearest = {
          playerId: playerId,
          nickname: player.nickname || player.name || playerId,
          distanceM: distanceM,
          updatedAt: updatedAt,
          isDummy: player.isDummy === true
        };
      }
    });

    return nearest;
  }

  function computeAlertLevel(distanceM, ranges){
    if(distanceM == null || !Number.isFinite(distanceM)){
      return "safe";
    }
    if(distanceM <= ranges.battleRange) return "critical";
    if(distanceM <= ranges.dangerRange) return "danger";
    if(distanceM <= ranges.warningRange) return "warning";
    return "safe";
  }

  function buildDisplay(level, nearest, options){
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

      let css = "hunter-alert-safe";
      if(level === "warning") css = "hunter-alert-warning";
      if(level === "danger") css = "hunter-alert-danger";
      if(level === "critical") css = "hunter-alert-critical";

      return {
        level: level,
        text: lines.join("\n"),
        css: css,
        infoTitle: "自分はHUNTER"
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

      let css = "hunter-alert-safe";
      if(level === "warning") css = "hunter-alert-warning";
      if(level === "danger") css = "hunter-alert-danger";
      if(level === "critical") css = "hunter-alert-critical";

      return {
        level: level,
        text: lines.join("\n"),
        css: css,
        infoTitle: "SAFE中"
      };
    }

    if(level === "safe" || !nearest){
      return {
        level: "safe",
        text: "🟢 周囲安全\n近くにHUNTERはいません",
        css: "hunter-alert-safe",
        infoTitle: "周囲安全"
      };
    }

    const dist = "約" + nearest.distanceM + "m";

    if(level === "warning"){
      return {
        level: "warning",
        text: "⚠️ HUNTER接近\n" + dist,
        css: "hunter-alert-warning",
        infoTitle: "HUNTER接近"
      };
    }

    if(level === "danger"){
      return {
        level: "danger",
        text: "🚨 HUNTER危険\n" + dist,
        css: "hunter-alert-danger",
        infoTitle: "HUNTER危険"
      };
    }

    return {
      level: "critical",
      text: "🔥 超危険\nHUNTERがすぐ近くです\n" + dist,
      css: "hunter-alert-critical",
      infoTitle: "超危険"
    };
  }

  function ensureAlertElement(){
    let el = document.getElementById("hunterAlertStatus");
    if(el) return el;

    el = document.createElement("div");
    el.id = "hunterAlertStatus";
    el.className = "hunter-alert-status hunter-alert-safe";
    el.textContent = "🟢 周囲安全";

    const anchor =
      document.getElementById("safeZoneStatus") ||
      document.getElementById("healerZoneStatus") ||
      document.getElementById("radioCard") ||
      document.getElementById("safeAreaBanner");

    if(anchor && anchor.parentNode){
      if(anchor.nextSibling){
        anchor.parentNode.insertBefore(el, anchor.nextSibling);
      }else{
        anchor.parentNode.appendChild(el);
      }
    }else if(document.body){
      document.body.appendChild(el);
    }

    return el;
  }

  function updateAlertUI(display){
    const el = ensureAlertElement();
    if(!el) return;

    el.classList.remove(
      "hunter-alert-safe",
      "hunter-alert-warning",
      "hunter-alert-danger",
      "hunter-alert-critical",
      "hidden"
    );

    el.classList.add(display.css);
    el.textContent = display.text;
    setText("infoWarning", display.infoTitle || "待機中");
  }

  function showNoLocation(){
    const el = ensureAlertElement();
    if(!el) return;
    el.classList.remove(
      "hunter-alert-safe",
      "hunter-alert-warning",
      "hunter-alert-danger",
      "hunter-alert-critical",
      "hidden"
    );
    el.classList.add("hunter-alert-warning");
    el.textContent = "HUNTER警告: 自分の位置情報なし";
    setText("infoWarning", "位置情報なし");
  }

  function logLevelChange(level){
    if(level === lastAlertLevel) return;
    const prev = lastAlertLevel;
    lastAlertLevel = level;

    const map = {
      safe: "🟢 周囲安全",
      warning: "⚠️ HUNTER接近",
      danger: "🚨 HUNTER危険",
      critical: "🔥 超危険"
    };

    if(map[level]){
      logMsg(map[level]);
    }

    debug("警告レベル変更", { from: prev, to: level });
  }

  function tryVibrate(level, options){
    if(options.isHunter || options.inSafe) return;
    if(options.role !== "RUNNER") return;
    if(level !== "warning" && level !== "danger" && level !== "critical") return;

    const now = Date.now();
    if(now - lastVibrateAt < VIBRATE_MIN_MS) return;

    try{
      if(!navigator.vibrate) return;
      if(level === "warning"){
        navigator.vibrate([120]);
      }else if(level === "danger"){
        navigator.vibrate([200, 100, 200]);
      }else if(level === "critical"){
        navigator.vibrate([300, 100, 300, 100, 300]);
      }
      lastVibrateAt = now;
      debug("バイブ", level);
    }catch(e){
      debug("バイブ非対応", e && e.message ? e.message : "");
    }
  }

  async function saveAlertState(level, nearest){
    if(!playerRef) return;

    const now = Date.now();
    if(lastSavedLevel === level && now - lastSaveAt < SAVE_MIN_MS){
      return;
    }

    lastSaveAt = now;
    lastSavedLevel = level;

    const payload = {
      nearestHunterDistanceM: nearest ? nearest.distanceM : null,
      nearestHunterName: nearest ? nearest.nickname : null,
      hunterAlertLevel: level,
      hunterAlertUpdatedAt: now,
      updatedAt: now
    };

    try{
      await playerRef.update(payload);
    }catch(e){
      console.warn("[hunter-alert-sync] Firebase保存失敗", e);
    }
  }

  function logEvalSnapshot(myId, ownLoc, hunterCount, nearest, level){
    debug("自分の位置取得OK", ownLoc);
    debug("HUNTER候補: " + hunterCount + "件");
    if(nearest){
      debug("最寄りHUNTER: " + nearest.distanceM + "m", {
        name: nearest.nickname,
        isDummy: !!nearest.isDummy
      });
    }else{
      debug("最寄りHUNTER: なし");
    }
    debug("警告レベル: " + level);

    const key = (nearest ? nearest.playerId + ":" + nearest.distanceM : "none") + ":" + level;
    if(key !== lastLoggedNearestKey){
      lastLoggedNearestKey = key;
      logMsg("HUNTER候補: " + hunterCount + "件");
      if(nearest){
        logMsg("最寄りHUNTER: " + nearest.distanceM + "m");
      }else{
        logMsg("最寄りHUNTER: なし");
      }
      logMsg("警告レベル: " + level);
    }
  }

  window.evaluateHunterAlert = function(){
    const myId = getPlayerId();
    if(!myId){
      debug("判定スキップ", "playerIdなし");
      return null;
    }

    const ownLoc = getOwnLocation();
    if(!ownLoc){
      showNoLocation();
      debug("HUNTER警告: 自分の位置情報なし");
      return null;
    }

    const role = getOwnRole();
    const inSafe = isInSafeZone();
    const isHunter = role === "HUNTER";
    const ranges = getRanges();
    const hunterCount = countHunterCandidates(myId);
    const nearest = findNearestHunter(ownLoc.lat, ownLoc.lng, myId);
    const level = computeAlertLevel(nearest ? nearest.distanceM : null, ranges);
    const display = buildDisplay(level, nearest, { isHunter: isHunter, inSafe: inSafe });

    logEvalSnapshot(myId, ownLoc, hunterCount, nearest, level);
    logLevelChange(level);
    updateAlertUI(display);

    tryVibrate(level, {
      isHunter: isHunter,
      inSafe: inSafe,
      role: role
    });

    saveAlertState(level, nearest);

    window.STREET_SURVIVAL_NEAREST_HUNTER = nearest;
    window.STREET_SURVIVAL_HUNTER_ALERT_LEVEL = level;

    return {
      level: level,
      nearest: nearest,
      ranges: ranges,
      hunterCount: hunterCount
    };
  };

  function watchPlayers(){
    if(playersWatchStarted) return;

    const db = getDb();
    if(!db){
      setTimeout(watchPlayers, BOOT_RETRY_MS);
      return;
    }

    playersWatchStarted = true;
    logMsg("players監視開始");

    db.ref("streetSurvival/players").on("value", snap => {
      allPlayers = snap.val() || {};
      const myId = getPlayerId();
      if(myId && allPlayers[myId]){
        selfPlayer = allPlayers[myId];
      }
      window.evaluateHunterAlert();
    });
  }

  function watchSelfPlayer(){
    const ref = playerRef;
    if(!ref || ref.__ssHunterAlertSelfWatch) return;

    ref.__ssHunterAlertSelfWatch = true;
    ref.on("value", snap => {
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
    if(started) return;

    if(!canStart()){
      setTimeout(boot, BOOT_RETRY_MS);
      return;
    }

    started = true;
    const playerId = getPlayerId();

    logMsg("hunter-alert-sync.js 起動");
    logMsg("playerId: " + playerId);
    debug("起動 v" + VERSION, { playerId: playerId });

    ensureAlertElement();
    playerRef = getDb().ref("streetSurvival/players/" + playerId);
    watchSelfPlayer();
    watchPlayers();
    startEvalLoop();
    window.evaluateHunterAlert();
  }

  window.addEventListener("load", boot);
  setTimeout(boot, 500);

  window.addEventListener("ss-player-registered", () => {
    started = false;
    playersWatchStarted = false;
    playerRef = null;
    allPlayers = {};
    selfPlayer = null;
    lastAlertLevel = null;
    lastSavedLevel = null;
    lastLoggedNearestKey = null;
    if(evalTimer){
      clearInterval(evalTimer);
      evalTimer = null;
    }
    setTimeout(boot, 800);
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
