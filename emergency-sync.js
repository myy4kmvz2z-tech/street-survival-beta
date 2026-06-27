/* EMERGENCY SYNC v1.0 - streetSurvival/emergency リアルタイム監視 */

(function(){
  const VERSION = 1;

  let started = false;
  let overlay = null;
  let wasActive = false;
  let stylesInjected = false;

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

  function injectStyles(){
    if(stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "ssEmergencySyncStyles";
    style.textContent = [
      "#ssEmergencyOverlay.ss-emergency-overlay{",
      "position:fixed!important;",
      "inset:0!important;",
      "z-index:1000002!important;",
      "display:flex!important;",
      "align-items:center!important;",
      "justify-content:center!important;",
      "padding:24px!important;",
      "box-sizing:border-box!important;",
      "background:radial-gradient(circle at 50% 20%,rgba(120,20,20,.92) 0%,rgba(20,5,5,.97) 55%,#050101 100%)!important;",
      "color:#fff!important;",
      "text-align:center!important;",
      "}",
      "#ssEmergencyOverlay.ss-emergency-overlay.hidden{display:none!important;}",
      "#ssEmergencyOverlay .ss-emergency-panel{",
      "width:100%;",
      "max-width:420px;",
      "padding:28px 22px;",
      "border-radius:28px;",
      "border:2px solid rgba(255,255,255,.18);",
      "background:rgba(0,0,0,.35);",
      "box-shadow:0 24px 80px rgba(0,0,0,.55);",
      "}",
      "#ssEmergencyOverlay .ss-emergency-icon{",
      "font-size:72px;",
      "line-height:1;",
      "margin-bottom:16px;",
      "}",
      "#ssEmergencyOverlay .ss-emergency-title{",
      "display:block;",
      "font-size:clamp(28px,7vw,36px);",
      "font-weight:900;",
      "letter-spacing:.04em;",
      "margin-bottom:18px;",
      "color:#fff;",
      "}",
      "#ssEmergencyOverlay .ss-emergency-text{",
      "margin:0 0 16px;",
      "font-size:17px;",
      "line-height:1.7;",
      "font-weight:700;",
      "color:#fff;",
      "}",
      "#ssEmergencyOverlay .ss-emergency-message{",
      "margin:0;",
      "font-size:15px;",
      "line-height:1.6;",
      "color:rgba(255,255,255,.88);",
      "padding:14px 12px;",
      "border-radius:16px;",
      "background:rgba(255,255,255,.08);",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureOverlay(){
    if(overlay) return overlay;

    injectStyles();

    overlay = document.createElement("div");
    overlay.id = "ssEmergencyOverlay";
    overlay.className = "ss-emergency-overlay hidden";
    overlay.innerHTML =
      "<div class=\"ss-emergency-panel\">" +
        "<div class=\"ss-emergency-icon\">🚨</div>" +
        "<strong class=\"ss-emergency-title\">ゲーム一時停止中</strong>" +
        "<p class=\"ss-emergency-text\">安全確認してください。<br>運営の指示に従ってください。</p>" +
        "<p class=\"ss-emergency-message\"></p>" +
      "</div>";

    document.body.appendChild(overlay);
    return overlay;
  }

  function vibrateEmergency(){
    if(!("vibrate" in navigator)) return;

    try{
      navigator.vibrate([300, 120, 300, 120, 500]);
    }catch(e){}
  }

  function applyEmergency(data){
    const el = ensureOverlay();
    const active = !!(data && data.active === true);
    const messageEl = el.querySelector(".ss-emergency-message");

    if(!active){
      el.classList.add("hidden");
      wasActive = false;
      window.STREET_SURVIVAL_EMERGENCY_ACTIVE = false;
      return;
    }

    el.classList.remove("hidden");
    window.STREET_SURVIVAL_EMERGENCY_ACTIVE = true;

    const message = data && data.message ? String(data.message).trim() : "";
    if(messageEl){
      if(message){
        messageEl.textContent = message;
        messageEl.style.display = "block";
      }else{
        messageEl.textContent = "";
        messageEl.style.display = "none";
      }
    }

    if(!wasActive){
      wasActive = true;
      logMsg("🚨 緊急停止中");
      vibrateEmergency();
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

    db.ref("streetSurvival/emergency").on("value", snap => {
      applyEmergency(snap.val());
    });
  }

  window.addEventListener("load", () => {
    setTimeout(start, 1800);
  });
})();
