'use strict';
// Personal, browser-local practice records. No accounts, credentials, network requests, or shared scores.
class PagesStore {
  constructor(bank, topics, storage, key='ipas-pages-v1:'+new URL('./',location.href).pathname, sets=[]) {
    this.bank=bank;this.topics=topics;this.sets=sets;this.byId=new Map(bank.map(q=>[q.id,q]));this.storage=storage;this.key=key;this.warning='';this.persistent=true;
    this.state={version:3,format:'ipas-pages-v1',profile:{displayName:'我的練習'},attempts:[],active:null};
    let text;
    try {if(storage===undefined)storage=window.localStorage;this.storage=storage;text=storage.getItem(key);} catch {this.persistent=false;this.warning='此瀏覽器無法保存紀錄，目前只暫存在本分頁；請交卷後匯出備份。';}
    if(text){try{const saved=JSON.parse(text);this.validate(saved);this.state=saved;}catch{throw new Error('已有紀錄的格式無法讀取。請先保留瀏覽器資料，勿清除儲存；可聯絡協助修復。');}}
    this.save(this.state);
  }
  save(next) {
    try {this.storage.setItem(this.key,JSON.stringify(next));this.persistent=true;this.warning='';}
    catch {this.persistent=false;this.warning='此瀏覽器目前無法保存紀錄，只暫存在本分頁；請交卷後匯出備份。';}
    this.state=next;
  }
  sync() {
    if(!this.persistent)return;
    let text;try{text=this.storage.getItem(this.key);}catch{return;}
    if(!text)return;
    const saved=JSON.parse(text);this.validate(saved);this.state=saved;
  }
  copy() {return JSON.parse(JSON.stringify(this.state));}
  validate(s) {
    if(s?.version!==3||s.format!=='ipas-pages-v1'||!Array.isArray(s.attempts)||s.attempts.length>1000||typeof s.profile?.displayName!=='string'||s.profile.displayName.length>30)throw Error('紀錄格式不正確。');
    for(const r of s.attempts)this.normalizeAttempt(r);
    if(s.active)this.validateActive(s.active);
  }
  validateActive(e) {
    if(!e||typeof e.id!=='string'||typeof e.name!=='string'||!Array.isArray(e.ids)||!e.ids.length||e.ids.length>this.bank.length||new Set(e.ids).size!==e.ids.length||e.ids.some(id=>!this.byId.has(id))||!Number.isFinite(e.deadline)||!Number.isFinite(e.startedMs)||e.deadline<=e.startedMs||e.deadline-e.startedMs>this.bank.length*120000||!e.answers||typeof e.answers!=='object'||Array.isArray(e.answers))throw Error('未完成試卷格式不正確。');
    for(const [id,picked]of Object.entries(e.answers))if(!e.ids.includes(id)||!QuestionTools.valid(this.byId.get(id),picked))throw Error('未完成試卷答案不正確。');
  }
  normalizeAttempt(r) {
    if(!r||!Array.isArray(r.items)||!r.items.length||r.items.length>this.bank.length||typeof r.name!=='string'||r.name.length>200||!Number.isFinite(Date.parse(r.date)))throw Error('備份內有無效的測驗紀錄。');
    const seen=new Set();const items=r.items.map(x=>{if(!this.byId.has(x.id)||seen.has(x.id)||(x.picked!==null&&x.picked!==undefined&&!QuestionTools.valid(this.byId.get(x.id),x.picked)))throw Error('備份內有不符合題庫的作答。');seen.add(x.id);return{id:x.id,picked:x.picked??null,ok:QuestionTools.correct(this.byId.get(x.id),x.picked)};});
    const seconds=Number.isFinite(r.durationSeconds)&&r.durationSeconds>=0?Math.min(this.bank.length*120,Math.round(r.durationSeconds)):null;
    return{id:typeof r.id==='string'?r.id.slice(0,100):this.id(),name:r.name,date:new Date(r.date).toISOString(),startedAt:Number.isFinite(Date.parse(r.startedAt))?new Date(r.startedAt).toISOString():null,durationSeconds:seconds,displayName:String(r.displayName||'我的練習').slice(0,30),imported:!!r.imported,items};
  }
  id() {return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
  shuffle(xs) {const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  stats() {
    const stats={};for(const r of [...this.state.attempts].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)))for(const x of r.items){const ok=QuestionTools.correct(this.byId.get(x.id),x.picked);const s=stats[x.id]??={n:0,wrong:0,lastWrong:false};s.n++;s.wrong+=+!ok;s.lastWrong=!ok;}return stats;
  }
  summary(r) {const correct=r.items.filter(x=>QuestionTools.correct(this.byId.get(x.id),x.picked)).length;return{...r,items:undefined,username:'local',level:r.items.some(x=>this.byId.get(x.id).subject>=21)?'intermediate':'beginner',correct,total:r.items.length,score:Math.round(correct/r.items.length*100)};}
  start(d) {
    const {mode,subject,year}=d,level=d.level||'beginner';
    if(!['beginner','intermediate'].includes(level))throw Error('請選擇級別。');
    const allowed=level==='beginner'?[0,1,2]:[0,21,22,23];
    if(!allowed.includes(subject))throw Error('請選擇科目。');
    const pool=this.bank.filter(q=>(q.level||'beginner')===level&&(!subject||q.subject===subject)),stats=this.stats();let qs,name,minutes;
    if(mode==='diagnostic'){qs=pool.filter(q=>q.kind==='原創基礎診斷');name='基礎診斷';minutes=qs.length*1.5;}
    else if(mode==='formal'){
      if(!subject)throw Error('請先選擇一個科目。');
      const official=pool.filter(q=>q.kind==='官方公告考古題');
      const latest=level==='beginner'?'115-3':'115';
      qs=year==='mixed'?this.shuffle([...this.shuffle(official.filter(q=>QuestionTools.paper(q)==='114')).slice(0,25),...this.shuffle(official.filter(q=>QuestionTools.paper(q)===latest)).slice(0,25)]):year==='shuffled'?this.shuffle(official.filter(q=>QuestionTools.paper(q)==='114')):pool.filter(q=>QuestionTools.paper(q)===year).sort((a,b)=>a.number-b.number);
      if(!qs.length||(year==='mixed'&&qs.length!==50))throw Error('此科目沒有這份試卷，請重新選擇版本。');
      name=(year==='mixed'?'跨年度混合版':year==='shuffled'?'114 年同卷隨機排序':qs[0].paperName||({'114':'114 年官方考古題','115':'115 年第一次','115-2':'115 年第二次','115-3':'115 年第三次'}[year]||'匯入試卷'))+' · 科目 '+(subject>=21?subject-20:subject);
      minutes=qs.length*(level==='intermediate'?1.8:1.5);
    } else if(mode==='wrong'){qs=this.shuffle(pool.filter(q=>stats[q.id]?.lastWrong));name='錯題再考';minutes=Math.max(10,qs.length*1.5);}
    else if(mode==='adaptive'){
      if(!pool.some(q=>stats[q.id]))throw Error('請先完成基礎診斷，建立弱點紀錄。');
      const groups={};for(const q of pool){const st=stats[q.id];if(!st)continue;const g=groups[q.subject+'|'+q.topic]??={n:0,wrong:0};g.n+=st.n;g.wrong+=st.wrong;}
      qs=this.shuffle(pool).map(q=>{const st=stats[q.id],g=groups[q.subject+'|'+q.topic];return{q,score:(g?g.wrong/g.n:.35)*5+(st?.lastWrong?2:0)+(!st?1.5:0)+Math.random()*.5};}).sort((a,b)=>b.score-a.score).slice(0,20).map(x=>x.q);
      name='弱項加強';minutes=30;
    } else throw Error('測驗模式不正確。');
    if(!qs.length)throw Error('目前沒有此科目的錯題。可以改選科目或先做診斷。');
    if(this.state.active&&!d.replaceActive)throw Error('另一個分頁有未完成試卷，請重新整理再繼續。');
    name=(level==='intermediate'?'中級':'初級')+' · '+name;
    const now=Date.now(),e={id:this.id(),level,name,ids:qs.map(q=>q.id),answers:{},displayName:this.state.profile.displayName,startedMs:now,startedAt:new Date(now).toISOString(),deadline:now+minutes*60000};
    const next=this.copy();next.active=e;this.save(next);return JSON.parse(JSON.stringify(e));
  }
  async import(backup) {
    if(![1,2,3].includes(backup?.version)||!Array.isArray(backup.attempts)||backup.attempts.length>1000)throw Error('請選擇本練習室匯出的 JSON 備份。');
    const sets=backup.questionSets||[];if(!Array.isArray(sets)||sets.length>100)throw Error('備份題庫格式不正確。');
    for(const set of sets)QuestionTools.validateSet(set);
    const additions=sets.filter(set=>!this.sets.some(old=>old.id===set.id));
    const merged=[...this.bank,...additions.flatMap(set=>set.questions)],map=new Map(merged.map(q=>[q.id,q]));
    if(map.size!==merged.length)throw Error('備份題庫有重複題號。');
    const oldBank=this.bank,oldMap=this.byId;let prepared;
    try{this.bank=merged;this.byId=map;
      prepared=backup.attempts.map(r=>({...this.normalizeAttempt(r),imported:true}));
      if(backup.version===3&&backup.format!=='ipas-pages-v1')throw Error('備份版本不相容。');
      if(backup.version===3&&backup.active)this.validateActive(backup.active);
    }finally{this.bank=oldBank;this.byId=oldMap;}
    const fingerprint=r=>JSON.stringify([new Date(r.date).toISOString(),r.name,r.items.map(x=>[x.id,x.picked])]);
    const next=this.copy(),seen=new Set(next.attempts.map(fingerprint));let imported=0;
    for(const r of prepared){const key=fingerprint(r);if(seen.has(key))continue;seen.add(key);next.attempts.push({...r,id:this.id()});imported++;}
    if(next.attempts.length>1000)throw Error('紀錄已達 1000 份，請先保留備份。');
    let resumed=false;if(!next.active&&backup.version===3&&backup.active){next.active=JSON.parse(JSON.stringify(backup.active));resumed=true;}
    await QuestionLibrary.save(additions);this.sets.push(...additions);this.bank=merged;this.byId=map;
    next.attempts.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));this.save(next);return{imported,resumed};
  }
  async addSet(set){
    QuestionTools.validateSet(set);if(this.sets.some(s=>s.id===set.id))return{imported:0};
    if(set.questions.some(q=>this.byId.has(q.id)))throw Error('題號已存在，未覆蓋任何紀錄。');
    if(this.sets.length>=100)throw Error('個人題庫已達 100 份，請保留備份。');
    await QuestionLibrary.save([set]);this.sets.push(set);this.bank.push(...set.questions);for(const q of set.questions)this.byId.set(q.id,q);return{imported:set.questions.length};
  }
  action(path,d) {
    this.sync();const [route,query='']=path.split('?');
    if(route==='bootstrap')return{bank:this.bank,topics:this.topics,stats:this.stats(),active:this.state.active?JSON.parse(JSON.stringify(this.state.active)):null};
    if(route==='attempts')return{attempts:[...this.state.attempts].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).map(r=>this.summary(r))};
    if(route.startsWith('attempts/')){const r=this.state.attempts.find(r=>r.id===decodeURIComponent(route.slice(9)));if(!r)throw Error('找不到這份紀錄。');return{...this.summary(r),items:r.items.map(x=>({...x,ok:QuestionTools.correct(this.byId.get(x.id),x.picked),q:this.byId.get(x.id)}))};}
    if(route==='exams')return this.start(d);
    if(route==='export')return {...this.copy(),questionSets:this.sets};
    if(route==='import')return this.import(d.backup);
    if(route==='bank-import')return this.addSet(d.set);
    if(route==='profile'){const name=String(d.displayName||'').trim();if(!name||name.length>30)throw Error('暱稱請填寫 1～30 字。');const next=this.copy();next.profile.displayName=name;this.save(next);return{ok:true};}
    if(route==='answer'||route==='finish'){
      const e=this.state.active;
      if(!e||e.id!==d.examId){if(this.state.attempts.some(r=>r.id===d.examId))return{resultId:d.examId,finished:true};throw Error('未完成試卷已在其他分頁變更，請重新整理。');}
      if(route==='answer'){
        if(Date.now()>=e.deadline)return{expired:true};
        if(!e.ids.includes(d.questionId)||!QuestionTools.valid(this.byId.get(d.questionId),d.picked))throw Error('答案格式不正確。');
        const next=this.copy();if(Array.isArray(d.picked)&&!d.picked.length)delete next.active.answers[d.questionId];else next.active.answers[d.questionId]=d.picked;this.save(next);return{ok:true};
      }
      if(this.state.attempts.length>=1000)throw Error('已達 1000 份測驗紀錄，請先匯出備份。');
      const end=Math.min(Date.now(),e.deadline),r={id:e.id,name:e.name,date:new Date(end).toISOString(),startedAt:e.startedAt,durationSeconds:Math.max(0,Math.round((end-e.startedMs)/1000)),displayName:e.displayName||this.state.profile.displayName,imported:false,items:e.ids.map(id=>({id,picked:e.answers[id]??null,ok:QuestionTools.correct(this.byId.get(id),e.answers[id])}))};
      const next=this.copy();next.attempts.push(r);next.active=null;this.save(next);return{resultId:r.id,finished:true};
    }
    throw Error('不支援的本機操作。');
  }
}
window.PagesStore=PagesStore;
