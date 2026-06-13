/* ROLE SYNC v1 - player role watcher */

(function(){
  let started = false;

  function logMsg(msg){
    if(typeof addLog === "function"){
      addLog(msg);
    }else{
      console.log(msg);
    }
  }

  function getDb(){
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

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }

  function formatTime(ms){
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function ensureHud(){
    let hud = document.getElementById("roleSyncHud");
    if(hud) return hud;

    hud = document.createElement("div");
    hud.id = "roleSyncHud";
    hud.style.position = "fixed";
    hud.style.left = "12px";
    hud.style.right = "12px";
    hud.style.bottom = "14px";
    hud.style.zIndex = "999999";
    hud.style.padding = "14px";
    hud.style.borderRadius = "16px";
    hud.style.background = "rgba(120,0,0,.95)";
    hud.style.color = "#fff";
    hud.style.fontWeight = "900";
    hud.style.textAlign = "center";
    hud.style.fontSize = "18px";
    hud.style.display = "none";
    document.body.appendChild(hud);

    return hud;
  }

  function applyRole(player, ref){
    if(!player) return;

    const role = String(player.role || "RUNNER").toUpperCase();
    const isHunter = role === "HUNTER";

    if(typeof state !== "undefined" && state.me){
      state.me.role = isHunter ? "hunter" : "runner";
      state.me.hunterEndsAt = player.hunterEndsAt || null;
      if(typeof player.hp === "number") state.me.hp = player.hp;
      if(typeof player.points === "number") state.me.points = player.points;
    }

    const badge = document.getElementById("roleBadge");
    if(badge){
      badge.textContent = role;
      badge.className = "badge " + (isHunter ? "hunter" : "runner");
    }

    setText("statusTitle", role);
    setText("statusIcon", isHunter ? "🟢" : "🔵");
    setText("statusSub", isHunter ? "🎯 追跡中" : "🏃 生存中");

    const hud = ensureHud();

    if(!isHunter){
      hud.style.display = "none";
      setText("hunterTimer", "-");
      if(typeof render === "function") render();
      return;
    }

    const endsAt = Number(player.hunterEndsAt || 0);

    if(!endsAt){
      hud.style.display = "block";
      hud.textContent = "🟢 HUNTER MODE";
      setText("hunterTimer", "HUNTER");
      if(typeof render === "function") render();
      return;
    }

    const remain = endsAt - Date.now();

    if(remain <= 0){
      hud.style.display = "block";
      hud.textContent = "🔵 RUNNERへ戻ります...";
      setText("hunterTimer", "0:00");

      ref.update({
        role: "RUNNER",
        hunterEndsAt: null,
        lastAdminAction: "HUNTER_TIME_UP",
        lastSeen: Date.now()
      });

      if(typeof render === "function") render();
      return;
    }

    const time = formatTime(remain);
    hud.style.display = "block";
    hud.textContent = "🟢 HUNTER 残り " + time;
    setText("hunterTimer", time);

    if(typeof render === "function") render();
  }

  function start(){
    if(started) return;

    const db = getDb();
    const playerId = getPlayerId();

    if(!db || !playerId){
      setTimeout(start, 1000);
      return;
    }

    started = true;

    const ref = db.ref("streetSurvival/players/" + playerId);

    ref.on("value", snap => {
      const player = snap.val();
      if(!player){
        logMsg("⚠️ 自分のFirebaseデータなし");
        return;
      }
      applyRole(player, ref);
    });

    setInterval(() => {
      ref.get().then(snap => {
        const player = snap.val();
        if(player) applyRole(player, ref);
      });
    }, 1000);

    logMsg("✅ ROLE同期開始 role-sync.js: " + playerId);
  }

  window.addEventListener("load", () => {
    setTimeout(start, 3000);
  });
})();
