// ===== Utility helpers =====
function shuffle(a){const arr=a.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function normalize(s){return (s||"").toLowerCase().replace(/\./g," ").replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," ").trim();}
function editDistance(a,b){const m=a.length,n=b.length,dp=Array.from({length:m+1},()=>new Array(n+1).fill(0));for(let i=0;i<=m;i++)dp[i][0]=i;for(let j=0;j<=n;j++)dp[0][j]=j;for(let i=1;i<=m;i++){for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+c);}}return dp[m][n];}
function isCloseEnough(guess, correct, aliases=[]){const g=normalize(guess);const candidates=[correct,...(aliases||[])].map(normalize);for(const c of candidates){if(!c)continue;if(g===c)return true;const d=editDistance(g,c),thr=Math.max(2,Math.floor(c.length*0.25));if(d<=thr)return true;}return false;}
function uniqueAnswers(list){return Array.from(new Set(list.map(c=>c.answer)));}
function msToString(ms){const s=Math.floor(ms/1000);const mm=String(Math.floor(s/60)).padStart(2,"0");const ss=String(s%60).padStart(2,"0");return `${mm}:${ss}`;}

// ===== DOM =====
const themeEl=document.getElementById("theme");
const difficultyEl=document.getElementById("difficulty");
const mapToggleEl=document.getElementById("map-toggle");
const gridToggleEl=document.getElementById("grid-toggle");
const labelsToggleEl=document.getElementById("labels-toggle");
const calibrateToggleEl=document.getElementById("calibrate-toggle");
const startBtn=document.getElementById("start-btn");
const restartBtn=document.getElementById("restart-btn");
const clearPinsBtn=document.getElementById("clear-pins-btn");
const clueEl=document.getElementById("clue");
const tagsEl=document.getElementById("tags");
const choicesEl=document.getElementById("choices");
const freeTextEl=document.getElementById("free-text");
const answerInput=document.getElementById("answer");
const submitBtn=document.getElementById("submit-answer");
const resultEl=document.getElementById("result");
const progressEl=document.getElementById("progress");
const scoreEl=document.getElementById("score");
const timerEl=document.getElementById("timer");
const hintBtn=document.getElementById("hint-btn");
const hintEl=document.getElementById("hint");
const mapEl=document.getElementById("map");
const mapImg=document.getElementById("map-img");
const mapGrid=document.getElementById("map-grid");
const mapStatusEl=document.getElementById("map-status");
const mediaPanel=document.getElementById("media-panel");
const mediaImg=document.getElementById("location-image");
const mediaCaption=document.getElementById("media-caption");
const leaderboardEl=document.getElementById("leaderboard");

// ===== State =====
let DATA=[];
let filtered=[];
let order=[];
let currentIndex=0;
let mode="easy";
let score=0;
let hintsUsed=0;
let roundStart=0;
let questionStart=0;
let perQuestionTimes=[];
let awaitingMapClick=false;

// ===== Load data =====
(async function loadData(){
  try{
    const res=await fetch("questions.json",{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  }catch(e){
    const msg = "Could not load questions.json. If you opened this file directly, host it on GitHub Pages or run a local server.";
    clueEl.textContent = msg;
    document.getElementById("controls").insertAdjacentHTML("beforeend", `<div style="color:#b3261e">${msg}</div>`);
  }
})();

// ===== Events =====
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", resetUI);
clearPinsBtn.addEventListener("click", clearAllPins);
submitBtn.addEventListener("click", ()=>checkFreeText());
answerInput?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") checkFreeText(); });
hintBtn.addEventListener("click", ()=>{ const item=filtered[order[currentIndex]]; hintEl.textContent=item.hint||"No hint."; hintEl.classList.remove("hidden"); hintsUsed++; });

mapEl.addEventListener("click",(e)=>{
  const rect=mapEl.getBoundingClientRect();
  const xPct=((e.clientX-rect.left)/rect.width)*100;
  const yPct=((e.clientY-rect.top)/rect.height)*100;
  if(calibrateToggleEl.checked){
    const txt = `${xPct.toFixed(1)}, ${yPct.toFixed(1)}`;
    navigator.clipboard?.writeText(txt);
    mapStatusEl.textContent = `Copied coordinates: ${txt}`;
    const dot=document.createElement("div"); dot.className="pulse"; dot.style.left=xPct+"%"; dot.style.top=yPct+"%"; mapEl.appendChild(dot); setTimeout(()=>dot.remove(),1400);
    return;
  }
  if(!awaitingMapClick) return;
  placePin(xPct,yPct, null);
  evaluateMapClick(xPct,yPct);
});

gridToggleEl?.addEventListener("change", drawGrid);
labelsToggleEl?.addEventListener("change", ()=>{
  mapEl.querySelectorAll(".pin-label").forEach(l=> l.style.display = labelsToggleEl.checked ? "block" : "none");
});
window.addEventListener("resize", drawGrid);

// ===== Timer =====
function updateTimer(){
  if(roundStart===0) return;
  const now=Date.now();
  timerEl.textContent=`Time: ${msToString(now-questionStart)} (round ${msToString(now-roundStart)})`;
  requestAnimationFrame(updateTimer);
}

// ===== Grid =====
function drawGrid(){
  if(!mapGrid) return;
  const show = gridToggleEl && gridToggleEl.checked;
  mapGrid.classList.toggle("hidden", !show);
  if(!show) return;
  const ctx = mapGrid.getContext('2d');
  const w = mapEl.clientWidth;
  const h = mapEl.clientHeight;
  mapGrid.width = w; mapGrid.height = h;
  ctx.clearRect(0,0,w,h);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  for(let i=0;i<=10;i++){
    const x = (w/10)*i, y=(h/10)*i;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ===== Map helpers =====
function renderTags(item){
  tagsEl.innerHTML="";
  const make=(txt)=>{const s=document.createElement("span");s.className="tag";s.textContent=txt;return s;};
  if(item.tags?.region) tagsEl.appendChild(make(item.tags.region));
  if(item.tags?.country) tagsEl.appendChild(make(item.tags.country));
  if(item.tags?.capital) tagsEl.appendChild(make("Capital"));
  if(item.tags?.major_city) tagsEl.appendChild(make("Major City"));
}

function setupMapTarget(coord){
  removeTarget();
  if(!coord){ mapStatusEl.textContent=""; return; }
  const target=document.createElement("div"); target.className="target"; target.style.left=coord.x+"%"; target.style.top=coord.y+"%"; target.style.display="none"; target.id="target-dot";
  const ring=document.createElement("div"); ring.className="ring"; ring.style.left=coord.x+"%"; ring.style.top=coord.y+"%"; ring.style.width="48px"; ring.style.height="48px"; ring.style.display="none"; ring.id="target-ring";
  mapEl.appendChild(target); mapEl.appendChild(ring);
  mapStatusEl.textContent="";
}
function removeTarget(){
  const t=mapEl.querySelector("#target-dot"); if(t) t.remove();
  const r=mapEl.querySelector("#target-ring"); if(r) r.remove();
}
function placePin(x,y,label){
  const pin=document.createElement("div"); pin.className="pin"; pin.style.left=x+"%"; pin.style.top=y+"%"; mapEl.appendChild(pin);
  if(label){
    const lab=document.createElement("div"); lab.className="pin-label"; lab.textContent=label; lab.style.left=x+"%"; lab.style.top=y+"%"; lab.style.display = (labelsToggleEl && labelsToggleEl.checked) ? "block" : "none"; mapEl.appendChild(lab);
  }
}
function pulseAt(x,y){
  const p=document.createElement("div"); p.className="pulse"; p.style.left=x+"%"; p.style.top=y+"%"; mapEl.appendChild(p);
  setTimeout(()=>p.remove(), 1400);
}
function clearAllPins(){ mapEl.querySelectorAll(".pin, .pin-label").forEach(n=>n.remove()); }

// ===== Game flow =====
function startGame(){
  if(!DATA || !DATA.length){ alert("Questions not loaded yet. Please try again."); return; }
  const theme=themeEl.value;
  filtered = DATA.filter(c => theme==="all" ? true : (c.themes||[]).includes(theme));
  if(!filtered.length){ alert("No questions for this theme."); return; }

  mode=difficultyEl.value;
  currentIndex=0; score=0; hintsUsed=0;
  order = shuffle([...Array(filtered.length).keys()]);
  startBtn.disabled=true; restartBtn.disabled=false; themeEl.disabled=true; difficultyEl.disabled=true; mapToggleEl.disabled=true; clearPinsBtn.disabled=false;
  roundStart=Date.now(); questionStart=Date.now();
  resultEl.textContent=""; progressEl.textContent=""; scoreEl.textContent="Score: 0"; hintEl.textContent=""; hintEl.classList.add("hidden"); hintBtn.classList.remove("hidden");
  showCurrent();
  requestAnimationFrame(updateTimer);
  drawGrid();
}

function resetUI(){
  startBtn.disabled=false; restartBtn.disabled=true; themeEl.disabled=false; difficultyEl.disabled=false; mapToggleEl.disabled=false; clearPinsBtn.disabled=true;
  clueEl.textContent="Choose a theme, difficulty, and press Start.";
  tagsEl.innerHTML=""; choicesEl.innerHTML=""; choicesEl.classList.add("hidden"); freeTextEl.classList.add("hidden");
  resultEl.textContent=""; progressEl.textContent=""; scoreEl.textContent=""; timerEl.textContent=""; hintEl.textContent=""; hintEl.classList.add("hidden"); hintBtn.classList.add("hidden");
  clearAllPins(); removeTarget();
  mediaImg.src=""; mediaImg.alt=""; mediaCaption.textContent=""; mediaPanel.classList.add("hidden");
  perQuestionTimes=[]; roundStart=0; questionStart=0; awaitingMapClick=false;
}

function showCurrent(){
  const item=filtered[order[currentIndex]];
  hintsUsed=0; awaitingMapClick=false;
  clueEl.textContent=item.clue; renderTags(item);
  progressEl.textContent=`Question ${currentIndex+1} of ${filtered.length}`;
  resultEl.textContent=""; hintEl.textContent=""; hintEl.classList.add("hidden"); hintBtn.classList.remove("hidden");
  questionStart=Date.now();

  if(mode==="easy"){ renderChoices(item.answer); choicesEl.classList.remove("hidden"); freeTextEl.classList.add("hidden"); }
  else { choicesEl.classList.add("hidden"); freeTextEl.classList.remove("hidden"); answerInput.value=""; answerInput.focus(); }

  setupMapTarget(item.map);
  loadMedia(null);
}

function renderChoices(correct){
  // Build up to 3 distractors; if theme too small, backfill from ALL data; ensure total 4 options.
  const correctNorm = normalize(correct);
  const themeAnswers=uniqueAnswers(filtered).filter(a=>normalize(a)!==correctNorm);
  let pool = shuffle(themeAnswers);
  const allAnswers=uniqueAnswers(DATA).filter(a=>normalize(a)!==correctNorm && !pool.some(p=>normalize(p)===normalize(a)));
  pool = pool.concat(shuffle(allAnswers));
  const fallbacks = ["Antioch","Alexandria","Ephesus","Caesarea","Hebron","Capernaum","Nazareth","Tarsus"];
  const finalDistractors = pool.slice(0,3);
  while(finalDistractors.length<3){
    const pick = fallbacks.find(x=>normalize(x)!==correctNorm && !finalDistractors.some(y=>normalize(y)===normalize(x)));
    if(!pick) break;
    finalDistractors.push(pick);
  }
  const options=shuffle([correct, ...finalDistractors.slice(0,3)]);
  choicesEl.innerHTML="";
  options.forEach(opt=>{
    const btn=document.createElement("button"); btn.className="choice-btn"; btn.textContent=opt;
    btn.addEventListener("click", ()=>{
      const item=filtered[order[currentIndex]];
      if(normalize(opt)===normalize(item.answer)){ btn.classList.add("correct"); correctAnswerFlow(); }
      else { btn.classList.add("incorrect"); resultEl.textContent="Not quite. Try another."; }
    });
    choicesEl.appendChild(btn);
  });
}

function checkFreeText(){
  const item=filtered[order[currentIndex]];
  const guess=(answerInput.value||"").trim();
  if(!guess){ resultEl.textContent="Please type an answer."; return; }
  if(isCloseEnough(guess, item.answer, item.aliases)){ correctAnswerFlow(); }
  else { resultEl.textContent="Close, but not quite—try again!"; }
}

function correctAnswerFlow(){
  const now=Date.now();
  const qTime=now-questionStart;
  perQuestionTimes.push(qTime);
  const base=10;
  const speedBonus = qTime<5000?5 : qTime<10000?3 : qTime<20000?2 : 0;
  const penalty=Math.min(5,2*hintsUsed);
  score += Math.max(1, base + speedBonus - penalty);
  scoreEl.textContent=`Score: ${score}`;
  resultEl.textContent="Correct!";

  const item=filtered[order[currentIndex]];
  const dot=document.getElementById("target-dot");
  const ring=document.getElementById("target-ring");
  if(dot && ring){ dot.style.display="block"; ring.style.display="block"; pulseAt(item.map.x, item.map.y); }
  if(item.map){ placePin(item.map.x, item.map.y, item.answer); }
  loadMedia(item);

  // Auto-advance even when Map Bonus is ON; still let user click for bonus briefly
  const bonusWindowMs = 1500;
  if(mapToggleEl && mapToggleEl.checked){
    awaitingMapClick=true;
    mapStatusEl.textContent="Bonus: click near the location for +3 (auto-advances).";
    setTimeout(()=>{ if(awaitingMapClick){ awaitingMapClick=false; nextOrFinish(); } }, bonusWindowMs);
    return;
  }
  setTimeout(nextOrFinish, 600);
}

function evaluateMapClick(xPct,yPct){
  const item=filtered[order[currentIndex]];
  const target=item.map;
  if(!target){ mapStatusEl.textContent="No target for this item."; awaitingMapClick=false; nextOrFinish(); return; }
  const dx=xPct-target.x, dy=yPct-target.y;
  const dist=Math.hypot(dx,dy);
  const dot=document.getElementById("target-dot"); const ring=document.getElementById("target-ring");
  if(dot && ring){ dot.style.display="block"; ring.style.display="block"; }
  if(dist<=6){ score+=3; scoreEl.textContent=`Score: ${score}`; mapStatusEl.textContent=`Nice! Within range (~${dist.toFixed(1)}). +3 bonus.`; }
  else { mapStatusEl.textContent=`A bit off (~${dist.toFixed(1)}). No bonus.`; }
  awaitingMapClick=false;
  setTimeout(nextOrFinish,600);
}

function nextOrFinish(){ currentIndex++; if(currentIndex<filtered.length){ showCurrent(); } else { finishRound(); } }

function finishRound(){
  const totalTime=Date.now()-roundStart;
  clueEl.textContent="🎉 Great job! You completed the round!";
  choicesEl.classList.add("hidden"); freeTextEl.classList.add("hidden"); hintBtn.classList.add("hidden");
  progressEl.textContent=""; resultEl.textContent=`Final Score: ${score}`;
  const initials=prompt("Enter your initials for the leaderboard (3 chars):","YOU")||"YOU";
  saveLeaderboard({ initials: initials.slice(0,3).toUpperCase(), score, questions: filtered.length, timeMs: totalTime, date: new Date().toISOString() });
  renderLeaderboard();
  startBtn.disabled=false; restartBtn.disabled=true; themeEl.disabled=false; difficultyEl.disabled=false; mapToggleEl.disabled=false; clearPinsBtn.disabled=true;
  roundStart=0;
}

// ===== Leaderboard =====
function getLeaderboard(){ try{return JSON.parse(localStorage.getItem("blg_leaderboard")||"[]");}catch(e){return[];} }
function saveLeaderboard(entry){ const list=getLeaderboard(); list.push(entry); list.sort((a,b)=> b.score-a.score || a.timeMs-b.timeMs); localStorage.setItem("blg_leaderboard", JSON.stringify(list.slice(0,20))); }
function renderLeaderboard(){
  const list=getLeaderboard();
  if(!list.length){ leaderboardEl.innerHTML="<p>No scores yet.</p>"; return; }
  let html=`<table><thead><tr><th>Rank</th><th>Initials</th><th>Score</th><th>Qs</th><th>Time</th><th>Date</th></tr></thead><tbody>`;
  list.forEach((e,i)=>{ const d=new Date(e.date); const ds=d.toLocaleDateString(); html+=`<tr><td>${i+1}</td><td>${e.initials}</td><td>${e.score}</td><td>${e.questions}</td><td>${msToString(e.timeMs)}</td><td>${ds}</td></tr>`; });
  html+="</tbody></table>";
  leaderboardEl.innerHTML=html;
}
renderLeaderboard();

function loadMedia(item){
  const src = item && item.image ? item.image : "";
  if(!src){ mediaImg.src=""; mediaImg.alt=""; mediaCaption.textContent=""; mediaPanel.classList.add("hidden"); return; }
  mediaImg.src = src;
  mediaImg.alt = item.answer || "Location image";
  mediaCaption.textContent = item.answer ? item.answer : "";
  mediaPanel.classList.remove("hidden");
}
