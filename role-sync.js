/* ROLE SYNC v5 - 本番前安定版 / street-survival-admin v54 連動 */

(function(){
  const VERSION = 5;
  window.SS_ROLE_SYNC_OFFICIAL = true;

  let started = false;
  let playerRef = null;
  let playersRef = null;
  let returnLock = false;
  let lastHunterEndsAt = null;

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

  function getPlayerId(){
    let id = localStorage.getItem("street_survival_player_id");

    if(!id){
      id = "player_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      localStorage.setItem("street_survival_player_id", id);
    }

    return id;
  }

  function setText(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }

  function maxHp(){
    try{
      if(typeof CONFIG !== "undefined" && CONFIG.maxHp){
        return CONFIG.maxHp;
      }
    }catch(e){}
    return 300;
  }

  function countOnlinePlayers(players){
    const now = Date.now();
    return players.filter(p => {
      const lastSeen = Number(p.lastSeen || 0);
      const status = String(p.status || "").toUpperCase();
      return status !== "OFFLINE" && now - lastSeen < 1000 * 60 * 5;
    });
  }

  function renderFirebasePlayerList(playersObj){
    const el = document.getElementById("players");
    if(!el) return;

    const active = countOnlinePlayers(Object.values(playersObj || {}));
    if(!active.length) return;

    const hpMax = maxHp();
    const rows = active
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"))
      .map(p => {
        const role = String(p.role || "RUNNER").toUpperCase();
        const icon = role === "HUNTER" ? "🟢" : "🔵";
        const name = p.name || p.id || "?";
        const hp = Math.round(Number(p.hp) || 0);
        return `<div class="item"><strong>${icon} ${name}</strong><small>HP ${hp} / ${hpMax}</small><br><small>${role}</small></div>`;
      });

    el.innerHTML = rows.join("");
  }

  function updatePlayerCounts(playersObj){
    const all = Object.values(playersObj || {});
    const active = countOnlinePlayers(all);

    const total = active.length;
    const hunters = active.filter(p => String(p.role || "").toUpperCase() === "HUNTER").length;
    const bosses = active.filter(p => String(p.role || "").toUpperCase() === "BOSS").length;
    const missions = active.filter(p => String(p.role || "").toUpperCase() === "MISSION").length;
    const safe = active.filter(p =>
      String(p.area || "").toUpperCase() === "SAFE" ||
      String(p.status || "").toUpperCase() === "SAFE"
    ).length;
    const runners = Math.max(0, total - hunters - bosses - missions);

    if(typeof state !== "undefined"){
      state.participantCount = total;
      state.simulatedHunters = hunters;
      state.simulatedSafe = safe;
      state.bossActive = bosses > 0 || state.bossActive;
      state.missionActive = missions > 0 || state.missionActive;
    }

    setText("totalPlayers", total);
    setText("totalPlayersFull", total + "人参加中");
    setText("hunterCount", hunters);
    setText("runnerCount", runners);
    setText("bossCount", bosses);
    setText("missionCount", missions);
    setText("safeCount", safe);

    renderFirebasePlayerList(playersObj);

    if(typeof render === "function"){
      render();
    }
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
    hud.style.boxShadow = "0 0 24px rgba(255,0,0,.45)";
    hud.style.border = "2px solid rgba(255,255,255,.35)";

    document.body.appendChild(hud);
    return hud;
  }

  function formatTime(ms){
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function syncStats(player){
    const hpMaxVal = maxHp();

    if(typeof player.hp === "number"){
      if(typeof state !== "undefined" && state.me){
        state.me.hp = player.hp;
      }
      setText("hpText", Math.round(player.hp) + "/" + hpMaxVal);
      const bar = document.getElementById("hpBar");
      if(bar){
        bar.style.width = Math.max(0, Math.min(100, (player.hp / hpMaxVal) * 100)) + "%";
      }
    }

    if(typeof player.points === "number"){
      if(typeof state !== "undefined" && state.me){
        state.me.points = player.points;
      }
      setText("points", Math.round(player.points));
    }
  }

  function setRolePanel(isHunter){
    const panel = document.getElementById("statusPanel");
    if(panel){
      panel.className = "status-panel " + (isHunter ? "hunter-mode" : "runner-mode");
    }

    const roleBtn = document.getElementById("roleBtn");
    if(roleBtn){
      roleBtn.textContent = isHunter ? "🔵 ACTION" : "🟢 ACTION";
    }
  }

  async function ensurePlayerData(ref, playerId){
    const snap = await ref.get();
    const nameInput = document.getElementById("playerName");
    const name = nameInput && nameInput.value ? nameInput.value : "RED";

    if(snap.exists()){
      await ref.update({
        name: name,
        status: "ONLINE",
        lastSeen: Date.now()
      });
      return;
    }

    await ref.set({
      id: playerId,
      name: name,
      role: "RUNNER",
      hp: 100,
      points: 0,
      area: "UNKNOWN",
      status: "ONLINE",
      lastSeen: Date.now(),
      createdAt: Date.now()
    });

    try{
      ref.onDisconnect().update({
        status: "OFFLINE",
        lastSeen: Date.now()
      });
    }catch(e){}

    logMsg("✅ 自分のFirebaseデータ作成");
  }

  async function returnToRunner(ref){
    if(!ref || returnLock) return;

    returnLock = true;

    try{
      await ref.update({
        role: "RUNNER",
        hunterEndsAt: null,
        lastAdminAction: "HUNTER_TIME_UP",
        lastSeen: Date.now()
      });

      logMsg("⏰ HUNTER時間終了 → RUNNERへ戻りました");
    }catch(e){
      console.error(e);
    }

    setTimeout(() => {
      returnLock = false;
    }, 3000);
  }

  function applyRole(player, ref){
    if(!player) return;

    const role = String(player.role || "RUNNER").toUpperCase();
    const isHunter = role === "HUNTER";

    if(typeof state !== "undefined" && state.me){
      state.me.role = isHunter ? "hunter" : "runner";
      state.me.hunterEndsAt = player.hunterEndsAt || null;
    }

    syncStats(player);

    const badge = document.getElementById("roleBadge");
    if(badge){
      badge.textContent = role;
      badge.className = "badge " + (isHunter ? "hunter" : "runner");
    }

    setText("statusTitle", role);
    setText("statusIcon", isHunter ? "🟢" : "🔵");
    setText("statusSub", isHunter ? "🎯 追跡中" : "🏃 生存中");
    setText("statusNote", isHunter ? "👀 追跡中" : "👀 気配なし");
    setRolePanel(isHunter);

    const hud = ensureHud();

    if(!isHunter){
      hud.style.display = "none";
      setText("hunterTimer", "-");
      lastHunterEndsAt = null;
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

    if(endsAt !== lastHunterEndsAt){
      lastHunterEndsAt = endsAt;
    }

    const remain = endsAt - Date.now();

    if(remain <= 0){
      hud.style.display = "block";
      hud.textContent = "🔵 RUNNERへ戻ります...";
      setText("hunterTimer", "0:00");
      returnToRunner(ref);
      if(typeof render === "function") render();
      return;
    }

    const time = formatTime(remain);

    hud.style.display = "block";
    hud.textContent = "🟢 HUNTER 残り " + time;
    setText("hunterTimer", time);

    if(typeof render === "function") render();
  }

  async function start(){
    if(started) return;

    const db = getDb();

    if(!db){
      setTimeout(start, 1000);
      return;
    }

    started = true;

    const playerId = getPlayerId();

    playerRef = db.ref("streetSurvival/players/" + playerId);
    playersRef = db.ref("streetSurvival/players");

    await ensurePlayerData(playerRef, playerId);

    playerRef.on("value", snap => {
      const player = snap.val();

      if(!player){
        logMsg("⚠️ 自分のFirebaseデータなし");
        return;
      }

      applyRole(player, playerRef);
    });

    playersRef.on("value", snap => {
      updatePlayerCounts(snap.val() || {});
    });

    setInterval(() => {
      if(!playerRef) return;

      const nameInput = document.getElementById("playerName");
      const name = nameInput && nameInput.value ? nameInput.value : null;

      const patch = {
        status: "ONLINE",
        lastSeen: Date.now()
      };

      if(name) patch.name = name;

      playerRef.update(patch);

      playerRef.get().then(snap => {
        const player = snap.val();
        if(player){
          applyRole(player, playerRef);
        }
      });
    }, 1000);

    logMsg("✅ ROLE同期開始 role-sync.js v" + VERSION);
  }

  window.addEventListener("load", () => {
    setTimeout(start, 1500);
  });
})();
