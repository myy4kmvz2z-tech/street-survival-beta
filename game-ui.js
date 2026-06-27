/* GAME UI v1.0 - 本番デザイン */

(function(){
  const EVENT_BADGES = {
    NORMAL: { text: "通常", cls: "event-normal" },
    ALERT: { text: "警戒", cls: "event-alert" },
    BOSS: { text: "👹 BOSS", cls: "event-boss" },
    MISSION: { text: "🎯 MISSION", cls: "event-mission" },
    LIVE: { text: "🎵 LIVE", cls: "event-live" },
    SAFE: { text: "🛡 SAFE", cls: "event-safe" },
    FINAL: { text: "🔥 FINAL", cls: "event-final" },
    END: { text: "🏁 END", cls: "event-end" },
    EMERGENCY: { text: "🚨 EMERGENCY", cls: "event-emergency" },
    RADIO: { text: "📻 RADIO", cls: "event-radio" }
  };

  const ROLE_VISUAL = {
    RUNNER: { icon: "🔵", title: "RUNNER", sub: "逃走中", panel: "runner-mode", theme: "theme-runner" },
    HUNTER: { icon: "🟢", title: "HUNTER", sub: "追跡中", panel: "hunter-mode", theme: "theme-hunter" },
    SAFE: { icon: "🛡", title: "SAFE", sub: "安全エリア", panel: "safe-mode", theme: "theme-safe" },
    BOSS: { icon: "👹", title: "BOSS", sub: "ボス出現中", panel: "boss-mode", theme: "theme-boss" },
    FINAL: { icon: "🔥", title: "FINAL", sub: "ファイナルバトル", panel: "final-mode", theme: "theme-final" },
    ALERT: { icon: "⚠️", title: "ALERT", sub: "警戒中", panel: "battle-mode", theme: "theme-alert" },
    UNKNOWN: { icon: "⚪", title: "UNKNOWN", sub: "確認中", panel: "runner-mode", theme: "theme-unknown" }
  };

  let lastCommandType = "NORMAL";
  let lastRadioText = "";
  let commandWatchStarted = false;

  function getDb(){
    try{
      if(typeof SS_FINAL_DB !== "undefined" && SS_FINAL_DB) return SS_FINAL_DB;
    }catch(e){}
    try{
      if(window.firebase && firebase.apps && firebase.apps.length) return firebase.database();
    }catch(e){}
    return null;
  }

  function getMaxHp(){
    try{
      if(window.STREET_SURVIVAL_SETTINGS && window.STREET_SURVIVAL_SETTINGS.maxHp){
        return Number(window.STREET_SURVIVAL_SETTINGS.maxHp) || 300;
      }
    }catch(e){}
    try{
      if(typeof CONFIG !== "undefined" && CONFIG.maxHp) return CONFIG.maxHp;
    }catch(e){}
    return 300;
  }

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }

  function detectVisualMode(playerData){
    const role = String((playerData && playerData.role) || "RUNNER").toUpperCase();
    let cityMode = "NORMAL";
    let zone = "FIELD";
    let bossActive = false;
    let liveActive = false;

    try{
      if(typeof state !== "undefined"){
        cityMode = state.cityMode || "NORMAL";
        zone = state.me && state.me.zone ? state.me.zone : "FIELD";
        bossActive = !!state.bossActive;
        liveActive = !!state.liveActive;
      }
    }catch(e){}

    if(lastCommandType === "EMERGENCY" || window.STREET_SURVIVAL_EMERGENCY_ACTIVE){
      return "ALERT";
    }
    if(lastCommandType === "FINAL" || cityMode === "FINAL") return "FINAL";
    if(lastCommandType === "BOSS" || cityMode === "BOSS" || bossActive) return "BOSS";
    if(lastCommandType === "SAFE" || lastCommandType === "LIVE" || cityMode === "SAFE" || cityMode === "LIVE" || liveActive || zone !== "FIELD") return "SAFE";
    if(role === "HUNTER") return "HUNTER";
    if(lastCommandType === "ALERT" || cityMode === "ALERT") return "ALERT";
    if(role === "RUNNER") return "RUNNER";
    return "UNKNOWN";
  }

  window.updateRoleDesign = function(modeKey){
    const visual = ROLE_VISUAL[modeKey] || ROLE_VISUAL.UNKNOWN;
    const panel = document.getElementById("statusPanel");
    const gameScreen = document.getElementById("gameScreen");

    setText("statusIcon", visual.icon);
    setText("statusTitle", visual.title);
    setText("statusSub", visual.sub);

    if(panel){
      panel.className = "status-panel status-hero " + visual.panel + " " + visual.theme;
    }

    if(gameScreen){
      gameScreen.classList.remove(
        "theme-runner","theme-hunter","theme-safe","theme-boss","theme-final","theme-alert","theme-unknown"
      );
      gameScreen.classList.add(visual.theme);
    }
  };

  window.updateHpGauge = function(hp, maxHp){
    const max = maxHp || getMaxHp();
    const current = Math.max(0, Math.round(Number(hp) || 0));
    const pct = Math.max(0, Math.min(100, (current / max) * 100));

    setText("hpText", current + " / " + max);

    const bar = document.getElementById("hpBar");
    if(bar){
      bar.style.width = pct + "%";
      bar.classList.toggle("hp-low", pct <= 30);
      bar.classList.toggle("hp-mid", pct > 30 && pct <= 60);
      bar.classList.toggle("hp-high", pct > 60);
    }
  };

  window.updateEventBadge = function(cmd){
    const badge = document.getElementById("eventBadge");
    if(!badge) return;

    const type = cmd && cmd.type ? String(cmd.type).toUpperCase() : lastCommandType;
    lastCommandType = type;

    const info = EVENT_BADGES[type] || EVENT_BADGES.NORMAL;
    badge.textContent = info.text;
    badge.className = "event-badge " + info.cls;
  };

  window.updateRadioCard = function(message){
    const text = String(message || "").trim();
    if(text) lastRadioText = text;

    const el = document.getElementById("radioCardText");
    if(!el) return;

    el.textContent = lastRadioText || "RADIO待機中";
  };

  function updateParticipantLabel(){
    const nick = localStorage.getItem("street_survival_nickname");
    if(nick){
      setText("participantLabel", "参加者：" + nick);
    }
  }

  function updateEventTitle(){
    const name = window.STREET_SURVIVAL_SETTINGS && window.STREET_SURVIVAL_SETTINGS.eventName;
    if(name){
      setText("gameEventTitle", name);
    }
  }

  function updateHunterTimeLarge(playerData){
    const card = document.getElementById("hunterTimeCard");
    const large = document.getElementById("hunterTimeLarge");
    const mini = document.getElementById("hunterTimer");
    if(!card || !large) return;

    const role = String((playerData && playerData.role) || "RUNNER").toUpperCase();
    const isHunter = role === "HUNTER";

    if(!isHunter){
      card.classList.add("is-idle");
      large.textContent = "--:--";
      return;
    }

    card.classList.remove("is-idle");

    let text = mini ? String(mini.textContent || "").trim() : "";
    if(!text || text === "-"){
      const endsAt = Number((playerData && playerData.hunterEndsAt) || 0);
      if(endsAt){
        const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        text = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      }else{
        text = "HUNTER";
      }
    } else if(/^\d:\d{2}$/.test(text)){
      const parts = text.split(":");
      text = String(parts[0]).padStart(2, "0") + ":" + parts[1];
    }

    large.textContent = text;
  }

  function updateInfoGrid(){
    const alert = document.getElementById("alertStatus");
    const conn = document.getElementById("connectionStatus");
    const fb = document.getElementById("firebaseStatus");

    if(alert) setText("infoWarning", alert.textContent.replace(/^[^\s]+\s*/, "") || "待機中");

    if(conn){
      setText("infoConnection", conn.textContent || "確認中");
    }else if(fb){
      const fbText = fb.textContent || "";
      if(/接続|OK|connected/i.test(fbText)){
        setText("infoConnection", "接続中");
      }else if(/エラー|error/i.test(fbText)){
        setText("infoConnection", "エラー");
      }else{
        setText("infoConnection", "確認中");
      }
    }
  }

  window.updateGameUI = function(playerData){
    updateEventTitle();
    updateParticipantLabel();

    const modeKey = detectVisualMode(playerData);
    window.updateRoleDesign(modeKey);

    const hp = playerData && typeof playerData.hp === "number"
      ? playerData.hp
      : (typeof state !== "undefined" && state.me ? state.me.hp : 100);

    window.updateHpGauge(hp, getMaxHp());
    updateHunterTimeLarge(playerData);
    updateInfoGrid();
    window.updateEventBadge({ type: lastCommandType });
    window.updateRadioCard(lastRadioText);
  };

  function updateGameUIFromState(){
    const player = {
      role: typeof state !== "undefined" && state.me
        ? (state.me.role === "hunter" ? "HUNTER" : "RUNNER")
        : "RUNNER",
      hp: typeof state !== "undefined" && state.me ? state.me.hp : 100,
      hunterEndsAt: typeof state !== "undefined" && state.me ? state.me.hunterEndsAt : null
    };
    window.updateGameUI(player);
  }

  function hookSetRadio(){
    if(typeof setRadio !== "function" || setRadio.__ssGameUiHooked) return;
    const original = setRadio;
    window.setRadio = function(text){
      original(text);
      window.updateRadioCard(text);
    };
    window.setRadio.__ssGameUiHooked = true;
  }

  function hookReceiveRadio(){
    if(typeof receiveRadio !== "function" || receiveRadio.__ssGameUiHooked) return;
    const original = receiveRadio;
    window.receiveRadio = function(message){
      original(message);
      window.updateRadioCard(message);
    };
    window.receiveRadio.__ssGameUiHooked = true;
  }

  function hookApplyCommand(){
    if(typeof ssFinalApplyCommand !== "function" || ssFinalApplyCommand.__ssGameUiHooked) return;
    const original = ssFinalApplyCommand;
    window.ssFinalApplyCommand = function(cmd){
      original(cmd);
      if(cmd && cmd.type){
        window.updateEventBadge(cmd);
        if(cmd.type === "RADIO" && cmd.message){
          window.updateRadioCard(cmd.message);
        }
      }
      updateGameUIFromState();
    };
    window.ssFinalApplyCommand.__ssGameUiHooked = true;
  }

  function hookRender(){
    if(typeof render !== "function" || render.__ssGameUiHooked) return;
    const original = render;
    window.render = function(){
      original();
      updateGameUIFromState();
    };
    window.render.__ssGameUiHooked = true;
  }

  function watchCurrentCommand(){
    if(commandWatchStarted) return;

    const db = getDb();
    if(!db){
      setTimeout(watchCurrentCommand, 1000);
      return;
    }

    commandWatchStarted = true;

    db.ref("streetSurvival/currentCommand").on("value", snap => {
      const cmd = snap.val();
      if(cmd){
        window.updateEventBadge(cmd);
        if(cmd.type === "RADIO" && cmd.message){
          window.updateRadioCard(cmd.message);
        }
      }
    });
  }

  function init(){
    hookSetRadio();
    hookReceiveRadio();
    hookApplyCommand();
    hookRender();
    watchCurrentCommand();
    updateGameUIFromState();
    setInterval(updateInfoGrid, 2000);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

  window.addEventListener("load", () => {
    setTimeout(init, 1200);
  });
})();
