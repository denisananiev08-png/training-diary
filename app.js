const SUPABASE_URL = 'https://xmcpqjirltvtbislcbdw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oU_xs8mseVtIKVLW-Xe0_Q_p_heECXs';
const TOKEN_KEY = 'training-diary-device-token-v1';
const CACHE_KEY = 'training-diary-cache-v1';

const PLANS = {
  A:[
    ['Присед со штангой','barbell',90,3,6],['Жим лёжа','barbell',95,3,8],['Подтягивания + вес','weighted-bw',10,3,6],['Горизонтальная тяга','barbell',55,3,10],['Подъём ног в висе','bodyweight',null,3,10],['Бицепс','dumbbell',15,2,8]
  ],
  B:[
    ['Присед со штангой','barbell',85,3,8],['Жим гантелей под наклоном','dumbbell',32,3,8],['Подтягивания без веса','bodyweight',null,3,8],['Горизонтальная тяга','barbell',55,3,10],['Жим гантелей над головой','dumbbell',null,2,8],['Пресс на наклонной скамье','bodyweight',null,3,12]
  ],
  C:[
    ['Присед со штангой','barbell',87.5,3,6],['Жим лёжа','barbell',90,3,8],['Подтягивания без веса','bodyweight',null,3,8],['Горизонтальная тяга','barbell',55,3,10],['Брусья','bodyweight',null,2,10],['Подъём ног в висе','bodyweight',null,3,10]
  ]
};

const KIND = {barbell:'штанга / тренажёр',dumbbell:'гантели',bodyweight:'своё тело','weighted-bw':'своё тело + вес'};
const $ = s => document.querySelector(s);
const state = { token:null, cycle:null, day:null, history:[], syncTimer:null, lastSync:null, loading:false };

function uid(){return Math.random().toString(36).slice(2,10)}
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function ruDate(s){if(!s)return '';const [y,m,d]=s.split('-').map(Number);const dt=new Date(y,m-1,d);return dt.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',weekday:'long'})}
function planTitle(p){return p==='A'?'Full Body A — тяжёлая':p==='B'?'Full Body B — объёмная':'Full Body C — средняя'}
function nextPlan(p){return p==='A'?'B':p==='B'?'C':'A'}
function makePlan(date, plan){return {date,plan,hasPlan:true,status:'planned',notes:'',bodyWeight:'',steps:'',finishedAt:null,exercises:PLANS[plan].map(([name,kind,w,sets,reps])=>({id:uid(),name,kind,sets:Array.from({length:sets},()=>({id:uid(),weight:w==null?'':String(w),reps:String(reps),done:false}))}))}}
function restDay(date, plan='A'){return {date,plan,hasPlan:false,status:'rest',notes:'',bodyWeight:'',steps:'',finishedAt:null,exercises:[]}}
function fromRow(row){
  if(!row)return null; const plan=row.plan||state.cycle?.next_plan||'A'; let ex=(row.workout?.exercises||[]).map(e=>({id:uid(),name:e.name||'Упражнение',kind:e.kind||'barbell',sets:(e.sets||[]).map(s=>({id:uid(),weight:s.weight===0||s.weight==null?'':String(s.weight),reps:s.reps==null?'':String(s.reps),done:!!s.done}))}));
  if(row.status==='planned'&&row.plan&&ex.length===0) ex=makePlan(row.day,plan).exercises;
  return {date:row.day,plan,hasPlan:!!row.plan,status:row.status||'planned',notes:row.notes||'',bodyWeight:row.morning_weight==null?'':String(row.morning_weight),steps:row.steps==null?'':String(row.steps),finishedAt:row.completed_at||null,exercises:ex};
}
function payload(w){return {day:w.date,plan:w.hasPlan?w.plan:'',status:w.status,notes:w.notes||'',morning_weight:w.bodyWeight||'',steps:w.steps||'',completed_at:w.finishedAt||'',workout:w.exercises.length?{title:planTitle(w.plan),exercises:w.exercises.map(e=>({name:e.name,kind:e.kind,sets:e.sets.map(s=>({done:s.done,reps:s.reps===''?null:Number(s.reps),weight:s.weight===''?0:Number(String(s.weight).replace(',','.'))}))}))}:null}}

async function rpc(name, body){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){throw new Error((await r.text()).slice(0,180)||`HTTP ${r.status}`)}
  const t=await r.text(); return t?JSON.parse(t):null;
}

function getToken(){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const fromHash=hash.get('key');
  if(fromHash){localStorage.setItem(TOKEN_KEY,fromHash);history.replaceState(null,'',location.pathname+location.search)}
  return localStorage.getItem(TOKEN_KEY);
}

function extractToken(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const u=new URL(raw);
    const h=new URLSearchParams(u.hash.replace(/^#/,''));
    const q=u.searchParams.get('key');
    return h.get('key')||q||'';
  }catch{}
  if(/^[A-Za-z0-9_-]{20,}$/.test(raw))return raw;
  const m=raw.match(/(?:#|[?&])key=([A-Za-z0-9_-]{20,})/);
  return m?m[1]:'';
}

async function pairDevice(){
  const input=$('#pairInput');
  const status=$('#pairStatus');
  const candidate=extractToken(input?.value);
  if(!candidate){status.textContent='Не вижу ключ в ссылке. Вставьте персональную ссылку целиком.';return}
  status.textContent='Проверяем подключение…';
  try{
    await rpc('diary_get_cycle',{p_token:candidate});
    localStorage.setItem(TOKEN_KEY,candidate);
    state.token=candidate;
    input.value='';
    status.textContent='Устройство подключено.';
    $('#setup').classList.add('hidden');
    await refreshAll(true);
  }catch(e){
    status.textContent='Ссылка не подошла. Скопируйте актуальную персональную ссылку и попробуйте ещё раз.';
  }
}
function cacheSave(){if(state.day)localStorage.setItem(CACHE_KEY,JSON.stringify({day:state.day,history:state.history,cycle:state.cycle}))}
function cacheLoad(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch{return null}}

async function bootstrap(){
  state.token=getToken();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  if(!state.token){$('#setup').classList.remove('hidden'); setSync('Нужна персональная ссылка устройства',true); return}
  $('#setup').classList.add('hidden');
  const cached=cacheLoad(); if(cached){state.cycle=cached.cycle;state.history=cached.history||[]}
  await refreshAll(true);
}

async function refreshAll(jump=false){
  if(state.loading)return; state.loading=true; setSync('Синхронизация…');
  try{
    state.cycle=await rpc('diary_get_cycle',{p_token:state.token});
    let date=$('#dateInput').value||localDate();
    if(jump&&state.cycle?.planned_date&&state.cycle.planned_date>=localDate()) date=state.cycle.planned_date;
    const [row,hist]=await Promise.all([rpc('diary_get_day',{p_token:state.token,p_day:date}),rpc('diary_get_history',{p_token:state.token})]);
    state.day=fromRow(row) || (state.cycle?.planned_date===date?makePlan(date,state.cycle.next_plan):restDay(date,state.cycle?.next_plan||'A'));
    state.history=(hist||[]).map(fromRow);
    state.lastSync=new Date(); cacheSave(); render(); setSync(`Обновлено · ${state.lastSync.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}${state.cycle?` · следующая: ${state.cycle.next_plan}, ${state.cycle.planned_date?.split('-').reverse().join('.')||'—'}`:''}`);
  }catch(e){
    const msg=String(e?.message||e);
    if(msg.includes('invalid diary token')){
      localStorage.removeItem(TOKEN_KEY);
      state.token=null; state.day=null; state.history=[]; state.cycle=null;
      $('#dayCard').classList.add('hidden'); $('#summaryCard').classList.add('hidden'); $('#exerciseList').innerHTML=''; $('#historyList').innerHTML='';
      $('#setup').classList.remove('hidden');
      setSync('Ключ устройства устарел — вставьте актуальную персональную ссылку',true);
      return;
    }
    const c=cacheLoad();if(c?.day)state.day=c.day;if(c?.history)state.history=c.history;if(c?.cycle)state.cycle=c.cycle;render();setSync(navigator.onLine?`Ошибка синхронизации: ${msg}`:'Нет связи — показаны данные с телефона',true)
  }
  finally{state.loading=false}
}

function setSync(text,error=false){const el=$('#syncLine');el.textContent=text;el.classList.toggle('error',error)}
function parseNum(v){const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:0}
function setTonnage(kind,w,reps){if(kind==='bodyweight')return 0;if(kind==='dumbbell')return w*2*reps;return w*reps}
function totals(w){let sets=0,reps=0,tonnage=0;(w.exercises||[]).forEach(e=>e.sets.forEach(s=>{const r=parseNum(s.reps);if(r>0){sets++;reps+=r;tonnage+=setTonnage(e.kind,parseNum(s.weight),r)}}));return{sets,reps,tonnage}}
function exerciseTotals(e){let sets=0,reps=0,tonnage=0;e.sets.forEach(s=>{const r=parseNum(s.reps);if(r>0){sets++;reps+=r;tonnage+=setTonnage(e.kind,parseNum(s.weight),r)}});return{sets,reps,tonnage}}

function render(){
  const w=state.day;if(!w)return;
  $('#dayCard').classList.remove('hidden');$('#summaryCard').classList.toggle('hidden',w.status==='rest');
  $('#title').textContent=w.status==='rest'?'Восстановление':planTitle(w.plan);
  $('#dateInput').value=w.date;$('#dateLabel').textContent=ruDate(w.date);$('#weightInput').value=w.bodyWeight;$('#stepsInput').value=w.steps;$('#notesInput').value=w.notes;
  document.querySelectorAll('[data-status]').forEach(b=>b.classList.toggle('active',b.dataset.status===w.status));
  document.querySelectorAll('[data-plan]').forEach(b=>b.classList.toggle('active',w.status!=='rest'&&b.dataset.plan===w.plan));
  renderExercises(); renderTotals(); renderHistory();
}

function renderExercises(){
  const list=$('#exerciseList');list.innerHTML='';const w=state.day;if(!w||w.status==='rest')return;
  w.exercises.forEach((ex,ei)=>{
    const node=$('#exerciseTemplate').content.cloneNode(true);const card=node.querySelector('.exercise-card');
    node.querySelector('.exercise-title').textContent=`${ei+1}. ${ex.name}`;node.querySelector('.exercise-kind').textContent=KIND[ex.kind]||ex.kind;
    const sets=node.querySelector('.sets');
    ex.sets.forEach((s,si)=>{const row=document.createElement('div');row.className='set-row';row.innerHTML=`<span class="set-index">${si+1}</span><input class="field weight" inputmode="decimal" placeholder="вес, кг"><input class="field reps" inputmode="numeric" placeholder="повторы"><button class="done">✓</button><button class="delete-set">−</button>`;row.querySelector('.weight').value=s.weight;row.querySelector('.reps').value=s.reps;row.querySelector('.done').classList.toggle('active',s.done);row.querySelector('.weight').disabled=ex.kind==='bodyweight';
      row.querySelector('.weight').addEventListener('input',e=>{s.weight=e.target.value;scheduleSave();renderTotals()});row.querySelector('.reps').addEventListener('input',e=>{s.reps=e.target.value;scheduleSave();renderTotals()});row.querySelector('.done').onclick=()=>{s.done=!s.done;scheduleSave();renderExercises();renderTotals()};row.querySelector('.delete-set').onclick=()=>{ex.sets.splice(si,1);scheduleSave();render()};sets.appendChild(row)});
    node.querySelector('.add-set').onclick=()=>{const last=ex.sets.at(-1)||{weight:'',reps:''};ex.sets.push({id:uid(),weight:last.weight,reps:last.reps,done:false});scheduleSave();render()};
    node.querySelector('.delete-exercise').onclick=()=>{w.exercises.splice(ei,1);scheduleSave();render()};
    const t=exerciseTotals(ex);node.querySelector('.exercise-total').textContent=`Итог: ${t.sets} подх. · ${t.reps} повт.${t.tonnage?` · ${Math.round(t.tonnage)} кг тоннаж`:''}`;list.appendChild(node);
  });
}
function renderTotals(){if(!state.day)return;const t=totals(state.day);$('#setsTotal').textContent=t.sets;$('#repsTotal').textContent=t.reps;$('#tonnageTotal').textContent=Math.round(t.tonnage)}
function renderHistory(){const root=$('#historyList');root.innerHTML='';state.history.forEach(h=>{const b=document.createElement('button');b.className='history-item';const t=totals(h);b.innerHTML=`<strong>${ruDate(h.date)}</strong><span>${h.status==='rest'?'Отдых':`${h.plan} · ${h.status==='completed'?'Завершена':'План'}`}${h.status==='completed'?` · ${Math.round(t.tonnage)} кг`:''}${h.bodyWeight?` · ${h.bodyWeight} кг утром`:''}</span>`;b.onclick=async()=>{$('#dateInput').value=h.date;await loadDate(h.date)};root.appendChild(b)})}

async function loadDate(date){setSync('Загрузка…');try{const row=await rpc('diary_get_day',{p_token:state.token,p_day:date});state.day=fromRow(row)||(state.cycle?.planned_date===date?makePlan(date,state.cycle.next_plan):restDay(date,state.cycle?.next_plan||'A'));cacheSave();render();setSync('Обновлено')}catch(e){setSync(`Ошибка: ${e.message}`,true)}}

function scheduleSave(){cacheSave();clearTimeout(state.syncTimer);setSync('Сохраняем…');state.syncTimer=setTimeout(saveDay,700)}
async function saveDay(){if(!state.day)return;try{await rpc('diary_save_day',{p_token:state.token,p_payload:payload(state.day)});state.lastSync=new Date();await refreshHistoryOnly();setSync(`Обновлено · ${state.lastSync.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`)}catch(e){setSync(navigator.onLine?`Ошибка синхронизации: ${e.message}`:'Нет связи — сохранено на телефоне',true)}}
async function refreshHistoryOnly(){try{const hist=await rpc('diary_get_history',{p_token:state.token});state.history=(hist||[]).map(fromRow);cacheSave();renderHistory()}catch{}}

async function finish(){const w=state.day;if(!w||w.status==='rest')return;if(!confirm('Завершить тренировку и перейти к следующему циклу?'))return;w.status='completed';w.hasPlan=true;w.finishedAt=new Date().toISOString();setSync('Сохраняем тренировку…');try{await rpc('diary_save_day',{p_token:state.token,p_payload:payload(w)});state.cycle=await rpc('diary_advance_cycle',{p_token:state.token,p_done_day:w.date,p_done_plan:w.plan});await refreshAll(true)}catch(e){setSync(`Ошибка: ${e.message}`,true)}}
function summaryText(w){const t=totals(w);const lines=[`${ruDate(w.date)} — ${w.status==='rest'?'восстановление':planTitle(w.plan)}`];if(w.bodyWeight)lines.push(`Утренний вес: ${w.bodyWeight} кг`);if(w.steps)lines.push(`Шаги: ${w.steps}`);lines.push('');w.exercises.forEach(e=>{const sets=e.sets.map(s=>e.kind==='bodyweight'||!s.weight?`${s.reps}`:e.kind==='weighted-bw'?`+${s.weight}кг×${s.reps}`:e.kind==='dumbbell'?`${s.weight}кг(×2)×${s.reps}`:`${s.weight}кг×${s.reps}`).join(', ');lines.push(`${e.name}: ${sets}`)});lines.push('',`ИТОГО: подходов ${t.sets}, повторов ${t.reps}, тоннаж ${Math.round(t.tonnage)} кг`);return lines.join('\n')}

$('#refreshBtn').onclick=()=>state.token?refreshAll(true):$('#setup').classList.remove('hidden');
$('#pairBtn').onclick=pairDevice;
$('#pairInput').addEventListener('keydown',e=>{if(e.key==='Enter')pairDevice()});
$('#dateInput').onchange=e=>loadDate(e.target.value);
$('#weightInput').oninput=e=>{state.day.bodyWeight=e.target.value;scheduleSave()};$('#stepsInput').oninput=e=>{state.day.steps=e.target.value;scheduleSave()};$('#notesInput').oninput=e=>{state.day.notes=e.target.value;scheduleSave()};
document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{state.day.status=b.dataset.status;if(state.day.status==='rest'){state.day.hasPlan=false;state.day.exercises=[]}else if(!state.day.exercises.length){state.day.hasPlan=true;Object.assign(state.day,makePlan(state.day.date,state.day.plan))}scheduleSave();render()});
document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>{const p=b.dataset.plan;const keep={bodyWeight:state.day.bodyWeight,steps:state.day.steps,notes:state.day.notes,date:state.day.date};state.day={...makePlan(state.day.date,p),...keep};scheduleSave();render()});
$('#finishBtn').onclick=finish;$('#copyBtn').onclick=async()=>{await navigator.clipboard.writeText(summaryText(state.day));$('#copyBtn').textContent='Скопировано';setTimeout(()=>$('#copyBtn').textContent='Скопировать итог',1200)};
window.addEventListener('online',()=>refreshAll(false));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshAll(false)});
bootstrap();
