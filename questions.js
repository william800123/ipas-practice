'use strict';
// Shared choice semantics; old numeric single-choice records remain valid.
const QuestionTools={
 letters:'ABCDEFGH',
 answers(q){return q.answers|| (Array.isArray(q.answer)?q.answer:[q.answer]);},
 multiple(q){return q.type==='multiple'||this.answers(q).length>1;},
 picks(value){return Array.isArray(value)?value:Number.isInteger(value)?[value]:[];},
 valid(q,value){
  if(this.multiple(q)!==Array.isArray(value))return false;
  const xs=this.picks(value);return xs.length<=q.options.length&&new Set(xs).size===xs.length&&xs.every(x=>Number.isInteger(x)&&x>=0&&x<q.options.length);
 },
 correct(q,value){if(value===null||value===undefined)return false;const a=[...this.answers(q)].sort(),b=[...this.picks(value)].sort();return a.length>0&&JSON.stringify(a)===JSON.stringify(b);},
 paper(q){return q.paper||(q.kind==='官方公告考古題'?(q.source.startsWith('114')?'114':'115'):'diagnostic');},
 validateSet(set){
  if(!set||!/^pdf-[a-f0-9]{24}$/.test(set.id)||typeof set.name!=='string'||!set.name.trim()||set.name.length>180||!['beginner','intermediate'].includes(set.level)||!(set.level==='beginner'?[1,2]:[21,22,23]).includes(set.subject)||!Array.isArray(set.questions)||!set.questions.length||set.questions.length>200)throw Error('匯入題庫格式不正確。');
  const seen=new Set();
  for(const q of set.questions){
   if(q.setId!==set.id||q.paper!==set.id||q.level!==set.level||q.subject!==set.subject||!new RegExp('^'+set.id+'q[0-9]{1,3}$').test(q.id)||seen.has(q.id)||typeof q.q!=='string'||!q.q.trim()||q.q.length>20000||!Array.isArray(q.options)||q.options.length<2||q.options.length>8||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>10000)||!['single','multiple'].includes(q.type)||!Array.isArray(q.answers)||!q.answers.length||q.answers.some(a=>!Number.isInteger(a)||a<0||a>=q.options.length)||new Set(q.answers).size!==q.answers.length||(q.type==='single'&&q.answers.length!==1))throw Error('題目或答案不完整，請先修正預覽中的題目。');
   if(q.image&&(!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(q.image)||q.image.length>1800000))throw Error('題目圖片格式不正確或過大。');
   for(const [key,max]of [['source',200],['topic',100],['explanation',10000]])if(typeof q[key]!=='string'||q[key].length>max)throw Error('題目說明格式不正確。');
   seen.add(q.id);
  }
  if(JSON.stringify(set).length>18000000)throw Error('匯入題庫超過 18 MB，請分成較小份的 PDF。');
  return set;
 }
};
const QuestionLibrary={
 async db(){return new Promise((resolve,reject)=>{const request=indexedDB.open('ipas-pdf-library-v1:'+new URL('./',location.href).pathname,1);request.onupgradeneeded=()=>request.result.createObjectStore('sets',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('此瀏覽器無法開啟題庫儲存空間，請使用一般瀏覽模式。'));});},
 async load(){const db=await this.db();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('sets'),r=tx.objectStore('sets').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('無法讀取個人題庫。'));});}finally{db.close();}},
 async save(sets){for(const s of sets)QuestionTools.validateSet(s);const db=await this.db();try{await new Promise((resolve,reject)=>{const tx=db.transaction('sets','readwrite');for(const s of sets)tx.objectStore('sets').put(s);tx.oncomplete=resolve;tx.onerror=()=>reject(Error('無法保存題庫，可能儲存空間不足；既有題庫會保留。'));tx.onabort=()=>reject(Error('題庫未能保存；既有題庫會保留。'));});}finally{db.close();}},
 async digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
};
