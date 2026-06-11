
const DEFAULT_CENTER={lat:35.5008,lng:137.5032};
const CONFIG={eventDurationSec:21600,initialHp:100,maxHp:300,minHp:0,drainPerSec:1,chargePerTick:2,chargeTickSec:5,hunterMaxSec:600,invincibleSec:5,battleRangeM:7,hunterSenseM:15,radarRangeM:100};
const state={eventStartAt:Date.now(),cityMode:"NORMAL",participantCount:18,simulatedHunters:5,simulatedSafe:4,bossActive:false,missionActive:false,liveActive:false,alertUntil:0,viewMode:"radar",me:{id:"me",name:"RED",hp:100,points:0,role:"runner",lat:DEFAULT_CENTER.lat,lng:DEFAULT_CENTER.lng,hunterEndsAt:null,invincibleUntil:0,zone:"FIELD"},npcs:[{id:"dai",name:"DAI",hp:100,role:"hunter",lat:35.50095,lng:137.50325,hunterEndsAt:Date.now()+600000},{id:"shinya",name:"SHINYA",hp:100,role:"runner",lat:35.50055,lng:137.50285,hunterEndsAt:null},{id:"taro",name:"TARO",hp:100,role:"runner",lat:35.5011,lng:137.50365,hunterEndsAt:null}],zones:[{id:"onn",name:"お宿 Onn",lat:35.5008,lng:137.5032,radius:35},{id:"coffee",name:"喫茶店",lat:35.50125,lng:137.5020,radius:25},{id:"food",name:"飲食店",lat:35.49975,lng:137.5040,radius:25},{id:"honmachi",name:"本町",lat:35.50105,lng:137.5042,radius:30},{id:"shinmachi",name:"新町",lat:35.49975,lng:137.5046,radius:30}],log:[],map:null,meMarker:null,accuracyCircle:null,zoneLayers:[],npcMarkers:[],watchId:null,lastChargeAt:0,lastDrainAt:0,lastVibeAt:0};
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

  function tone(freq, start, dur, type="sine", volume=0.10, slideTo=null){
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    if(slideTo){
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + start + dur);
    }
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  }

  function noise(start, dur, volume=0.06){
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700, now + start);
    gain.gain.setValueAtTime(volume, now + start);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now + start);
    src.stop(now + start + dur);
  }

  if(kind === "safe"){
    // Bright heal chime: up-up
    tone(660, 0.00, 0.18, "sine", 0.10);
    tone(880, 0.13, 0.20, "sine", 0.10);
    tone(1320,0.28, 0.18, "triangle", 0.07);
  } else if(kind === "live"){
    // Happy fanfare
    tone(523, 0.00, 0.14, "triangle", 0.09);
    tone(659, 0.12, 0.14, "triangle", 0.09);
    tone(784, 0.24, 0.18, "triangle", 0.10);
    tone(1046,0.40, 0.20, "sine", 0.08);
  } else if(kind === "mission"){
    // Alert but positive beeps
    tone(720, 0.00, 0.10, "square", 0.075);
    tone(720, 0.16, 0.10, "square", 0.075);
    tone(960, 0.32, 0.14, "square", 0.07);
  } else if(kind === "boss"){
    // Low ominous hit
    noise(0.00, 0.38, 0.08);
    tone(150, 0.00, 0.45, "sawtooth", 0.12, 75);
    tone(55,  0.04, 0.52, "square", 0.055, 38);
  } else if(kind === "final"){
    // Siren-like two-tone + rumble
    noise(0.00, 0.70, 0.055);
    tone(440, 0.00, 0.22, "sawtooth", 0.08, 660);
    tone(660, 0.23, 0.22, "sawtooth", 0.08, 440);
    tone(440, 0.46, 0.22, "sawtooth", 0.08, 660);
    tone(80,  0.00, 0.70, "square", 0.04, 60);
  } else if(kind === "end"){
    // End / win sound
    tone(523, 0.00, 0.16, "triangle", 0.09);
    tone(659, 0.14, 0.16, "triangle", 0.09);
    tone(784, 0.28, 0.16, "triangle", 0.09);
    tone(1046,0.42, 0.34, "sine", 0.10);
  } else if(kind === "danger"){
    tone(220, 0.00, 0.16, "square", 0.08);
    tone(180, 0.20, 0.16, "square", 0.08);
  } else {
    // General FX test
    tone(520, 0.00, 0.16, "sine", 0.10);
    tone(780, 0.16, 0.18, "sine", 0.10);
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
    overlay.classList.remove("hidden");
    setTimeout(()=>overlay.classList.add("hidden"), 1800);
  }

  const toast = $("fxToast");
  if(toast){
    toast.textContent = `${icon} ${text}`;
    toast.classList.remove("hidden");
    toast.style.animation = "none";
    void toast.offsetWidth;
    toast.style.animation = "";
    setTimeout(()=>toast.classList.add("hidden"), 1800);
  }

  document.body.classList.remove("fx-test-shake");
  void document.body.offsetWidth;
  document.body.classList.add("fx-test-shake");
  setTimeout(()=>document.body.classList.remove("fx-test-shake"), 1200);

  flashBody(kind);

  const radar = $("radar");
  if(radar){
    radar.classList.remove("sound-wave");
    void radar.offsetWidth;
    radar.classList.add("sound-wave");
    setTimeout(()=>radar.classList.remove("sound-wave"), 1200);
  }

  const panel = $("statusPanel");
  if(panel){
    panel.classList.remove("ping");
    void panel.offsetWidth;
    panel.classList.add("ping");
    setTimeout(()=>panel.classList.remove("ping"), 1200);
  }

  if(withSound) playTone(kind);
}

function addLog(text){const now=new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"});state.log.unshift(`[${now}] ${text}`);state.log=state.log.slice(0,80);render();
  trimDomLog();
}
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
function updateAlert(nearest,distance,zone){const box=$("alertStatus");document.body.classList.remove("boss-shake","safe-glow");
if(state.cityMode==="ALERT" && Date.now() < (state.alertUntil || 0)){
  if(box){
    box.textContent="⚠️ ALERT / 警戒発令中";
    box.className="alert-box level2";
  }
  updateStatus("alert-mode","⚠️","ALERT","警戒発令中","街に注意");
  updateRadar(nearest,distance,null);
  return;
}if(state.cityMode==="FINAL")document.body.classList.add("final-battle");box.className="alert-box";if(zone){box.textContent=`🛡 ${zone.name}：SAFE / HP CHARGE`;box.classList.add("safe");updateStatus("safe-mode","🛡","SAFE",zone.name,"❤️ HP CHARGE");document.body.classList.add("safe-glow");updateRadar(nearest,distance,zone);return;}if(isInvincible()){const s=Math.ceil((state.me.invincibleUntil-Date.now())/1000);box.textContent=`🛡 無敵中：${s}秒`;box.classList.add("safe");updateStatus("safe-mode","🛡","INVINCIBLE",`${s}秒`,"態勢を立て直せ");updateRadar(nearest,distance,null);return;}if(state.me.role==="hunter"){if(nearest&&distance<=CONFIG.hunterSenseM){box.textContent=`📳 TARGET ${distance.toFixed(1)}m`;box.classList.add("level2");updateStatus("hunter-mode","🟢","HUNTER","🎯 TARGET",`${distance.toFixed(1)}m`);alertVibration("hunterSense");}else{box.textContent="🟢 ハンター：気配なし";updateStatus("hunter-mode","🟢","HUNTER","🎯 SEARCH","気配なし");}updateRadar(nearest,distance,null);return;}if(!nearest){box.textContent="🔵 ランナー：通常";updateStatus("runner-mode","🔵","RUNNER","🏃 生存中","👀 気配なし");updateRadar(null,999,null);return;}if(distance<=CONFIG.battleRangeM){box.textContent=`⚔ CONTACT ${distance.toFixed(1)}m`;box.classList.add("level3");updateStatus("battle-mode","⚔","BATTLE","HP吸収中！",`${distance.toFixed(1)}m`);alertVibration("contact");}else if(distance<=10){box.textContent=`🚨 DANGER ${distance.toFixed(1)}m`;box.classList.add("level3");updateStatus("battle-mode","🚨","DANGER","逃げろ！",`${distance.toFixed(1)}m`);alertVibration("runner10");}else if(distance<=20){box.textContent=`⚠ ハンター接近 ${Math.round(distance)}m`;box.classList.add("level2");updateStatus("runner-mode","⚠","ALERT","ハンター接近",`${Math.round(distance)}m`);alertVibration("runner20");}else if(distance<=30){box.textContent=`👀 気配 ${Math.round(distance)}m`;box.classList.add("level1");updateStatus("runner-mode","🔵","RUNNER","🏃 生存中",`👀 気配 ${Math.round(distance)}m`);alertVibration("runner30");}else{box.textContent="🔵 ランナー：通常";updateStatus("runner-mode","🔵","RUNNER","🏃 生存中","👀 気配なし");}updateRadar(nearest,distance,null);}
function showChargeFloat(){playTone("safe");const el=$("chargeFloat");el.classList.remove("hidden");el.style.animation="none";void el.offsetWidth;el.style.animation="";setTimeout(()=>el.classList.add("hidden"),900);}
function gameTick(){const now=Date.now();hunterTimeout();state.npcs.forEach(p=>{p.lat+=(Math.random()-.5)*0.00006;p.lng+=(Math.random()-.5)*0.00006;if(p.role==="hunter"&&p.hunterEndsAt&&now>=p.hunterEndsAt){p.role="runner";p.hunterEndsAt=null;}});renderNpcMarkers();const zone=checkZone();if(zone){$("battleStatus").textContent=`🛡 ${zone.name}：HP CHARGE中`;updateAlert(null,999,zone);if(now-state.lastChargeAt>=CONFIG.chargeTickSec*1000){const before=state.me.hp;state.me.hp=clamp(state.me.hp+CONFIG.chargePerTick,CONFIG.minHp,CONFIG.maxHp);state.lastChargeAt=now;if(state.me.hp>before){addLog(`❤️ ${zone.name}でHP +${CONFIG.chargePerTick}`);showChargeFloat();}}render();return;}const targetRole=state.me.role==="hunter"?"runner":"hunter";const nearest=nearestByRole(targetRole);const d=nearest?meters(state.me,nearest):999;updateAlert(nearest,d,null);if(!isInvincible()&&nearest&&d<=CONFIG.battleRangeM){if(now-state.lastDrainAt>=1000){state.lastDrainAt=now;const drain=state.cityMode==="FINAL"?CONFIG.drainPerSec*2:CONFIG.drainPerSec;if(state.me.role==="hunter"){nearest.hp=clamp(nearest.hp-drain,CONFIG.minHp,CONFIG.maxHp);state.me.hp=clamp(state.me.hp+drain,CONFIG.minHp,CONFIG.maxHp);state.me.points+=drain;$("battleStatus").textContent=`⚔ ${nearest.name}から吸収中 ${d.toFixed(1)}m`;if(nearest.hp<=0)swapRolesWith(nearest);}else{state.me.hp=clamp(state.me.hp-drain,CONFIG.minHp,CONFIG.maxHp);nearest.hp=clamp(nearest.hp+drain,CONFIG.minHp,CONFIG.maxHp);$("battleStatus").textContent=`⚠ ${nearest.name}に吸収されています ${d.toFixed(1)}m`;if(state.me.hp<=0)swapRolesWith(nearest);}}}else if(nearest){$("battleStatus").textContent=`通常エリア：最寄り ${nearest.name} ${Math.round(d)}m`;}render();}
function formatTime(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h>0?`${h}:${String(m).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
function renderPlayerCounts(){const hunter=state.simulatedHunters+(state.me.role==="hunter"?1:0),boss=state.bossActive?1:0,mission=state.missionActive?1:0,runner=Math.max(0,state.participantCount-hunter);$("totalPlayers").textContent=`${state.participantCount}`;$("totalPlayersFull").textContent=`${state.participantCount}人参加中`;$("hunterCount").textContent=hunter;$("runnerCount").textContent=runner;$("bossCount").textContent=boss;$("missionCount").textContent=mission;$("safeCount").textContent=state.simulatedSafe+(state.me.zone!=="FIELD"?1:0);}
function render(){if(!$("hpText"))return;state.me.name=$("playerName")?.value||"RED";$("hpText").textContent=`${Math.round(state.me.hp)}/${CONFIG.maxHp}`;$("hpBar").style.width=`${(state.me.hp/CONFIG.maxHp)*100}%`;$("points").textContent=Math.round(state.me.points);$("hunterTimer").textContent=(state.me.role==="hunter"&&state.me.hunterEndsAt)?Math.max(0,Math.ceil((state.me.hunterEndsAt-Date.now())/1000)):"-";$("zoneState").textContent=state.me.zone==="FIELD"?"FIELD":"SAFE";$("cityModeMini").textContent=state.cityMode;const elapsed=(Date.now()-state.eventStartAt)/1000;$("eventTimer").textContent=formatTime(CONFIG.eventDurationSec-elapsed);const badge=$("roleBadge");badge.textContent=state.me.role==="hunter"?"HUNTER":"RUNNER";badge.className=`badge ${state.me.role==="hunter"?"hunter":"runner"} ${isInvincible()?"invincible":""}`;$("roleBtn").textContent=state.me.role==="hunter"?"🔵 ACTION":"🟢 ACTION";renderPlayerCounts();renderPlayers();$("log").innerHTML=state.log.map(line=>`<div>${line}</div>`).join("");}
function renderPlayers(){const rows=[`<div class="item"><strong>${state.me.role==="hunter"?"🟢":"🔵"} ${state.me.name}</strong><small>HP ${Math.round(state.me.hp)} / ${CONFIG.maxHp}</small><br><small>${state.me.zone}${isInvincible()?" / 無敵中":""}</small></div>`,`<div class="item"><strong>β10.3 Ops Stable HUD</strong><small>本番運営安定版。省電力・自動復帰・ログ整理。</small></div>`].concat(state.npcs.map(p=>`<div class="item"><strong>${p.role==="hunter"?"🟢":"🔵"} ${p.name}</strong><small>HP ${Math.round(p.hp)} / ${CONFIG.maxHp}</small><br><small>距離 ${Math.round(meters(state.me,p))}m</small></div>`));$("players").innerHTML=rows.join("");}
function move(direction){const step=.00018;let lat=state.me.lat,lng=state.me.lng;if(direction==="up")lat+=step;if(direction==="down")lat-=step;if(direction==="left")lng-=step;if(direction==="right")lng+=step;updateMePosition(lat,lng,10,true);addLog(`テスト移動：${direction}`);}
function reset(){state.eventStartAt=Date.now();state.me.hp=CONFIG.initialHp;state.me.points=0;state.me.role="runner";state.me.hunterEndsAt=null;state.me.invincibleUntil=0;state.me.lat=DEFAULT_CENTER.lat;state.me.lng=DEFAULT_CENTER.lng;state.bossActive=false;state.missionActive=false;state.liveActive=false;state.log=[];state.lastVibeAt=0;setCityMode("NORMAL");setRadio("ゲーム開始");updateMePosition(state.me.lat,state.me.lng,10,true);addLog("RESET");}
function cycleViewMode(){const modes=["radar","game","real"];state.viewMode=modes[(modes.indexOf(state.viewMode)+1)%modes.length];$("radar").classList.toggle("hidden",state.viewMode!=="radar");$("gameMap").classList.toggle("hidden",state.viewMode!=="game");$("realMap").classList.toggle("hidden",state.viewMode!=="real");$("modeTitle").textContent=state.viewMode==="radar"?"🛰 RADAR":state.viewMode==="game"?"🗺 GAME MAP":"🗺 REAL MAP";$("mapModeBtn").textContent=state.viewMode==="radar"?"🗺 MAP":state.viewMode==="game"?"🌍 REAL":"🛰 RADAR";if(state.viewMode==="real"&&state.map)setTimeout(()=>state.map.invalidateSize(),150);}
function normalMode(){state.bossActive=false;state.missionActive=false;state.liveActive=false;setCityMode("NORMAL");setRadio("通常モード");}
function alertMode(){hardAlertEffect("⚠️ 警戒モード発令！街に注意してください。");}
function triggerBoss(){state.bossActive=!state.bossActive;if(state.bossActive){setCityMode("BOSS");setRadio("👹 BOSS DETECTED");updateStatus("boss-mode","👹","WARNING","BOSS DETECTED","新町");showFullEvent("👹","BOSS EVENT","新町 出現！！","boss");showEffect("boss","👹","BOSS DETECTED");document.body.classList.add("boss-shake");setTimeout(()=>document.body.classList.remove("boss-shake"),2200);vibrate([200,80,200,80,300]);}else{setCityMode("NORMAL");setRadio("BOSS終了");}render();}
function triggerMission(){state.missionActive=!state.missionActive;if(state.missionActive){setCityMode("ALERT");setRadio("🎯 本町集合ミッション");updateStatus("boss-mode","🎯","MISSION","本町集合","報酬あり");showEffect("mission","🎯","MISSION");vibrate([120,80,120]);}else{setRadio("MISSION終了");}render();}
function triggerLive(){state.liveActive=true;setCityMode("LIVE");setRadio("🎵 オルタLIVE / SAFE");updateStatus("safe-mode","🎵","LIVE SAFE","お宿 Onn","戦闘停止");showFullEvent("🎵","LIVE SAFE","お宿 Onn","");showEffect("live","🎵","LIVE SAFE");vibrate([100,60,100,60,100]);render();}
function triggerSafe(){state.liveActive=true;setCityMode("SAFE");setRadio("🛡 SAFE発動");updateStatus("safe-mode","🛡","SAFE","お宿 Onn","❤️ HP CHARGE");showFullEvent("🛡","SAFE","HP CHARGE","");showEffect("safe","🛡","SAFE");render();}
function triggerFinal(){state.bossActive=true;state.missionActive=true;setCityMode("FINAL");setRadio("🔥 FINAL BATTLE");updateStatus("final-mode","🔥","FINAL","BATTLE","HP吸収2倍 / POINT2倍");showFullEvent("🔥","FINAL BATTLE","HP吸収2倍・POINT2倍","final");showEffect("final","🔥","FINAL BATTLE");vibrate([250,80,250,80,400]);render();}
function triggerEnd(){state.bossActive=false;state.missionActive=false;state.liveActive=false;setCityMode("END");setRadio("🏆 GAME END");updateStatus("boss-mode","🏆","GAME END","お疲れさまでした","お宿 Onn前へ");showFullEvent("🏆","GAME END","お疲れさまでした","");showEffect("end","🏆","GAME END");vibrate([120,80,120,80,300]);render();}
document.addEventListener("DOMContentLoaded",()=>{initMap();document.querySelectorAll("[data-move]").forEach(btn=>btn.addEventListener("click",()=>move(btn.dataset.move)));window.addEventListener("keydown",e=>{if(e.key==="ArrowUp")move("up");if(e.key==="ArrowDown")move("down");if(e.key==="ArrowLeft")move("left");if(e.key==="ArrowRight")move("right");});$("gpsBtn").addEventListener("click",startGps);$("resetBtn").addEventListener("click",reset);$("roleBtn").addEventListener("click",()=>setRole(state.me.role==="hunter"?"runner":"hunter"));$("menuBtn").addEventListener("click",()=>{$("menuPanel").open=!$("menuPanel").open;});if($("effectBtn")) $("effectBtn").addEventListener("click",()=>{showEffect("notice","🔊","FX TEST");addLog("🔊 FX TEST");});$("vibeBtn").addEventListener("click",()=>{showEffect("notice","🔊","FX TEST");vibrate([120,80,120]);addLog("🔊 FX TEST");});
if($("safeSoundBtn")) $("safeSoundBtn").addEventListener("click",()=>{showEffect("safe","🛡","SAFE SOUND");addLog("🛡 SAFE SOUND");});
if($("bossSoundBtn")) $("bossSoundBtn").addEventListener("click",()=>{showEffect("boss","👹","BOSS SOUND");addLog("👹 BOSS SOUND");});
if($("missionSoundBtn")) $("missionSoundBtn").addEventListener("click",()=>{showEffect("mission","🎯","MISSION SOUND");addLog("🎯 MISSION SOUND");});
if($("liveSoundBtn")) $("liveSoundBtn").addEventListener("click",()=>{showEffect("live","🎵","LIVE SOUND");addLog("🎵 LIVE SOUND");});
if($("finalSoundBtn")) $("finalSoundBtn").addEventListener("click",()=>{showEffect("final","🔥","FINAL SOUND");addLog("🔥 FINAL SOUND");});
if($("endSoundBtn")) $("endSoundBtn").addEventListener("click",()=>{showEffect("end","🏆","END SOUND");addLog("🏆 END SOUND");});
$("mapModeBtn").addEventListener("click",cycleViewMode);addLog("STREET SURVIVAL β8.2 起動");initFirebasePlayer();render();setInterval(gameTick,1000);setInterval(render,1000);});



function receiveRadio(message){
  setRadio(message);
  const popup = $("radioPopup");
  if(popup){
    $("radioPopupText").textContent = message;
    popup.classList.remove("hidden");
    popup.style.animation = "none";
    void popup.offsetWidth;
    popup.style.animation = "";
    setTimeout(()=>popup.classList.add("hidden"), 5000);
  }
  document.body.classList.remove("radio-flash");
  void document.body.offsetWidth;
  document.body.classList.add("radio-flash");
  setTimeout(()=>document.body.classList.remove("radio-flash"), 1000);
  showEffect("mission","📻","RADIO", false);
  playTone("mission");
}


// β8.2 Firebase realtime receive
let firebaseApp = null;
let firebaseDb = null;
let firebaseLastCommandId = null;

function setFirebaseStatus(text, cls=""){
  const el = $("firebaseStatus");
  if(!el) return;
  el.textContent = text;
  el.className = "firebase-status " + cls;
}

function loadScript(src){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`script[src="${src}"]`)) return resolve();
    const s=document.createElement("script");
    s.src=src;
    s.onload=resolve;
    s.onerror=reject;
    document.head.appendChild(s);
  });
}

async function initFirebasePlayer(){
  if(!window.STREET_SURVIVAL_FIREBASE_ENABLED){
    setFirebaseStatus("🔥 Firebase: OFF / デモ", "");
    return;
  }
  try{
    await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js");
    firebaseApp = firebase.initializeApp(window.STREET_SURVIVAL_FIREBASE_CONFIG);
    firebaseDb = firebase.database();

    firebaseDb.ref("streetSurvival/currentCommand").on("value", snap=>{
      const cmd = snap.val();
      if(!cmd || cmd.id === firebaseLastCommandId) return;
      firebaseLastCommandId = cmd.id;
      applyAdminCommand(cmd);
    });

    setFirebaseStatus("🔥 Firebase: 接続中", "connected");
    addLog("🔥 Firebase PLAYER 接続");
  }catch(e){
    console.error(e);
    setFirebaseStatus("🔥 Firebase: エラー", "error");
    addLog("🔥 Firebase接続エラー: " + e.message);
  }
}

// β7.0: receive admin commands from admin.html on same browser via localStorage.
let lastAdminCommandId = null;
function applyAdminCommand(cmd){
  ssOpsMarkFirebaseSeen();
  if(ssOpsIsOldCommand(cmd)){ if(typeof addLog==="function") addLog("🧹 古い命令を整理: "+(cmd.type||"UNKNOWN")); return; }
  ssNotifyCommandOnce(cmd);
  if(!cmd || cmd.id === lastAdminCommandId) return;
  lastAdminCommandId = cmd.id;
  if(cmd.type === "NORMAL") normalMode();
  if(cmd.type === "ALERT") hardAlertEffect(cmd.message || "⚠️ 警戒モード発令！");
  if(cmd.type === "BOSS") triggerBoss();
  if(cmd.type === "MISSION") triggerMission();
  if(cmd.type === "LIVE") triggerLive();
  if(cmd.type === "SAFE") triggerSafe();
  if(cmd.type === "FINAL") triggerFinal();
  if(cmd.type === "END") triggerEnd();
  if(cmd.type === "RADIO"){
    receiveRadio(cmd.message || "運営速報");
  }
}
function pollAdminCommand(){
  try{
    const raw = localStorage.getItem("street_survival_admin_command");
    if(raw) applyAdminCommand(JSON.parse(raw));
  }catch(e){}
}
setInterval(pollAdminCommand, 800);
window.addEventListener("storage", pollAdminCommand);


/* β8.2 FIREBASE FIX - PLAYER */
let ssFirebasePlayerDb = null;
let ssFirebasePlayerLastId = null;

function ssSetFirebaseStatus(text, cls){
  const el = document.getElementById("firebaseStatus");
  if(!el) return;
  el.textContent = text;
  el.className = "firebase-status " + (cls || "");
}

function ssLoadScript(src){
  return new Promise((resolve, reject)=>{
    if(document.querySelector('script[src="'+src+'"]')) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function ssApplyFirebaseCommand(cmd){
  ssOpsMarkFirebaseSeen();
  if(ssOpsIsOldCommand(cmd)){ if(typeof addLog==="function") addLog("🧹 古い命令を整理: "+(cmd.type||"UNKNOWN")); return; }
  if(!cmd || !cmd.type) return;
  if(cmd.id && cmd.id === ssFirebasePlayerLastId) return;
  ssFirebasePlayerLastId = cmd.id || String(Date.now());

  try{
    if(cmd.type === "RADIO"){
      if(typeof receiveRadio === "function") receiveRadio(cmd.message || "運営速報");
      else if(typeof setRadio === "function") setRadio(cmd.message || "運営速報");
      return;
    }
    if(cmd.type === "NORMAL" && typeof normalMode === "function") normalMode();
    if(cmd.type === "ALERT") hardAlertEffect(cmd.message || "⚠️ 警戒モード発令！");
    if(cmd.type === "BOSS" && typeof triggerBoss === "function") triggerBoss();
    if(cmd.type === "MISSION" && typeof triggerMission === "function") triggerMission();
    if(cmd.type === "LIVE" && typeof triggerLive === "function") triggerLive();
    if(cmd.type === "SAFE" && typeof triggerSafe === "function") triggerSafe();
    if(cmd.type === "FINAL" && typeof triggerFinal === "function") triggerFinal();
    if(cmd.type === "END" && typeof triggerEnd === "function") triggerEnd();
    if(typeof addLog === "function") addLog("🔥 Firebase受信: " + cmd.type);
  }catch(e){
    console.error("Firebase command error", e);
    if(typeof addLog === "function") addLog("🔥 Firebase受信エラー: " + e.message);
  }
}

async function initFirebasePlayer(){
  try{
    if(!window.STREET_SURVIVAL_FIREBASE_ENABLED){
      ssSetFirebaseStatus("🔥 Firebase: OFF / デモ", "demo");
      if(typeof addLog === "function") addLog("🔥 Firebase OFF / デモ");
      return;
    }
    if(!window.STREET_SURVIVAL_FIREBASE_CONFIG){
      ssSetFirebaseStatus("🔥 Firebase: Configなし", "error");
      if(typeof addLog === "function") addLog("🔥 Firebase Configなし");
      return;
    }
    ssSetFirebaseStatus("🔥 Firebase: 接続準備中", "demo");
    await ssLoadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    await ssLoadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js");
    if(!firebase.apps.length){
      firebase.initializeApp(window.STREET_SURVIVAL_FIREBASE_CONFIG);
    }
    ssFirebasePlayerDb = firebase.database();
    ssFirebasePlayerDb.ref("streetSurvival/currentCommand").on("value", snap=>{
      const cmd = snap.val();
      if(cmd) ssApplyFirebaseCommand(cmd);
    });
    ssSetFirebaseStatus("🔥 Firebase: 接続中", "connected");
    if(typeof addLog === "function") addLog("🔥 Firebase PLAYER 接続中");
  }catch(e){
    console.error(e);
    ssSetFirebaseStatus("🔥 Firebase: エラー", "error");
    if(typeof addLog === "function") addLog("🔥 Firebase接続エラー: " + e.message);
  }
}

window.addEventListener("load", ()=>{
  setTimeout(()=>{
    if(!ssFirebasePlayerDb) initFirebasePlayer();
  }, 300);
});



/* β8.2 ALERT HARD FIX */
function ensureAlertToast(){
  let el = document.getElementById("alertToast");
  if(!el){
    el = document.createElement("div");
    el.id = "alertToast";
    el.className = "alert-toast hidden";
    document.body.appendChild(el);
  }
  return el;
}

function hardAlertEffect(message){
  try{
    state.cityMode = "ALERT";
    state.alertUntil = Date.now() + 6500;
    state.bossActive = false;
    state.missionActive = false;
    state.liveActive = false;

    const alertBox = document.getElementById("alertStatus");
    if(alertBox){
      alertBox.textContent = "⚠️ ALERT / 警戒発令中";
      alertBox.className = "alert-box level2";
    }
    const statusPanel = document.getElementById("statusPanel");
    if(statusPanel){
      statusPanel.classList.add("alert-hard");
      setTimeout(()=>statusPanel.classList.remove("alert-hard"), 1800);
    }

    
    const toast = ensureAlertToast();
    toast.textContent = "⚠️ ALERT / 警戒発令";
    toast.classList.remove("hidden");
    clearTimeout(hardAlertEffect.toastTimer);
    hardAlertEffect.toastTimer = setTimeout(()=>toast.classList.add("hidden"), 1800);

    if(typeof receiveRadio === "function") receiveRadio(message || "⚠️ 警戒モード発令！");
    if(typeof showEffect === "function") showEffect("alert", "⚠️", "ALERT", false);
    if(typeof playTone === "function") {
      playTone("mission");
      setTimeout(()=>playTone("boss"), 160);
    }
    if(navigator.vibrate) navigator.vibrate([90,40,90]);

    if(typeof addLog === "function") addLog("⚠️ ALERT受信 / 警戒発令");
    if(typeof updateStatus === "function") updateStatus("alert-mode", "⚠️", "ALERT", "警戒エリア");
    if(typeof render === "function") render();
  }catch(e){
    console.error("hardAlertEffect error", e);
  }
}

// 既存alertModeが弱い場合でも強制的に上書き
window.alertMode = function(){
  hardAlertEffect("⚠️ 警戒モード発令！街に注意してください。");
};



/* β10.3 ULTIMATE PUSH NOTIFY */
let ssNotifyReady = false;

function ssPushStatus(text){
  const el = document.getElementById("notifyStatus");
  if(el) el.textContent = text;
}

function ssPushToast(text){
  let el = document.getElementById("pushToast");
  if(!el){
    el = document.createElement("div");
    el.id = "pushToast";
    el.className = "push-toast hidden";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(ssPushToast.timer);
  ssPushToast.timer = setTimeout(()=>el.classList.add("hidden"), 1700);
}

async function initStreetSurvivalPush(){
  try{
    if(!("Notification" in window)){
      ssPushStatus("通知: この端末は非対応");
      return;
    }

    if("serviceWorker" in navigator){
      try{
        await navigator.serviceWorker.register("./sw.js?v=91");
        if(typeof addLog === "function") addLog("🔔 Service Worker登録OK");
      }catch(e){
        if(typeof addLog === "function") addLog("🔔 SW登録失敗: " + e.message);
      }
    }

    if(Notification.permission === "granted"){
      ssNotifyReady = true;
      ssPushStatus("通知: 許可済み");
    }else if(Notification.permission === "denied"){
      ssNotifyReady = false;
      ssPushStatus("通知: 拒否中");
    }else{
      ssNotifyReady = false;
      ssPushStatus("通知: 未許可");
    }
  }catch(e){
    console.error("push init error", e);
    ssPushStatus("通知: エラー");
  }
}

async function requestStreetSurvivalPush(){
  try{
    if(!("Notification" in window)){
      alert("この端末はWeb通知に対応していません。");
      return;
    }

    const result = await Notification.requestPermission();
    if(result === "granted"){
      ssNotifyReady = true;
      ssPushStatus("通知: 許可済み");
      ssPushToast("🔔 通知ON");
      await sendStreetSurvivalNotification("🔔 STREET SURVIVAL", "通知が有効になりました。");
      if(typeof addLog === "function") addLog("🔔 通知許可OK");
    }else{
      ssNotifyReady = false;
      ssPushStatus("通知: 未許可");
      ssPushToast("通知が許可されませんでした");
      if(typeof addLog === "function") addLog("🔔 通知未許可");
    }
  }catch(e){
    console.error("permission error", e);
    ssPushStatus("通知: エラー");
  }
}

function streetSurvivalNotifyText(cmd){
  const type = cmd && cmd.type ? cmd.type : "RADIO";
  const msg = cmd && cmd.message ? cmd.message : "";
  const map = {
    NORMAL:["🌆 NORMAL", msg || "通常モードです。"],
    ALERT:["⚠️ ALERT", msg || "警戒エリア発生！街に注意してください。"],
    BOSS:["👹 BOSS出現！", msg || "新町にBOSS出現！討伐チャンス！"],
    MISSION:["🎯 MISSION", msg || "本町集合ミッション開始！"],
    LIVE:["🎵 LIVE開始！", msg || "オルタネーターズLIVE開始！"],
    SAFE:["🛡 SAFE ZONE", msg || "お宿 Onn SAFE ZONE発動！"],
    FINAL:["🔥 FINAL BATTLE", msg || "FINAL BATTLE開始！"],
    END:["🏆 GAME END", msg || "ゲーム終了！集合してください！"],
    RADIO:["📡 STREET RADIO", msg || "運営速報"]
  };
  return map[type] || ["📡 STREET SURVIVAL", msg || type];
}

async function sendStreetSurvivalNotification(title, body){
  try{
    
    if(!("Notification" in window) || Notification.permission !== "granted") return;

    const options = {
      body,
      icon:"./icon-192.png",
      badge:"./icon-192.png",
      tag:"street-survival-event",
      renotify:true,
      requireInteraction:false
    };

    if("serviceWorker" in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg && reg.showNotification){
        await reg.showNotification(title, options);
        return;
      }
    }

    new Notification(title, options);
  }catch(e){
    console.error("notify error", e);
  }
}

function notifyStreetSurvivalCommand(cmd){
  const arr = streetSurvivalNotifyText(cmd);
  sendStreetSurvivalNotification(arr[0], arr[1]);
}

window.addEventListener("load", ()=>{
  setTimeout(()=>{
    initStreetSurvivalPush();
    const btn = document.getElementById("notifyBtn");
    if(btn) btn.addEventListener("click", requestStreetSurvivalPush);
  }, 500);
});



/* β10.3 CLEANUP / PERFORMANCE GUARD */
const SS_MAX_LOG_ITEMS = 30;
const SS_RENDER_INTERVAL_MS = 900;
let ssLastRenderAt = 0;

function trimDomLog(){
  try{
    const logEl = document.getElementById("log");
    if(!logEl) return;
    const lines = logEl.textContent.split("\n").filter(Boolean);
    if(lines.length > SS_MAX_LOG_ITEMS){
      logEl.textContent = lines.slice(0, SS_MAX_LOG_ITEMS).join("\n") + "\n";
    }
  }catch(e){}
}

function cleanupOldEffects(){
  try{
    document.querySelectorAll(".push-toast, .alert-toast").forEach((el)=>{
      if(el.classList.contains("hidden") && el.parentNode){
        el.parentNode.removeChild(el);
      }
    });
  }catch(e){}
}

function ssThrottleRender(){
  const now = Date.now();
  if(now - ssLastRenderAt < SS_RENDER_INTERVAL_MS) return false;
  ssLastRenderAt = now;
  return true;
}

setInterval(()=>{
  trimDomLog();
  cleanupOldEffects();
}, 5000);



/* β10.3 PUSH ONCE FIX / 通知暴走停止 */
const SS_PUSH_SEEN_KEY = "street_survival_seen_push_ids_v102";
const SS_PUSH_MAX_AGE_MS = 1000 * 60 * 10; // 10分より古い命令は通知しない

function ssLoadSeenPushIds(){
  try{
    return JSON.parse(localStorage.getItem(SS_PUSH_SEEN_KEY) || "{}");
  }catch(e){
    return {};
  }
}

function ssSaveSeenPushIds(obj){
  try{
    const entries = Object.entries(obj).slice(-80);
    localStorage.setItem(SS_PUSH_SEEN_KEY, JSON.stringify(Object.fromEntries(entries)));
  }catch(e){}
}

function ssCommandTime(cmd){
  if(!cmd) return Date.now();
  if(cmd.at){
    const t = Date.parse(cmd.at);
    if(!Number.isNaN(t)) return t;
  }
  if(cmd.time){
    const t = Date.parse(cmd.time);
    if(!Number.isNaN(t)) return t;
    if(typeof cmd.time === "number") return cmd.time;
  }
  return Date.now();
}

function ssShouldNotifyCommand(cmd){
  if(!cmd) return false;
  const id = cmd.id || (cmd.type + "_" + (cmd.at || cmd.time || cmd.message || ""));
  if(!id) return false;

  const t = ssCommandTime(cmd);
  if(Date.now() - t > SS_PUSH_MAX_AGE_MS){
    if(typeof addLog === "function") addLog("🔕 古い通知をスキップ: " + (cmd.type || "UNKNOWN"));
    return false;
  }

  const seen = ssLoadSeenPushIds();
  if(seen[id]){
    return false;
  }

  seen[id] = Date.now();
  ssSaveSeenPushIds(seen);
  return true;
}

function ssNotifyCommandOnce(cmd){
  if(!ssShouldNotifyCommand(cmd)) return;
  if(typeof notifyStreetSurvivalCommand === "function"){
    ssNotifyCommandOnce(cmd);
  }
}



/* β10.3 OPS STABLE / 本番運営安定化 */
const SS_OPS_MAX_LOG = 25;
const SS_OPS_COMMAND_MAX_AGE_MS = 1000 * 60 * 15;
const SS_OPS_RECONNECT_MS = 15000;
let ssOpsLastFirebaseSeen = Date.now();
let ssOpsReconnectTimer = null;
let ssOpsLowPower = false;

function ssOpsSet(id, text, cls){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  el.className = cls || "";
}

function ssOpsTrimLog(){
  try{
    const logEl = document.getElementById("log");
    if(!logEl) return;
    const lines = logEl.textContent.split("\n").filter(Boolean);
    if(lines.length > SS_OPS_MAX_LOG){
      logEl.textContent = lines.slice(0, SS_OPS_MAX_LOG).join("\n") + "\n";
    }
  }catch(e){}
}

function ssOpsCleanupLocal(){
  try{
    const now = Date.now();
    ["street_survival_seen_push_ids_v102"].forEach(key=>{
      const raw = localStorage.getItem(key);
      if(!raw) return;
      const data = JSON.parse(raw);
      const cleaned = {};
      Object.entries(data).forEach(([k,v])=>{
        if(now - Number(v) < 1000 * 60 * 60) cleaned[k] = v;
      });
      localStorage.setItem(key, JSON.stringify(cleaned));
    });
    ssOpsSet("cleanupStatus", "OK", "ok");
  }catch(e){
    ssOpsSet("cleanupStatus", "ERR", "err");
  }
}

function ssOpsEnableLowPower(){
  ssOpsLowPower = true;
  document.body.classList.add("low-power");
  ssOpsSet("batteryStatus", "ON", "ok");
}

function ssOpsDisableLowPower(){
  ssOpsLowPower = false;
  document.body.classList.remove("low-power");
  ssOpsSet("batteryStatus", "通常", "warn");
}

function ssOpsConnectionHeartbeat(){
  try{
    if(navigator.onLine === false){
      ssOpsSet("connectionStatus", "OFFLINE", "err");
      return;
    }
    const diff = Date.now() - ssOpsLastFirebaseSeen;
    if(diff > SS_OPS_RECONNECT_MS * 2){
      ssOpsSet("connectionStatus", "再接続中", "warn");
      if(typeof initFirebasePlayer === "function"){
        clearTimeout(ssOpsReconnectTimer);
        ssOpsReconnectTimer = setTimeout(()=>initFirebasePlayer(), 1200);
      }
    }else{
      ssOpsSet("connectionStatus", "ONLINE", "ok");
    }
  }catch(e){}
}

// Firebase受信時に呼べるよう、既存apply関数の前後で使う
function ssOpsMarkFirebaseSeen(){
  ssOpsLastFirebaseSeen = Date.now();
  ssOpsSet("connectionStatus", "ONLINE", "ok");
}

// 古い命令は画面演出も弱める
function ssOpsIsOldCommand(cmd){
  try{
    if(!cmd) return false;
    const t = cmd.at ? Date.parse(cmd.at) : Date.now();
    if(Number.isNaN(t)) return false;
    return Date.now() - t > SS_OPS_COMMAND_MAX_AGE_MS;
  }catch(e){
    return false;
  }
}

window.addEventListener("online", ()=>ssOpsSet("connectionStatus","ONLINE","ok"));
window.addEventListener("offline", ()=>ssOpsSet("connectionStatus","OFFLINE","err"));
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden){
    ssOpsEnableLowPower();
  }else{
    ssOpsDisableLowPower();
    ssOpsConnectionHeartbeat();
  }
});

setInterval(()=>{
  ssOpsTrimLog();
  ssOpsCleanupLocal();
  ssOpsConnectionHeartbeat();
}, 10000);

window.addEventListener("load", ()=>{
  setTimeout(()=>{
    ssOpsEnableLowPower();
    ssOpsCleanupLocal();
    ssOpsConnectionHeartbeat();
    if(typeof addLog === "function") addLog("📊 β10.3 本番運営安定化 起動");
  }, 1200);
});
/* =========================================================
   STREET SURVIVAL PLAYER FIREBASE FINAL FIX
   参加者側 Firebase 受信・通知・デモ表示 修正版
   app.js の一番下に丸ごと追加
========================================================= */

console.log("STREET SURVIVAL: PLAYER FINAL FIX LOADED");

let SS_FINAL_DB = null;
let SS_FINAL_LAST_COMMAND_ID = null;
let SS_FINAL_INIT_DONE = false;

function ssFinalSetFirebaseStatus(text, cls) {
  const el = document.getElementById("firebaseStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "firebase-status " + (cls || "");
}

function ssFinalAddLog(text) {
  if (typeof addLog === "function") {
    addLog(text);
  } else {
    console.log(text);
  }
}

function ssFinalLoadScript(src) {
  return new Promise((resolve, reject) => {
    const exists = Array.from(document.scripts).some(s => s.src.includes(src));
    if (exists) {
      resolve();
      return;
    }

    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("読み込み失敗: " + src));
    document.head.appendChild(s);
  });
}

/* 通知バグ修正：自分自身を呼ばない */
window.ssNotifyCommandOnce = function(cmd) {
  try {
    if (typeof ssShouldNotifyCommand === "function") {
      if (!ssShouldNotifyCommand(cmd)) return;
    }

    if (typeof notifyStreetSurvivalCommand === "function") {
      notifyStreetSurvivalCommand(cmd);
    }
  } catch (e) {
    console.error("notify fixed error", e);
  }
};

function ssFinalReceiveRadio(message) {
  try {
    if (typeof receiveRadio === "function") {
      receiveRadio(message || "運営速報");
      return;
    }

    if (typeof setRadio === "function") {
      setRadio(message || "運営速報");
      return;
    }

    const radio = document.getElementById("radioTicker");
    if (radio) radio.textContent = "📻 " + (message || "運営速報");
  } catch (e) {
    console.error("radio receive error", e);
  }
}

function ssFinalApplyCommand(cmd) {
  try {
    if (!cmd || !cmd.type) return;

    const commandId = cmd.id || cmd.type + "_" + (cmd.time || cmd.at || cmd.message || "");
    if (commandId && commandId === SS_FINAL_LAST_COMMAND_ID) return;
    SS_FINAL_LAST_COMMAND_ID = commandId;

    if (typeof ssOpsMarkFirebaseSeen === "function") {
      ssOpsMarkFirebaseSeen();
    }

    console.log("STREET SURVIVAL Firebase command:", cmd);
    ssFinalAddLog("🔥 Firebase受信: " + cmd.type);

    if (cmd.type === "RADIO") {
      ssFinalReceiveRadio(cmd.message || "運営速報");
    }

    if (cmd.type === "NORMAL" && typeof normalMode === "function") {
      normalMode();
    }

    if (cmd.type === "ALERT") {
      if (typeof hardAlertEffect === "function") {
        hardAlertEffect(cmd.message || "⚠️ 警戒モード発令！");
      } else if (typeof alertMode === "function") {
        alertMode();
      }
    }

    if (cmd.type === "BOSS" && typeof triggerBoss === "function") {
      triggerBoss();
    }

    if (cmd.type === "MISSION" && typeof triggerMission === "function") {
      triggerMission();
    }

    if (cmd.type === "LIVE" && typeof triggerLive === "function") {
      triggerLive();
    }

    if (cmd.type === "SAFE" && typeof triggerSafe === "function") {
      triggerSafe();
    }

    if (cmd.type === "FINAL" && typeof triggerFinal === "function") {
      triggerFinal();
    }

    if (cmd.type === "END" && typeof triggerEnd === "function") {
      triggerEnd();
    }

    if (typeof window.ssNotifyCommandOnce === "function") {
      window.ssNotifyCommandOnce(cmd);
    }

    if (typeof render === "function") {
      render();
    }
  } catch (e) {
    console.error("command apply error", e);
    ssFinalSetFirebaseStatus("🔥 Firebase: 受信エラー", "error");
    ssFinalAddLog("🔥 Firebase受信エラー: " + e.message);
  }
}

async function ssFinalInitFirebasePlayer() {
  try {
    if (SS_FINAL_INIT_DONE) return;
    SS_FINAL_INIT_DONE = true;

    ssFinalSetFirebaseStatus("🔥 Firebase: 確認中", "demo");

    console.log("Firebase flag:", window.STREET_SURVIVAL_FIREBASE_ENABLED);
    console.log("Firebase config:", window.STREET_SURVIVAL_FIREBASE_CONFIG);

    if (window.STREET_SURVIVAL_FIREBASE_ENABLED !== true) {
      ssFinalSetFirebaseStatus("🔥 Firebase: OFF / config未読込", "demo");
      ssFinalAddLog("🔥 Firebase OFF / config未読込");
      return;
    }

    if (
      !window.STREET_SURVIVAL_FIREBASE_CONFIG ||
      !window.STREET_SURVIVAL_FIREBASE_CONFIG.apiKey ||
      !window.STREET_SURVIVAL_FIREBASE_CONFIG.databaseURL
    ) {
      ssFinalSetFirebaseStatus("🔥 Firebase: config空", "error");
      ssFinalAddLog("🔥 Firebase config空");
      return;
    }

    ssFinalSetFirebaseStatus("🔥 Firebase: 本体読込中", "demo");

    await ssFinalLoadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    await ssFinalLoadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js");

    if (!window.firebase) {
      ssFinalSetFirebaseStatus("🔥 Firebase: 本体未読込", "error");
      ssFinalAddLog("🔥 Firebase本体未読込");
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(window.STREET_SURVIVAL_FIREBASE_CONFIG);
    }

    SS_FINAL_DB = firebase.database();

    ssFinalSetFirebaseStatus("🔥 Firebase: 接続中", "connected");
    ssFinalAddLog("🔥 Firebase PLAYER 接続OK");

    SS_FINAL_DB.ref("streetSurvival/currentCommand").on("value", snap => {
      const cmd = snap.val();
      if (!cmd) return;
      ssFinalApplyCommand(cmd);
    });

    if (typeof ssOpsMarkFirebaseSeen === "function") {
      ssOpsMarkFirebaseSeen();
    }

  } catch (e) {
    console.error("Firebase final init error", e);
    ssFinalSetFirebaseStatus("🔥 Firebase: エラー", "error");
    ssFinalAddLog("🔥 Firebase接続エラー: " + e.message);
  }
}

/* 古い initFirebasePlayer を最後から上書き */
window.initFirebasePlayer = ssFinalInitFirebasePlayer;

/* 起動 */
window.addEventListener("load", () => {
  setTimeout(() => {
    ssFinalInitFirebasePlayer();
  }, 800);
});
/* =========================================================
   STREET SURVIVAL AUDIO TOGGLE FIX v29
   iPhone / Safari 音声ON/OFF切替
========================================================= */

let SS_AUDIO_UNLOCKED = false;
let SS_AUDIO_MUTED = false;

function ssSetAudioStatusV29() {
  const status = document.getElementById("notifyStatus");
  const btn = document.getElementById("audioUnlockBtn");

  if (SS_AUDIO_MUTED) {
    if (status) status.textContent = "通知: 確認済み / 音: OFF";
    if (btn) btn.textContent = "🔊 音ON";
  } else if (SS_AUDIO_UNLOCKED) {
    if (status) status.textContent = "通知: 確認済み / 音: ON";
    if (btn) btn.textContent = "🔇 音OFF";
  } else {
    if (status) status.textContent = "通知: 未確認 / 音: 未ON";
    if (btn) btn.textContent = "🔊 音ON";
  }
}

function ssUnlockAudioV29() {
  try {
    if (typeof getAudioCtx !== "function") {
      console.log("getAudioCtx not found");
      return;
    }

    const ctx = getAudioCtx();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.03);

    SS_AUDIO_UNLOCKED = true;
    SS_AUDIO_MUTED = false;

    ssSetAudioStatusV29();

    if (typeof addLog === "function") {
      addLog("🔊 音声ON");
    }

    console.log("STREET SURVIVAL: AUDIO ON v29");
  } catch (e) {
    console.error("audio unlock error", e);
  }
}

function ssToggleAudioV29() {
  if (!SS_AUDIO_UNLOCKED) {
    ssUnlockAudioV29();

    if (typeof showEffect === "function") {
      showEffect("notice", "🔊", "SOUND ON", true);
    }

    return;
  }

  SS_AUDIO_MUTED = !SS_AUDIO_MUTED;
  ssSetAudioStatusV29();

  if (typeof addLog === "function") {
    addLog(SS_AUDIO_MUTED ? "🔇 音声OFF" : "🔊 音声ON");
  }

  if (!SS_AUDIO_MUTED && typeof showEffect === "function") {
    showEffect("notice", "🔊", "SOUND ON", true);
  }
}

/* playTone を上書きして、音OFF時は鳴らさない */
const ssOriginalPlayToneV29 = typeof playTone === "function" ? playTone : null;

if (ssOriginalPlayToneV29) {
  window.playTone = function(kind) {
    if (SS_AUDIO_MUTED) {
      console.log("STREET SURVIVAL: audio muted, skip tone:", kind);
      return;
    }
    ssOriginalPlayToneV29(kind);
  };
}

window.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("audioUnlockBtn");

  if (btn) {
    btn.addEventListener("click", function () {
      ssToggleAudioV29();
    });
  }

  ssSetAudioStatusV29();
});
/* =========================================================
   STREET SURVIVAL REALTIME PLAYER SYNC v30
   /* =========================================================
   STREET SURVIVAL REALTIME PLAYER SYNC v30.1
   リアル参加者HP同期 土台・見える化版
========================================================= */

let SS_PLAYER_ID_V30 = null;
let SS_REMOTE_PLAYERS_V30 = {};
let SS_PLAYERS_REF_V30 = null;
let SS_PLAYER_SYNC_READY_V30 = false;

function ssGetPlayerIdV30() {
  let id = localStorage.getItem("street_survival_player_id_v30");

  if (!id) {
    id = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("street_survival_player_id_v30", id);
  }

  return id;
}

function ssGetPlayerNameV30() {
  const input = document.getElementById("playerName");
  return input && input.value ? input.value.trim() : "PLAYER";
}

function ssSetSyncLogV30(text) {
  if (typeof addLog === "function") {
    addLog(text);
  } else {
    console.log(text);
  }
}

function ssBuildMyPlayerDataV30() {
  return {
    id: SS_PLAYER_ID_V30,
    name: ssGetPlayerNameV30(),
    role: state.me.role || "runner",
    hp: Math.round(state.me.hp || 0),
    points: Math.round(state.me.points || 0),
    lat: state.me.lat,
    lng: state.me.lng,
    zone: state.me.zone || "FIELD",
    cityMode: state.cityMode || "NORMAL",
    online: true,
    lastSeen: Date.now()
  };
}

function ssSyncMyPlayerV30() {
  try {
    if (!SS_PLAYER_SYNC_READY_V30) return;
    if (!SS_PLAYERS_REF_V30 || !SS_PLAYER_ID_V30) return;

    SS_PLAYERS_REF_V30.child(SS_PLAYER_ID_V30).update(ssBuildMyPlayerDataV30());
  } catch (e) {
    console.error("v30 sync my player error", e);
  }
}

function ssListenPlayersV30() {
  if (!SS_PLAYERS_REF_V30) return;

  SS_PLAYERS_REF_V30.on("value", snap => {
    const all = snap.val() || {};
    SS_REMOTE_PLAYERS_V30 = all;

    const allPlayers = Object.values(all).filter(Boolean);
    const others = allPlayers.filter(p => p && p.id !== SS_PLAYER_ID_V30);

    ssRenderRemotePlayersV30(others, allPlayers);
  });
}

function ssRenderRemotePlayersV30(others, allPlayers) {
  try {
    const list = document.getElementById("players");
    if (!list) return;

    const oldRealtime = document.getElementById("realPlayersV30");
    if (oldRealtime) oldRealtime.remove();

    const activeOthers = others.filter(p => {
      return p && Date.now() - Number(p.lastSeen || 0) < 60000;
    });

    const myData = ssBuildMyPlayerDataV30();

    const myRow = `<div class="item">
      <strong>🧍 自分: ${myData.name}</strong>
      <small>HP ${myData.hp} / ${CONFIG.maxHp}</small><br>
      <small>ID ${String(myData.id).slice(-6)} / ${myData.zone}</small>
    </div>`;

    const remoteRows = activeOthers.map(p => {
      const roleIcon = p.role === "hunter" ? "🟢" : "🔵";

      const dist = (typeof meters === "function")
        ? Math.round(meters(state.me, { lat: p.lat, lng: p.lng }))
        : "-";

      return `<div class="item">
        <strong>${roleIcon} ${p.name || "PLAYER"}</strong>
        <small>HP ${Math.round(p.hp || 0)} / ${CONFIG.maxHp}</small><br>
        <small>距離 ${dist}m / ${p.zone || "FIELD"} / ID ${String(p.id || "").slice(-6)}</small>
      </div>`;
    });

    const header = `<div class="item">
      <strong>🌐 REAL PLAYERS v30.1</strong>
      <small>Firebase同期中 / 他参加者 ${activeOthers.length}人 / 全登録 ${allPlayers.length}人</small>
    </div>`;

    const wrap = document.createElement("div");
    wrap.id = "realPlayersV30";
    wrap.innerHTML = header + myRow + remoteRows.join("");

    list.prepend(wrap);
  } catch (e) {
    console.error("render remote players error", e);
  }
}

async function ssInitRealtimePlayersV30() {
  try {
    if (!window.firebase) {
      ssSetSyncLogV30("🌐 v30: Firebase未読込");
      return;
    }

    if (!firebase.apps || !firebase.apps.length) {
      ssSetSyncLogV30("🌐 v30: Firebase未初期化");
      return;
    }

    SS_PLAYER_ID_V30 = ssGetPlayerIdV30();
    SS_PLAYERS_REF_V30 = firebase.database().ref("streetSurvival/players");
    SS_PLAYER_SYNC_READY_V30 = true;

    const myRef = SS_PLAYERS_REF_V30.child(SS_PLAYER_ID_V30);

    myRef.onDisconnect().update({
      online: false,
      lastSeen: Date.now()
    });

    await myRef.update({
      ...ssBuildMyPlayerDataV30(),
      joinedAt: Date.now()
    });

    ssListenPlayersV30();

    setInterval(ssSyncMyPlayerV30, 3000);

    ssSetSyncLogV30("🌐 v30.1 リアル参加者同期ON");
  } catch (e) {
    console.error("v30 realtime init error", e);
    ssSetSyncLogV30("🌐 v30 同期エラー: " + e.message);
  }
}

window.addEventListener("load", () => {
  setTimeout(() => {
    ssInitRealtimePlayersV30();
  }, 3000);
});

/* =========================================================
   STREET SURVIVAL REAL PLAYERS DISPLAY FIX v30.2
   renderPlayers上書き対策：REAL表示を毎秒復活
========================================================= */

function ssForceRenderRealPlayersV302() {
  try {
    if (typeof SS_PLAYER_ID_V30 === "undefined" || !SS_PLAYER_ID_V30) return;

    const all = SS_REMOTE_PLAYERS_V30 || {};
    const allPlayers = Object.values(all).filter(Boolean);
    const others = allPlayers.filter(p => p && p.id !== SS_PLAYER_ID_V30);

    if (typeof ssRenderRemotePlayersV30 === "function") {
      ssRenderRemotePlayersV30(others, allPlayers);
    }
  } catch (e) {
    console.error("v30.2 force render error", e);
  }
}

setInterval(() => {
  ssForceRenderRealPlayersV302();
}, 1200);

window.addEventListener("load", () => {
  setTimeout(() => {
    ssForceRenderRealPlayersV302();
  }, 5000);
});
/* =========================================================
   STREET SURVIVAL REAL PLAYERS DISPLAY FIX v30.3
   renderPlayers直後にREAL表示を差し込む・チラつき防止
========================================================= */

const ssOriginalRenderPlayersV303 =
  typeof renderPlayers === "function" ? renderPlayers : null;

if (ssOriginalRenderPlayersV303) {
  window.renderPlayers = function () {
    // まず元のNPC/自分一覧を描画
    ssOriginalRenderPlayersV303();

    // その直後にREAL PLAYERSを差し込む
    try {
      if (typeof ssForceRenderRealPlayersV302 === "function") {
        ssForceRenderRealPlayersV302();
      }
    } catch (e) {
      console.error("v30.3 render hook error", e);
    }
  };
}

/* v30.2の1.2秒待ちより速く補助復活 */
setInterval(() => {
  try {
    if (typeof ssForceRenderRealPlayersV302 === "function") {
      ssForceRenderRealPlayersV302();
    }
  } catch (e) {
    console.error("v30.3 fast render error", e);
  }
}, 300);
/* =========================================================
   STREET SURVIVAL REAL PLAYERS STABLE SLOT v30.4
   点滅防止：players内ではなく専用エリアに固定表示
========================================================= */

function ssEnsureRealPlayersSlotV304() {
  let slot = document.getElementById("realPlayersStableV304");
  if (slot) return slot;

  const players = document.getElementById("players");
  if (!players || !players.parentNode) return null;

  slot = document.createElement("div");
  slot.id = "realPlayersStableV304";
  slot.className = "player-list";

  players.parentNode.insertBefore(slot, players);

  return slot;
}

function ssRenderStableRealPlayersV304() {
  try {
    const slot = ssEnsureRealPlayersSlotV304();
    if (!slot) return;

    if (typeof SS_PLAYER_ID_V30 === "undefined" || !SS_PLAYER_ID_V30) {
      slot.innerHTML = `<div class="item">
        <strong>🌐 REAL PLAYERS v30.4</strong>
        <small>同期準備中...</small>
      </div>`;
      return;
    }

    const all = SS_REMOTE_PLAYERS_V30 || {};
    const allPlayers = Object.values(all).filter(Boolean);
    const others = allPlayers.filter(p => p && p.id !== SS_PLAYER_ID_V30);

    const activeOthers = others.filter(p => {
      return p && Date.now() - Number(p.lastSeen || 0) < 60000;
    });

    const myName = typeof ssGetPlayerNameV30 === "function"
      ? ssGetPlayerNameV30()
      : "PLAYER";

    const myHp = state && state.me ? Math.round(state.me.hp || 0) : 0;
    const myZone = state && state.me ? state.me.zone || "FIELD" : "FIELD";

    const header = `<div class="item">
      <strong>🌐 REAL PLAYERS v30.4</strong>
      <small>Firebase同期中 / 他参加者 ${activeOthers.length}人 / 全登録 ${allPlayers.length}人</small>
    </div>`;

    const myRow = `<div class="item">
      <strong>🧍 自分: ${myName}</strong>
      <small>HP ${myHp} / ${CONFIG.maxHp}</small><br>
      <small>ID ${String(SS_PLAYER_ID_V30).slice(-6)} / ${myZone}</small>
    </div>`;

    const remoteRows = activeOthers.map(p => {
      const roleIcon = p.role === "hunter" ? "🟢" : "🔵";
      const dist = (typeof meters === "function" && state && state.me)
        ? Math.round(meters(state.me, { lat: p.lat, lng: p.lng }))
        : "-";

      return `<div class="item">
        <strong>${roleIcon} ${p.name || "PLAYER"}</strong>
        <small>HP ${Math.round(p.hp || 0)} / ${CONFIG.maxHp}</small><br>
        <small>距離 ${dist}m / ${p.zone || "FIELD"} / ID ${String(p.id || "").slice(-6)}</small>
      </div>`;
    });

    slot.innerHTML = header + myRow + remoteRows.join("");
  } catch (e) {
    console.error("v30.4 stable render error", e);
  }
}

setInterval(() => {
  ssRenderStableRealPlayersV304();
}, 1000);

window.addEventListener("load", () => {
  setTimeout(() => {
    ssRenderStableRealPlayersV304();
  }, 1500);

  setTimeout(() => {
    ssRenderStableRealPlayersV304();
  }, 5000);
});
/* =========================================================
   STREET SURVIVAL REAL PLAYERS FLICKER STOP v30.5
   v30.2 / v30.3 の点滅表示を停止して v30.4 固定表示だけ残す
========================================================= */

window.ssForceRenderRealPlayersV302 = function () {
  // v30.2 / v30.3 の players差し込み表示を停止
};

window.ssRenderRemotePlayersV30 = function () {
  // v30.1 の players差し込み表示を停止
};

setInterval(() => {
  try {
    const old = document.getElementById("realPlayersV30");
    if (old) old.remove();

    if (typeof ssRenderStableRealPlayersV304 === "function") {
      ssRenderStableRealPlayersV304();
    }
  } catch (e) {
    console.error("v30.5 flicker stop error", e);
  }
}, 1000);

window.addEventListener("load", () => {
  setTimeout(() => {
    try {
      const old = document.getElementById("realPlayersV30");
      if (old) old.remove();

      if (typeof ssRenderStableRealPlayersV304 === "function") {
        ssRenderStableRealPlayersV304();
      }
    } catch (e) {
      console.error("v30.5 load error", e);
    }
  }, 3000);
});
