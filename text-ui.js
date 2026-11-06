'use strict';
const TextTools={
 clean(value){return String(value??'').replace(/[\u00a0\u200b]/g,' ').replace(/(?<=[\p{Script=Han}])[ \t]+(?=[\p{Script=Han}A-Za-z0-9])/gu,'').replace(/(?<=[A-Za-z0-9])[ \t]+(?=[\p{Script=Han}])/gu,'').replace(/[ \t]+([，。、；：？！）】])/g,'$1').replace(/([（【])[ \t]+/g,'$1');},
 block(block){
  if(block.type==='table')return `<section class="question-data"><p class="meta">${esc(block.label||'原題資料表')}</p><div class="table-wrap"><table><thead><tr>${block.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  if(block.type==='code')return `<section class="question-data">${block.label?`<p class="meta">${esc(block.label)}</p>`:''}<pre class="question-code"><code>${esc(block.text)}</code></pre></section>`;
  return `<section class="question-data">${block.label?`<p class="meta">${esc(block.label)}</p>`:''}<p class="question-copy ${block.type==='description'?'figure-description':''}">${esc(this.clean(block.text))}</p></section>`;
 },
 question(q){
  const blocks=Array.isArray(q.blocks)&&q.blocks.length?q.blocks:[{type:'text',text:q.q}];
  const text=`<div class="question-text">${blocks.map(b=>this.block(b)).join('')}</div>`;
  // Legacy personal imports keep their reference figure; the text is always primary.
  return text+(q.image?`<details class="import-reference"><summary>查看個人匯入的原圖參考</summary>${questionImage(q)}</details>`:'');
 },
 option(q,index){return q.optionCode?.[index]?`<code class="option-code">${esc(q.options[index])}</code>`:esc(this.clean(q.options[index]));},
 answerText(q,ids){return ids.map(index=>{
  const text=q.options[index]||'';
  const short=text.length>360?text.slice(0,360)+'…（完整內容見下方選項）':text;
  return `${QuestionTools.letters[index]}. ${this.clean(short)}`;
 }).join('\n');},
 feedback(item){
  const picked=QuestionTools.picks(item.picked),correct=QuestionTools.answers(item.q),q=item.q;
  const negative=/何者(?:最)?不|哪一[^\n。？]{0,8}不(?:正確|適當|合理)|(?:敘述|陳述)(?:是|為)?錯誤|何者(?:是|為)錯誤|下列[^\n。？]{0,8}不(?:正確|適當|合理)/.test(q.stem||q.q);
  return `<div class="answer-feedback ${item.ok?'feedback-good':'feedback-bad'}"><strong>${item.ok?'你的答案正確。':picked.length?'你的答案不正確。':'這題未作答。'}</strong>${picked.length?`<p><b>你選的是：</b></p><p class="feedback-choice">${esc(this.answerText(q,picked))}</p>`:''}<p><b>${negative?'本題應選的答案':'正確答案'}：</b></p><p class="feedback-choice">${esc(this.answerText(q,correct))}</p>${negative?'<p class="meta">留意問法：本題要找出不正確／不適當的敘述；「應選答案」不代表該敘述本身是正確知識。</p>':''}${QuestionTools.multiple(q)&&!item.ok?'<p class="meta">複選需完整選對，少選或多選皆不得分。</p>':''}</div>`;
 }
};
