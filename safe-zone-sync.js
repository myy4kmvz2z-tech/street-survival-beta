/* SAFE ZONE SYNC v1.0 - streetSurvival/safeZones + ヒーラー回復 */

(function(){
  const VERSION = 1;

  window.STREET_SURVIVAL_SAFE_ZONES = window.STREET_SURVIVAL_SAFE_ZONES || {};

  let watchStarted = false;
  let healerTimer = null;
  let currentHealerZoneId = null;
  let currentHealerConfig = null;
  let lastSafeZoneId = null;
  let playerRef = null;

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

  function ensurePlayerRef(){
    if(playerRef) return playerRef;

    const playerId = getPlayerId();
    const db = getDb();
    if(!playerId || !db) return null;

    playerRef = db.ref("streetSurvival/players/" + playerId);
    return playerRef;
  }

  window.findSafeZone = function(lat, lng){
    const zones = window.STREET_SURVIVAL_SAFE_ZONES || {};
    const latitude = Number(lat);
    const longitude = Number(lng);
    const getDistance = window.getDistanceMeters;

    if(!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof getDistance !== "function"){
      return null;
    }

    let closest = null;

    Object.keys(zones).forEach(zoneId => {
      const zone = zones[zoneId];
      if(!zone || zone.active !== true) return;

      const zoneLat = Number(zone.lat);
      const zoneLng = Number(zone.lng);
      const radiusM = Number(zone.radiusM);

      if(!Number.isFinite(zoneLat) || !Number.isFinite(zoneLng) || !Number.isFinite(radiusM) || radiusM <= 0){
        return;
      }

      const distanceM = getDistance(latitude, longitude, zoneLat, zoneLng);
      if(distanceM > radiusM) return;

      const match = {
        zoneId: zoneId,
        name: zone.name || zoneId,
        label: zone.label || ("🛡 " + (zone.name || zoneId)),
        distanceM: Math.round(distanceM),
        radiusM: radiusM,
        isHealer: zone.isHealer === true,
        healAmount: Number(zone.healAmount) > 0 ? Number(zone.healAmount) : 2,
        healIntervalSec: Number(zone.healIntervalSec) > 0 ? Number(zone.healIntervalSec) : 5
      };

      if(!closest || match.distanceM < closest.distanceM){
        closest = match;
      }
    });

    return closest;
  };

  function stopHealerTimer(){
    if(healerTimer){
      clearInterval(healerTimer);
      healerTimer = null;
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
      const hp = Number.isFinite(currentHp) ? currentHp : 100;

      if(hp >= maxHp) return;

      const healAmount = Number(zone.healAmount) || 2;
      const newHp = Math.min(maxHp, hp + healAmount);
      const now = Date.now();

      await ref.update({
        hp: newHp,
        updatedAt: now
      });

      if(typeof state !== "undefined" && state.me){
        state.me.hp = newHp;
      }

      if(typeof window.updateHpGauge === "function"){
        window.updateHpGauge(newHp, maxHp);
      }else if(typeof render === "function"){
        render();
      }

      logMsg("❤️ HP回復 +" + healAmount);
      logMsg("❤️ HEALER ZONE: " + zone.name);
    }catch(e){
      console.warn("ヒーラー回復失敗", e);
    }
  }

  function startHealerTimer(zone){
    if(!zone || !zone.isHealer) return;

    const sameZone = currentHealerZoneId === zone.zoneId &&
      currentHealerConfig &&
      currentHealerConfig.healIntervalSec === zone.healIntervalSec &&
      currentHealerConfig.healAmount === zone.healAmount;

    if(healerTimer && sameZone) return;

    stopHealerTimer();
    currentHealerZoneId = zone.zoneId;
    currentHealerConfig = {
      healAmount: zone.healAmount,
      healIntervalSec: zone.healIntervalSec
    };

    const intervalMs = Math.max(1000, (zone.healIntervalSec || 5) * 1000);
    healerTimer = setInterval(() => {
      performHeal(zone);
    }, intervalMs);
  }

  function logSafeZoneTransition(areaResult){
    const safeZone = areaResult && areaResult.safeZone ? areaResult.safeZone : null;
    const newId = safeZone ? safeZone.zoneId : null;

    if(newId === lastSafeZoneId) return;

    if(lastSafeZoneId && !newId){
      logMsg("🛡 SAFEゾーンを出ました");
    }else if(newId){
      logMsg("🛡 SAFEゾーンに入りました：" + safeZone.name);
    }

    lastSafeZoneId = newId;
  }

  window.updateSafeZoneDisplay = function(areaResult){
    const banner = document.getElementById("safeAreaBanner");
    const title = document.getElementById("safeAreaBannerTitle");
    const sub = document.getElementById("safeAreaBannerSub");
    const gameScreen = document.getElementById("gameScreen");
    const safeZone = areaResult && areaResult.safeZone ? areaResult.safeZone : null;

    if(safeZone){
      if(banner) banner.classList.remove("hidden");
      if(gameScreen){
        gameScreen.classList.add("in-safe-area");
        gameScreen.classList.toggle("in-healer-zone", !!safeZone.isHealer);
      }

      if(safeZone.isHealer){
        if(title) title.textContent = "❤️ HEALER ZONE";
        if(sub) sub.textContent = safeZone.name + "\nHP +" + safeZone.healAmount + " / " + safeZone.healIntervalSec + "秒";
        if(banner) banner.classList.add("healer-zone");
      }else{
        if(title) title.textContent = "🛡 SAFEゾーン";
        if(sub) sub.textContent = safeZone.name;
        if(banner) banner.classList.remove("healer-zone");
      }

      setText("areaStatus", safeZone.label || safeZone.name);
      return;
    }

    if(banner){
      banner.classList.remove("healer-zone");

      if(areaResult && areaResult.isSafe && areaResult.key !== "safeZone"){
        banner.classList.remove("hidden");
        if(title) title.textContent = "🛡 SAFEエリア中";
        if(sub) sub.textContent = "ここでは安全です";
        if(gameScreen) gameScreen.classList.add("in-safe-area");
      }else{
        banner.classList.add("hidden");
        if(gameScreen){
          gameScreen.classList.remove("in-safe-area");
          gameScreen.classList.remove("in-healer-zone");
        }
      }
    }
  };

  window.syncSafeZoneHealer = function(areaResult){
    const safeZone = areaResult && areaResult.safeZone ? areaResult.safeZone : null;

    if(!safeZone || !safeZone.isHealer){
      stopHealerTimer();
      return;
    }

    startHealerTimer(safeZone);
  };

  window.onSafeZoneAreaChange = function(areaResult){
    logSafeZoneTransition(areaResult);
    window.syncSafeZoneHealer(areaResult);
  };

  window.buildSafeZonePlayerFields = function(areaResult){
    const safeZone = areaResult && areaResult.safeZone ? areaResult.safeZone : null;

    if(safeZone){
      return {
        isSafe: true,
        safeZoneId: safeZone.zoneId,
        safeZoneName: safeZone.name,
        safeZoneLabel: safeZone.label,
        safeZoneDistanceM: safeZone.distanceM,
        isHealer: !!safeZone.isHealer,
        healerZoneName: safeZone.isHealer ? safeZone.name : null
      };
    }

    return {
      isSafe: !!areaResult.isSafe,
      safeZoneId: null,
      safeZoneName: null,
      safeZoneLabel: null,
      safeZoneDistanceM: null,
      isHealer: false,
      healerZoneName: null
    };
  };

  function watchSafeZones(){
    if(watchStarted) return;

    const db = getDb();
    if(!db){
      setTimeout(watchSafeZones, 1000);
      return;
    }

    watchStarted = true;

    db.ref("streetSurvival/safeZones").on("value", snap => {
      window.STREET_SURVIVAL_SAFE_ZONES = snap.val() || {};
      console.log("SAFEゾーン更新:", Object.keys(window.STREET_SURVIVAL_SAFE_ZONES).length + "件");
    });

    logMsg("✅ SAFEゾーン同期開始 safe-zone-sync.js v" + VERSION);
  }

  function boot(){
    if(!isRegistered()) return;

    ensurePlayerRef();
    watchSafeZones();
  }

  window.addEventListener("load", () => {
    setTimeout(boot, 1600);
  });

  window.addEventListener("ss-player-registered", () => {
    playerRef = null;
    lastSafeZoneId = null;
    stopHealerTimer();
    setTimeout(boot, 800);
  }, { once: true });

  window.addEventListener("beforeunload", stopHealerTimer);
})();
