/* LOCATION SYNC v3.0 - 位置情報 + エリア判定 + SAFEゾーン連動 */

(function(){
  const VERSION = 3;
  const SAVE_INTERVAL_MS = 5000;
  const WATCH_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000
  };

  /*
   * エリア座標はここだけ変更すればOK（lat / lng / radiusM）
   * SAFEゾーンは streetSurvival/safeZones が最優先（safe-zone-sync.js）
   */
  const AREA_CONFIG = {
    onnSafe: {
      name: "Onn SAFE",
      label: "🟢 Onn SAFE",
      lat: 35.495000,
      lng: 137.500000,
      radiusM: 80,
      isSafe: true
    },
    honmachi: {
      name: "本町",
      label: "🟡 本町",
      lat: 35.495500,
      lng: 137.501000,
      radiusM: 180,
      isSafe: false
    },
    shinmachi: {
      name: "新町",
      label: "🔴 新町",
      lat: 35.496000,
      lng: 137.502000,
      radiusM: 180,
      isSafe: false
    }
  };

  const AREA_ORDER = ["onnSafe", "honmachi", "shinmachi"];

  const AREA_PENDING = {
    key: "pending",
    name: "確認中",
    label: "確認中",
    distanceM: null,
    isSafe: false
  };

  const AREA_OUTSIDE = {
    key: "outside",
    name: "エリア外",
    label: "⚪ エリア外",
    distanceM: null,
    isSafe: false
  };

  window.STREET_SURVIVAL_AREA_CONFIG = AREA_CONFIG;

  let started = false;
  let watchId = null;
  let playerRef = null;
  let lastSaveAt = 0;
  let lastAreaKey = null;
  let currentAreaResult = AREA_PENDING;

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }else{
      console.log(msg);
    }
  }

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }

  function getDb(){
    try{
      if(typeof SS_FINAL_DB !== "undefined" && SS_FINAL_DB){
        return SS_FINAL_DB;
      }
    }catch(e){}

    try{
      if(window.firebase && firebase.apps && firebase.apps.length){
        return firebase.database();
      }
    }catch(e){}

    return null;
  }

  function getPlayerId(){
    return localStorage.getItem("street_survival_player_id");
  }

  function isRegistered(){
    return localStorage.getItem("street_survival_registered") === "true";
  }

  function getAreaTrackingKey(areaResult){
    if(!areaResult) return "";
    if(areaResult.key === "safeZone" && areaResult.safeZone){
      return "safeZone:" + areaResult.safeZone.zoneId;
    }
    return areaResult.key || "";
  }

  window.getDistanceMeters = function(lat1, lng1, lat2, lng2){
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(Number(lat2) - Number(lat1));
    const dLng = toRad(Number(lng2) - Number(lng1));
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  window.detectLegacyArea = function(lat, lng){
    const latitude = Number(lat);
    const longitude = Number(lng);

    if(!Number.isFinite(latitude) || !Number.isFinite(longitude)){
      return Object.assign({}, AREA_PENDING);
    }

    for(let i = 0; i < AREA_ORDER.length; i++){
      const key = AREA_ORDER[i];
      const zone = AREA_CONFIG[key];
      if(!zone || !Number.isFinite(zone.lat) || !Number.isFinite(zone.lng) || !zone.radiusM){
        continue;
      }

      const distanceM = window.getDistanceMeters(latitude, longitude, zone.lat, zone.lng);
      if(distanceM <= zone.radiusM){
        return {
          key: key,
          name: zone.name,
          label: zone.label,
          distanceM: Math.round(distanceM),
          isSafe: !!zone.isSafe
        };
      }
    }

    return Object.assign({}, AREA_OUTSIDE);
  };

  window.detectArea = function(lat, lng){
    const latitude = Number(lat);
    const longitude = Number(lng);

    if(!Number.isFinite(latitude) || !Number.isFinite(longitude)){
      return Object.assign({}, AREA_PENDING);
    }

    if(typeof window.findSafeZone === "function"){
      const safeZone = window.findSafeZone(latitude, longitude);
      if(safeZone){
        return {
          key: "safeZone",
          name: safeZone.name,
          label: safeZone.label,
          distanceM: safeZone.distanceM,
          isSafe: true,
          isHealer: !!safeZone.isHealer,
          safeZone: safeZone
        };
      }
    }

    return window.detectLegacyArea(latitude, longitude);
  };

  window.updateAreaUI = function(areaResult){
    const area = areaResult || currentAreaResult || AREA_PENDING;
    currentAreaResult = area;
    window.STREET_SURVIVAL_CURRENT_AREA = area;

    if(typeof window.updateSafeZoneDisplay === "function"){
      window.updateSafeZoneDisplay(area);
    }else{
      setText("areaStatus", area.label || area.name || "確認中");

      const banner = document.getElementById("safeAreaBanner");
      if(banner){
        if(area.isSafe){
          banner.classList.remove("hidden");
        }else{
          banner.classList.add("hidden");
        }
      }

      const gameScreen = document.getElementById("gameScreen");
      if(gameScreen){
        gameScreen.classList.toggle("in-safe-area", !!area.isSafe);
      }
    }

    if(area.key !== "safeZone"){
      setText("areaStatus", area.label || area.name || "確認中");
    }
  };

  function setLocationStatus(text){
    setText("locationStatus", text);
  }

  function logAreaChange(areaResult){
    const trackingKey = getAreaTrackingKey(areaResult);
    if(!trackingKey || trackingKey === lastAreaKey){
      return;
    }

    if(areaResult.key !== "safeZone"){
      lastAreaKey = trackingKey;
      const msg = "エリア変更: " + (areaResult.label || areaResult.name);
      logMsg(msg);
      console.log(msg, areaResult);
    }else{
      lastAreaKey = trackingKey;
    }
  }

  function mapGeoError(err){
    if(!err) return { log: "位置情報: エラー", ui: "エラー" };

    switch(err.code){
      case 1:
        return {
          log: "位置情報: 許可されていません",
          ui: "許可してください"
        };
      case 2:
        return {
          log: "位置情報: 取得できません",
          ui: "取得できません"
        };
      case 3:
        return {
          log: "位置情報: タイムアウト",
          ui: "タイムアウト"
        };
      default:
        return { log: "位置情報: エラー", ui: "エラー" };
    }
  }

  function handleGeoError(err){
    const mapped = mapGeoError(err);
    setLocationStatus(mapped.ui);
    logMsg(mapped.log);
    console.warn(mapped.log, err);

    if(err && err.code === 1){
      logMsg("位置情報: iPhone Safari では設定アプリから再許可が必要な場合があります");
    }
  }

  function buildPlayerUpdate(lat, lng, accuracy, areaResult, now){
    const safeFields = typeof window.buildSafeZonePlayerFields === "function"
      ? window.buildSafeZonePlayerFields(areaResult)
      : {
          isSafe: !!areaResult.isSafe,
          safeZoneId: null,
          safeZoneName: null,
          safeZoneLabel: null,
          safeZoneDistanceM: null,
          isHealer: false,
          healerZoneName: null
        };

    return Object.assign({
      location: {
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        updatedAt: now
      },
      area: areaResult.name,
      areaKey: areaResult.key,
      areaLabel: areaResult.label,
      areaUpdatedAt: now,
      updatedAt: now
    }, safeFields);
  }

  async function saveLocation(lat, lng, accuracy, areaResult){
    if(!playerRef || !areaResult) return;

    const now = Date.now();
    if(now - lastSaveAt < SAVE_INTERVAL_MS){
      return;
    }

    lastSaveAt = now;

    try{
      await playerRef.update(buildPlayerUpdate(lat, lng, accuracy, areaResult, now));
    }catch(e){
      console.warn("位置情報: Firebase保存失敗", e);
      logMsg("位置情報: Firebase保存失敗");
    }
  }

  function onPosition(pos){
    const coords = pos.coords || {};
    const lat = coords.latitude;
    const lng = coords.longitude;
    const accuracy = coords.accuracy;

    if(!Number.isFinite(lat) || !Number.isFinite(lng)){
      handleGeoError({ code: 2, message: "invalid coordinates" });
      return;
    }

    const areaResult = window.detectArea(lat, lng);

    if(typeof window.onSafeZoneAreaChange === "function"){
      window.onSafeZoneAreaChange(areaResult);
    }

    logAreaChange(areaResult);
    window.updateAreaUI(areaResult);

    const accText = Number.isFinite(accuracy) ? Math.round(accuracy) : "?";
    setLocationStatus("OK ±" + accText + "m");

    saveLocation(lat, lng, accuracy, areaResult);

    if(typeof state !== "undefined" && state.me){
      state.me.lat = lat;
      state.me.lng = lng;
    }
  }

  function startWatch(){
    if(!navigator.geolocation){
      const msg = "位置情報: 取得できません";
      setLocationStatus("非対応");
      logMsg(msg + "（このブラウザはGPS非対応）");
      console.warn(msg);
      return;
    }

    if(watchId !== null){
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    setLocationStatus("取得中");
    window.updateAreaUI(AREA_PENDING);
    logMsg("位置情報: 取得開始（HTTPS + 許可が必要です）");

    watchId = navigator.geolocation.watchPosition(onPosition, handleGeoError, WATCH_OPTIONS);
  }

  function stopWatch(){
    if(watchId !== null){
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  async function start(){
    if(started) return;

    if(!isRegistered()){
      return;
    }

    const playerId = getPlayerId();
    if(!playerId){
      logMsg("位置情報: playerIdなし");
      console.warn("位置情報: playerIdなし");
      setLocationStatus("playerIdなし");
      return;
    }

    const db = getDb();
    if(!db){
      setTimeout(start, 1000);
      return;
    }

    started = true;
    playerRef = db.ref("streetSurvival/players/" + playerId);

    const now = Date.now();
    const initialFields = buildPlayerUpdate(null, null, null, AREA_PENDING, now);
    delete initialFields.location;

    try{
      await playerRef.update(initialFields);
    }catch(e){
      console.warn("位置情報: 初期area保存失敗", e);
    }

    window.updateAreaUI(AREA_PENDING);
    startWatch();
    logMsg("✅ 位置情報同期開始 location-sync.js v" + VERSION);
  }

  function bootLocationSync(){
    if(!isRegistered()){
      return;
    }

    setTimeout(start, 1800);

    window.addEventListener("ss-player-registered", () => {
      started = false;
      lastAreaKey = null;
      setTimeout(start, 800);
    }, { once: true });
  }

  window.addEventListener("beforeunload", stopWatch);
  window.addEventListener("load", bootLocationSync);
})();
