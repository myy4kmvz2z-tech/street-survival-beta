/* SETTINGS SYNC v1 - street-survival-admin v1.0 イベント設定連動 */

(function(){
  const VERSION = 1;

  const DEFAULTS = {
    eventName: "STREET SURVIVAL",
    hunterMinutes: 10,
    testHunterSeconds: 30,
    initialHp: 100,
    maxHp: 300,
    battleRange: 7,
    warningRange: 15,
    safeName: "お宿 Onn",
    bossMessage: "👹 BOSS出現！",
    missionMessage: "🎯 MISSION発生！",
    liveMessage: "🎵 LIVE開始！"
  };

  let started = false;
  let firstLogDone = false;

  window.STREET_SURVIVAL_SETTINGS = Object.assign({}, DEFAULTS);

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }else{
      console.log(msg);
    }
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

  function normalizeSettings(raw){
    if(!raw || typeof raw !== "object") return null;

    return {
      eventName: String(raw.eventName || DEFAULTS.eventName).trim() || DEFAULTS.eventName,
      hunterMinutes: Number(raw.hunterMinutes) || DEFAULTS.hunterMinutes,
      testHunterSeconds: Number(raw.testHunterSeconds) || DEFAULTS.testHunterSeconds,
      initialHp: Number(raw.initialHp) || DEFAULTS.initialHp,
      maxHp: Number(raw.maxHp) || DEFAULTS.maxHp,
      battleRange: Number(raw.battleRange) || DEFAULTS.battleRange,
      warningRange: Number(raw.warningRange) || DEFAULTS.warningRange,
      safeName: String(raw.safeName || DEFAULTS.safeName).trim() || DEFAULTS.safeName,
      bossMessage: String(raw.bossMessage || DEFAULTS.bossMessage).trim() || DEFAULTS.bossMessage,
      missionMessage: String(raw.missionMessage || DEFAULTS.missionMessage).trim() || DEFAULTS.missionMessage,
      liveMessage: String(raw.liveMessage || DEFAULTS.liveMessage).trim() || DEFAULTS.liveMessage
    };
  }

  function applyToConfig(settings){
    try{
      if(typeof CONFIG === "undefined" || !CONFIG) return;

      CONFIG.initialHp = settings.initialHp;
      CONFIG.maxHp = settings.maxHp;
      CONFIG.battleRangeM = settings.battleRange;
      CONFIG.hunterSenseM = settings.warningRange;
      CONFIG.hunterMaxSec = settings.hunterMinutes * 60;
    }catch(e){}
  }

  function applyToState(settings){
    try{
      if(typeof state === "undefined" || !state) return;

      if(state.zones && state.zones[0]){
        state.zones[0].name = settings.safeName;
      }

      if(state.me && typeof state.me.hp === "number"){
        state.me.hp = Math.min(state.me.hp, settings.maxHp);
      }

      if(state.accuracyCircle && typeof state.accuracyCircle.setRadius === "function"){
        state.accuracyCircle.setRadius(settings.battleRange);
      }
    }catch(e){}
  }

  function applyToUi(settings){
    document.title = settings.eventName;

    const h1 = document.querySelector(".top-header h1");
    if(h1) h1.textContent = settings.eventName;

    const ticker = document.getElementById("radioTicker");
    if(ticker){
      ticker.textContent = "📻 " + settings.eventName + " ｜ 👹 BOSS ｜ 🎯 本町集合 ｜ 🎵 LIVE SAFE ｜ 🔥 FINAL";
    }

    const zoneOnn = document.querySelector(".zone-label.zone-onn");
    if(zoneOnn){
      const safeLabel = settings.safeName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      zoneOnn.innerHTML = "🎵 " + safeLabel + "<br><small>SAFE</small>";
    }
  }

  function applySettings(settings){
    window.STREET_SURVIVAL_SETTINGS = settings;
    applyToConfig(settings);
    applyToState(settings);
    applyToUi(settings);

    if(typeof render === "function"){
      render();
    }
  }

  function handleSnapshot(snap){
    const hasSettings = snap && snap.exists();
    const normalized = hasSettings ? normalizeSettings(snap.val()) : null;
    const settings = normalized || Object.assign({}, DEFAULTS);

    applySettings(settings);

    if(firstLogDone) return;
    firstLogDone = true;

    if(hasSettings && normalized){
      logMsg("⚙ 設定読込OK: " + settings.eventName);
    }else{
      logMsg("⚙ 設定なし：初期値を使用");
    }
  }

  function start(){
    if(started) return;

    const db = getDb();
    if(!db){
      setTimeout(start, 1000);
      return;
    }

    started = true;

    db.ref("streetSurvival/settings").on("value", handleSnapshot);
  }

  window.addEventListener("load", () => {
    setTimeout(start, 1600);
  });
})();
