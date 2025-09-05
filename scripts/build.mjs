import fs from 'node:fs/promises';
import Parser from 'rss-parser';
import { htmlToText } from 'html-to-text';
import fetch from 'node-fetch';
import OpenAI from 'openai';

const SITE_TITLE = '📈 오늘의 주가·경제 TOP 10';
const TIMEZONE = 'Asia/Seoul';
const MAX_CANDIDATES = 40;
const TOP_N = 10;
const MAX_CHARS = 1400;
const KEYWORDS = ['KOSPI','KOSDAQ','USD/KRW','연준','금리','환율','FOMC','삼성전자','SK하이닉스','반도체','원자재','유가','중국','소비','미국채','CPI','PPI','GDP','실업','수출','무역','전망','공시'];

function kstNow() {
  const now = new Date();
  const kst = now.toLocaleString('sv-SE', { timeZone: TIMEZONE }).replace(' ', 'T');
  return new Date(kst);
}
function pad(n){return String(n).padStart(2,'0')}
function fmtDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function fmtDateLong(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function short20(s){const t=(s||'').replace(/\s+/g,' ').trim(); return t.length<=20? t : t.slice(0,20)}
function scoreItem(item){
  const text = `${item.title} ${item.body}`.toLowerCase();
  let kscore = 0; for(const k of KEYWORDS) if(text.includes(k.toLowerCase())) kscore+=1;
  return (item.weight||1) + kscore + Math.min(2,(item.body?.length||0)/1000);
}
async function fetchArticle(url){
  try{
    const res = await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}, timeout:10000});
    if(!res.ok) return '';
    const html = await res.text();
    return htmlToText(html,{wordwrap:false, selectors:[{selector:'a',options:{ignoreHref:true}}]});
  }catch{return ''}
}
function escapeHtml(s) {
  let t = String(s ?? '');
  t = t.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#39;');
  return t;
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

async function summarize(openai, body){
  const sys='당신은 한국어 경제기사를 2~3문장(200자 내)으로 핵심만 요약하는 전문가입니다. 수치/기관명을 보존하세요.';
  const prompt=`아래 기사 본문을 한국어로 2~3문장, 200자 내로 요약:\n\n${(body||'').slice(0,MAX_CHARS)}`;
  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2, max_tokens: 220,
    messages:[{role:'system',content:sys},{role:'user',content:prompt}]
  });
  return (resp.choices?.[0]?.message?.content||'').trim();
}

async function main(){
  if(!process.env.OPENAI_API_KEY){console.error('ERROR: OPENAI_API_KEY is missing'); process.exit(1)}
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sources = JSON.parse(await fs.readFile('sources.json','utf-8'));
  const parser = new Parser();

  let entries=[];
  for(const src of sources){
    try{
      const feed = await parser.parseURL(src.url);
      for(const e of feed.items){
        const title=(e.title||'').trim(), link=(e.link||'').trim();
        const summary = htmlToText((e.content||e.contentSnippet||e.summary||''),{wordwrap:false});
        if(!title || !link) continue;
        entries.push({source:src.name,url:link,title,summary,weight:src.weight||1});
      }
    }catch{}
  }
  entries = entries.sort(()=>Math.random()-0.5).slice(0,MAX_CANDIDATES);

  // hydrate
  const items = [];
  for(const it of entries){
    const body = (await fetchArticle(it.url)) || it.summary || '';
    items.push({...it, body});
  }

  // dedup simple
  const seen = new Set(), dedup=[];
  for(const it of items){
    const host = (()=>{try{return new URL(it.url).hostname}catch{return ''}})();
    const key = `${it.title}|${host}`;
    if(seen.has(key)) continue; seen.add(key); dedup.push(it);
  }

  // score & pick
  dedup.sort((a,b)=>scoreItem(b)-scoreItem(a));
  const picked = dedup.slice(0,TOP_N);

  // summarize
  for(const p of picked){
    try{ p.summary2 = await summarize(openai, p.body) }catch{ p.summary2 = (p.body||'').slice(0,200) }
    p.short20 = short20(p.summary2);
  }

  // render
  const tpl = await fs.readFile('public/template.html','utf-8');
  const items_html = picked.map(p=>`<li><span class="title">${escapeHtml(p.title)}</span><br>
  <span class="src">${escapeHtml(p.source)} · ${escapeHtml(new URL(p.url).hostname)}</span><br>
  ${escapeHtml(p.summary2)}<br>
  <a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">원문보기</a></li>`).join('\n');

  const shorts_html = picked.map(p=>`<li>${escapeHtml(p.short20)} — <a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">원문</a></li>`).join('\n');

  const now = kstNow();
  const out = tpl.replaceAll('{site_title}', SITE_TITLE)
    .replaceAll('{date_ymd}', fmtDate(now))
    .replaceAll('{date_long}', fmtDateLong(now))
    .replace('{items_html}', items_html)
    .replace('{short_items_html}', shorts_html);

  await fs.writeFile('index.html', out, 'utf-8');
  console.log('[OK] wrote: index.html');
}

main().catch(e=>{console.error(e); process.exit(1)});
