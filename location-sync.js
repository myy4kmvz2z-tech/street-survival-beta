/* LOCATION SYNC v1.0 - 参加者位置情報 → Firebase */

(function(){
  const VERSION = 1;
  const SAVE_INTERVAL_MS = 5000;
  const WATCH_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000
  };

  /*
   * 本番座標は後で設定してください。
   * AREAS_CONFIGURED を true にし、各 lat / lng / radiusM を入れると判定が有効になります。
   */
  const AREAS_CONFIGURED = false;
  const AREA_ZONES = [
    { key: "onn", name: "Onn SAFE", lat: null, lng: null, radiusM: 50 },
    { key: "honmachi", name: "本町", lat: null, lng: null, radiusM: 80 },
    { key: "shinmachi", name: "新町", lat: null, lng: null, radiusM: 80 }
  ];

  let started = false;
  let watchId = null;
  let playerRef = null;
  let lastSaveAt = 0;
  let lastArea = "確認中";

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

  function haversineM(lat1, lng1, lat2, lng2){
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  window.detectArea = function(lat, lng){
    if(!AREAS_CONFIGURED){
      return "確認中";
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if(!Number.isFinite(latitude) || !Number.isFinite(longitude)){
      return "確認中";
    }

    for(let i = 0; i < AREA_ZONES.length; i++){
      const zone = AREA_ZONES[i];
      if(zone.lat == null || zone.lng == null || !zone.radiusM){
        continue;
      }

      const dist = haversineM(latitude, longitude, zone.lat, zone.lng);
      if(dist <= zone.radiusM){
        return zone.name;
      }
    }

    return "エリア外";
  };

  function setLocationStatus(text){
    setText("locationStatus", text);
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

  async function saveLocation(lat, lng, accuracy, area){
    if(!playerRef) return;

    const now = Date.now();
    if(now - lastSaveAt < SAVE_INTERVAL_MS){
      return;
    }

    lastSaveAt = now;

    try{
      await playerRef.update({
        location: {
          lat: lat,
          lng: lng,
          accuracy: accuracy,
          updatedAt: now
        },
        area: area,
        updatedAt: now
      });
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
    const timestamp = pos.timestamp;

    if(!Number.isFinite(lat) || !Number.isFinite(lng)){
      handleGeoError({ code: 2, message: "invalid coordinates" });
      return;
    }

    const area = window.detectArea(lat, lng);
    lastArea = area;

    const accText = Number.isFinite(accuracy) ? Math.round(accuracy) : "?";
    setLocationStatus("OK ±" + accText + "m");

    if(area !== "確認中"){
      setLocationStatus("OK ±" + accText + "m · " + area);
    }

    saveLocation(lat, lng, accuracy, area);

    if(typeof state !== "undefined" && state.me){
      state.me.lat = lat;
      state.me.lng = lng;
    }

    console.log("位置情報:", {
      lat: lat,
      lng: lng,
      accuracy: accuracy,
      timestamp: timestamp,
      area: area
    });
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

    try{
      await playerRef.update({
        area: lastArea || "確認中",
        updatedAt: Date.now()
      });
    }catch(e){
      console.warn("位置情報: 初期area保存失敗", e);
    }

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
      setTimeout(start, 800);
    }, { once: true });
  }

  window.addEventListener("beforeunload", stopWatch);
  window.addEventListener("load", bootLocationSync);
})();
