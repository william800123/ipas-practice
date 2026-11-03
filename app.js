'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const localDate=date=>date?new Date(date).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'未紀錄';
const duration=seconds=>seconds===null||seconds===undefined?'未紀錄':`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`;
let store,user,bank=BANK,topics=TOPICS,stats={},active=null,exam=null,idx=0,timer=null,finishing=false,pendingAnswer=false,ownAttempts=[];
async function api(path,body){return store.action(path,body);}
function notify(message = '') { $('notice').textContent = [store.warning,message].filter(Boolean).join(' '); }
function fail(error) { notify(error.message); }
function run(fn) { return event => Promise.resolve().then(() => fn(event)).catch(fail); }
function jump() { $('content').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth', block:'start'}); }
async function refresh() {
  const [boot, history] = await Promise.all([api('bootstrap'), api('attempts?scope=mine')]);
  bank = boot.bank; topics = boot.topics; stats = boot.stats; active = boot.active; ownAttempts = history.attempts;
  levelMetrics();
  $('resume').disabled = !active;
  $('resume').innerHTML=icon('clock')+(active?'繼續'+LEVELS[examLevel(active)].name+'未完成測驗':'繼續未完成測驗');
}
async function begin(mode) {
  if (pendingAnswer || finishing) return;
  if (mode === 'formal' && $('subject').value === '0') { notify('完整模擬考請先選一個科目；每份 50 題，時間依所選級別設定。'); return; }
  if (active && !confirm('你有未完成試卷。開始新測驗將取代這份試卷，確定繼續？')) return;
  const result = await api('exams', {mode, level:selectedLevel(), subject:+$('subject').value, year:$('year').value, replaceActive:!!active});
  clearInterval(timer); exam = result; active = result; idx = 0; $('resume').disabled = false;
  notify(''); renderExam(); startTimer(); jump();
}
function startTimer() { clearInterval(timer); tick(); if (exam) timer = setInterval(tick, 1000); }
function tick() {
  if (!exam || finishing) return;
  const seconds = Math.max(0, Math.ceil((exam.deadline-Date.now())/1000));
  if ($('clock')) $('clock').textContent = `剩餘 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  if (seconds === 0 && !pendingAnswer) finish(true).catch(error => { clearInterval(timer); fail(error); });
}
function renderExam() {
  if (!exam) return;
  const q = bank.find(q=>q.id===exam.ids[idx]);
  const answered = Object.keys(exam.answers).length;
  $('content').innerHTML = `<section class="box"><div class="question-header"><strong>${icon('book')}${esc(exam.name)}</strong><span class="time-badge">${icon('clock')}<span id="clock"></span></span></div><progress value="${answered}" max="${exam.ids.length}" aria-label="作答進度"></progress><p class="meta">第 ${idx+1} / ${exam.ids.length} 題 · 已答 ${answered} 題 · ${esc(LEVELS[questionLevel(q)].name)} · ${esc(subjectName(q.subject))} · ${esc(q.kind)}</p>${q.image?questionImage(q):`<h2 class="question-title">${esc(q.q)}</h2>`}<fieldset class="answer-field"><legend class="sr-only">請選擇一個答案</legend>${q.options.map((o,i)=>`<label class="option"><input type="radio" name="answer" value="${i}" ${exam.answers[q.id]===i?'checked':''}><span>${'ABCD'[i]}. ${q.image?'請選擇此選項':esc(o)}</span></label>`).join('')}</fieldset><p id="answer-status" class="meta" role="status" aria-live="polite"></p><div class="toolbar"><button id="prev" ${idx===0?'disabled':''}>上一題</button><button id="next" ${idx===exam.ids.length-1?'disabled':''}>下一題${icon('arrow')}</button><button id="unanswered">跳到未答題</button><button class="primary" id="submit">交卷看解析</button></div><p class="meta">練習者：${esc(exam.displayName)} · 關閉頁面後仍持續計時；未答題以錯誤計算。</p></section>`;
  document.querySelectorAll('[name=answer]').forEach(el => { el.onchange = async () => {
    if (pendingAnswer || !exam) return;
    pendingAnswer = true;
    document.querySelectorAll('[name=answer],#prev,#next,#unanswered,#submit').forEach(e=>e.disabled=true);
    $('answer-status').textContent = '正在儲存答案…';
    try {
      const result = await api('answer', {examId:exam.id, questionId:q.id, picked:+el.value});
      if (result.finished || result.expired) { pendingAnswer = false; await finish(true); return; }
      exam.answers[q.id] = +el.value; active = exam;
      renderExam(); $('answer-status').textContent = store.persistent?'答案已儲存於此瀏覽器':'答案暫存在此分頁，請匯出備份'; tick();
    } catch(error) { if (exam) {renderExam(); $('answer-status').textContent = '儲存失敗，請重新選擇答案。';} fail(error); }
    finally {pendingAnswer = false;}
  }; });
  $('prev').onclick = () => {idx--;renderExam();tick();};
  $('next').onclick = () => {idx++;renderExam();tick();};
  $('unanswered').onclick = () => {const next = exam.ids.findIndex(id=>exam.answers[id]===undefined); if (next<0) notify('已完成所有題目，可以交卷。'); else {idx=next;renderExam();tick();}};
  $('submit').onclick = run(()=>finish(false));
  tick();
}
async function finish(auto) {
  if (!exam || finishing || pendingAnswer) return;
  const missing = exam.ids.length-Object.keys(exam.answers).length;
  if (!auto && !confirm(`確定交卷？尚有 ${missing} 題未作答，未答視為錯誤。`)) return;
  finishing = true;
  try {
    const result = await api('finish', {examId:exam.id});
    clearInterval(timer); exam = null; active = null;
    await refresh(); await showResult(result.resultId);
    notify(auto ? '時間到，已自動交卷並保存成績。' : '成績已保存在此瀏覽器，建議匯出備份。');
    jump();
  } finally {finishing=false;}
}
async function showResult(id) {
  const r = await api('attempts/'+encodeURIComponent(id));
  if(recordLevel(r)!==selectedLevel()){$('level').value=recordLevel(r);updateLevel();}
  const groups = {};
  for (const item of r.items) {const key=item.q.subject+'｜'+item.q.topic;const g=groups[key]??={n:0,ok:0};g.n++;g.ok+=+item.ok;}
  const subjects = [...new Set(r.items.map(x=>x.q.subject))].map(s=>{const items=r.items.filter(x=>x.q.subject===s);return items.length?`${esc(subjectName(s))}：${items.filter(x=>x.ok).length}/${items.length} 題`:'';}).filter(Boolean).join('　·　');
  $('content').innerHTML = `<section class="box"><div class="eyebrow">PRACTICE COMPLETE</div><h2>${esc(r.name)}</h2><div class="result-score">${r.score}<small> 分 · ${r.correct} / ${r.total} 題</small></div><div class="result-meta"><span>${icon('user')}${esc(r.displayName)}</span><span>${icon('clock')}作答 ${duration(r.durationSeconds)}</span><span>${esc(localDate(r.date))}</span>${r.imported?'<span>匯入紀錄</span>':''}</div><p class="meta">${subjects}。少量診斷結果僅供找弱點，同題重作進步後，記得用未見題確認。</p><div class="table-wrap"><table><thead><tr><th>主題</th><th>答對</th><th>接下來</th></tr></thead><tbody>${Object.entries(groups).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n).map(([key,g])=>`<tr><td>${esc(key)}</td><td>${g.ok}/${g.n}</td><td>${g.ok/g.n<.7?'優先補強':g.ok/g.n<.9?'再練一輪':'持續複習'}</td></tr>`).join('')}</tbody></table></div><div class="toolbar"><button id="result-wrong">${icon('refresh')}錯題再考</button><button id="result-adaptive">${icon('spark')}弱項加強</button><button id="result-export">${icon('download')}匯出給老師分析</button></div><p class="meta">綠底：正確答案；紅底：你選錯的答案。未答題顯示正解，並標示未作答。</p></section>${r.items.map((x,i)=>`<details class="box review" ${x.ok?'':'open'}><summary class="${x.ok?'good':'bad'}">${i+1}. ${x.ok?'答對':x.picked===null?'未作答':'答錯'} · ${esc(x.q.topic)}</summary>${x.q.image?questionImage(x.q):`<p>${esc(x.q.q)}</p>`}${x.q.options.map((o,j)=>`<div class="answer-option ${j===x.q.answer?'answer-correct':j===x.picked?'answer-wrong':''}">${'ABCD'[j]}. ${x.q.image?'請參照上方原題選項':esc(o)}${j===x.q.answer?`<span class="answer-tag">正確答案${x.ok?' · 你的答案':''}</span>`:j===x.picked?'<span class="answer-tag">你的答案 · 答錯</span>':''}</div>`).join('')}${x.picked===null?'<p class="bad">本題未作答</p>':''}<div class="explanation"><strong>答案解析</strong><p>${esc(x.q.explanation)}</p><strong>觀念補充</strong><p>${esc(topics[x.q.topic])}</p></div><p class="meta">${esc(x.q.source)} ${x.q.page?'· PDF 第 '+x.q.page+' 頁':''} · 原題號 ${x.q.number}</p></details>`).join('')}`;
  $('result-wrong').onclick=run(()=>begin('wrong')); $('result-adaptive').onclick=run(()=>begin('adaptive')); $('result-export').onclick=run(exportMine);
}
function showNotes() {
  $('content').innerHTML=`<section class="box"><span class="eyebrow">QUICK REVIEW</span><h2>${LEVELS[selectedLevel()].name}核心觀念速讀</h2><p class="meta">先做診斷，再從弱點開始讀。以下是依教材整理的複習順序，並非官方配分。</p></section><div class="note-grid">${Object.entries(topics).filter(([name])=>bank.some(q=>questionLevel(q)===selectedLevel()&&q.topic===name)).map(([name,text],i)=>`<section class="box"><h3>${icon(i<5?'ai':'spark')}${esc(name)}</h3><p>${esc(text)}</p></section>`).join('')}</div>`;
}
function download(payload, name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function showHistory() {
  const response=await api('attempts');const attempts=response.attempts.filter(r=>recordLevel(r)===selectedLevel());
  $('content').innerHTML=`<section class="box"><div class="section-title"><span class="section-icon">${icon('chart')}</span><div><h2>我的練習紀錄</h2><p>這些紀錄只保存在目前裝置的瀏覽器。</p></div></div><div id="attempts">${attempts.length?`<div class="table-wrap"><table><thead><tr><th>練習者</th><th>測驗與時間</th><th>成績</th><th>作答時間</th><th>紀錄</th></tr></thead><tbody>${attempts.map(r=>`<tr><td>${esc(r.displayName)}</td><td>${esc(r.name)}<div class="meta">${esc(localDate(r.date))}${r.imported?' · 匯入':''}</div></td><td><strong>${r.score} 分</strong><div class="meta">${r.correct}/${r.total} 題</div></td><td>${duration(r.durationSeconds)}</td><td><button data-result="${esc(r.id)}">看解析</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">還沒有紀錄，從一次基礎診斷開始吧。</p>'}</div><p class="meta">可用「匯出我的紀錄」備份，再在手機或其他電腦匯入；本版沒有跨裝置自動同步或大家的成績。同題重作分數與未見題表現請分開看。</p></section>`;
  document.querySelectorAll('[data-result]').forEach(button=>button.onclick=run(()=>showResult(button.dataset.result)));
}
async function exportMine() {
  download({...await api('export'),note:'請依我的錯題補講觀念，再出清楚標示為原創的同概念變形題。'},'iPAS-個人學習紀錄-'+new Date().toISOString().slice(0,10)+'.json');
}
async function importBackup(backup) {
  if(!confirm('將備份追加到此瀏覽器，重複紀錄略過；目前的成績會保留。確定匯入？'))return;
  const result=await api('import',{backup});await refresh();await showHistory();
  notify(`已匯入 ${result.imported} 筆紀錄。${result.resumed?'已帶入未完成試卷，可按「繼續未完成測驗」。':''}`);
}
function wire() {
  for(const [id,mode]of [['diagnostic','diagnostic'],['formal','formal'],['wrong','wrong'],['adaptive','adaptive']])$(id).onclick=run(()=>begin(mode));
  $('resume').onclick=run(async()=>{await refresh();if(!active){notify('沒有未完成測驗。');return;}selectExamLevel(active);exam=active;idx=0;renderExam();startTimer();jump();});
  $('notes').onclick=()=>{showNotes();jump();};$('history').onclick=run(async()=>{await showHistory();jump();});$('export').onclick=run(exportMine);
  $('year').onchange=()=>{$('version-hint').textContent=$('year').value==='mixed'?'混合版：所選科目從 114、115 年各抽 25 題，隨機排列，共 50 題／75 分鐘。':'完整模擬考請選一科，每份 50 題、75 分鐘。';};
  $('profile').onclick=run(async()=>{const name=prompt('練習紀錄上的暱稱（免登入，沒有密碼）',store.state.profile.displayName);if(name===null)return;await api('profile',{displayName:name});user.displayName=store.state.profile.displayName;updateName();notify('暱稱已更新；已完成測驗保留當時的暱稱。');});
  $('import').onchange=run(async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>5_000_000)throw Error('請選擇 5 MB 以內的備份。');let data;try{data=JSON.parse(await file.text());}catch{throw Error('無法讀取備份，請選擇匯出的 JSON 檔。');}await importBackup(data);}finally{event.target.value='';}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
}
function updateName(){$('account-name').textContent=user.displayName;$('greeting').textContent=user.displayName==='我的練習'?'今天，也進步一點。':`${user.displayName}，今天也進步一點。`;}
async function initialize() {
  try {
    store=new PagesStore(BANK,TOPICS);user={username:'local',displayName:store.state.profile.displayName};wire();wireLevels();updateName();await refresh();
    notify(active?'你有一份未完成的測驗，可接著作答。':'個人刷題版免登入。先做基礎診斷；成績只存在此瀏覽器，記得匯出備份。');
  }catch(error){$('notice').textContent=error.message;document.querySelectorAll('button').forEach(b=>b.disabled=true);}
}
initialize();
