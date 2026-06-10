
const $ = id => document.getElementById(id);

const state = { mode:"NORMAL", total:18, hunter:5, runner:13, boss:0, mission:0, safe:4, log:[] };

let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(Ctx) audioCtx = new Ctx();
  }
  if(audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(freq=520, dur=.18, type="sine"){
  const ctx = getAudioCtx();
  if(!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.10, now+.02);
  gain.gain.exponentialRampToValueAtTime(.0001, now+dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now+dur+.02);
}
function playAdminSound(type){
  if(type==="BOSS"){tone(130,.35,"sawtooth"); setTimeout(()=>tone(70,.35,"square"),120);}
  else if(type==="FINAL"){tone(440,.18,"sawtooth"); setTimeout(()=>tone(660,.18,"sawtooth"),220); setTimeout(()=>tone(440,.18,"sawtooth"),440);}
  else if(type==="SAFE"){tone(660,.16); setTimeout(()=>tone(880,.18),130);}
  else if(type==="LIVE"){tone(523,.14); setTimeout(()=>tone(659,.14),120); setTimeout(()=>tone(784,.2),240);}
  else if(type==="MISSION"){tone(720,.1,"square"); setTimeout(()=>tone(960,.12,"square"),160);}
  else if(type==="END"){tone(523,.14); setTimeout(()=>tone(784,.18),160); setTimeout(()=>tone(1046,.25),320);}
  else tone(520,.16);
}
function command(type, message){
  const id = Date.now() + "_" + Math.random().toString(16).slice(2);
  const cmd = { id, type, message: message || type, at: new Date().toISOString() };
  localStorage.setItem("street_survival_admin_command", JSON.stringify(cmd));
  applyLocal(type);
  playAdminSound(type);
  addLog(`📡 ${type}${message ? " / " + message : ""}`);
}
function applyLocal(type){
  if(type==="NORMAL"){state.mode="NORMAL"; state.boss=0; state.mission=0;}
  if(type==="ALERT"){state.mode="ALERT";}
  if(type==="BOSS"){state.mode="BOSS"; state.boss=1;}
  if(type==="MISSION"){state.mode="ALERT"; state.mission=1;}
  if(type==="LIVE"){state.mode="LIVE";}
  if(type==="SAFE"){state.mode="SAFE";}
  if(type==="FINAL"){state.mode="FINAL"; state.boss=1; state.mission=1;}
  if(type==="END"){state.mode="END"; state.boss=0; state.mission=0;}
  render();
}
function addLog(text){
  const now = new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  state.log.unshift(`[${now}] ${text}`);
  state.log = state.log.slice(0,80);
  render();
}
function render(){
  $("adminModeText").textContent = state.mode;
  $("adminTotal").textContent = state.total;
  $("adminHunter").textContent = state.hunter;
  $("adminRunner").textContent = state.runner;
  $("adminBossCount").textContent = state.boss;
  $("adminMissionCount").textContent = state.mission;
  $("adminSafeCount").textContent = state.safe;
  $("adminLog").innerHTML = state.log.map(x=>`<div>${x}</div>`).join("");
}
document.addEventListener("DOMContentLoaded",()=>{
  $("adminNormal").addEventListener("click",()=>command("NORMAL","通常モード"));
  $("adminAlert").addEventListener("click",()=>command("ALERT","警戒情報"));
  $("adminBoss").addEventListener("click",()=>command("BOSS","新町にボス出現"));
  $("adminMission").addEventListener("click",()=>command("MISSION","本町集合"));
  $("adminLive").addEventListener("click",()=>command("LIVE","オルタネーターズLIVE開始"));
  $("adminSafe").addEventListener("click",()=>command("SAFE","お宿 Onn SAFE発動"));
  $("adminFinal").addEventListener("click",()=>command("FINAL","FINAL BATTLE"));
  $("adminEnd").addEventListener("click",()=>command("END","GAME END"));
  $("adminRadioSend").addEventListener("click",()=>command("RADIO",$("adminRadioInput").value || "運営速報"));
  addLog("ADMIN MODE 起動");
  render();
});
