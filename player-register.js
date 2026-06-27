/* PLAYER REGISTER v1 - 本番用参加者登録 */

(function(){
  window.SS_PLAYER_REGISTERED = localStorage.getItem("street_survival_registered") === "true";

  function getPlayerId(){
    let id = localStorage.getItem("street_survival_player_id");
    if(!id){
      id = "player_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      localStorage.setItem("street_survival_player_id", id);
    }
    return id;
  }

  function getInitialHp(){
    try{
      if(window.STREET_SURVIVAL_SETTINGS && window.STREET_SURVIVAL_SETTINGS.initialHp){
        return Number(window.STREET_SURVIVAL_SETTINGS.initialHp) || 100;
      }
    }catch(e){}
    return 100;
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

  function waitForDb(){
    return new Promise(resolve => {
      function tryDb(){
        const db = getDb();
        if(db){
          resolve(db);
          return;
        }
        setTimeout(tryDb, 1000);
      }
      tryDb();
    });
  }

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }else{
      console.log(msg);
    }
  }

  function applyNicknameToGame(){
    const nick = localStorage.getItem("street_survival_nickname") || "RED";
    const playerName = document.getElementById("playerName");
    if(playerName){
      playerName.value = nick;
      playerName.readOnly = true;
    }
    const label = document.getElementById("participantLabel");
    if(label){
      label.textContent = "参加者：" + nick;
    }
    try{
      if(typeof state !== "undefined" && state.me){
        state.me.name = nick;
      }
    }catch(e){}
    if(typeof render === "function"){
      render();
    }
  }

  function showGame(){
    document.documentElement.classList.add("ss-registered");
    window.SS_PLAYER_REGISTERED = true;
    applyNicknameToGame();
  }

  function showRegister(){
    document.documentElement.classList.remove("ss-registered");
    window.SS_PLAYER_REGISTERED = false;
  }

  function showRegisterError(messages){
    const el = document.getElementById("registrationMessage");
    if(!el) return;
    el.textContent = messages.join("\n");
  }

  function hideRegisterError(){
    const el = document.getElementById("registrationMessage");
    if(!el) return;
    el.textContent = "";
  }

  async function joinGame(){
    const nicknameInput = document.getElementById("nicknameInput");
    const agreeInput = document.getElementById("agreeCheck");
    const joinBtn = document.getElementById("joinButton");
    const nickname = nicknameInput ? nicknameInput.value.trim() : "";
    const agreed = agreeInput ? agreeInput.checked : false;
    const errors = [];

    if(!nickname) errors.push("ニックネームを入力してください");
    if(!agreed) errors.push("注意事項に同意してください");

    if(errors.length){
      showRegisterError(errors);
      return;
    }

    hideRegisterError();
    if(joinBtn){
      joinBtn.disabled = true;
      joinBtn.textContent = "参加処理中...";
    }

    try{
      const db = await waitForDb();
      const playerId = getPlayerId();
      const initialHp = getInitialHp();
      const now = Date.now();

      await db.ref("streetSurvival/players/" + playerId).set({
        nickname: nickname,
        name: nickname,
        role: "RUNNER",
        hp: initialHp,
        points: 0,
        joinedAt: now,
        updatedAt: now,
        online: true,
        status: "ONLINE",
        lastSeen: now,
        id: playerId
      });

      try{
        db.ref("streetSurvival/players/" + playerId).onDisconnect().update({
          online: false,
          status: "OFFLINE",
          lastSeen: Date.now(),
          updatedAt: Date.now()
        });
      }catch(e){}

      localStorage.setItem("street_survival_registered", "true");
      localStorage.setItem("street_survival_nickname", nickname);

      showGame();
      logMsg("✅ 参加登録: " + nickname);
      window.dispatchEvent(new Event("ss-player-registered"));
    }catch(e){
      console.error(e);
      showRegisterError(["参加登録に失敗しました。通信を確認してください。"]);
    }finally{
      if(joinBtn){
        joinBtn.disabled = false;
        joinBtn.textContent = "参加する";
      }
    }
  }

  function resetRegistration(){
    localStorage.removeItem("street_survival_registered");
    localStorage.removeItem("street_survival_nickname");
    location.reload();
  }

  function init(){
    if(window.SS_PLAYER_REGISTERED){
      showGame();
    }else{
      showRegister();
    }

    const joinBtn = document.getElementById("joinButton");
    if(joinBtn){
      joinBtn.addEventListener("click", joinGame);
    }

    const resetBtn = document.getElementById("registerResetBtn");
    if(resetBtn){
      resetBtn.addEventListener("click", resetRegistration);
    }

    const nicknameInput = document.getElementById("nicknameInput");
    if(nicknameInput){
      nicknameInput.addEventListener("keydown", e => {
        if(e.key === "Enter") joinGame();
      });
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();
