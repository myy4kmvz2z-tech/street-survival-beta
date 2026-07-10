/* SAFE ZONE SYNC v3.0 - streetSurvival/safeZones + ヒーラー回復 + SAFE解除反映 */

(function(){
  const VERSION = 3;
  const SAVE_INTERVAL_MS = 5000;
  const GEO_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000
  };

  window.STREET_SURVIVAL_SAFE_ZONES = window.STREET_SURVIVAL_SAFE_ZONES || [];
  window.STREET_SURVIVAL_CURRENT_LOCATION = window.STREET_SURVIVAL_CURRENT_LOCATION || null;
  window.STREET_SURVIVAL_CURRENT_SAFE_ZONE = window.STREET_SURVIVAL_CURRENT_SAFE_ZONE || null;
  window.STREET_SURVIVAL_IS_SAFE = window.STREET_SURVIVAL_IS_SAFE === true;

  let started = false;
  let zonesWatchStarted = false;
  let geoWatchId = null;
  let healerTimer = null;
  let currentHealerZoneId = null;
  let currentHealerConfig = null;
  let lastSafeZoneId = null;
  let lastSavedSafeZoneId = undefined;
  let lastSaveAt = 0;
  let currentMatch = null;
  let playerRef = null;
  let playerHp = null;

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }else{
      console.log(msg);
    }
  }

  function debug(msg, data){
    console.log("[safe-zone-sync]", msg, data !== undefined ? data : "");
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

  function getMaxHp(){
    try{
      if(window.STREET_SURVIVAL_SETTINGS && window.STREET_SURVIVAL_SETTINGS.maxHp){
        return Number(window.STREET_SURVIVAL_SETTINGS.maxHp) || 300;
      }
    }catch(e){}
    try{
      if(typeof CONFIG !== "undefined" && CONFIG.maxHp){
        return CONFIG.maxHp;
      }
    }catch(e){}
    return 300;
  }

  function isActiveZone(zone){
    if(!zone) return false;
    return zone.active === true || zone.active === "true" || zone.active === 1;
  }

  function normalizeSafeZones(raw){
    if(!raw) return [];

    const list = [];

    if(Array.isArray(raw)){
      raw.forEach((zone, index) => {
        if(!zone || !isActiveZone(zone)) return;
        list.push(Object.assign({}, zone, {
          zoneId: zone.zoneId || zone.id || ("zone_" + index)
        }));
      });
      return list;
    }

    Object.keys(raw).forEach(zoneId => {
      const zone = raw[zoneId];
      if(!zone || !isActiveZone(zone)) return;
      list.push(Object.assign({}, zone, { zoneId: zone.zoneId || zone.id || zoneId }));
    });

    return list;
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

  window.getDistanceMeters = getDistanceMeters;

  function getCurrentLocation(){
    if(window.STREET_SURVIVAL_CURRENT_LOCATION &&
      Number.isFinite(window.STREET_SURVIVAL_CURRENT_LOCATION.lat) &&
      Number.isFinite(window.STREET_SURVIVAL_CURRENT_LOCATION.lng)){
      return window.STREET_SURVIVAL_CURRENT_LOCATION;
    }

    if(window.CURRENT_LOCATION &&
      Number.isFinite(window.CURRENT_LOCATION.lat) &&
      Number.isFinite(window.CURRENT_LOCATION.lng)){
      return window.CURRENT_LOCATION;
    }

    return null;
  }

  function publishLocation(lat, lng, accuracy){
    const loc = {
      lat: lat,
      lng: lng,
      accuracy: accuracy,
      updatedAt: Date.now()
    };
    window.STREET_SURVIVAL_CURRENT_LOCATION = loc;
    window.CURRENT_LOCATION = loc;
    return loc;
  }

  function findClosestSafeZone(lat, lng){
    const zones = window.STREET_SURVIVAL_SAFE_ZONES || [];
    const latitude = Number(lat);
    const longitude = Number(lng);

    if(!Number.isFinite(latitude) || !Number.isFinite(longitude) || !zones.length){
      return null;
    }

    let closest = null;

    zones.forEach(zone => {
      const zoneLat = Number(zone.lat);
      const zoneLng = Number(zone.lng);
      const radiusM = Number(zone.radiusM != null ? zone.radiusM : zone.radius);

      if(!Number.isFinite(zoneLat) || !Number.isFinite(zoneLng) || !Number.isFinite(radiusM) || radiusM <= 0){
        return;
      }

      const distanceM = getDistanceMeters(latitude, longitude, zoneLat, zoneLng);
      if(distanceM > radiusM) return;

      const match = {
        zoneId: zone.zoneId,
        name: zone.name || zone.zoneId,
        label: zone.label || ("🛡 " + (zone.name || zone.zoneId)),
        distanceM: Math.round(distanceM),
        radiusM: radiusM,
        isHealer: zone.isHealer === true || zone.isHealer === "true" || zone.isHealer === 1,
        healAmount: Number(zone.healAmount) > 0 ? Number(zone.healAmount) : 2,
        healIntervalSec: Number(zone.healIntervalSec) > 0 ? Number(zone.healIntervalSec) : 5
      };

      if(!closest || match.distanceM < closest.distanceM){
        closest = match;
      }
    });

    return closest;
  }

  window.findSafeZone = function(lat, lng){
    return findClosestSafeZone(lat, lng);
  };

  function ensurePlayerRef(){
    if(playerRef) return playerRef;

    const playerId = getPlayerId();
    const db = getDb();
    if(!playerId || !db) return null;

    playerRef = db.ref("streetSurvival/players/" + playerId);
    return playerRef;
  }

  function watchPlayerHp(){
    const ref = ensurePlayerRef();
    if(!ref || ref.__ssSafeZoneHpWatch) return;

    ref.__ssSafeZoneHpWatch = true;
    ref.on("value", snap => {
      const player = snap.val();
      if(player && typeof player.hp === "number"){
        playerHp = player.hp;
      }
    });
  }

  function updateSafeZoneUI(match){
    const status = document.getElementById("safeZoneStatus");
    const healerStatus = document.getElementById("healerZoneStatus");
    const banner = document.getElementById("safeAreaBanner");
    const bannerTitle = document.getElementById("safeAreaBannerTitle");
    const bannerSub = document.getElementById("safeAreaBannerSub");
    const gameScreen = document.getElementById("gameScreen");

    if(!match){
      if(status) status.textContent = "🛡 SAFEゾーン外";
      if(healerStatus) healerStatus.textContent = "";
      if(banner) banner.classList.add("hidden");
      if(gameScreen){
        gameScreen.classList.remove("in-safe-area");
        gameScreen.classList.remove("in-healer-zone");
      }
      return;
    }

    if(status){
      status.textContent = "🛡 SAFEゾーン：" + match.name + "\n距離：" + match.distanceM + "m / 半径：" + match.radiusM + "m";
    }

    if(gameScreen){
      gameScreen.classList.add("in-safe-area");
      gameScreen.classList.toggle("in-healer-zone", !!match.isHealer);
    }

    if(banner){
      banner.classList.remove("hidden");
      banner.classList.toggle("healer-zone", !!match.isHealer);
    }

    if(match.isHealer){
      if(healerStatus){
        healerStatus.textContent = "❤️ HEALER ZONE\nHP +" + match.healAmount + " / " + match.healIntervalSec + "秒";
      }
      if(bannerTitle) bannerTitle.textContent = "❤️ HEALER ZONE";
      if(bannerSub) bannerSub.textContent = match.name + "\nHP +" + match.healAmount + " / " + match.healIntervalSec + "秒";
      setText("areaStatus", match.label || match.name);
    }else{
      if(healerStatus) healerStatus.textContent = "";
      if(bannerTitle) bannerTitle.textContent = "🛡 SAFEゾーン";
      if(bannerSub) bannerSub.textContent = match.name;
      setText("areaStatus", match.label || match.name);
    }
  }

  function logSafeZoneTransition(match){
    const newId = match ? match.zoneId : null;
    if(newId === lastSafeZoneId) return;

    if(lastSafeZoneId && !newId){
      logMsg("🛡 SAFEゾーンを出ました");
      logMsg("SAFE解除");
      logMsg("isSafe=false");
      logMsg("safeZoneName=null");
      debug("SAFE判定", "outside / cleared");
    }else if(newId){
      logMsg("🛡 SAFEゾーンに入りました：" + match.name);
      debug("SAFE判定", "inside " + match.name);
    }

    lastSafeZoneId = newId;
  }

  function notifyCaptureReevaluate(){
    try{
      if(typeof window.evaluateCapture === "function"){
        window.evaluateCapture();
      }
    }catch(e){}

    setTimeout(() => {
      try{
        if(typeof window.evaluateCapture === "function"){
          window.evaluateCapture();
        }
      }catch(e){}
    }, 500);

    setTimeout(() => {
      try{
        if(typeof window.evaluateCapture === "function"){
          window.evaluateCapture();
        }
      }catch(e){}
    }, 2500);
  }

  function applySafeState(match, options){
    const opts = options || {};
    const wasSafe = window.STREET_SURVIVAL_IS_SAFE === true;
    const isSafe = !!match;

    currentMatch = match || null;
    window.STREET_SURVIVAL_CURRENT_SAFE_ZONE = currentMatch;
    window.STREET_SURVIVAL_IS_SAFE = isSafe;

    logSafeZoneTransition(currentMatch);
    updateSafeZoneUI(currentMatch);
    saveSafeZoneState(currentMatch, { force: !!opts.force || (wasSafe && !isSafe) });
    syncHealerTimer(currentMatch);

    if(wasSafe && !isSafe){
      notifyCaptureReevaluate();
    }

    return currentMatch;
  }

  async function saveSafeZoneState(match, options){
    const ref = ensurePlayerRef();
    if(!ref) return;

    const opts = options || {};
    const now = Date.now();
    const zoneId = match ? match.zoneId : null;
    const zoneChanged = zoneId !== lastSavedSafeZoneId;

    if(!opts.force && !zoneChanged && now - lastSaveAt < SAVE_INTERVAL_MS){
      return;
    }

    lastSaveAt = now;
    lastSavedSafeZoneId = zoneId;

    try{
      if(match){
        await ref.update({
          isSafe: true,
          safeZoneId: match.zoneId,
          safeZoneName: match.name,
          safeZoneLabel: match.label,
          safeZoneDistanceM: match.distanceM,
          isHealer: !!match.isHealer,
          healerZoneName: match.isHealer ? match.name : null,
          area: match.name,
          areaKey: "safeZone",
          areaLabel: match.label,
          areaUpdatedAt: now,
          updatedAt: now
        });
      }else{
        await ref.update({
          isSafe: false,
          safeZoneId: null,
          safeZoneName: null,
          safeZoneLabel: null,
          safeZoneDistanceM: null,
          isHealer: false,
          healerZoneName: null,
          updatedAt: now
        });
        debug("Firebase SAFE解除", { isSafe: false, safeZoneName: null });
      }
    }catch(e){
      console.warn("[safe-zone-sync] Firebase保存失敗", e);
      logMsg("SAFEゾーン: Firebase保存失敗");
    }
  }

  function stopHealerTimer(reason){
    if(healerTimer){
      clearInterval(healerTimer);
      healerTimer = null;
      debug("ヒーラー停止", reason || "stop");
    }
    currentHealerZoneId = null;
    currentHealerConfig = null;
  }

  async function performHeal(zone){
    const ref = ensurePlayerRef();
    if(!ref || !zone || !zone.isHealer) return;

    try{
      const snap = await ref.once("value");
      const player = snap.val() || {};
      const maxHp = getMaxHp();
      const currentHp = Number(player.hp);
      const hp = Number.isFinite(currentHp) ? currentHp : (playerHp != null ? playerHp : 100);

      if(hp >= maxHp) return;

      const healAmount = Number(zone.healAmount) || 2;
      const newHp = Math.min(maxHp, hp + healAmount);
      const now = Date.now();

      await ref.update({
        hp: newHp,
        updatedAt: now
      });

      playerHp = newHp;

      if(typeof state !== "undefined" && state.me){
        state.me.hp = newHp;
      }

      if(typeof window.updateHpGauge === "function"){
        window.updateHpGauge(newHp, maxHp);
      }else if(typeof render === "function"){
        render();
      }

      logMsg("❤️ HP回復 +" + healAmount);

      const healerStatus = document.getElementById("healerZoneStatus");
      if(healerStatus){
        healerStatus.textContent = "❤️ HEALER ZONE：" + zone.name + " / +" + healAmount + " / " + zone.healIntervalSec + "秒";
      }
    }catch(e){
      console.warn("[safe-zone-sync] ヒーラー回復失敗", e);
    }
  }

  function syncHealerTimer(zone){
    if(!zone || !zone.isHealer){
      stopHealerTimer("left healer zone");
      return;
    }

    const sameZone = currentHealerZoneId === zone.zoneId &&
      currentHealerConfig &&
      currentHealerConfig.healIntervalSec === zone.healIntervalSec &&
      currentHealerConfig.healAmount === zone.healAmount;

    if(healerTimer && sameZone) return;

    stopHealerTimer("switch zone");
    currentHealerZoneId = zone.zoneId;
    currentHealerConfig = {
      healAmount: zone.healAmount,
      healIntervalSec: zone.healIntervalSec
    };

    const intervalMs = Math.max(1000, (zone.healIntervalSec || 5) * 1000);
    healerTimer = setInterval(() => {
      performHeal(zone);
    }, intervalMs);

    debug("ヒーラー開始", {
      zoneId: zone.zoneId,
      name: zone.name,
      healAmount: zone.healAmount,
      healIntervalSec: zone.healIntervalSec
    });
  }

  window.checkSafeZones = function(){
    const loc = getCurrentLocation();
    const zones = window.STREET_SURVIVAL_SAFE_ZONES || [];

    if(!loc){
      debug("checkSafeZones", "現在地なし");
      // 位置がなくても SAFEゾーン自体がOFFなら解除する
      if(!zones.length && (window.STREET_SURVIVAL_IS_SAFE || lastSafeZoneId || lastSavedSafeZoneId)){
        return applySafeState(null, { force: true });
      }
      return null;
    }

    if(!zones.length){
      debug("checkSafeZones", "SAFEゾーンなし / 解除");
      return applySafeState(null, { force: true });
    }

    const match = findClosestSafeZone(loc.lat, loc.lng);

    debug("現在地", { lat: loc.lat, lng: loc.lng });
    if(match){
      debug("最近接SAFE", { name: match.name, distanceM: match.distanceM, radiusM: match.radiusM });
    }else{
      debug("SAFE判定", "範囲外");
    }

    return applySafeState(match, { force: !match && window.STREET_SURVIVAL_IS_SAFE === true });
  };

  window.buildSafeZonePlayerFields = function(areaResult){
    const match = currentMatch || (areaResult && areaResult.safeZone ? areaResult.safeZone : null);

    if(match){
      return {
        isSafe: true,
        safeZoneId: match.zoneId,
        safeZoneName: match.name,
        safeZoneLabel: match.label,
        safeZoneDistanceM: match.distanceM,
        isHealer: !!match.isHealer,
        healerZoneName: match.isHealer ? match.name : null
      };
    }

    return {
      isSafe: false,
      safeZoneId: null,
      safeZoneName: null,
      safeZoneLabel: null,
      safeZoneDistanceM: null,
      isHealer: false,
      healerZoneName: null
    };
  };

  window.onSafeZoneAreaChange = function(areaResult){
    window.checkSafeZones();
  };

  window.updateSafeZoneDisplay = function(areaResult){
    updateSafeZoneUI(currentMatch);
  };

  function onGeoPosition(pos){
    const coords = pos.coords || {};
    const lat = coords.latitude;
    const lng = coords.longitude;
    const accuracy = coords.accuracy;

    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    publishLocation(lat, lng, accuracy);
    window.checkSafeZones();
  }

  function startGeoFallback(){
    if(geoWatchId !== null || getCurrentLocation()) return;
    if(!navigator.geolocation) return;

    debug("位置情報", "safe-zone-sync fallback watchPosition 開始");
    geoWatchId = navigator.geolocation.watchPosition(onGeoPosition, err => {
      console.warn("[safe-zone-sync] 位置情報エラー", err);
    }, GEO_OPTIONS);
  }

  function watchSafeZones(){
    if(zonesWatchStarted) return;

    const db = getDb();
    if(!db){
      setTimeout(watchSafeZones, 1000);
      return;
    }

    zonesWatchStarted = true;

    db.ref("streetSurvival/safeZones").on("value", snap => {
      const raw = snap.val();
      window.STREET_SURVIVAL_SAFE_ZONES = normalizeSafeZones(raw);
      const count = window.STREET_SURVIVAL_SAFE_ZONES.length;

      if(count > 0){
        logMsg("🛡 SAFEゾーン読込OK: " + count + "件");
      }else{
        logMsg("🛡 SAFEゾーンなし");
      }

      debug("SAFEゾーン読込", count + "件", window.STREET_SURVIVAL_SAFE_ZONES);
      window.checkSafeZones();
    });
  }

  function boot(){
    if(started) return;

    if(!canStart()){
      setTimeout(boot, 1000);
      return;
    }

    started = true;
    const playerId = getPlayerId();

    logMsg("✅ safe-zone-sync.js 起動 v" + VERSION);
    debug("起動", { playerId: playerId });

    ensurePlayerRef();
    watchPlayerHp();
    watchSafeZones();
    startGeoFallback();

    if(getCurrentLocation()){
      window.checkSafeZones();
    }
  }

  window.addEventListener("load", boot);

  window.addEventListener("ss-player-registered", () => {
    started = false;
    zonesWatchStarted = false;
    playerRef = null;
    lastSafeZoneId = null;
    lastSavedSafeZoneId = undefined;
    currentMatch = null;
    stopHealerTimer("register reset");
    if(geoWatchId !== null){
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    setTimeout(boot, 800);
  });

  window.addEventListener("beforeunload", () => {
    stopHealerTimer("unload");
    if(geoWatchId !== null){
      navigator.geolocation.clearWatch(geoWatchId);
    }
  });
})();
