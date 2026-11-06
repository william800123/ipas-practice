// Shared grade controls for IIS and the static personal edition.
const LEVELS={
 beginner:{name:'初級',minutes:75,subjects:{1:'人工智慧基礎概論',2:'生成式 AI 應用與規劃'},years:{'115-3':'115 年第三次','115-2':'115 年第二次','115':'115 年第一次','114':'114 年第四梯次',mixed:'混和版'},hint:'請先選擇一科；每科基礎診斷15題／22.5分鐘。正式模擬每科 50 題／75 分鐘。',count:'30 題原創基礎題＋400 題官方公告考古題。'},
 intermediate:{name:'中級',minutes:90,subjects:{21:'人工智慧技術應用與規劃',22:'大數據處理分析與應用',23:'機器學習技術與應用'},years:{'115':'115 年第一次','114':'114 年第二梯次',mixed:'混和版',shuffled:'同卷隨機排序 · 114 年'},hint:'科一必考，科二／科三擇一報考；此處三科都可練習。請先選擇一科；每科原創診斷10題／15分鐘。正式模擬每科 50 題／90 分鐘。',count:'30 題原創基礎題＋300 題官方公告考古題；原題圖文保留圖表、公式及程式碼。'}
};
function selectedLevel(){return document.getElementById('level').value;}
function questionLevel(q){return q.level||(q.subject>=21?'intermediate':'beginner');}
function recordLevel(r){return r.level||(r.items?.some(x=>questionLevel(x.q||bank.find(q=>q.id===x.id)||{})==='intermediate')?'intermediate':'beginner');}
function subjectName(s){return LEVELS.beginner.subjects[s]||LEVELS.intermediate.subjects[s]||'綜合';}
function levelMetrics(){
 const lev=selectedLevel(),records=ownAttempts.filter(r=>recordLevel(r)===lev),ids=new Set(bank.filter(q=>questionLevel(q)===lev).map(q=>q.id));
 $('metric-attempts').innerHTML=`${records.length} <small>次</small>`;
 $('metric-wrong').innerHTML=`${Object.entries(stats).filter(([id,s])=>ids.has(id)&&s.lastWrong).length} <small>題</small>`;
 $('metric-time').innerHTML=`${Math.floor(records.reduce((s,r)=>s+(r.durationSeconds??0),0)/60)} <small>分鐘</small>`;
}
function updatePaperOptions(preferred){
 const l=LEVELS[selectedLevel()],value=preferred||$('year').value,choices={...l.years};
 for(const q of bank)if(questionLevel(q)===selectedLevel()&&q.setId&&(!$('subject').value||$('subject').value===''||q.subject===+$('subject').value))choices[q.paper]='匯入 · '+(q.paperName||q.source);
 $('year').innerHTML=Object.entries(choices).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
 $('year').value=choices[value]?value:selectedLevel()==='beginner'?'115-3':'115';versionHint();
}
function versionHint(){
 const level=selectedLevel(),l=LEVELS[level],year=$('year').value;
 const qs=bank.filter(q=>questionLevel(q)===level&&q.subject===+$('subject').value&&QuestionTools.paper(q)===year);
 $('version-hint').textContent=year==='mixed'?`混和版：所選科目隨機抽50題／${l.minutes}分鐘。`:year==='shuffled'?'同卷隨機排序：114 年第二梯次同一份 50 題，90 分鐘。':year.startsWith('pdf-')?`匯入卷：${qs.length} 題，${Math.round(qs.length*(level==='beginner'?1.5:1.8)*10)/10} 分鐘；按原題單選／複選作答。`:`完整模擬考請選一科，每份 50 題、${l.minutes} 分鐘。`;
}
function updateLevel(){
 const l=LEVELS[selectedLevel()];
 $('subject').innerHTML='<option value="">請選擇科目（必選）</option>'+Object.entries(l.subjects).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
 updatePaperOptions(selectedLevel()==='beginner'?'115-3':'115');
 $('level-hint').textContent=l.hint;
 const welcome=document.querySelector('.welcome p');
 // Rebuild the course chips when changing grade, keeping the welcome artwork intact.
 document.querySelectorAll('.welcome .pill').forEach(el=>el.remove());
 for(const name of Object.values(l.subjects)){const chip=document.createElement('span');chip.className='pill';chip.textContent=name;welcome.parentNode.append(chip);}
 document.querySelector('.source-note').textContent=l.count+' 設定依資料夾簡章；歷年題目按公告當時情境。';
 versionHint();levelMetrics();
 if(!$('practice-area').hidden){
  $('chosen-level').textContent='目前練習：'+l.name+'。可隨時回到此處切換。';
  document.querySelectorAll('[data-choose-level]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chooseLevel===selectedLevel())));
 }
}
function wireLevels(){
 updateLevel();$('year').onchange=versionHint;
 document.querySelectorAll('[data-choose-level]').forEach(button=>button.onclick=()=>chooseLevel(button.dataset.chooseLevel));
 $('pdf-import').onclick=()=>{showPdfImport();jump();};
 $('subject').onchange=()=>{if(pendingAnswer||finishing){if(exam)$('subject').value=String(bank.find(q=>q.id===exam.ids[0]).subject);notify('正在儲存答案，請稍後切換科目。');return;}if(exam){clearInterval(timer);exam=null;$('content').replaceChildren();notify('已切換科目；未完成試卷仍保留原截止時間。');}updatePaperOptions();};
 $('sprint').onclick=()=>{showSprint();jump();};
 $('level').onchange=()=>{
  if(pendingAnswer||finishing){if(exam)$('level').value=examLevel(exam);notify('正在儲存作答，請稍後切換級別。');return;}
  if(exam){clearInterval(timer);exam=null;}
  updateLevel();$('content').replaceChildren();
  notify('已切換為'+LEVELS[selectedLevel()].name+'。診斷、錯題、弱項、重點與成績依此級別顯示。'+(active?'未完成試卷仍保留原截止時間，可按繼續測驗返回。':''));
 };
}
function examLevel(e){return e.level||questionLevel(bank.find(q=>q.id===e.ids[0])||{});}
function selectExamLevel(e){$('level').value=examLevel(e);updateLevel();const subjects=[...new Set(e.ids.map(id=>bank.find(q=>q.id===id)?.subject))];if(subjects.length!==1)throw Error('此舊試卷包含多個科目，請選擇單一科目重新開始練習。');$('subject').value=String(subjects[0]);updatePaperOptions();}
function resetLevelEntry(){
 $('subject').value='';
 $('practice-area').hidden=true;
 document.querySelectorAll('[data-choose-level]').forEach(button=>button.setAttribute('aria-pressed','false'));
 $('chosen-level').textContent='請先選擇初級或中級。';
}
function chooseLevel(level){
 if(selectedLevel()!==level){$('level').value=level;$('level').onchange();}
 $('practice-area').hidden=false;
 $('chosen-level').textContent='目前練習：'+LEVELS[level].name+'。可隨時回到此處切換。';
 document.querySelectorAll('[data-choose-level]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chooseLevel===level)));
 $('setup').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
const SPRINT={
 beginner:{
  intro:'先掌握兩科基本判斷，再以完整卷驗證。每科 50 題／75 分鐘，平均每題約 90 秒。',
  courses:[
   {subject:1,focus:'先讀學習類型 → 資料處理 → 模型評估 → AI 治理。',checks:['分類預測類別，迴歸預測連續值，分群找未標記資料的結構；KNN 與 K-means 不同。','訓練／驗證／測試分工清楚；補值、縮放與特徵選擇只在訓練資料擬合，避免資料洩漏。','Precision=TP/(TP+FP)；Recall=TP/(TP+FN)。重視漏報時先看 Recall，不能只看 Accuracy。','過擬合：訓練好、驗證差；可考慮正則化、更多資料與合適模型複雜度。']},
   {subject:2,focus:'先辨認需求 → 選工具或方法 → 規劃導入 → 檢查風險。',checks:['知識常更新：評估 RAG；輸出格式不穩：先改善提示與範例；穩定領域行為：再評估微調。','提示包含任務、背景、限制、輸出格式與範例；生成結果需查證，temperature 不代表真實性。','No-code／Low-code 降低開發門檻，仍需權限、測試、資料品質與維護規劃。','企業導入先定義問題與 KPI，再盤點資料、PoC、小規模試行、驗收與持續監控；注意個資、偏見及提示注入。']}
  ],
  traps:[['平均差與標準差','平均差使用與平均數的絕對差；標準差由平方差計算。'],['Type I／Type II','Type I 是誤拒真 H0；Type II 是未拒絕假的 H0。p 值不是 H0 為真的機率。'],['RAG 與微調','RAG 檢索外部資料，微調更新參數；兩者都不保證回答完全正確。'],['重考分數','同題答對可能是記憶效果，仍要用未做過的原卷確認理解。']],
  days:[['第 1 階段｜找弱點','分別完成兩科各15題診斷，讀最低的三個主題，逐題寫一句判斷理由。'],['第 2 階段｜科一','複習資料處理、學習類型與評估；做一份科一 50 題／75 分鐘原卷並檢討。'],['第 3 階段｜科二','複習提示、RAG、微調與導入；做一份科二 50 題／75 分鐘原卷並檢討。'],['考前一天｜收斂','先重考仍錯的題，讀易混淆概念；若有時間，以另一年度原卷確認，不再大量擴充範圍。']]
 },
 intermediate:{
  intro:'科一必考，科二「大數據」或科三「機器學習」擇一報考。先鎖定自己的選考科；每科 50 題／90 分鐘，平均每題約 108 秒。',
  courses:[
   {subject:21,focus:'語言與視覺技術 → 模型評估 → AI 導入規劃與治理。',checks:['TF-IDF 同時考慮詞頻與稀有性；詞向量表示語意。BERT 偏理解編碼，GPT 偏自回歸生成，Transformer 以注意力建立關聯。','影像分類判類別，物件偵測加上定位，分割判像素；IoU=交集／聯集。','RAG、微調、量化及蒸餾各解決不同問題；用任務品質、延遲、成本與資源限制選方案。','用業務 KPI、資料可用性、PoC、風險、上線監控與回滾形成完整導入計畫。']},
   {subject:22,focus:'選考大數據：統計與特徵工程 → SQL／pandas → 分散式與串流管線。',checks:['Z=(x−平均數)/標準差；標準化不保證落在 0～1。極端值下比較 Robust Scaling 與 Min-Max。','無序類別的 Label Encoding 可能引入虛假順序；One-Hot 注意高基數。隨機過採樣可能增加過擬合風險。','SQL 先辨認 WHERE／GROUP BY／HAVING；pandas 練 describe、groupby、sum、缺值、索引與資料型別。','ETL 先轉再載入，ELT 先載入再轉；比較批次／串流、HDFS、MapReduce、Spark、ACID 與 CAP 的適用情境。']},
   {subject:23,focus:'選考機器學習：監督模型 → 分群降維 → 神經網路 → 驗證與程式判讀。',checks:['分清 KNN、SVM、樹、Bagging 與 Boosting；訓練與驗證差距用來判斷偏差／變異問題。','K-means 受尺度與起點影響；DBSCAN 看密度與雜訊；PCA 以最大變異降維，NMF 要求逐元素非負。','神經元 z=Σ(wᵢxᵢ)+b，梯度決定更新方向；辨認 CNN、RNN、LSTM 的結構及任務。','程式題先看輸入 shape、索引、axis、資料切分與每行輸出；交叉驗證選模型，最終測試集留到最後。']}
  ],
  traps:[['Recall 勘誤','Recall=TP/(TP+FN)，不能把分母寫成 TP+FP。'],['邏輯迴歸勘誤','線性關係指特徵與對數勝算，不表示原資料必須線性可分。'],['NMF 與神經元勘誤','非負是每個元素不小於零；加權和使用對應的 wᵢxᵢ，最後加偏置 b。'],['圖表與題組','先看共用資料、單位及程式碼，再判讀選項；請完整閱讀文字轉寫的圖表資料與程式碼。']],
  days:[['第 1 階段｜確定選科','先做科一與自己的選考科診斷，各 10 題；檢討錯誤，列出最弱的三個主題。'],['第 2 階段｜科一完整卷','補語言／視覺技術與導入規劃，再做科一 50 題／90 分鐘原卷。'],['第 3 階段｜選考科完整卷','大數據重統計、資料處理及管線；機器學習重模型、驗證及程式。完成選考科原卷並檢討。'],['考前一天｜公式與程式','重考仍錯的題，口述公式的分子分母及程式輸入輸出；保留另一年度原卷驗證理解；同卷隨機排序仍是舊題，不當作新題能力驗證。']]
 }
};
function showSprint(){
 const level=selectedLevel(),l=LEVELS[level],plan=SPRINT[level];
 const weak={};
 for(const q of bank.filter(q=>questionLevel(q)===level)){
  const st=stats[q.id];if(!st)continue;
  const row=weak[q.topic]??={n:0,wrong:0,pending:0};row.n+=st.n;row.wrong+=st.wrong;row.pending+=+st.lastWrong;
 }
 const priorities=Object.entries(weak).sort((a,b)=>b[1].pending-a[1].pending||b[1].wrong/b[1].n-a[1].wrong/a[1].n).slice(0,3);
 $('content').innerHTML=`<section class="box sprint-hero"><span class="eyebrow">EXAM SPRINT · ${esc(l.name)}</span><h2>${esc(l.name)}考前衝刺</h2><p>${esc(plan.intro)}</p><p class="meta">依資料夾教材、簡章及勘誤表整理，以下是複習建議，不代表官方配分或及格保證。可用四天完成四階段；時間不足時先補最弱觀念。</p><div class="toolbar"><button id="sprint-diagnostic">先做本級診斷</button><button id="sprint-wrong">本級錯題再考</button><button id="sprint-back">回到練習設定</button></div></section><section class="box"><h3>依你的作答，優先複習</h3>${priorities.length?`<ul>${priorities.map(([name,s])=>`<li><strong>${esc(name)}</strong>：累積答錯 ${s.wrong}/${s.n} 次，目前待複習 ${s.pending} 題。</li>`).join('')}</ul><p class="meta">已答對的錯題會移出待複習池，歷史答錯次數仍保留。</p>`:'<p>尚無本級診斷紀錄。先做診斷，再依實際結果安排複習順序。</p>'}</section><section class="box"><h3>四階段衝刺安排</h3><ol class="sprint-plan">${plan.days.map(([name,text])=>`<li><strong>${esc(name)}</strong><p>${esc(text)}</p></li>`).join('')}</ol></section><div class="note-grid">${plan.courses.map(c=>`<section class="box sprint-course"><span class="eyebrow">${esc(l.name)} · 科目 ${c.subject>=21?c.subject-20:c.subject}</span><h3>${esc(subjectName(c.subject))}</h3><p>${esc(c.focus)}</p><ul>${c.checks.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><button data-sprint-subject="${c.subject}">練這一科的診斷</button></section>`).join('')}</div><section class="box"><h3>考前最容易混淆</h3><dl>${plan.traps.map(([name,text])=>`<dt><strong>${esc(name)}</strong></dt><dd>${esc(text)}</dd>`).join('')}</dl></section><section class="box"><h3>做題與考前檢查</h3><ul><li>圈出「不正確／最不適當／優先」，先以任務目標排除無關選項。</li><li>不會的題先標記並往下做，預留最後檢查時間；本練習室未答以錯誤計。</li><li>檢討時能說明正解理由，也要能說出其他選項錯在哪裡。</li><li>確認准考證、證件、報到地點與時間，考前維持正常作息。</li></ul></section>`;
 $('sprint-diagnostic').onclick=run(()=>{return begin('diagnostic');});
 $('sprint-wrong').onclick=run(()=>{return begin('wrong');});
 $('sprint-back').onclick=()=>$('setup').scrollIntoView({block:'start',behavior:'smooth'});
 document.querySelectorAll('[data-sprint-subject]').forEach(button=>button.onclick=run(()=>{$('subject').value=button.dataset.sprintSubject;return begin('diagnostic');}));
}
function questionImage(q){return q.image?`<figure class="original-question"><img src="${esc(q.image)}" alt="官方第 ${q.number} 題原題圖文（不含答案欄）"><figcaption>原題圖文，可點選放大查看；請在下方選擇 A～D。</figcaption></figure>`:'';}
document.addEventListener('click',event=>{if(event.target.matches('.original-question img')){const dialog=document.createElement('dialog');dialog.className='question-zoom';const close=document.createElement('button');close.textContent='關閉放大';close.onclick=()=>{dialog.close();dialog.remove();};const img=event.target.cloneNode();dialog.append(close,img);document.body.append(dialog);dialog.addEventListener('cancel',()=>dialog.remove());dialog.showModal();}});
