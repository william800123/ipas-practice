'use strict';
// PDFs are decoded locally. Only explicitly confirmed questions are saved.
const PdfQuiz={
 answerTokens(items,marker){
  const keys=items.filter(i=>/^[A-H](?:[、,，\s]*[A-H])*$/.test(i.s)&&i.x<marker.x-3&&Math.abs(i.y-marker.y)<25).sort((a,b)=>a.y-b.y||a.x-b.x);
  return [...new Set(keys.flatMap(i=>i.s.replace(/[^A-H]/g,'').split('').map(c=>c.charCodeAt(0)-65)))].sort((a,b)=>a-b);
 },
 async library(){if(!this.module){this.module=await import(new URL('vendor/pdf.js',document.baseURI).href);this.module.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.js',document.baseURI).href;}return this.module;},
 textRows(items){
  const rows=[];
  for(const item of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){
   let row=rows.find(r=>Math.abs(r.y-item.y)<2.5);
   if(!row){row={y:item.y,items:[]};rows.push(row);}row.items.push(item);
  }
  for(const row of rows){
   row.items.sort((a,b)=>a.x-b.x);row.text='';let previous=null;
   for(const item of row.items){const gap=previous&&item.x>previous.x+previous.width+.7&&/[A-Za-z0-9]$/.test(row.text)&&/^[A-Za-z0-9]/.test(item.s);row.text+=(gap?' ':'')+item.s;previous=item;}
   row.text=row.text.replace(/\s+/g,' ').trim();
  }
  return rows;
 },
 async parse(bytes,progress=()=>{}){
  const lib=await this.library();
  const base=new URL('vendor/',document.baseURI).href;
  const task=lib.getDocument({data:new Uint8Array(bytes),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',isEvalSupported:false,maxImageSize:16000000});let doc;
  try{
   doc=await task.promise;
   if(doc.numPages>80)throw Error('一次最多處理 80 頁，請先將 PDF 分成較小份。');
   const pages=[],candidates=[];
   for(let n=1;n<=doc.numPages;n++){
    progress(`讀取 PDF 第 ${n}/${doc.numPages} 頁…`);
    const page=await doc.getPage(n),view=page.getViewport({scale:1}),text=await page.getTextContent(),ops=await page.getOperatorList();
    if(view.width>3000||view.height>4000)throw Error('PDF 頁面尺寸過大，請先另存為一般紙張尺寸。');
    const items=text.items.filter(i=>i.str?.trim()).map(i=>{const t=lib.Util.transform(view.transform,i.transform);return{s:i.str.normalize('NFKC').trim(),x:t[4],y:t[5],h:Math.max(i.height,8),width:i.width};});
    const rules=[];
    for(let j=0;j<ops.fnArray.length;j++)if(ops.fnArray[j]===lib.OPS.constructPath){
     const box=ops.argsArray[j]?.[2];if(!box)continue;
     const transform=(x,y)=>[view.transform[0]*x+view.transform[2]*y+view.transform[4],view.transform[1]*x+view.transform[3]*y+view.transform[5]];
     const a=transform(box[0],box[1]),b=transform(box[2],box[3]);
     const y=Math.min(a[1],b[1]);if(Math.abs(a[0]-b[0])>view.width*.5&&Math.abs(a[1]-b[1])<2&&y>65&&y<view.height-25)rules.push(y);
    }
    const boundaries=[...new Set(rules.map(y=>Math.round(y*10)/10))].sort((a,b)=>a-b);
    const body=boundaries.length>=2?[boundaries[1]+1,boundaries.at(-1)]:[40,view.height-30];
    const p={page,n,width:view.width,height:view.height,items,rows:this.textRows(items),rules:boundaries,body};pages.push(p);
    for(const item of items){const m=item.s.match(/^(\d{1,3})\s*[.．、](?:\s|$)/);if(m&&item.x<view.width*.4&&item.y>body[0]&&item.y<body[1])candidates.push({...item,number:+m[1],pi:n-1});}
   }
   if(!candidates.length)throw Error('找不到可辨識的題號。掃描影像 PDF 需先做 OCR；本工具不會猜測題目或答案。');
   const left=Math.min(...candidates.map(m=>m.x));
   const markers=[];let expected=1;
   for(const m of candidates){if(m.x<=left+22&&m.number===expected){markers.push(m);expected++;}}
   if(!markers.length)throw Error('題號須從 1 開始。請使用完整試卷，或先將題號整理為連續序號。');
   if(candidates.some(m=>m.x<=left+22&&m.number>=expected&&m.number<=200))throw Error('題號不連續或版面未完整辨識。請先核對原卷並拆分，避免漏題後誤合併。');
   if(markers.length>200)throw Error('一次最多匯入 200 題。');
   for(const m of markers){
    const p=pages[m.pi],above=p.rules.filter(y=>y<m.y-6);m.top=above.length?above.at(-1)+1:Math.max(p.body[0],m.y-m.h-4);
    m.answers=this.answerTokens(p.items,m);
   }
   const contexts=[];
   for(let pi=0;pi<pages.length;pi++){
    const all=pages[pi].rows.map(r=>r.text).join('\n');
    for(const range of all.matchAll(/(?:回答|作答)[^。！？]{0,50}?第?\s*(\d{1,3})\s*[~～\-至]\s*(\d{1,3})\s*題/g)){
    let offset=0;const row=pages[pi].rows.find(r=>{const found=range.index<offset+r.text.length+1;offset+=r.text.length+1;return found;});
    const first=+range[1],last=+range[2],target=markers.find(m=>m.number===first);
    if(!target||last<first||last-first>20||contexts.some(c=>c.first===first))continue;
    const above=pages[pi].rules.filter(y=>y<row.y-6);
    contexts.push({first,last,pi,top:above.length?above.at(-1)+1:Math.max(pages[pi].body[0],row.y-18),target});
    }
   }
   const cache=new Map();
   const render=async pi=>{
    if(cache.has(pi))return cache.get(pi);
    const p=pages[pi],scale=Math.min(1.6,1200/p.width),view=p.page.getViewport({scale}),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
    await p.page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
    if(cache.size>=2){const old=cache.keys().next().value;cache.get(old).canvas.width=0;cache.delete(old);}
    const value={canvas,scale};cache.set(pi,value);return value;
   };
   const questions=[];
   for(let ix=0;ix<markers.length;ix++){
    const m=markers[ix],p=pages[m.pi],next=markers[ix+1]||{pi:pages.length-1,top:pages.at(-1).body[1]};
    const cut=contexts.find(c=>c.first===m.number+1),end=cut||next;
    const ranges=[];
    for(const c of contexts.filter(c=>m.number>=c.first&&m.number<=c.last))ranges.push([c.pi,c.top,c.target.pi,c.target.top-1]);
    ranges.push([m.pi,m.top,end.pi,end.top-1]);
    const chunks=[],texts=[];
    for(const [first,top,last,bottom]of ranges)for(let pi=first;pi<=last;pi++){
     const pg=pages[pi],a=pi===first?top:pg.body[0],b=pi===last?bottom:pg.body[1];if(b<=a+2)continue;
     const x=Math.max(0,m.x-3),right=pg.width-25;
     const rendered=await render(pi),scale=rendered.scale,c=document.createElement('canvas');
     c.width=Math.ceil((right-x)*scale);c.height=Math.ceil((b-a)*scale);
     c.getContext('2d').drawImage(rendered.canvas,x*scale,a*scale,c.width,c.height,0,0,c.width,c.height);chunks.push(c);
     texts.push(this.textRows(pg.items.filter(i=>i.x>=x&&i.y>a&&i.y<=b+1)).map(r=>r.text).join('\n'));
    }
    const combined=document.createElement('canvas');combined.width=Math.max(...chunks.map(c=>c.width));combined.height=chunks.reduce((sum,c)=>sum+c.height+10,0);
    if(combined.height>18000)throw Error(`第 ${m.number} 題跨頁內容過長，題號或版面可能未正確辨識，請拆分 PDF。`);
    const ctx=combined.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,combined.width,combined.height);let y=0;
    for(const c of chunks){ctx.drawImage(c,0,y);y+=c.height+10;c.width=0;}
    const image=combined.toDataURL('image/jpeg',.8);combined.width=0;
    const raw=texts.join('\n').replace(new RegExp('^'+m.number+'[.．]\\s*'),'');
    const labels=[...raw.matchAll(/(?<![A-Za-z0-9_.])\(([A-H])\)/g)].map(m=>m[1]).join('');
    const parts=raw.split(/(?<![A-Za-z0-9_.])\([A-H]\)/),ordered=labels.length>=2&&QuestionTools.letters.startsWith(labels);
    const options=ordered?parts.slice(1).map(x=>x.replace(/\s+/g,' ').trim()):['A','B','C','D'].map(x=>'請參照原題選項 '+x);
    const inline=raw.match(/(?:正確答案|參考答案|答案)\s*[:：]\s*([A-H](?:[、,， ]*[A-H])*)/);
    const answers=m.answers.length?m.answers:inline?[...new Set(inline[1].replace(/[^A-H]/g,'').split('').map(c=>c.charCodeAt(0)-65))]:[];
    const multiple=answers.length?answers.length>1:/複選題|多選題|可複選|選出[兩二三四2-4]個/.test(raw);
    questions.push({number:m.number,q:parts[0].trim()||`第 ${m.number} 題（請參照原題圖文）`,options,answers,type:multiple?'multiple':'single',image,page:m.pi+1,contextCount:ranges.length-1,explanation:'依匯入 PDF 的答案與人工核對結果評分；非系統生成答案。',warning:answers.length?'':'尚未辨識正確答案，請依原卷補填。'});
    progress(`已轉換 ${ix+1}/${markers.length} 題，請稍後核對題型及答案…`);
   }
   for(const {canvas}of cache.values())canvas.width=0;
   return questions;
  }finally{await task.destroy();}
 }
};
let pdfDraft=null,pdfBusy=false;
function showPdfImport(){
 if(pdfBusy){notify('PDF 仍在轉換，請稍候。');return;}
 pdfDraft=null;
 $('content').innerHTML=`<section class="box"><span class="eyebrow">YOUR QUESTION LIBRARY</span><h2>匯入 PDF 題庫</h2><p>先確認級別、科目，選擇含文字的試題 PDF。轉換後逐題核對題幹、圖文、題型及正確答案，再加入自己的題庫。</p><p class="meta">PDF 在此瀏覽器內解析，不傳到外部轉檔服務。外部版僅保存在此瀏覽器；公司版保存到目前登入帳號。掃描影像需先 OCR；未提供的答案不會自動猜測。單選選一項，真正複選可勾多項，全部選對且不多選才得分。</p><form id="pdf-form"><div class="filters"><label>級別<select id="pdf-level">${Object.entries(LEVELS).map(([id,l])=>`<option value="${id}">${l.name}</option>`).join('')}</select></label><label>科目<select id="pdf-subject"></select></label><label>試卷名稱<input id="pdf-name" required maxlength="150" placeholder="例如：115 年第四次科目一"></label></div><label>PDF 檔案（最多 20 MB／80 頁）<input id="pdf-file" type="file" accept="application/pdf,.pdf" required></label><button class="primary" id="pdf-convert" type="submit">轉換並預覽題目</button></form><p id="pdf-status" role="status" aria-live="polite"></p></section><section id="pdf-preview"></section>`;
 $('pdf-level').value=selectedLevel();
 const subjects=()=>{$('pdf-subject').innerHTML=Object.entries(LEVELS[$('pdf-level').value].subjects).map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('');};
 subjects();if(+$('subject').value)$('pdf-subject').value=$('subject').value;
 $('pdf-level').onchange=subjects;
 $('pdf-file').onchange=()=>{if(!$('pdf-name').value&&$('pdf-file').files[0])$('pdf-name').value=$('pdf-file').files[0].name.replace(/\.pdf$/i,'').slice(0,150);};
 $('pdf-form').onsubmit=run(async event=>{
  event.preventDefault();if(pdfBusy)return;const file=$('pdf-file').files[0];if(!file)return;
  if(location.protocol==='file:')throw Error('PDF 轉檔請由網站網址開啟，瀏覽器不允許直接從本機檔案啟動 PDF 工作程序。');
  if(file.size>20*1024*1024)throw Error('PDF 超過 20 MB，請先拆分檔案。');
  const level=$('pdf-level').value,subject=+$('pdf-subject').value,name=$('pdf-name').value.trim();
  if(!name)throw Error('請填寫試卷名稱。');
  pdfBusy=true;$('pdf-convert').disabled=true;$('pdf-preview').replaceChildren();
  try{
   const data=await file.arrayBuffer(),hash=await QuestionLibrary.digest(data);
   const questions=await PdfQuiz.parse(data,message=>{if($('pdf-status'))$('pdf-status').textContent=message;});
   if(!$('pdf-preview'))throw Error('轉換已停止，請重新進入匯入頁面。');
   pdfDraft={level,subject,name,source:file.name.slice(0,200),hash,questions};renderPdfPreview();
  }catch(error){if($('pdf-status'))$('pdf-status').textContent=error.message;throw error;}
  finally{pdfBusy=false;if($('pdf-convert'))$('pdf-convert').disabled=false;}
 });
}
function readPdfEdits(){
 for(const [i,q]of pdfDraft.questions.entries()){
  q.q=$('pq-'+i).value.trim();q.options=$('po-'+i).value.split('\n').map(x=>x.trim()).filter(Boolean);q.type=$('pt-'+i).value;
  const value=$('pa-'+i).value.toUpperCase().normalize('NFKC');
  q.answers=/^[A-H、,，\s]*$/.test(value)?[...new Set(value.replace(/[^A-H]/g,'').split('').map(c=>c.charCodeAt(0)-65))].sort((a,b)=>a-b):[-1];
  q.useImage=$('pi-'+i).checked;
 }
}
function pdfProblems(){return pdfDraft.questions.filter(q=>!q.q||q.options.length<2||q.options.length>8||!q.answers.length||q.answers.some(a=>a<0||a>=q.options.length)||(q.type==='single'&&q.answers.length!==1));}
function pdfPreviewStatus(){
 readPdfEdits();const invalid=pdfProblems(),multi=pdfDraft.questions.filter(q=>q.type==='multiple').length;
 document.querySelectorAll('.pdf-review').forEach((details,i)=>{const q=pdfDraft.questions[i];details.querySelector('summary').textContent=`第 ${q.number} 題 · ${q.type==='multiple'?'複選':'單選'} · 答案 ${q.answers.map(a=>QuestionTools.letters[a]||'?').join(',')||'待補'}`;});
 $('pdf-review-status').textContent=`共 ${pdfDraft.questions.length} 題：單選 ${pdfDraft.questions.length-multi}、複選 ${multi}。${invalid.length?'仍有 '+invalid.length+' 題需修正題目、選項或答案。':'格式檢查通過，請核對原文後確認匯入。'}`;
 $('pdf-save').disabled=invalid.length>0||!$('pdf-confirm').checked;
}
function renderPdfPreview(){
 $('pdf-status').textContent='轉檔完成，尚未加入題庫。請核對以下內容；圖片若裁切不正確，可取消使用圖片並修正文字。';
 $('pdf-preview').innerHTML=`<section class="box"><h3>${esc(pdfDraft.name)} · ${esc(LEVELS[pdfDraft.level].name)} · ${esc(subjectName(pdfDraft.subject))}</h3><p id="pdf-review-status" role="status"></p><p>答案請填選項字母，例如 A；複選填 A,C。若選項本身已是敘述組合且官方只給一個字母，請維持單選。</p></section>${pdfDraft.questions.map((q,i)=>`<details class="box pdf-review" ${!q.answers.length?'open':''}><summary>第 ${q.number} 題 · ${q.type==='multiple'?'複選':'單選'} · 答案 ${q.answers.map(a=>QuestionTools.letters[a]).join(',')||'待補'}</summary><img loading="lazy" class="pdf-preview-image" src="${q.image}" alt="第 ${q.number} 題辨識圖片"><label><input type="checkbox" id="pi-${i}" checked>測驗時使用這張原題圖片（含題組共用資料）</label><label>題幹<textarea id="pq-${i}" rows="3">${esc(q.q)}</textarea></label><label>選項（每行一項，依 A、B、C… 順序）<textarea id="po-${i}" rows="4">${esc(q.options.join('\n'))}</textarea></label><div class="filters"><label>題型<select id="pt-${i}"><option value="single" ${q.type==='single'?'selected':''}>單選</option><option value="multiple" ${q.type==='multiple'?'selected':''}>複選</option></select></label><label>正確答案<input id="pa-${i}" value="${q.answers.map(a=>QuestionTools.letters[a]).join(',')}" maxlength="30" placeholder="例如 A 或 A,C"></label></div></details>`).join('')}<section class="box"><label><input id="pdf-confirm" type="checkbox">我已核對原文、圖片、題型及答案，確認後加入個人題庫。</label><button class="primary" id="pdf-save" disabled>確認匯入題庫</button><p class="meta">匯入不覆蓋既有題庫或成績；同內容重複匯入會略過。</p></section>`;
 $('pdf-preview').oninput=pdfPreviewStatus;$('pdf-preview').onchange=pdfPreviewStatus;pdfPreviewStatus();
 $('pdf-save').onclick=run(async()=>{
  pdfPreviewStatus();if($('pdf-save').disabled)return;
  $('pdf-save').disabled=true;
  const draft=pdfDraft,stable=JSON.stringify({hash:draft.hash,level:draft.level,subject:draft.subject,questions:draft.questions.map(q=>({number:q.number,q:q.q,options:q.options,type:q.type,answers:q.answers,useImage:q.useImage}))});
  const id='pdf-'+(await QuestionLibrary.digest(stable)).slice(0,24);
  const set={id,name:draft.name,level:draft.level,subject:draft.subject,questions:draft.questions.map(q=>({id:id+'q'+q.number,setId:id,paper:id,paperName:draft.name,level:draft.level,subject:draft.subject,q:q.q,options:q.options,type:q.type,answers:q.answers,answer:q.type==='single'?q.answers[0]:q.answers,image:q.useImage?q.image:'',topic:'匯入題庫｜'+draft.name.slice(0,80),explanation:q.explanation,kind:'PDF匯入題庫',source:draft.source,page:q.page,number:q.number}))};
  try{
   QuestionTools.validateSet(set);const result=await api('bank-import',{set});await refresh();
   $('level').value=set.level;updateLevel();$('subject').value=String(set.subject);updatePaperOptions(set.id);
   $('content').innerHTML=`<section class="box"><h2>${result.imported?'題庫匯入完成':'已存在相同題庫，略過重複匯入'}</h2><p>${esc(set.name)} · ${set.questions.length} 題。可從上方試卷版本選擇此題庫；圖文、單選及複選依核對結果作答。</p><button id="pdf-practice" class="primary">開始這份題庫</button></section>`;
   $('pdf-practice').onclick=run(()=>begin('formal'));pdfDraft=null;notify('原有題庫與成績已保留。');
  }catch(error){if($('pdf-save'))$('pdf-save').disabled=false;throw error;}
 });
}
