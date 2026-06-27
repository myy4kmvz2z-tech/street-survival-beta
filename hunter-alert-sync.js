/* HUNTER ALERT SYNC v1.0 - RUNNER向け HUNTER接近警告 */

(function(){
  const VERSION = 1;
  const STALE_MS = 3 * 60 * 1000;
  const DANGER_RANGE_M = 10;
  const VIBRATE_MIN_MS = 3000;
  const SAVE_MIN_MS = 3000;
  const EVAL_INTERVAL_MS = 2000;

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

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }else{
      console.log(msg);
    }
  }

  function debug(msg, data){
    console.log("[hunter-alert-sync]", msg, data !== undefined ? data : "");
  }

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }

  function isRegistered(){
    return localStorage.getItem("street_survival_registered") === "true";
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
    if(!isRegistered()) return false;
    if(!getPlayerId()) return false;
    if(!getDb()) return false;
    if(!window.firebase || typeof firebase.database !== "function") return false;
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
    return Date.now() - ts <= STALE_MS;
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
    if(live && Number.isFinite(live.lat) && Number.isFinite(live.lng)){
      return { lat: live.lat, lng: live.lng, source: "live" };
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
          updatedAt: updatedAt
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

    if(isHunter){
      return {
        level: "off",
        title: "",
        sub: "",
        css: "hunter-alert-safe",
        hidden: true
      };
    }

    if(inSafe){
      return {
        level: "safe_paused",
        title: "🛡 SAFE中",
        sub: "接近警告停止",
        css: "hunter-alert-safe",
        hidden: false
      };
    }

    if(level === "safe" || !nearest){
      return {
        level: "safe",
        title: "🟢 周囲安全",
        sub: "近くにHUNTERはいません",
        css: "hunter-alert-safe",
        hidden: false
      };
    }

    const dist = "約" + nearest.distanceM + "m";

    if(level === "warning"){
      return {
        level: "warning",
        title: "⚠️ HUNTER接近",
        sub: dist,
        css: "hunter-alert-warning",
        hidden: false
      };
    }

    if(level === "danger"){
      return {
        level: "danger",
        title: "🚨 HUNTER危険",
        sub: dist,
        css: "hunter-alert-danger",
        hidden: false
      };
    }

    return {
      level: "critical",
      title: "🔥 超危険",
      sub: "HUNTERがすぐ近くです\n" + dist,
      css: "hunter-alert-critical",
      hidden: false
    };
  }

  function updateAlertUI(display){
    const el = document.getElementById("hunterAlertStatus");
    if(!el) return;

    el.classList.remove(
      "hunter-alert-safe",
      "hunter-alert-warning",
      "hunter-alert-danger",
      "hunter-alert-critical",
      "hidden"
    );

    if(display.hidden){
      el.classList.add("hidden");
      setText("infoWarning", getOwnRole() === "HUNTER" ? "追跡中" : "待機中");
      return;
    }

    el.classList.add(display.css);
    el.textContent = display.title + (display.sub ? "\n" + display.sub : "");
    setText("infoWarning", display.title.replace(/^[^\s]+\s*/, "").trim() || display.title);
  }

  function logLevelChange(display){
    const key = display.level;
    if(key === lastAlertLevel) return;

    const prev = lastAlertLevel;
    lastAlertLevel = key;

    const map = {
      safe: "🟢 周囲安全",
      safe_paused: "SAFE中のため接近警告停止",
      warning: "⚠️ HUNTER接近",
      danger: "🚨 HUNTER危険",
      critical: "🔥 HUNTER超危険"
    };

    if(map[key]){
      logMsg(map[key]);
    }

    debug("警告レベル変更", { from: prev, to: key });
  }

  function tryVibrate(level, options){
    if(options.isHunter || options.inSafe) return;
    if(level !== "warning" && level !== "danger" && level !== "critical") return;

    const now = Date.now();
    if(now - lastVibrateAt < VIBRATE_MIN_MS) return;

    if(!navigator.vibrate) return;

    try{
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
      hunterAlertLevel: level === "off" || level === "safe_paused" ? "safe" : level,
      hunterAlertUpdatedAt: now,
      updatedAt: now
    };

    try{
      await playerRef.update(payload);
    }catch(e){
      console.warn("[hunter-alert-sync] Firebase保存失敗", e);
    }
  }

  window.evaluateHunterAlert = function(){
    const myId = getPlayerId();
    const ownLoc = getOwnLocation();
    const role = getOwnRole();
    const inSafe = isInSafeZone();
    const isHunter = role === "HUNTER";
    const ranges = getRanges();

    if(!myId || !ownLoc){
      debug("判定スキップ", "現在地なし");
      return null;
    }

    const nearest = isHunter || inSafe ? null : findNearestHunter(ownLoc.lat, ownLoc.lng, myId);
    const level = isHunter || inSafe ? "safe" : computeAlertLevel(nearest ? nearest.distanceM : null, ranges);
    const display = buildDisplay(level, nearest, { isHunter: isHunter, inSafe: inSafe });

    if(nearest){
      debug("最近接HUNTER", {
        name: nearest.nickname,
        distanceM: nearest.distanceM,
        level: display.level
      });
    }

    logLevelChange(display);
    updateAlertUI(display);

    if(!isHunter && !inSafe){
      tryVibrate(display.level, { isHunter: false, inSafe: false });
    }

    saveAlertState(display.level, nearest);

    window.STREET_SURVIVAL_NEAREST_HUNTER = nearest;
    window.STREET_SURVIVAL_HUNTER_ALERT_LEVEL = display.level;

    return {
      level: display.level,
      nearest: nearest,
      ranges: ranges
    };
  };

  function watchPlayers(){
    if(playersWatchStarted) return;

    const db = getDb();
    if(!db){
      setTimeout(watchPlayers, 1000);
      return;
    }

    playersWatchStarted = true;

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
      setTimeout(boot, 1000);
      return;
    }

    started = true;
    const playerId = getPlayerId();

    logMsg("✅ hunter-alert-sync.js 起動 v" + VERSION);
    debug("起動", { playerId: playerId });

    playerRef = getDb().ref("streetSurvival/players/" + playerId);
    watchSelfPlayer();
    watchPlayers();
    startEvalLoop();
    window.evaluateHunterAlert();
  }

  window.addEventListener("load", boot);

  window.addEventListener("ss-player-registered", () => {
    started = false;
    playersWatchStarted = false;
    playerRef = null;
    allPlayers = {};
    selfPlayer = null;
    lastAlertLevel = null;
    lastSavedLevel = null;
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
