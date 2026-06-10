
const DEFAULT_CENTER={lat:35.5008,lng:137.5032};
const CONFIG={eventDurationSec:21600,initialHp:100,maxHp:300,minHp:0,drainPerSec:1,chargePerTick:2,chargeTickSec:5,hunterMaxSec:600,invincibleSec:5,battleRangeM:7,hunterSenseM:15,radarRangeM:100};
const state={eventStartAt:Date.now(),cityMode:"NORMAL",participantCount:18,simulatedHunters:5,simulatedSafe:4,bossActive:false,missionActive:false,liveActive:false,viewMode:"radar",me:{id:"me",name:"RED",hp:100,points:0,role:"runner",lat:DEFAULT_CENTER.lat,lng:DEFAULT_CENTER.lng,hunterEndsAt:null,invincibleUntil:0,zone:"FIELD"},npcs:[{id:"dai",name:"DAI",hp:100,role:"hunter",lat:35.50095,lng:137.50325,hunterEndsAt:Date.now()+600000},{id:"shinya",name:"SHINYA",hp:100,role:"runner",lat:35.50055,lng:137.50285,hunterEndsAt:null},{id:"taro",name:"TARO",hp:100,role:"runner",lat:35.5011,lng:137.50365,hunterEndsAt:null}],zones:[{id:"onn",name:"お宿 Onn",lat:35.5008,lng:137.5032,radius:35},{id:"coffee",name:"喫茶店",lat:35.50125,lng:137.5020,radius:25},{id:"food",name:"飲食店",lat:35.49975,lng:137.5040,radius:25},{id:"honmachi",name:"本町",lat:35.50105,lng:137.5042,radius:30},{id:"shinmachi",name:"新町",lat:35.49975,lng:137.5046,radius:30}],log:[],map:null,meMarker:null,accuracyCircle:null,zoneLayers:[],npcMarkers:[],watchId:null,lastChargeAt:0,lastDrainAt:0,lastVibeAt:0};
const $=id=>document.getElementById(id);const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

// β6.0 Effect / Sound system. iPhone vibration fallback: light + animation + WebAudio.
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(Ctx) audioCtx = new Ctx();
  }
  if(audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function playTone(kind="notice"){
  const ctx = getAudioCtx();
  if(!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  const osc = ctx.createOscillator();
  osc.type = kind==="boss" || kind==="final" ? "sawtooth" : "sine";
  const freq = {
    safe: 660,
    live: 880,
    mission: 720,
    boss: 150,
    final: 110,
    danger: 220,
    notice: 520
  }[kind] || 520;
  osc.frequency.setValueAtTime(freq, now);
  if(kind==="boss" || kind==="final"){
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + 0.42);
  } else {
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.20);
  }
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.48);

  if(kind==="final" || kind==="boss"){
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(kind==="final" ? 80 : 95, now);
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.58);
  }
}
function flashBody(kind){
  const cls = kind==="safe" ? "flash-safe" :
              kind==="boss" ? "flash-boss" :
              kind==="final" ? "flash-final" :
              kind==="mission" ? "flash-mission" : "flash-safe";
  document.body.classList.remove(cls);
  void document.body.offsetWidth;
  document.body.classList.add(cls);
  setTimeout(()=>document.body.classList.remove(cls), 800);
}
function showEffect(kind="notice", icon="⚡", text="EFFECT", withSound=true){
  const overlay = $("effectOverlay");
  if(overlay){
    $("effectIcon").textContent = icon;
    $("effectText").textContent = text;
    overlay.className = `effect-overlay ${kind}-fx`;
    setTimeout(()=>overlay.classList.add("hidden"), 920);
  }
  flashBody(kind);
  const radar = $("radar");
  if(radar){
    radar.classList.remove("sound-wave");
    void radar.offsetWidth;
    radar.classList.add("sound-wave");
    setTimeout(()=>radar.classList.remove("sound-wave"), 1000);
  }
  const panel = $("statusPanel");
  if(panel){
    panel.classList.remove("ping");
    void panel.offsetWidth;
    panel.classList.add("ping");
    setTimeout(()=>panel.classList.remove("ping"), 800);
  }
  if(withSound) playTone(kind);
}

function addLog(text){const now=new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"});state.log.unshift(`[${now}] ${text}`);state.log=state.log.slice(0,80);render();}
function setRadio(text){$("radioTicker").textContent=`📻 ${text} ｜ 👹 BOSS ｜ 🎯 本町集合 ｜ 🎵 LIVE SAFE ｜ 🔥 FINAL`;addLog("📻 "+text);}
function setCityMode(mode){state.cityMode=mode;document.body.classList.remove("final-battle");if(mode==="FINAL")document.body.classList.add("final-battle");render();}
function meters(a,b){const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function bearingMeters(a,b){const latScale=111320,lngScale=111320*Math.cos(a.lat*Math.PI/180);return{x:(b.lng-a.lng)*lngScale,y:-(b.lat-a.lat)*latScale};}
function setRadarPos(id,target,visible=true){const el=$(id);if(!el)return;if(!visible){el.classList.add("hidden");return;}el.classList.remove("hidden");const v=bearingMeters(state.me,target);const range=CONFIG.radarRangeM;let x=50+(v.x/range)*42,y=50+(v.y/range)*42;x=clamp(x,8,92);y=clamp(y,8,92);el.style.left=x+"%";el.style.top=y+"%";el.style.transform="translate(-50%,-50%)";}
function updateRadar(nearest,distance,zone){const radar=$("radar");radar.classList.remove("safe","danger","final");if(zone)radar.classList.add("safe");if(state.cityMode==="FINAL")radar.classList.add("final");if(nearest&&distance<=20)radar.classList.add("danger");setRadarPos("radarOnn",state.zones[0],true);setRadarPos("radarCoffee",state.zones[1],true);setRadarPos("radarFood",state.zones[2],true);setRadarPos("radarHonmachi",state.zones[3],true);setRadarPos("radarShinmachi",state.zones[4],true);setRadarPos("radarBoss",{lat:35.49985,lng:137.50455},state.bossActive);setRadarPos("radarMission",state.zones[3],state.missionActive);$("gameBoss").classList.toggle("hidden",!state.bossActive);$("gameMission").classList.toggle("hidden",!state.missionActive);if(nearest&&nearest.role==="hunter"&&distance<=30){setRadarPos("radarHunter",nearest,true);$("radarWarning").classList.toggle("hidden",distance>CONFIG.battleRangeM);}else{$("radarHunter").classList.add("hidden");$("radarWarning").classList.add("hidden");}$("safePulse").classList.toggle("hidden",!zone);}
function vibrate(pattern){if("vibrate" in navigator){try{navigator.vibrate(pattern)}catch(e){}}}
function alertVibration(level){const now=Date.now();let interval=999999,pattern=0;if(level==="hunterSense"){interval=2000;pattern=250}else if(level==="runner30"){interval=5000;pattern=80}else if(level==="runner20"){interval=3000;pattern=120}else if(level==="runner10"){interval=1200;pattern=180}else if(level==="contact"){interval=700;pattern=[120,80,120]}if(pattern&&now-state.lastVibeAt>=interval){vibrate(pattern);state.lastVibeAt=now;}}
function showFullEvent(icon,title,sub,type=""){const el=$("fullScreenEvent");$("fullEventIcon").textContent=icon;$("fullEventTitle").textContent=title;$("fullEventSub").textContent=sub;el.className=`full-screen-event ${type}`;setTimeout(()=>el.classList.add("hidden"),2200);}
function updateStatus(cls,icon,title,sub,note){$("statusPanel").className="status-panel "+cls;$("statusIcon").textContent=icon;$("statusTitle").textContent=title;$("statusSub").textContent=sub;$("statusNote").textContent=note;}
function initMap(){state.map=L.map("realMap").setView([state.me.lat,state.me.lng],17);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(state.map);state.meMarker=L.marker([state.me.lat,state.me.lng]).addTo(state.map).bindPopup("📍 YOU");state.accuracyCircle=L.circle([state.me.lat,state.me.lng],{radius:CONFIG.battleRangeM,color:"#f7c948"}).addTo(state.map);renderZones();renderNpcMarkers();}
function renderZones(){state.zoneLayers.forEach(l=>l.remove());state.zoneLayers=[];state.zones.slice(0,3).forEach(z=>{const c=L.circle([z.lat,z.lng],{radius:z.radius,color:"#59d68d",fillOpacity:.12}).addTo(state.map);c.bindPopup(z.name);state.zoneLayers.push(c);const m=L.marker([z.lat,z.lng]).addTo(state.map);m.bindPopup(z.name);state.zoneLayers.push(m);});}
function renderNpcMarkers(){state.npcMarkers.forEach(m=>m.remove());state.npcMarkers=[];state.npcs.forEach(p=>{const marker=L.marker([p.lat,p.lng]).addTo(state.map);marker.bindPopup(`${p.role==="hunter"?"🟢":"🔵"} ${p.name}<br>HP ${Math.round(p.hp)}`);state.npcMarkers.push(marker);});}
function updateMePosition(lat,lng,accuracy=10,moveMap=true){state.me.lat=lat;state.me.lng=lng;if(state.meMarker){state.meMarker.setLatLng([lat,lng]);state.meMarker.setPopupContent(`${state.me.role==="hunter"?"🟢 HUNTER":"🔵 RUNNER"}<br>HP ${Math.round(state.me.hp)}`)}if(state.accuracyCircle){state.accuracyCircle.setLatLng([lat,lng]);state.accuracyCircle.setRadius(CONFIG.battleRangeM)}if(state.map&&moveMap)state.map.setView([lat,lng],Math.max(state.map.getZoom(),17));checkZone();render();}
function startGps(){if(!navigator.geolocation){$("gpsStatus").textContent="このブラウザはGPSに対応していません。";return;}$("gpsStatus").textContent="GPS取得中…位置情報を許可してください。";if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);state.watchId=navigator.geolocation.watchPosition(pos=>{const{latitude,longitude,accuracy}=pos.coords;updateMePosition(latitude,longitude,accuracy,true);$("gpsStatus").textContent=`GPS取得中：精度 約${Math.round(accuracy)}m`;},err=>{$("gpsStatus").textContent=`GPS取得失敗：${err.message}`;addLog(`GPS取得失敗：${err.message}`);},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});}
function checkZone(){let inZone=null;for(const z of state.zones.slice(0,3)){if(meters(state.me,z)<=z.radius){inZone=z;break}}state.me.zone=inZone?inZone.name:"FIELD";return inZone;}
function setRole(role){state.me.role=role;state.me.hunterEndsAt=role==="hunter"?Date.now()+CONFIG.hunterMaxSec*1000:null;state.me.invincibleUntil=Date.now()+CONFIG.invincibleSec*1000;addLog(role==="hunter"?"🟢 HUNTERになりました":"🔵 RUNNERになりました");setRadio(role==="hunter"?"ハンター誕生。街の気配を読め。":"ランナー復帰。SAFEを活用せよ。");render();}
function swapRolesWith(target){const oldRole=state.me.role;state.me.role=target.role;target.role=oldRole;state.me.hp=CONFIG.initialHp;target.hp=CONFIG.initialHp;state.me.hunterEndsAt=state.me.role==="hunter"?Date.now()+CONFIG.hunterMaxSec*1000:null;target.hunterEndsAt=target.role==="hunter"?Date.now()+CONFIG.hunterMaxSec*1000:null;state.me.invincibleUntil=Date.now()+CONFIG.invincibleSec*1000;addLog("🔄 HP0。役割交代！");setRadio("役割交代発生！");vibrate([200,80,200]);}
function hunterTimeout(){if(state.me.role==="hunter"&&state.me.hunterEndsAt&&Date.now()>=state.me.hunterEndsAt){state.me.role="runner";state.me.hunterEndsAt=null;state.me.invincibleUntil=Date.now()+CONFIG.invincibleSec*1000;addLog("⏰ ハンター10分終了");setRadio("ハンター終了。ランナーへ復帰。");}}
function nearestByRole(role){const targets=state.npcs.filter(p=>p.role===role);if(!targets.length)return null;return targets.sort((a,b)=>meters(state.me,a)-meters(state.me,b))[0];}
function isInvincible(){return Date.now()<state.me.invincibleUntil;}
function updateAlert(nearest,distance,zone){const box=$("alertStatus");document.body.classList.remove("danger-flash","boss-shake","safe-glow");if(state.cityMode==="FINAL")document.body.classList.add("final-battle");box.className="alert-box";if(zone){box.textContent=`🛡 ${zone.name}：SAFE / HP CHARGE`;box.classList.add("safe");updateStatus("safe-mode","🛡","SAFE",zone.name,"❤️ HP CHARGE");document.body.classList.add("safe-glow");updateRadar(nearest,distance,zone);return;}if(isInvincible()){const s=Math.ceil((state.me.invincibleUntil-Date.now())/1000);box.textContent=`🛡 無敵中：${s}秒`;box.classList.add("safe");updateStatus("safe-mode","🛡","INVINCIBLE",`${s}秒`,"態勢を立て直せ");updateRadar(nearest,distance,null);return;}if(state.me.role==="hunter"){if(nearest&&distance<=CONFIG.hunterSenseM){box.textContent=`📳 TARGET ${distance.toFixed(1)}m`;box.classList.add("level2");updateStatus("hunter-mode","🟢","HUNTER","🎯 TARGET",`${distance.toFixed(1)}m`);alertVibration("hunterSense");}else{box.textContent="🟢 ハンター：気配なし";updateStatus("hunter-mode","🟢","HUNTER","🎯 SEARCH","気配なし");}updateRadar(nearest,distance,null);return;}if(!nearest){box.textContent="🔵 ランナー：通常";updateStatus("runner-mode","🔵","RUNNER","🏃 生存中","👀 気配なし");updateRadar(null,999,null);return;}if(distance<=CONFIG.battleRangeM){box.textContent=`⚔ CONTACT ${distance.toFixed(1)}m`;box.classList.add("level3");document.body.classList.add("danger-flash");updateStatus("battle-mode","⚔","BATTLE","HP吸収中！",`${distance.toFixed(1)}m`);alertVibration("contact");}else if(distance<=10){box.textContent=`🚨 DANGER ${distance.toFixed(1)}m`;box.classList.add("level3");document.body.classList.add("danger-flash");updateStatus("battle-mode","🚨","DANGER","逃げろ！",`${distance.toFixed(1)}m`);alertVibration("runner10");}else if(distance<=20){box.textContent=`⚠ ハンター接近 ${Math.round(distance)}m`;box.classList.add("level2");updateStatus("runner-mode","⚠","ALERT","ハンター接近",`${Math.round(distance)}m`);alertVibration("runner20");}else if(distance<=30){box.textContent=`👀 気配 ${Math.round(distance)}m`;box.classList.add("level1");updateStatus("runner-mode","🔵","RUNNER","🏃 生存中",`👀 気配 ${Math.round(distance)}m`);alertVibration("runner30");}else{box.textContent="🔵 ランナー：通常";updateStatus("runner-mode","🔵","RUNNER","🏃 生存中","👀 気配なし");}updateRadar(nearest,distance,null);}
function showChargeFloat(){playTone("safe");const el=$("chargeFloat");el.classList.remove("hidden");el.style.animation="none";void el.offsetWidth;el.style.animation="";setTimeout(()=>el.classList.add("hidden"),900);}
function gameTick(){const now=Date.now();hunterTimeout();state.npcs.forEach(p=>{p.lat+=(Math.random()-.5)*0.00006;p.lng+=(Math.random()-.5)*0.00006;if(p.role==="hunter"&&p.hunterEndsAt&&now>=p.hunterEndsAt){p.role="runner";p.hunterEndsAt=null;}});renderNpcMarkers();const zone=checkZone();if(zone){$("battleStatus").textContent=`🛡 ${zone.name}：HP CHARGE中`;updateAlert(null,999,zone);if(now-state.lastChargeAt>=CONFIG.chargeTickSec*1000){const before=state.me.hp;state.me.hp=clamp(state.me.hp+CONFIG.chargePerTick,CONFIG.minHp,CONFIG.maxHp);state.lastChargeAt=now;if(state.me.hp>before){addLog(`❤️ ${zone.name}でHP +${CONFIG.chargePerTick}`);showChargeFloat();}}render();return;}const targetRole=state.me.role==="hunter"?"runner":"hunter";const nearest=nearestByRole(targetRole);const d=nearest?meters(state.me,nearest):999;updateAlert(nearest,d,null);if(!isInvincible()&&nearest&&d<=CONFIG.battleRangeM){if(now-state.lastDrainAt>=1000){state.lastDrainAt=now;const drain=state.cityMode==="FINAL"?CONFIG.drainPerSec*2:CONFIG.drainPerSec;if(state.me.role==="hunter"){nearest.hp=clamp(nearest.hp-drain,CONFIG.minHp,CONFIG.maxHp);state.me.hp=clamp(state.me.hp+drain,CONFIG.minHp,CONFIG.maxHp);state.me.points+=drain;$("battleStatus").textContent=`⚔ ${nearest.name}から吸収中 ${d.toFixed(1)}m`;if(nearest.hp<=0)swapRolesWith(nearest);}else{state.me.hp=clamp(state.me.hp-drain,CONFIG.minHp,CONFIG.maxHp);nearest.hp=clamp(nearest.hp+drain,CONFIG.minHp,CONFIG.maxHp);$("battleStatus").textContent=`⚠ ${nearest.name}に吸収されています ${d.toFixed(1)}m`;if(state.me.hp<=0)swapRolesWith(nearest);}}}else if(nearest){$("battleStatus").textContent=`通常エリア：最寄り ${nearest.name} ${Math.round(d)}m`;}render();}
function formatTime(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h>0?`${h}:${String(m).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
function renderPlayerCounts(){const hunter=state.simulatedHunters+(state.me.role==="hunter"?1:0),boss=state.bossActive?1:0,mission=state.missionActive?1:0,runner=Math.max(0,state.participantCount-hunter);$("totalPlayers").textContent=`${state.participantCount}`;$("totalPlayersFull").textContent=`${state.participantCount}人参加中`;$("hunterCount").textContent=hunter;$("runnerCount").textContent=runner;$("bossCount").textContent=boss;$("missionCount").textContent=mission;$("safeCount").textContent=state.simulatedSafe+(state.me.zone!=="FIELD"?1:0);}
function render(){if(!$("hpText"))return;state.me.name=$("playerName")?.value||"RED";$("hpText").textContent=`${Math.round(state.me.hp)}/${CONFIG.maxHp}`;$("hpBar").style.width=`${(state.me.hp/CONFIG.maxHp)*100}%`;$("points").textContent=Math.round(state.me.points);$("hunterTimer").textContent=(state.me.role==="hunter"&&state.me.hunterEndsAt)?Math.max(0,Math.ceil((state.me.hunterEndsAt-Date.now())/1000)):"-";$("zoneState").textContent=state.me.zone==="FIELD"?"FIELD":"SAFE";$("cityModeMini").textContent=state.cityMode;const elapsed=(Date.now()-state.eventStartAt)/1000;$("eventTimer").textContent=formatTime(CONFIG.eventDurationSec-elapsed);const badge=$("roleBadge");badge.textContent=state.me.role==="hunter"?"HUNTER":"RUNNER";badge.className=`badge ${state.me.role==="hunter"?"hunter":"runner"} ${isInvincible()?"invincible":""}`;$("roleBtn").textContent=state.me.role==="hunter"?"🔵 ACTION":"🟢 ACTION";renderPlayerCounts();renderPlayers();$("log").innerHTML=state.log.map(line=>`<div>${line}</div>`).join("");}
function renderPlayers(){const rows=[`<div class="item"><strong>${state.me.role==="hunter"?"🟢":"🔵"} ${state.me.name}</strong><small>HP ${Math.round(state.me.hp)} / ${CONFIG.maxHp}</small><br><small>${state.me.zone}${isInvincible()?" / 無敵中":""}</small></div>`,`<div class="item"><strong>β6.0 Effects HUD</strong><small>バイブなしでも、光・音・動きで伝える。</small></div>`].concat(state.npcs.map(p=>`<div class="item"><strong>${p.role==="hunter"?"🟢":"🔵"} ${p.name}</strong><small>HP ${Math.round(p.hp)} / ${CONFIG.maxHp}</small><br><small>距離 ${Math.round(meters(state.me,p))}m</small></div>`));$("players").innerHTML=rows.join("");}
function move(direction){const step=.00018;let lat=state.me.lat,lng=state.me.lng;if(direction==="up")lat+=step;if(direction==="down")lat-=step;if(direction==="left")lng-=step;if(direction==="right")lng+=step;updateMePosition(lat,lng,10,true);addLog(`テスト移動：${direction}`);}
function reset(){state.eventStartAt=Date.now();state.me.hp=CONFIG.initialHp;state.me.points=0;state.me.role="runner";state.me.hunterEndsAt=null;state.me.invincibleUntil=0;state.me.lat=DEFAULT_CENTER.lat;state.me.lng=DEFAULT_CENTER.lng;state.bossActive=false;state.missionActive=false;state.liveActive=false;state.log=[];state.lastVibeAt=0;setCityMode("NORMAL");setRadio("ゲーム開始");updateMePosition(state.me.lat,state.me.lng,10,true);addLog("RESET");}
function cycleViewMode(){const modes=["radar","game","real"];state.viewMode=modes[(modes.indexOf(state.viewMode)+1)%modes.length];$("radar").classList.toggle("hidden",state.viewMode!=="radar");$("gameMap").classList.toggle("hidden",state.viewMode!=="game");$("realMap").classList.toggle("hidden",state.viewMode!=="real");$("modeTitle").textContent=state.viewMode==="radar"?"🛰 RADAR":state.viewMode==="game"?"🗺 GAME MAP":"🗺 REAL MAP";$("mapModeBtn").textContent=state.viewMode==="radar"?"🗺 MAP":state.viewMode==="game"?"🌍 REAL":"🛰 RADAR";if(state.viewMode==="real"&&state.map)setTimeout(()=>state.map.invalidateSize(),150);}
function normalMode(){state.bossActive=false;state.missionActive=false;state.liveActive=false;setCityMode("NORMAL");setRadio("通常モード");}
function alertMode(){setCityMode("ALERT");setRadio("警戒情報。本町・新町に動きあり。");}
function triggerBoss(){state.bossActive=!state.bossActive;if(state.bossActive){setCityMode("BOSS");setRadio("👹 BOSS DETECTED");updateStatus("boss-mode","👹","WARNING","BOSS DETECTED","新町");showFullEvent("👹","BOSS EVENT","新町 出現！！","boss");showEffect("boss","👹","BOSS DETECTED");document.body.classList.add("boss-shake");setTimeout(()=>document.body.classList.remove("boss-shake"),2200);vibrate([200,80,200,80,300]);}else{setCityMode("NORMAL");setRadio("BOSS終了");}render();}
function triggerMission(){state.missionActive=!state.missionActive;if(state.missionActive){setCityMode("ALERT");setRadio("🎯 本町集合ミッション");updateStatus("boss-mode","🎯","MISSION","本町集合","報酬あり");showEffect("mission","🎯","MISSION");vibrate([120,80,120]);}else{setRadio("MISSION終了");}render();}
function triggerLive(){state.liveActive=true;setCityMode("LIVE");setRadio("🎵 オルタLIVE / SAFE");updateStatus("safe-mode","🎵","LIVE SAFE","お宿 Onn","戦闘停止");showFullEvent("🎵","LIVE SAFE","お宿 Onn","");showEffect("live","🎵","LIVE SAFE");vibrate([100,60,100,60,100]);render();}
function triggerSafe(){state.liveActive=true;setCityMode("SAFE");setRadio("🛡 SAFE発動");updateStatus("safe-mode","🛡","SAFE","お宿 Onn","❤️ HP CHARGE");showFullEvent("🛡","SAFE","HP CHARGE","");showEffect("safe","🛡","SAFE");render();}
function triggerFinal(){state.bossActive=true;state.missionActive=true;setCityMode("FINAL");setRadio("🔥 FINAL BATTLE");updateStatus("final-mode","🔥","FINAL","BATTLE","HP吸収2倍 / POINT2倍");showFullEvent("🔥","FINAL BATTLE","HP吸収2倍・POINT2倍","final");showEffect("final","🔥","FINAL BATTLE");vibrate([250,80,250,80,400]);render();}
function triggerEnd(){state.bossActive=false;state.missionActive=false;state.liveActive=false;setCityMode("END");setRadio("🏆 GAME END");updateStatus("boss-mode","🏆","GAME END","お疲れさまでした","お宿 Onn前へ");showFullEvent("🏆","GAME END","お疲れさまでした","");showEffect("mission","🏆","GAME END");vibrate([120,80,120,80,300]);render();}
document.addEventListener("DOMContentLoaded",()=>{initMap();document.querySelectorAll("[data-move]").forEach(btn=>btn.addEventListener("click",()=>move(btn.dataset.move)));window.addEventListener("keydown",e=>{if(e.key==="ArrowUp")move("up");if(e.key==="ArrowDown")move("down");if(e.key==="ArrowLeft")move("left");if(e.key==="ArrowRight")move("right");});$("gpsBtn").addEventListener("click",startGps);$("resetBtn").addEventListener("click",reset);$("roleBtn").addEventListener("click",()=>setRole(state.me.role==="hunter"?"runner":"hunter"));$("menuBtn").addEventListener("click",()=>{$("menuPanel").open=!$("menuPanel").open;});$("effectBtn").addEventListener("click",()=>{showEffect("notice","🔊","FX TEST");addLog("🔊 FX TEST");});$("vibeBtn").addEventListener("click",()=>{showEffect("notice","🔊","FX TEST");vibrate([120,80,120]);addLog("🔊 FX TEST");});$("mapModeBtn").addEventListener("click",cycleViewMode);$("normalBtn").addEventListener("click",normalMode);$("alertBtn").addEventListener("click",alertMode);$("bossBtn").addEventListener("click",triggerBoss);$("missionBtn").addEventListener("click",triggerMission);$("liveBtn").addEventListener("click",triggerLive);$("safeBtn").addEventListener("click",triggerSafe);$("finalBtn").addEventListener("click",triggerFinal);$("endBtn").addEventListener("click",triggerEnd);addLog("STREET SURVIVAL β5.0 起動");render();setInterval(gameTick,1000);setInterval(render,1000);});
