/* CAPTURE SYNC v1.0 - HUNTER吸収判定 */

(function(){
  const VERSION = 1;
  const STALE_MS = 5 * 60 * 1000;
  const CAPTURE_COOLDOWN_MS = 10000;
  const BOOT_RETRY_MS = 1000;
  const EVAL_INTERVAL_MS = 1500;
  const SAFE_LOG_COOLDOWN_MS = 15000;

  let started = false;
  let selfPlayer = null;
  let allPlayers = {};
  let playerRef = null;
  let playersWatchStarted = false;
  let selfWatchStarted = false;
  let evalTimer = null;
  let lastCaptureAt = 0;
  let capturing = false;
  let lastSafeLogAt = 0;
  let lastStatusText = "";

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }
    console.log("[capture-sync]", msg);
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

  function getBattleRange(){
    const settings = window.STREET_SURVIVAL_SETTINGS || {};
    return Number(settings.battleRange) > 0 ? Number(settings.battleRange) : 7;
  }

  function getHunterMinutes(){
    const settings = window.STREET_SURVIVAL_SETTINGS || {};
    return Number(settings.hunterMinutes) > 0 ? Number(settings.hunterMinutes) : 10;
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

  function ensureCaptureStatus(){
    let el = document.getElementById("captureStatus");
    if(el) return el;

    el = document.createElement("div");
    el.id = "captureStatus";
    el.className = "capture-status";
    el.textContent = "吸収判定：待機中";

    const anchor =
      document.getElementById("hunterAlertDebug") ||
      document.getElementById("hunterAlertStatus") ||
      document.getElementById("radioCard") ||
      document.getElementById("safeZoneStatus");

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

  function setCaptureStatus(text){
    const el = ensureCaptureStatus();
    if(!el) return;
    if(text === lastStatusText) return;
    lastStatusText = text;
    el.textContent = text;
  }

  function isFresh(player){
    const locTs = player && player.location ? Number(player.location.updatedAt) : 0;
    const playerTs = player ? Number(player.updatedAt) : 0;
    const ts = Math.max(locTs, playerTs);
    if(!ts) return false;
    return Date.now() - ts <= STALE_MS;
  }

  function getOwnLocation(){
    const live = window.STREET_SURVIVAL_CURRENT_LOCATION;
    if(live && Number.isFinite(Number(live.lat)) && Number.isFinite(Number(live.lng))){
      return { lat: Number(live.lat), lng: Number(live.lng) };
    }

    const fallback = window.CURRENT_LOCATION;
    if(fallback && Number.isFinite(Number(fallback.lat)) && Number.isFinite(Number(fallback.lng))){
      return { lat: Number(fallback.lat), lng: Number(fallback.lng) };
    }

    if(selfPlayer && selfPlayer.location){
      const lat = Number(selfPlayer.location.lat);
      const lng = Number(selfPlayer.location.lng);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        return { lat: lat, lng: lng };
      }
    }

    return null;
  }

  function getOwnRole(){
    if(selfPlayer && selfPlayer.role){
      return String(selfPlayer.role).toUpperCase();
    }
    return "RUNNER";
  }

  function isOwnSafe(){
    return window.STREET_SURVIVAL_IS_SAFE === true;
  }

  function getNickname(player, fallbackId){
    if(!player) return fallbackId || "UNKNOWN";
    return player.nickname || player.name || fallbackId || "UNKNOWN";
  }

  function findNearestCapturableRunner(myLat, myLng, myId){
    let nearest = null;

    Object.keys(allPlayers).forEach(playerId => {
      if(playerId === myId) return;

      const player = allPlayers[playerId];
      if(!player) return;
      if(String(player.role || "").toUpperCase() !== "RUNNER") return;
      if(player.isSafe === true) return;
      if(!player.location) return;

      const lat = Number(player.location.lat);
      const lng = Number(player.location.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if(!isFresh(player)) return;

      const distanceM = getDistanceMeters(myLat, myLng, lat, lng);
      if(!nearest || distanceM < nearest.distanceM){
        nearest = {
          playerId: playerId,
          nickname: getNickname(player, playerId),
          distanceM: distanceM,
          player: player
        };
      }
    });

    return nearest;
  }

  // TEST HUNTER は端末を持たないため、RUNNER側で isDummy HUNTER 接近のみ検知する
  function findNearestDummyHunter(myLat, myLng, myId){
    let nearest = null;

    Object.keys(allPlayers).forEach(playerId => {
      if(playerId === myId) return;

      const player = allPlayers[playerId];
      if(!player) return;
      if(player.isDummy !== true) return;
      if(String(player.role || "").toUpperCase() !== "HUNTER") return;
      if(!player.location) return;

      const lat = Number(player.location.lat);
      const lng = Number(player.location.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if(!isFresh(player)) return;

      const distanceM = getDistanceMeters(myLat, myLng, lat, lng);
      if(!nearest || distanceM < nearest.distanceM){
        nearest = {
          playerId: playerId,
          nickname: getNickname(player, playerId),
          distanceM: distanceM,
          player: player
        };
      }
    });

    return nearest;
  }

  async function writeCaptureEvent(db, hunterId, hunterName, runnerId, runnerName, distanceM){
    const now = Date.now();
    const message = "🔥 " + hunterName + " が " + runnerName + " を捕まえました";

    await db.ref("streetSurvival/captureLogs").push({
      hunterId: hunterId,
      hunterName: hunterName,
      runnerId: runnerId,
      runnerName: runnerName,
      distanceM: Math.round(distanceM),
      createdAt: now
    });

    await db.ref("streetSurvival/currentCommand").set({
      type: "CAPTURE",
      message: message,
      hunterName: hunterName,
      runnerName: runnerName,
      createdAt: now,
      id: "CAPTURE_" + now,
      at: new Date(now).toISOString()
    });

    if(typeof window.updateRadioCard === "function"){
      window.updateRadioCard(message);
    }else{
      const radio = document.getElementById("radioCardText");
      if(radio) radio.textContent = message;
    }
  }

  async function applyCapture(hunterId, hunterPlayer, runnerId, runnerPlayer, distanceM){
    if(capturing) return false;

    const now = Date.now();
    if(now - lastCaptureAt < CAPTURE_COOLDOWN_MS) return false;

    const db = getDb();
    if(!db) return false;

    capturing = true;
    lastCaptureAt = now;

    const hunterName = getNickname(hunterPlayer, hunterId);
    const runnerName = getNickname(runnerPlayer, runnerId);
    const hunterMinutes = getHunterMinutes();
    const hunterUntil = now + hunterMinutes * 60 * 1000;
    const isDummyHunter = hunterPlayer && hunterPlayer.isDummy === true;

    try{
      setCaptureStatus("🔥 吸収成立：" + runnerName);

      await db.ref("streetSurvival/players/" + runnerId).update({
        role: "HUNTER",
        hunterUntil: hunterUntil,
        capturedBy: hunterId,
        capturedByName: hunterName,
        capturedAt: now,
        updatedAt: now
      });

      if(isDummyHunter){
        await db.ref("streetSurvival/players/" + hunterId).update({
          role: "HUNTER",
          capturedRunnerId: runnerId,
          capturedRunnerName: runnerName,
          capturedAt: now,
          updatedAt: now
        });
      }else{
        await db.ref("streetSurvival/players/" + hunterId).update({
          role: "RUNNER",
          hunterUntil: null,
          capturedRunnerId: runnerId,
          capturedRunnerName: runnerName,
          capturedAt: now,
          updatedAt: now
        });
      }

      await writeCaptureEvent(db, hunterId, hunterName, runnerId, runnerName, distanceM);

      const myId = getPlayerId();
      if(myId === hunterId){
        logMsg("🔥 吸収成立：" + runnerName + "を捕まえました");
      }else if(myId === runnerId){
        logMsg("🔥 捕まりました：HUNTERになりました");
        setCaptureStatus("🔥 捕まりました：HUNTERになりました");
      }else{
        logMsg("🔥 吸収成立：" + hunterName + " → " + runnerName);
      }

      return true;
    }catch(e){
      console.warn("[capture-sync] 吸収処理失敗", e);
      setCaptureStatus("吸収判定：エラー");
      lastCaptureAt = 0;
      return false;
    }finally{
      capturing = false;
    }
  }

  async function evaluateCapture(){
    ensureCaptureStatus();

    const myId = getPlayerId();
    if(!myId){
      setCaptureStatus("吸収判定：playerIdなし");
      return;
    }

    if(!selfPlayer){
      setCaptureStatus("吸収判定：待機中");
      return;
    }

    const role = getOwnRole();
    const ownLoc = getOwnLocation();
    const battleRange = getBattleRange();
    const now = Date.now();

    if(now - lastCaptureAt < CAPTURE_COOLDOWN_MS){
      setCaptureStatus("吸収判定：クールダウン中");
      return;
    }

    // 通常は自分がHUNTERの時だけ判定。
    // 例外: isDummy TEST HUNTER は端末がないため、RUNNER側で接近検知する。
    if(role === "RUNNER"){
      if(isOwnSafe()){
        setCaptureStatus("SAFE中のため吸収無効");
        if(now - lastSafeLogAt > SAFE_LOG_COOLDOWN_MS){
          lastSafeLogAt = now;
          logMsg("SAFE中のため吸収無効");
        }
        return;
      }

      if(!ownLoc){
        setCaptureStatus("吸収判定：位置情報なし");
        return;
      }

      // TEST HUNTER (isDummy) はクライアントを持たないため、RUNNER側で接近を検知して吸収する
      const dummyHunter = findNearestDummyHunter(ownLoc.lat, ownLoc.lng, myId);
      if(dummyHunter && dummyHunter.distanceM <= battleRange){
        setCaptureStatus("🔥 吸収成立：" + getNickname(selfPlayer, myId));
        await applyCapture(
          dummyHunter.playerId,
          dummyHunter.player,
          myId,
          selfPlayer,
          dummyHunter.distanceM
        );
        return;
      }

      if(dummyHunter){
        setCaptureStatus(
          "吸収判定：TEST HUNTER接近中\n約" + Math.round(dummyHunter.distanceM) + "m / 判定" + battleRange + "m"
        );
      }else{
        setCaptureStatus("吸収判定：待機中");
      }
      return;
    }

    if(role !== "HUNTER"){
      setCaptureStatus("吸収判定：待機中");
      return;
    }

    if(!ownLoc){
      setCaptureStatus("吸収判定：HUNTER中 / 位置情報なし");
      return;
    }

    const nearest = findNearestCapturableRunner(ownLoc.lat, ownLoc.lng, myId);
    if(!nearest){
      setCaptureStatus("吸収判定：HUNTER中 / RUNNER探索中");
      return;
    }

    if(nearest.distanceM > battleRange){
      setCaptureStatus(
        "吸収判定：HUNTER中 / RUNNER探索中\n最寄り " + nearest.nickname + " 約" + Math.round(nearest.distanceM) + "m"
      );
      return;
    }

    setCaptureStatus("🔥 吸収成立：" + nearest.nickname);
    await applyCapture(
      myId,
      selfPlayer,
      nearest.playerId,
      nearest.player,
      nearest.distanceM
    );
  }

  window.evaluateCapture = evaluateCapture;

  function watchSelf(){
    if(selfWatchStarted) return;
    const db = getDb();
    const playerId = getPlayerId();
    if(!db || !playerId) return;

    selfWatchStarted = true;
    playerRef = db.ref("streetSurvival/players/" + playerId);
    playerRef.on("value", snap => {
      selfPlayer = snap.val();
      evaluateCapture();
    });
  }

  function watchPlayers(){
    if(playersWatchStarted) return;
    const db = getDb();
    if(!db){
      setTimeout(watchPlayers, BOOT_RETRY_MS);
      return;
    }

    playersWatchStarted = true;
    db.ref("streetSurvival/players").on("value", snap => {
      allPlayers = snap.val() || {};
      const myId = getPlayerId();
      if(myId && allPlayers[myId]){
        selfPlayer = allPlayers[myId];
      }
      evaluateCapture();
    });
  }

  function startEvalLoop(){
    if(evalTimer) return;
    let lastKnownIsSafe = window.STREET_SURVIVAL_IS_SAFE === true;
    evalTimer = setInterval(() => {
      const isSafeNow = window.STREET_SURVIVAL_IS_SAFE === true;
      if(isSafeNow !== lastKnownIsSafe){
        lastKnownIsSafe = isSafeNow;
        if(!isSafeNow){
          setCaptureStatus("吸収判定：SAFE解除後の再判定");
        }
      }
      evaluateCapture();
    }, EVAL_INTERVAL_MS);
  }

  let bootLogged = false;

  function showBootLog(){
    ensureCaptureStatus();
    if(!bootLogged){
      bootLogged = true;
      logMsg("capture-sync.js 起動");
      logMsg("吸収判定：待機中");
    }
    setCaptureStatus("capture-sync.js 起動\n吸収判定：待機中");
  }

  function boot(){
    showBootLog();

    if(!getPlayerId()){
      setCaptureStatus("capture-sync.js 起動\n吸収判定：playerIdなし");
      setTimeout(boot, BOOT_RETRY_MS);
      return;
    }

    if(!window.firebase || typeof firebase.database !== "function" || !getDb()){
      setCaptureStatus("capture-sync.js 起動\n吸収判定：Firebase待機中");
      setTimeout(boot, BOOT_RETRY_MS);
      return;
    }

    if(started) return;
    started = true;

    setCaptureStatus("吸収判定：待機中");

    watchSelf();
    watchPlayers();
    startEvalLoop();
    evaluateCapture();
  }

  // スクリプト読込直後に必ず画面へ起動表示
  try{
    showBootLog();
  }catch(e){
    console.warn("[capture-sync] 初期表示失敗", e);
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
    selfWatchStarted = false;
    playerRef = null;
    selfPlayer = null;
    allPlayers = {};
    lastCaptureAt = 0;
    lastStatusText = "";
    bootLogged = false;
    if(evalTimer){
      clearInterval(evalTimer);
      evalTimer = null;
    }
    setTimeout(boot, 800);
  });
})();
