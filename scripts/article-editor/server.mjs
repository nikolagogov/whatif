import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { parse, stringify } from 'yaml';

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const PORT = Number(process.env.HIG_EDITOR_PORT || 4322);
const SECTORS = new Set(['history', 'science', 'space', 'society']);
const ARTICLE_ROOT = path.join(ROOT, 'src', 'content');
const ENTITY_ROOT = path.join(ROOT, 'src', 'content-entities');
const ARCHIVE_ROOT = path.join(ROOT, 'src', 'content-archive');
const BACKUP_ROOT = path.join(ROOT, '.hig-admin-backups');
const DRAFT_ROOT = path.join(ROOT, '.hig-admin-drafts');

function error(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function parseDraft(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) error('Постави съдържанието на статията.');
  const match = markdown.replace(/^\uFEFF/, '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) error('Статията трябва да започва с YAML frontmatter между --- редове.');
  let metadata;
  try { metadata = parse(match[1]); } catch (e) { error(`Невалиден YAML frontmatter: ${e.message}`); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) error('Frontmatter трябва да съдържа YAML обект.');
  for (const key of ['title', 'description', 'image']) {
    if (typeof metadata[key] !== 'string' || !metadata[key].trim()) error(`Липсва задължително поле: ${key}.`);
  }
  if ('id' in metadata || 'contentEntities' in metadata) error('Не въвеждай id или contentEntities — редакторът ги генерира.');
  const body = match[2].trim();
  return { metadata, body };
}
function splitBody(body) {
  const lines = body.split(/\r?\n/);
  const intro = [];
  const sections = [];
  let active = null;
  let fence = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      (active ? active.lines : intro).push(line);
      continue;
    }
    const heading = !fence && line.match(/^##[ \t]+(.+?)\s*#*\s*$/);
    if (heading) {
      if (active) sections.push(active);
      active = { title: heading[1].trim(), kind: 'section', lines: [line] };
    } else {
      (active ? active.lines : intro).push(line);
    }
  }
  if (active) sections.push(active);
  const result = [];
  if (intro.join('\n').trim()) result.push({ title: 'Introduction', kind: 'intro', body: intro.join('\n').trim() });
  for (const section of sections) {
    result.push({ title: section.title, kind: 'section', body: section.lines.join('\n').trim() });
  }
  return result;
}
function readFrontmatter(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    return match ? parse(match[1]) : {};
  } catch { return {}; }
}
function getUsedIds() {
  const articleIds = new Set();
  const entityIds = new Set();
  for (const sector of SECTORS) {
    const dir = path.join(ARTICLE_ROOT, sector);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const data = readFrontmatter(path.join(dir, name));
      if (typeof data.id === 'string' && /^\d{9}$/.test(data.id)) articleIds.add(data.id);
    }
  }
  if (fs.existsSync(ENTITY_ROOT)) {
    for (const folder of fs.readdirSync(ENTITY_ROOT, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const dir = path.join(ENTITY_ROOT, folder.name);
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.md')) continue;
        const data = readFrontmatter(path.join(dir, name));
        if (typeof data.id === 'string' && /^\d{10,}$/.test(data.id)) entityIds.add(data.id);
      }
    }
  }
  return { articleIds, entityIds };
}
function allocateIds(count) {
  const { articleIds, entityIds } = getUsedIds();
  let max = 0;
  for (const id of articleIds) max = Math.max(max, Number(id));
  const articleId = String(max + 1).padStart(9, '0');
  if (articleId.length !== 9 || articleIds.has(articleId)) error('Не може да бъде генериран уникален Article ID.', 409);
  let suffix = 0;
  for (const id of entityIds) {
    if (id.startsWith(articleId)) {
      const tail = id.slice(articleId.length);
      if (/^\d+$/.test(tail)) suffix = Math.max(suffix, Number(tail));
    }
  }
  const ids = [];
  while (ids.length < count) {
    const id = `${articleId}${++suffix}`;
    if (!entityIds.has(id)) ids.push(id);
  }
  return { articleId, entityIds: ids };
}
function validateSectorSlug(sector, slug) {
  if (!SECTORS.has(sector)) error('Избери валиден сектор.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) error('Slug трябва да съдържа малки латински букви, цифри и тирета.');
}
function makePreview(payload) {
  const { metadata, body } = parseDraft(payload.markdown);
  if (!metadata.world || typeof metadata.world.name !== 'string' || !metadata.world.name.trim()) error('За публикуване е задължителен World с поле name.');
  if (!metadata.divergence || !metadata.divergence.type || !metadata.divergence.title || !metadata.divergence.referenceOutcome || !metadata.divergence.alternateOutcome) error('За публикуване са задължителни Divergence: type, title, referenceOutcome и alternateOutcome.');
  const parts = splitBody(body);
  if (!parts.length) error('Не открих увод или H2 раздели.');
  const sector = payload.sector || 'history';
  const slug = payload.slug?.trim() || slugify(metadata.title);
  validateSectorSlug(sector, slug);
  const { articleId, entityIds } = allocateIds(parts.length);
  return { metadata, sector, slug, articleId, parts: parts.map((part, i) => ({ ...part, id: entityIds[i] })) };
}
function yamlFile(data, body = '') {
  return `---\n${stringify(data, { singleQuote: true, lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}
function writeImport(payload) {
  const preview = makePreview(payload);
  const parts = Array.isArray(payload.parts) ? payload.parts : preview.parts;
  if (!parts.length || parts.length > 300) error('Невалиден брой Content Entities.');
  for (const part of parts) {
    if (!['intro', 'section'].includes(part.kind) || typeof part.title !== 'string' || !part.title.trim() || typeof part.body !== 'string' || !part.body.trim()) {
      error('Всяка част трябва да има заглавие, валиден тип и съдържание.');
    }
  }
  // Reallocate at commit time, so a stale preview cannot cause collisions.
  const { articleId, entityIds } = allocateIds(parts.length);
  const articlePath = path.join(ARTICLE_ROOT, preview.sector, `${preview.slug}.md`);
  const entityDir = path.join(ENTITY_ROOT, articleId);
  if (fs.existsSync(articlePath) || fs.existsSync(entityDir)) error('Файлът или Article ID вече съществува. Обнови прегледа и опитай отново.', 409);

  const articleData = { ...preview.metadata, id: articleId, contentEntities: entityIds };
  const articleContent = yamlFile(articleData);
  const entityContents = parts.map((part, i) => {
    const entityData = { id: entityIds[i], originArticleId: articleId, title: part.title.trim(), kind: part.kind };
    return { file: path.join(entityDir, `${entityIds[i]}.md`), content: yamlFile(entityData, part.body) };
  });

  fs.mkdirSync(path.dirname(articlePath), { recursive: true });
  fs.mkdirSync(entityDir, { recursive: false });
  const written = [];
  try {
    fs.writeFileSync(articlePath, articleContent, { flag: 'wx' }); written.push(articlePath);
    for (const item of entityContents) {
      fs.writeFileSync(item.file, item.content, { flag: 'wx' }); written.push(item.file);
    }
  } catch (e) {
    for (const file of written) { try { fs.unlinkSync(file); } catch {} }
    try { fs.rmdirSync(entityDir); } catch {}
    throw e;
  }
  if (payload.draftId) { try { deleteDraft(payload.draftId); } catch {} }
  return { articleId, entityIds, articlePath: path.relative(ROOT, articlePath), entityCount: parts.length };
}
const HTML = String.raw`<!doctype html>
<html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HAD IT GONE — Admin · Нова статия</title>
<style>
:root{color-scheme:dark;--bg:#101923;--panel:#192633;--panel2:#223240;--line:#344554;--gold:#e0b66e;--text:#f3eee6;--muted:#aebbc5;--red:#ef9b91}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:26px 22px 60px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px}.admin-nav{display:flex;gap:8px;align-items:center;margin:0 0 22px;padding:10px 0;border-bottom:1px solid var(--line)}.admin-nav a{display:inline-block;padding:7px 12px;border:1px solid var(--line);border-radius:7px;color:var(--text);text-decoration:none;background:var(--panel)}.admin-nav a.active{background:var(--gold);border-color:var(--gold);color:#211b13;font-weight:700}
h1{font-size:25px;margin:0;color:var(--gold)}.sub{color:var(--muted);margin-top:4px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0}
label{display:block;color:var(--muted);font-size:13px;margin:0 0 7px}input,select,textarea{width:100%;background:#101923;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:11px;font:inherit}
textarea{min-height:330px;resize:vertical;font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.55}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
button{border:1px solid var(--line);border-radius:8px;padding:10px 16px;background:var(--panel2);color:var(--text);font:inherit;cursor:pointer}button.primary{background:var(--gold);color:#211b13;border-color:var(--gold);font-weight:700}button:disabled{opacity:.45;cursor:not-allowed}
.note{font-size:13px;color:var(--muted)}.status{margin-top:12px;white-space:pre-wrap;color:var(--gold)}.error{color:var(--red)}.parts{display:grid;gap:12px}.part{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:14px}.parthead{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}.part textarea{min-height:130px;margin-top:10px}.part .small{font-size:12px;color:var(--muted);margin-bottom:5px}.part-actions{display:flex;gap:6px}.part-actions button{padding:6px 10px}
.hidden{display:none}.pill{font-size:12px;color:var(--gold)}@media(max-width:700px){main{padding:20px 14px}.grid{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}}
</style></head><body><main>
<header><div><h1>HAD IT GONE · Admin</h1><div class="sub">Управление на съдържанието · Нова статия</div></div><span class="pill">LOCAL ONLY</span></header>
<nav class="admin-nav" aria-label="Admin navigation"><a href="/admin">Статии</a><a href="/admin/drafts">Чернови</a><a class="active" href="/admin/new">+ Нова статия</a></nav>
<section class="panel"><div class="grid"><div><label for="sector">Сектор</label><select id="sector"><option value="history">History</option><option value="science">Science</option><option value="space">Space</option><option value="society">Society</option></select></div><div><label for="slug">Slug (по желание)</label><input id="slug" placeholder="Автоматично от заглавието"></div></div>
<div style="margin-top:16px"><label for="markdown">Цяла статия в Markdown с YAML frontmatter</label><textarea id="markdown" placeholder="---
title: What If...
description: ...
image: /images/...
tags:
  - ...
topics:
  - ...
---

Уводът...

## Първи раздел

Текст...

## Втори раздел

Текст..."></textarea><div class="note">За публикуване са задължителни title, description, image, world.name и divergence (type, title, referenceOutcome, alternateOutcome). ID и contentEntities се генерират автоматично. Черновата може да се запази и преди тези полета да са готови.</div></div>
<div class="actions"><button class="primary" id="preview">Раздели и прегледай</button><button id="saveDraft">Запази черновата</button><button id="clear">Изчисти</button></div><div id="status" class="status" role="status"></div></section>
<section id="previewPanel" class="panel hidden"><h2 style="margin:0 0 5px;font-size:19px">Преглед на композицията</h2><div id="summary" class="note"></div><div id="parts" class="parts" style="margin-top:15px"></div><div class="actions"><button class="primary" id="import">Потвърди и запиши файловете</button><button id="back">Назад към текста</button></div><div class="note" style="margin-top:10px">Позицията в този списък определя реда в статията. Можеш да редактираш заглавията и съдържанието и да пренареждаш частите преди запис.</div></section>
</main>
<script>
const $=id=>document.getElementById(id);let previewData=null;let draftId=new URLSearchParams(location.search).get('id');
function status(msg,isError=false){$('status').textContent=msg;$('status').className='status'+(isError?' error':'')}
async function post(url,data){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Грешка');return j}
function render(){const wrap=$('parts');wrap.replaceChildren();previewData.parts.forEach((p,i)=>{const card=document.createElement('div');card.className='part';const head=document.createElement('div');head.className='parthead';const fields=document.createElement('div');const titleLabel=document.createElement('div');titleLabel.className='small';titleLabel.textContent=String(i+1).padStart(2,'0')+' · '+(p.kind==='intro'?'INTRO':'SECTION')+' · '+p.id;const title=document.createElement('input');title.value=p.title;title.setAttribute('aria-label','Заглавие на частта');title.addEventListener('input',()=>p.title=title.value);fields.append(titleLabel,title);const buttons=document.createElement('div');buttons.className='part-actions';for(const [label,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=i+delta<0||i+delta>=previewData.parts.length;b.addEventListener('click',()=>{const target=i+delta;[previewData.parts[i],previewData.parts[target]]=[previewData.parts[target],previewData.parts[i]];render()});buttons.append(b)}head.append(fields,buttons);const body=document.createElement('textarea');body.value=p.body;body.addEventListener('input',()=>p.body=body.value);card.append(head,body);wrap.append(card)});$('summary').textContent='Article ID: '+previewData.articleId+' · '+previewData.parts.length+' Content Entities · '+previewData.sector+'/'+previewData.slug;$('previewPanel').classList.remove('hidden')}
$('preview').addEventListener('click',async()=>{try{status('Подготвям преглед…');previewData=await post('/api/preview',{markdown:$('markdown').value,sector:$('sector').value,slug:$('slug').value});render();status('Прегледът е готов. Нищо още не е записано.')}catch(e){status(e.message,true)}});
$('saveDraft').addEventListener('click',async()=>{try{const title=(($('markdown').value.match(/^title:\s*['\"]?(.+?)['\"]?\s*$/m)||[])[1]||'').trim();const result=await post('/api/draft/save',{id:draftId,markdown:$('markdown').value,sector:$('sector').value,slug:$('slug').value,title});draftId=result.id;history.replaceState({},'', '/admin/new?id='+encodeURIComponent(draftId));status('Черновата е запазена. Не е публикувана и няма окончателни ID.')}catch(e){status(e.message,true)}});
$('import').addEventListener('click',async()=>{if(!previewData)return; if(!confirm('Да запиша ли статията и всички Content Entities в проекта?'))return;try{status('Записвам файловете…');const result=await post('/api/import',{markdown:$('markdown').value,sector:$('sector').value,slug:$('slug').value,parts:previewData.parts,draftId});status('Успешен импорт.\nArticle ID: '+result.articleId+'\nФайл: '+result.articlePath+'\nContent Entities: '+result.entityCount+'\nEntity IDs:\n'+result.entityIds.join('\n'));$('previewPanel').classList.add('hidden');previewData=null}catch(e){status(e.message,true)}});
if(draftId){fetch('/api/draft?id='+encodeURIComponent(draftId)).then(r=>r.json()).then(d=>{if(d.draft){$('markdown').value=d.draft.markdown;$('sector').value=d.draft.sector||'history';$('slug').value=d.draft.slug||'';status('Заредена чернова. Промените се записват само с бутона „Запази черновата“.')}}).catch(()=>{})}
$('clear').addEventListener('click',()=>{if(confirm('Да изчистя ли текста?')){$('markdown').value='';$('slug').value='';$('previewPanel').classList.add('hidden');status('')}});$('back').addEventListener('click',()=>$('previewPanel').classList.add('hidden'));
</script></body></html>`;


const ADMIN_HTML = String.raw`<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAD IT GONE — Admin</title><style>
:root{color-scheme:dark;--bg:#101923;--panel:#192633;--panel2:#223240;--line:#344554;--gold:#e0b66e;--text:#f3eee6;--muted:#aebbc5;--red:#ef9b91;--green:#9dc8a7}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:1160px;margin:auto;padding:30px 22px 60px}header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:22px}h1{font-size:25px;color:var(--gold);margin:0}h2{font-size:18px;margin:0}.muted,.meta{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin:16px 0}.actions{display:flex;gap:9px;flex-wrap:wrap}button,a.btn{display:inline-block;border:1px solid var(--line);border-radius:8px;padding:9px 14px;background:var(--panel2);color:var(--text);font:inherit;text-decoration:none;cursor:pointer}a.primary,button.primary{background:var(--gold);color:#211b13;border-color:var(--gold);font-weight:700}button.danger{color:var(--red)}input{width:100%;background:#101923;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:11px;font:inherit;margin:12px 0}.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{background:var(--panel2);border-radius:8px;padding:10px 14px}.stat strong{color:var(--gold);font-size:20px;margin-right:6px}.list{display:grid;gap:9px}.article{border:1px solid var(--line);border-radius:9px;padding:13px 15px;display:flex;justify-content:space-between;gap:12px;align-items:center}.article strong{display:block}.article a{color:var(--text);text-decoration:none}.article a:hover{color:var(--gold)}.meta{font-size:12px}.empty{padding:24px;text-align:center;color:var(--muted)}@media(max-width:650px){main{padding:20px 13px}.article{align-items:flex-start;flex-direction:column}}
</style></head><body><main><header><div><h1>HAD IT GONE · Admin</h1><div class="muted">Локално управление на съдържанието</div></div><span class="muted">LOCAL ONLY</span></header><section class="panel"><div class="actions"><a class="btn primary" href="/admin/new">+ Нова статия</a><a class="btn" href="/admin/drafts">Чернови</a><a class="btn" href="/admin/archive">Архив</a><button id="refresh">Обнови</button></div></section><section class="panel"><div class="stats"><div class="stat"><strong id="count">—</strong>статии</div><div class="stat"><strong id="entities">—</strong>Content Entities</div></div><input id="search" placeholder="Търси по заглавие, ID или сектор…"><div id="list" class="list"><div class="empty">Зареждане…</div></div></section><div class="muted" style="font-size:12px">Промените се записват директно в Markdown файловете. Преди всяка операция се създава резервно копие.</div></main><script>
const $=id=>document.getElementById(id);let rows=[];function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function render(){const q=$('search').value.trim().toLowerCase();const shown=rows.filter(a=>[a.title,a.id,a.sector,a.slug].join(' ').toLowerCase().includes(q));$('list').replaceChildren();if(!shown.length){$('list').innerHTML='<div class="empty">Няма намерени статии.</div>';return}for(const a of shown){const el=document.createElement('div');el.className='article';el.innerHTML='<div><a href="/admin/article?sector='+encodeURIComponent(a.sector)+'&slug='+encodeURIComponent(a.slug)+'"><strong>'+esc(a.title)+'</strong></a><div class="meta">'+esc(a.sector)+' · '+esc(a.id)+' · '+esc(a.entityCount)+' Entities · '+esc(a.slug)+'</div></div><div class="meta">'+(a.world?esc(a.world):'Няма World')+' · '+(a.divergence?esc(a.divergence):'Няма Divergence')+'</div>';$('list').append(el)}}async function load(){$('list').innerHTML='<div class="empty">Зареждане…</div>';try{const r=await fetch('/api/articles');if(!r.ok)throw new Error('Неуспешно зареждане');const data=await r.json();rows=data.articles;$('count').textContent=rows.length;$('entities').textContent=data.entityCount;render()}catch(e){$('list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}$('refresh').addEventListener('click',load);$('search').addEventListener('input',render);load();
</script></body></html>`;

const DETAIL_HTML = String.raw`<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAD IT GONE — Редакция</title><style>
:root{color-scheme:dark;--bg:#101923;--panel:#192633;--panel2:#223240;--line:#344554;--gold:#e0b66e;--text:#f3eee6;--muted:#aebbc5;--red:#ef9b91}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:1100px;margin:auto;padding:28px 20px 60px}h1{color:var(--gold);font-size:24px;margin:0}h2{font-size:18px;margin:0 0 12px}.muted{color:var(--muted);font-size:13px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin:16px 0}.bar,.actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;justify-content:space-between}button,a.btn{border:1px solid var(--line);border-radius:8px;padding:9px 13px;background:var(--panel2);color:var(--text);font:inherit;text-decoration:none;cursor:pointer}button.primary{background:var(--gold);color:#211b13;border-color:var(--gold);font-weight:700}button.danger{color:var(--red)}textarea{width:100%;min-height:210px;background:#101923;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:12px;font:13px/1.55 ui-monospace,Consolas,monospace;resize:vertical}.entity{border:1px solid var(--line);border-radius:9px;padding:14px;margin:12px 0;background:var(--panel2)}.entity-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.entity textarea{min-height:160px}.status{white-space:pre-wrap;color:var(--gold);margin-top:12px}.error{color:var(--red)}.move{display:flex;gap:5px;align-items:center}.drag-handle{cursor:grab;user-select:none;touch-action:none;padding:8px 11px!important;color:var(--gold)!important;font-size:18px!important;line-height:1}.drag-handle:active{cursor:grabbing}.entity{transition:border-color .12s,background .12s}.entity.dragging{opacity:.45;border-style:dashed}.entity.drag-over{border-color:var(--gold);box-shadow:inset 0 3px 0 var(--gold)}.reorder-help{margin:8px 0 12px;padding:10px 12px;border-radius:8px;background:#101923;color:var(--muted);font-size:13px}.small{font-size:12px;color:var(--muted)}
</style></head><body><main><div class="bar"><div><h1 id="title">Зареждане…</h1><div id="meta" class="muted"></div></div><div class="actions"><a class="btn" href="/admin">← Статии</a><a class="btn" href="/admin/archive">Архив</a></div></div><section class="panel"><h2>Статия · YAML frontmatter</h2><div class="muted">Редактирай метаданните. Article ID и contentEntities се управляват автоматично и не се променят тук.</div><textarea id="article"></textarea><div class="actions" style="margin-top:10px"><button class="primary" id="saveArticle">Запази метаданните</button><button class="danger" id="archiveArticle">Архивирай цялата статия</button></div></section><section class="panel"><div class="bar"><div><h2>Content Entities</h2><div class="muted">Редът тук е редът на визуализация в статията.</div></div><div class="actions"><button id="addEntity">+ Добави част</button><button id="saveOrder" class="primary">Запази реда</button></div></div><div id="addForm" hidden style="margin-top:12px"><input id="newTitle" placeholder="Заглавие на частта" style="width:100%;padding:10px;background:#101923;color:#f3eee6;border:1px solid #344554;border-radius:8px"><select id="newKind" style="padding:9px;background:#101923;color:#f3eee6;border:1px solid #344554;border-radius:8px"><option value="section">Section</option><option value="intro">Introduction</option></select><textarea id="newBody" placeholder="Съдържание на новата част" style="margin-top:8px"></textarea><button id="createEntity" class="primary">Създай Content Entity</button></div><div class="reorder-help">Най-сигурният начин: избери „Позиция“ до съответната част и натисни „Премести“. Можеш и да използваш стрелките. Накрая натисни „Запази реда“.</div><div id="entities"></div><div id="status" class="status"></div></section></main><script>
const qs=new URLSearchParams(location.search),sector=qs.get('sector'),slug=qs.get('slug'),$=id=>document.getElementById(id);let data=null;function status(t,err=false){$('status').textContent=t;$('status').className='status'+(err?' error':'')}async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'Грешка');return j}function render(){ $('title').textContent=data.article.title;$('meta').textContent=data.article.sector+' · '+data.article.id+' · '+data.entities.length+' Entities · '+data.article.slug; $('article').value=data.article.raw;const wrap=$('entities');wrap.replaceChildren();let dragIndex=-1;if(!data.entities.length){const empty=document.createElement('div');empty.className='muted';empty.textContent='Няма Content Entities в тази статия.';$('entities').append(empty)}data.entities.forEach((e,i)=>{const box=document.createElement('div');box.className='entity';box.dataset.index=String(i);const head=document.createElement('div');head.className='entity-head';const label=document.createElement('div');label.innerHTML='<strong>'+String(i+1).padStart(2,'0')+' · '+e.id+'</strong><div class="small">'+e.title+' · '+e.kind+'</div>';const actions=document.createElement('div');actions.className='move';const handle=document.createElement('button');handle.type='button';handle.className='drag-handle';handle.textContent='⠿';handle.title='Хвани и премести';handle.setAttribute('aria-label','Хвани и премести Content Entity');handle.draggable=true;handle.addEventListener('dragstart',ev=>{dragIndex=i;box.classList.add('dragging');ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',String(i))});handle.addEventListener('dragend',()=>{dragIndex=-1;wrap.querySelectorAll('.entity').forEach(x=>x.classList.remove('dragging','drag-over'))});box.addEventListener('dragover',ev=>{if(dragIndex<0)return;ev.preventDefault();ev.dataTransfer.dropEffect='move';wrap.querySelectorAll('.entity').forEach(x=>x.classList.remove('drag-over'));box.classList.add('drag-over')});box.addEventListener('dragleave',ev=>{if(!box.contains(ev.relatedTarget))box.classList.remove('drag-over')});box.addEventListener('drop',ev=>{ev.preventDefault();const from=dragIndex,to=i;if(from<0||from===to)return;const moved=data.entities.splice(from,1)[0];data.entities.splice(to,0,moved);render();status('Редът е променен. Натисни „Запази реда“, за да запишеш промените.')});actions.append(handle);for(const [txt,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.type='button';b.textContent=txt;b.title=delta<0?'Премести нагоре':'Премести надолу';b.disabled=i+delta<0||i+delta>=data.entities.length;b.onclick=()=>{const target=i+delta;[data.entities[i],data.entities[target]]=[data.entities[target],data.entities[i]];render();status('Редът е променен. Натисни „Запази реда“, за да запишеш промените.')};actions.append(b)}const position=document.createElement('select');position.title='Избери нова позиция';for(let n=0;n<data.entities.length;n++){const option=document.createElement('option');option.value=String(n);option.textContent='Позиция '+(n+1);option.selected=n===i;position.append(option)}const move=document.createElement('button');move.type='button';move.textContent='Премести';move.onclick=()=>{const target=Number(position.value);if(target===i)return;const [item]=data.entities.splice(i,1);data.entities.splice(target,0,item);render();status('Позицията е променена. Натисни „Запази реда“.')};actions.append(position,move);const archive=document.createElement('button');archive.textContent='Архивирай';archive.className='danger';archive.onclick=async()=>{if(!confirm('Да архивирам ли тази Content Entity? Тя ще бъде извадена от статията, но може да бъде възстановена.'))return;try{await api('/api/entity/archive',{sector,slug,id:e.id});await load();status('Entity е архивирана.')}catch(err){status(err.message,true)}};actions.append(archive);head.append(label,actions);const ta=document.createElement('textarea');ta.value=e.raw;ta.dataset.id=e.id;const save=document.createElement('button');save.textContent='Запази Entity';save.className='primary';save.onclick=async()=>{try{await api('/api/entity/save',{sector,slug,id:e.id,raw:ta.value});status('Записана Entity '+e.id);await load()}catch(err){status(err.message,true)}};box.append(head,ta,save);wrap.append(box)})}async function load(){try{data=await api('/api/article?sector='+encodeURIComponent(sector)+'&slug='+encodeURIComponent(slug));render()}catch(e){status(e.message,true)}}$('saveArticle').onclick=async()=>{try{await api('/api/article/save',{sector,slug,raw:$('article').value});status('Метаданните са записани.');await load()}catch(e){status(e.message,true)}};$('saveOrder').onclick=async()=>{try{await api('/api/entity/order',{sector,slug,ids:data.entities.map(e=>e.id)});status('Редът е записан.');await load()}catch(e){status(e.message,true)}};$('archiveArticle').onclick=async()=>{if(!confirm('Да архивирам ли статията заедно с всички нейни Content Entities? Може да бъде възстановена от Архив.'))return;try{await api('/api/article/archive',{sector,slug});location.href='/admin/archive'}catch(e){status(e.message,true)}};$('addEntity').onclick=()=>$('addForm').hidden=!$('addForm').hidden;$('createEntity').onclick=async()=>{try{await api('/api/entity/create',{sector,slug,title:$('newTitle').value,kind:$('newKind').value,body:$('newBody').value});$('newTitle').value='';$('newBody').value='';$('addForm').hidden=true;await load();status('Създадена е нова Content Entity.')}catch(e){status(e.message,true)}};load();
</script></body></html>`;


const DRAFTS_HTML = String.raw`<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAD IT GONE — Чернови</title><style>:root{color-scheme:dark;--bg:#101923;--panel:#192633;--line:#344554;--gold:#e0b66e;--text:#f3eee6;--muted:#aebbc5;--red:#ef9b91}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:1050px;margin:auto;padding:30px 20px}h1{color:var(--gold)}.panel,.item{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}.item{display:flex;justify-content:space-between;align-items:center;gap:12px}.muted{color:var(--muted);font-size:13px}button,a{border:1px solid var(--line);border-radius:8px;padding:9px 13px;background:#223240;color:var(--text);text-decoration:none;cursor:pointer;font:inherit}.primary{background:var(--gold);color:#211b13;font-weight:700}.danger{color:var(--red)}.status{color:var(--gold);white-space:pre-wrap}@media(max-width:650px){.item{align-items:flex-start;flex-direction:column}}</style></head><body><main><h1>HAD IT GONE · Чернови</h1><p><a href="/admin">← Към статиите</a>　<a class="primary" href="/admin/new">+ Нова чернова</a></p><section class="panel"><div class="muted">Черновите се записват само при натискане на „Запази черновата“. Не получават окончателни ID и не се показват в публичния сайт.</div><div id="list">Зареждане…</div><div id="status" class="status"></div></section></main><script>const $=id=>document.getElementById(id);async function call(url,body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Грешка');return j}async function load(){try{const r=await fetch('/api/drafts');const d=await r.json();$('list').replaceChildren();if(!d.drafts.length){$('list').textContent='Няма запазени чернови.';return}for(const x of d.drafts){const el=document.createElement('div');el.className='item';const label=document.createElement('div');const strong=document.createElement('strong');strong.textContent=x.title||'Чернова без заглавие';const meta=document.createElement('div');meta.className='muted';meta.textContent=(x.sector||'history')+' · '+new Date(x.updatedAt).toLocaleString('bg-BG');label.append(strong,meta);const actions=document.createElement('div');actions.style.display='flex';actions.style.gap='8px';const edit=document.createElement('a');edit.href='/admin/new?id='+encodeURIComponent(x.id);edit.textContent='Отвори';const del=document.createElement('button');del.className='danger';del.textContent='Изтрий';del.onclick=async()=>{if(!confirm('Да изтрия ли тази чернова?'))return;try{await call('/api/draft/delete',{id:x.id});load()}catch(e){$('status').textContent=e.message}};actions.append(edit,del);el.append(label,actions);$('list').append(el)}}catch(e){$('list').textContent=e.message}}load();</script></body></html>`;

const ARCHIVED_DETAIL_HTML = String.raw`<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Редакция на архивирана статия</title><style>:root{color-scheme:dark;--bg:#101923;--panel:#192633;--panel2:#223240;--line:#344554;--gold:#e0b66e;--text:#f3eee6;--muted:#aebbc5}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:1100px;margin:auto;padding:28px 20px 60px}h1,h2{color:var(--gold)}.panel,.entity{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin:14px 0}.muted{color:var(--muted);font-size:13px}textarea{width:100%;min-height:190px;background:#101923;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:12px;font:13px/1.55 ui-monospace,Consolas,monospace;resize:vertical}button,a,select{border:1px solid var(--line);border-radius:8px;padding:9px 13px;background:#223240;color:var(--text);text-decoration:none;cursor:pointer;font:inherit}.primary{background:var(--gold);color:#211b13;font-weight:700}.status{color:var(--gold);white-space:pre-wrap;margin-top:12px}.bar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.entity-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.entity-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.entity-body{margin:12px 0;padding:12px;background:#101923;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}.entity textarea{min-height:180px}.hint{font-size:12px;color:var(--muted);margin:8px 0}</style></head><body><main><div class="bar"><div><h1 id="title">Архивирана статия</h1><div id="meta" class="muted"></div></div><a href="/admin/archive">← Към архива</a></div><section class="panel"><h2>Метаданни на статията</h2><div class="muted">Article ID и списъкът с Entity ID са защитени. Текстът на статията се съдържа в Content Entities по-долу.</div><textarea id="article"></textarea><button id="saveArticle" class="primary">Запази метаданните</button></section><section class="panel"><div class="bar"><div><h2>Съдържание на статията</h2><div class="muted">Всички Content Entities, включително реалният Markdown текст.</div></div><button id="saveOrder" class="primary">Запази реда</button></div><div class="hint">Избери нова позиция от менюто до частта и натисни „Премести“. След това запази целия ред.</div><div id="entities"></div></section><div id="status" class="status"></div></main><script>const key=new URLSearchParams(location.search).get('key'),$=id=>document.getElementById(id);let data;async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'Грешка');return j}function status(t,err=false){$('status').textContent=t;$('status').style.color=err?'#ef9b91':'var(--gold)'}function render(){ $('title').textContent=data.article.title;$('meta').textContent=data.article.sector+' · '+data.article.id+' · '+data.entities.length+' Content Entities · '+data.article.slug;$('article').value=data.article.raw;$('entities').replaceChildren();if(!data.entities.length){const empty=document.createElement('div');empty.className='muted';empty.textContent='Не са намерени архивирани Content Entities. Провери архивния manifest и файловете.';$('entities').append(empty)}data.entities.forEach((e,i)=>{const box=document.createElement('div');box.className='entity';const head=document.createElement('div');head.className='entity-head';const label=document.createElement('strong');label.textContent=String(i+1).padStart(2,'0')+' · '+e.id+' · '+e.title+' · '+e.kind;const controls=document.createElement('div');controls.className='entity-actions';const select=document.createElement('select');for(let n=0;n<data.entities.length;n++){const o=document.createElement('option');o.value=String(n);o.textContent='Позиция '+(n+1);o.selected=n===i;select.append(o)}const move=document.createElement('button');move.textContent='Премести';move.onclick=()=>{const to=Number(select.value);if(to===i)return;const [item]=data.entities.splice(i,1);data.entities.splice(to,0,item);render();status('Позицията е променена. Натисни „Запази реда“.')};controls.append(select,move);head.append(label,controls);const preview=document.createElement('div');preview.className='entity-body';preview.textContent=e.body||'(Няма текст в тази Content Entity.)';const ta=document.createElement('textarea');ta.value=e.raw;const save=document.createElement('button');save.className='primary';save.textContent='Запази тази част';save.onclick=async()=>{try{await api('/api/archive/entity/save',{key,id:e.id,raw:ta.value});status('Записана Entity '+e.id);await load()}catch(err){status(err.message,true)}};box.append(head,preview,ta,save);$('entities').append(box)})}async function load(){try{data=await api('/api/archive/article?key='+encodeURIComponent(key));render()}catch(e){status(e.message,true)}}$('saveArticle').onclick=async()=>{try{await api('/api/archive/article/save',{key,raw:$('article').value});status('Метаданните са записани.');await load()}catch(e){status(e.message,true)}};$('saveOrder').onclick=async()=>{try{await api('/api/archive/entity/order',{key,ids:data.entities.map(e=>e.id)});status('Редът е записан.');await load()}catch(e){status(e.message,true)}};load();</script></body></html>`;

const ARCHIVE_HTML = String.raw`<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAD IT GONE — Архив</title><style>:root{color-scheme:dark;--bg:#101923;--panel:#192633;--line:#344554;--gold:#e0b66e;--text:#f3eee6;--muted:#aebbc5}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:1000px;margin:auto;padding:30px 20px}h1{color:var(--gold)}.panel,.item{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}.item{display:flex;justify-content:space-between;align-items:center;gap:12px}.muted{color:var(--muted);font-size:13px}button,a{border:1px solid var(--line);border-radius:8px;padding:9px 13px;background:#223240;color:var(--text);text-decoration:none;cursor:pointer;font:inherit}.primary{background:var(--gold);color:#211b13;font-weight:700}.status{color:var(--gold);white-space:pre-wrap}</style></head><body><main><h1>HAD IT GONE · Архив</h1><p><a href="/admin">← Към статиите</a>　<a href="/admin/drafts">Чернови</a></p><section class="panel"><h2>Архивирани статии и Content Entities</h2><div id="list" class="muted">Зареждане…</div><div id="status" class="status"></div></section></main><script>const $=id=>document.getElementById(id);async function call(url,body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Грешка');return j}async function load(){try{const r=await fetch('/api/archive');const d=await r.json();$('list').replaceChildren();if(!d.items.length){$('list').textContent='Архивът е празен.';return}for(const x of d.items){const el=document.createElement('div');el.className='item';const label=document.createElement('div');label.innerHTML='<strong>'+x.label+'</strong><div class="muted">'+x.detail+'</div>';const actions=document.createElement('div');actions.style.display='flex';actions.style.gap='8px';if(x.type==='article'){const edit=document.createElement('a');edit.href='/admin/archive/article?key='+encodeURIComponent(x.key);edit.textContent='Редактирай';actions.append(edit)}const b=document.createElement('button');b.className='primary';b.textContent='Възстанови';b.onclick=async()=>{if(!confirm('Да възстановя ли '+x.label+'?'))return;try{await call('/api/archive/restore',{key:x.key,type:x.type});$('status').textContent='Възстановено успешно.';load()}catch(e){$('status').textContent=e.message}};actions.append(b);el.append(label,actions);$('list').append(el)}}catch(e){$('list').textContent=e.message}}load();</script></body></html>`;

function safeSectorSlug(sector, slug) { validateSectorSlug(sector, slug); return path.join(ARTICLE_ROOT, sector, `${slug}.md`); }
function articleRecord(sector, slug) {
  const file = safeSectorSlug(sector, slug);
  if (!fs.existsSync(file)) error('Статията не е намерена.', 404);
  const raw = fs.readFileSync(file, 'utf8');
  const fm = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!fm) error('Невалиден frontmatter на статията.', 500);
  const metadata = parse(fm[1]);
  return { file, raw, metadata, body: fm[2] };
}
function entityFileFor(id, originArticleId) {
  if (!/^\d{10,}$/.test(String(id)) || !String(id).startsWith(String(originArticleId))) error('Невалиден Entity ID.');
  const file = path.join(ENTITY_ROOT, String(originArticleId), `${id}.md`);
  if (!fs.existsSync(file)) error(`Липсва Content Entity ${id}.`, 404);
  return file;
}
function backupFiles(files, label='change') {
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const dir = path.join(BACKUP_ROOT, `${stamp}-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(ROOT, file);
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  return dir;
}
function parseRawArticle(raw) {
  const m = String(raw||'').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!m) error('Статията трябва да съдържа валиден YAML frontmatter.');
  let meta; try { meta=parse(m[1]); } catch(e) { error(`Невалиден YAML: ${e.message}`); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) error('Frontmatter трябва да е YAML обект.');
  for (const k of ['id','title','description','image','contentEntities','world','divergence']) if (!(k in meta)) error(`Липсва задължително поле: ${k}.`);
  if (!/^\d{9}$/.test(String(meta.id))) error('Article ID трябва да е 9 цифри.');
  if (!Array.isArray(meta.contentEntities) || !meta.contentEntities.length || meta.contentEntities.some(x=>!/^\d{10,}$/.test(String(x)))) error('Невалиден contentEntities списък.');
  if (!meta.world || !meta.world.name || !meta.divergence || !meta.divergence.title) error('World и Divergence са задължителни.');
  return { metadata:meta, body:m[2] };
}
function createEntity(sector,slug,title,kind,body) {
  const rec=articleRecord(sector,slug); if(!title||!String(title).trim()) error('Въведи заглавие на Content Entity.'); if(!['intro','section'].includes(kind)) error('Невалиден тип Entity.'); if(!body||!String(body).trim()) error('Въведи съдържание.');
  const articleId=String(rec.metadata.id); const used=getUsedIds().entityIds; let suffix=0;
  for(const id of used) if(id.startsWith(articleId)){const tail=id.slice(articleId.length);if(/^\d+$/.test(tail))suffix=Math.max(suffix,Number(tail));}
  const id=`${articleId}${suffix+1}`; const file=path.join(ENTITY_ROOT,articleId,`${id}.md`); if(fs.existsSync(file)||used.has(id))error('Не може да бъде генериран уникален Entity ID.',409);
  backupFiles([rec.file],'add-entity'); const entityData={id,originArticleId:articleId,title:String(title).trim(),kind}; fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,yamlFile(entityData,String(body))); fs.writeFileSync(rec.file,yamlFile({...rec.metadata,contentEntities:[...rec.metadata.contentEntities,id]},rec.body)); return {id};
}

function archiveArticle(sector, slug) {
  const rec=articleRecord(sector,slug); const id=String(rec.metadata.id); const refs=rec.metadata.contentEntities;
  const key=`article-${id}-${Date.now()}`; const dir=path.join(ARCHIVE_ROOT,'articles',key); const entityFiles=refs.map(x=>entityFileFor(x,id));
  backupFiles([rec.file,...entityFiles],'archive-article'); fs.mkdirSync(path.join(dir,'entities'),{recursive:true});
  const manifest={type:'article',key,sector,slug,articleId:id,archivedAt:new Date().toISOString(),articleFile:'article.md',entities:refs.map((entityId,i)=>({id:entityId,file:path.basename(entityFiles[i])}))};
  const moved=[];
  try {
    fs.renameSync(rec.file,path.join(dir,'article.md')); moved.push([path.join(dir,'article.md'),rec.file]);
    for(let i=0;i<entityFiles.length;i++){ const dest=path.join(dir,'entities',path.basename(entityFiles[i])); fs.renameSync(entityFiles[i],dest); moved.push([dest,entityFiles[i]]); }
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
  } catch(e) { for(const [from,to] of moved.reverse()){try{fs.renameSync(from,to)}catch{}} try{fs.rmSync(dir,{recursive:true,force:true})}catch{} throw e; }
  return {key};
}
function archiveEntity(sector,slug,id) {
  const rec=articleRecord(sector,slug); const articleId=String(rec.metadata.id); const index=rec.metadata.contentEntities.indexOf(id);
  if(index<0) error('Entity не е свързана с тази статия.',404); if(rec.metadata.contentEntities.length<=1) error('Статията трябва да съдържа поне една Content Entity.');
  const file=entityFileFor(id,articleId); const key=`entity-${id}-${Date.now()}`; const dir=path.join(ARCHIVE_ROOT,'entities',key); backupFiles([rec.file,file],'archive-entity');
  fs.mkdirSync(dir,{recursive:true}); const manifest={type:'entity',key,sector,slug,articleId,id,index,archivedAt:new Date().toISOString(),file:`${id}.md`};
  const updated={...rec.metadata,contentEntities:rec.metadata.contentEntities.filter(x=>x!==id)};
  const archived=path.join(dir,`${id}.md`);
  try { fs.renameSync(file,archived); fs.writeFileSync(rec.file,yamlFile(updated,rec.body)); fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)); }
  catch(e) { try{if(fs.existsSync(archived))fs.renameSync(archived,file)}catch{} try{fs.writeFileSync(rec.file,rec.raw)}catch{} try{fs.rmSync(dir,{recursive:true,force:true})}catch{} throw e; }
  return {key};
}

function parseArchivedArticle(raw) {
  const m = String(raw || '').replace(/^\uFEFF/, '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!m) error('Архивираната статия няма валиден YAML frontmatter.');
  let meta;
  try { meta = parse(m[1]); } catch (e) { error(`Невалиден YAML в архивираната статия: ${e.message}`); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) error('Frontmatter на архивираната статия трябва да е YAML обект.');
  if (!/^\d{9}$/.test(String(meta.id || ''))) error('Невалиден Article ID в архива.');
  if (!Array.isArray(meta.contentEntities)) error('Архивираната статия няма валиден contentEntities списък.');
  return { metadata: meta, body: m[2] };
}

function archivedArticleRecord(key) {
  const normalizedKey = String(key ?? '').trim();
  if (!/^article-[A-Za-z0-9_-]+$/.test(normalizedKey)) error(`Невалиден архивен ключ: ${JSON.stringify(normalizedKey)}.`);
  const dir=path.join(ARCHIVE_ROOT,'articles',normalizedKey), mf=path.join(dir,'manifest.json');
  if(!fs.existsSync(mf)) error('Архивната статия не е намерена.',404);
  const manifest=JSON.parse(fs.readFileSync(mf,'utf8'));
  if(manifest.type!=='article') error('Архивният запис не е статия.');
  const file=path.join(dir,'article.md'), raw=fs.readFileSync(file,'utf8'), parsed=parseArchivedArticle(raw);
  const entities=(manifest.entities || []).map(item=>{
    const id = String(typeof item === 'string' ? item : item.id);
    const fileName = typeof item === 'string' ? `${id}.md` : (item.file || `${id}.md`);
    const candidates = [path.join(dir,'entities',fileName), path.join(dir,fileName), path.join(ARCHIVE_ROOT,'entities',id,`${id}.md`)];
    const entityFile = candidates.find(candidate => fs.existsSync(candidate));
    if(!entityFile) error(`Липсва архивирана Entity ${id}.`,404);
    const entityRaw=fs.readFileSync(entityFile,'utf8');
    const m=entityRaw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
    if(!m) error(`Невалиден frontmatter в Entity ${id}.`);
    const meta=parse(m[1]);
    return {id,title:meta.title||id,kind:meta.kind||'',raw:entityRaw,body:m[2]||'',file:fileName};
  });
  return {dir,manifest,file,metadata:parsed.metadata,body:parsed.body,article:{id:parsed.metadata.id,title:parsed.metadata.title,sector:manifest.sector,slug:manifest.slug,raw},entities};
}
function saveArchivedArticle(key,raw) {
  const rec=archivedArticleRecord(key), parsed=parseArchivedArticle(raw);
  if(String(parsed.metadata.id)!==String(rec.metadata.id)) error('Article ID не може да бъде променен.');
  if(JSON.stringify(parsed.metadata.contentEntities)!==JSON.stringify(rec.metadata.contentEntities)) error('Списъкът с Entity ID не може да бъде променен оттук.');
  backupFiles([rec.file],'edit-archived-article');
  fs.writeFileSync(rec.file,raw.endsWith('\n')?raw:raw+'\n');
  return {saved:true};
}
function saveArchivedEntity(key,id,raw) {
  const rec=archivedArticleRecord(key), item=rec.manifest.entities.find(x=>String(x.id)===String(id));
  if(!item) error('Entity не принадлежи на тази архивирана статия.',404);
  const file=path.join(rec.dir,'entities',item.file);
  const m=String(raw||'').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if(!m) error('Невалиден Entity frontmatter.');
  const meta=parse(m[1]);
  if(String(meta.id)!==String(id)||String(meta.originArticleId)!==String(rec.metadata.id)) error('Entity ID и originArticleId не могат да бъдат променени.');
  if(!meta.title||!['intro','section'].includes(meta.kind)) error('Entity трябва да има title и валиден kind.');
  backupFiles([file],'edit-archived-entity');
  fs.writeFileSync(file,raw.endsWith('\n')?raw:raw+'\n');
  return {saved:true};
}

function archiveItems() {
  const items=[];
  for (const [type,base] of [['article',path.join(ARCHIVE_ROOT,'articles')],['entity',path.join(ARCHIVE_ROOT,'entities')]]) {
    if(!fs.existsSync(base)) continue;
    for(const key of fs.readdirSync(base)) { const mf=path.join(base,key,'manifest.json'); if(!fs.existsSync(mf)) continue; try { const m=JSON.parse(fs.readFileSync(mf,'utf8')); items.push({type,key,label:type==='article'?`Статия ${m.articleId}`:`Content Entity ${m.id}`,detail:type==='article'?`${m.sector}/${m.slug} · ${m.entities.length} Entities`:`${m.sector}/${m.slug} · позиция ${m.index+1}`}); } catch {} }
  }
  items.sort((a,b)=>b.key.localeCompare(a.key)); return items;
}
function restoreArchive(type,key) {
  if(!['article','entity'].includes(type)||!/^(article|entity)-[A-Za-z0-9-]+$/.test(key)) error('Невалиден архивен запис.');
  const dir=path.join(ARCHIVE_ROOT,type==='article'?'articles':'entities',key); const mf=path.join(dir,'manifest.json'); if(!fs.existsSync(mf)) error('Архивният запис не е намерен.',404);
  const m=JSON.parse(fs.readFileSync(mf,'utf8'));
  if(type==='article') {
    const target=safeSectorSlug(m.sector,m.slug); if(fs.existsSync(target)) error('Вече има активна статия със същия адрес.');
    const articleRaw=fs.readFileSync(path.join(dir,'article.md'),'utf8'); const parsed=parseRawArticle(articleRaw); const entityTargets=m.entities.map(x=>path.join(ENTITY_ROOT,m.articleId,x.file));
    if(entityTargets.some(f=>fs.existsSync(f))) error('Една или повече Entity ID вече съществуват.');
    backupFiles([path.join(dir,'article.md'),...m.entities.map(x=>path.join(dir,'entities',x.file))],'restore-article');
    fs.mkdirSync(path.dirname(target),{recursive:true}); fs.mkdirSync(path.join(ENTITY_ROOT,m.articleId),{recursive:true});
    fs.renameSync(path.join(dir,'article.md'),target); for(let i=0;i<m.entities.length;i++) fs.renameSync(path.join(dir,'entities',m.entities[i].file),entityTargets[i]); fs.rmSync(dir,{recursive:true,force:true}); return {restored:true};
  }
  const rec=articleRecord(m.sector,m.slug); if(String(rec.metadata.id)!==String(m.articleId)) error('Статията вече има различен Article ID.');
  const target=path.join(ENTITY_ROOT,m.articleId,m.file); if(fs.existsSync(target)) error('Тази Entity вече съществува.');
  const archivedFile=path.join(dir,m.file); const raw=fs.readFileSync(archivedFile,'utf8'); const entityMeta=parse((raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)||[])[1]||'');
  if(String(entityMeta.originArticleId)!==String(m.articleId)||String(entityMeta.id)!==String(m.id)) error('Архивираната Entity не съответства на статията.');
  backupFiles([rec.file,archivedFile],'restore-entity'); fs.mkdirSync(path.dirname(target),{recursive:true});
  const refs=[...rec.metadata.contentEntities]; refs.splice(Math.min(m.index,refs.length),0,m.id);
  fs.renameSync(archivedFile,target);
  try { fs.writeFileSync(rec.file,yamlFile({...rec.metadata,contentEntities:refs},rec.body)); }
  catch(e) { try{fs.renameSync(target,archivedFile)}catch{} throw e; }
  fs.rmSync(dir,{recursive:true,force:true}); return {restored:true};
}

function safeDraftId(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ''))) error('Невалиден идентификатор на чернова.');
  return String(id);
}
function draftFile(id) { return path.join(DRAFT_ROOT, `${safeDraftId(id)}.json`); }
function readDraft(id) {
  const file = draftFile(id);
  if (!fs.existsSync(file)) error('Черновата не е намерена.', 404);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...data, id: String(id) };
}
function saveDraft(payload) {
  const markdown = String(payload.markdown || '');
  if (!markdown.trim()) error('Черновата е празна.');
  const sector = payload.sector || 'history';
  if (!SECTORS.has(sector)) error('Избери валиден сектор.');
  const id = payload.id ? safeDraftId(payload.id) : randomUUID();
  const file = draftFile(id);
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  let derivedTitle = String(payload.title || '').trim();
  if (!derivedTitle) { const titleMatch = markdown.match(/^title:\s*(?:['\"]([\s\S]*?)['\"]|([^\r\n]+))\s*$/m); derivedTitle = String(titleMatch?.[1] || titleMatch?.[2] || previous.title || '').trim(); }
  const record = {
    id, title: derivedTitle,
    sector, slug: String(payload.slug || '').trim(), markdown,
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(DRAFT_ROOT, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { id, title: record.title, updatedAt: record.updatedAt };
}
function listDrafts() {
  if (!fs.existsSync(DRAFT_ROOT)) return [];
  return fs.readdirSync(DRAFT_ROOT).filter(x => x.endsWith('.json')).map(name => {
    try { return JSON.parse(fs.readFileSync(path.join(DRAFT_ROOT, name), 'utf8')); } catch { return null; }
  }).filter(Boolean).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function deleteDraft(id) {
  const file = draftFile(id);
  if (!fs.existsSync(file)) error('Черновата не е намерена.', 404);
  fs.unlinkSync(file);
  return { deleted: true };
}

function listArticles() {
  const articles = [];
  let entityCount = 0;
  for (const sector of SECTORS) {
    const dir = path.join(ARTICLE_ROOT, sector);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const file = path.join(dir, name);
      const data = readFrontmatter(file);
      const refs = Array.isArray(data.contentEntities) ? data.contentEntities : [];
      entityCount += refs.length;
      articles.push({
        id: data.id || '', title: data.title || name.replace(/\.md$/, ''),
        sector, slug: name.replace(/\.md$/, ''), entityCount: refs.length,
        world: data.world?.name || '', divergence: data.divergence?.title || '',
      });
    }
  }
  articles.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return { articles, entityCount };
}

const server = http.createServer(async (req, res) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/admin')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(ADMIN_HTML); return;
    }
    if (req.method === 'GET' && req.url.startsWith('/admin/new')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(HTML); return;
    }
    if (req.method === 'GET' && req.url === '/admin/drafts') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(DRAFTS_HTML); return; }
    if (req.method === 'GET' && req.url === '/api/drafts') { res.writeHead(200, headers); res.end(JSON.stringify({drafts:listDrafts()})); return; }
    if (req.method === 'GET' && req.url.startsWith('/api/draft?')) { const u=new URL(req.url,`http://${HOST}:${PORT}`); const draft=readDraft(u.searchParams.get('id')); res.writeHead(200,headers); res.end(JSON.stringify({draft})); return; }
    if (req.method === 'GET' && req.url === '/api/articles') {
      res.writeHead(200, headers); res.end(JSON.stringify(listArticles())); return;
    }
    if (req.method === 'GET' && req.url.startsWith('/admin/archive/article?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(ARCHIVED_DETAIL_HTML); return; }
    if (req.method === 'GET' && req.url === '/admin/archive') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(ARCHIVE_HTML); return;
    }
    if (req.method === 'GET' && req.url.startsWith('/admin/article?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(DETAIL_HTML); return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/article?')) {
      const u=new URL(req.url,`http://${HOST}:${PORT}`); const sector=u.searchParams.get('sector'); const slug=u.searchParams.get('slug'); const rec=articleRecord(sector,slug); const refs=rec.metadata.contentEntities||[];
      const entities=refs.map(id=>{const file=entityFileFor(id,rec.metadata.id);const raw=fs.readFileSync(file,'utf8');const m=raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);if(!m)error(`Невалиден frontmatter в Entity ${id}.`);const meta=parse(m[1]);return{id,title:meta.title||id,kind:meta.kind||'',raw};});
      res.writeHead(200,headers);res.end(JSON.stringify({article:{id:rec.metadata.id,title:rec.metadata.title,sector,slug,raw:rec.raw},entities}));return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/archive/article?')) {
      const rawQuery = String(req.url).split('?')[1] || '';
      const params = new URLSearchParams(rawQuery);
      const key = String(params.get('key') || '').trim();
      console.log(`[HIG Admin] Archive article request key: ${JSON.stringify(key)}`);
      const rec = archivedArticleRecord(key);
      res.writeHead(200,headers);
      res.end(JSON.stringify({article:rec.article,entities:rec.entities}));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/archive') { res.writeHead(200,headers);res.end(JSON.stringify({items:archiveItems()}));return; }
    if (req.method === 'POST' && ['/api/preview','/api/import','/api/article/save','/api/entity/save','/api/entity/create','/api/entity/order','/api/entity/archive','/api/article/archive','/api/archive/restore','/api/archive/article/save','/api/archive/entity/save','/api/archive/entity/order','/api/draft/save','/api/draft/delete'].includes(req.url)) {
      let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>8*1024*1024) error('Заявката е твърде голяма (максимум 8 MB).',413); }
      const payload=JSON.parse(raw||'{}'); let result;
      if(req.url==='/api/preview') result=makePreview(payload);
      else if(req.url==='/api/import') result=writeImport(payload);
      else if(req.url==='/api/article/save') { const rec=articleRecord(payload.sector,payload.slug); const parsed=parseRawArticle(payload.raw); if(String(parsed.metadata.id)!==String(rec.metadata.id)) error('Article ID не може да бъде променен.'); if(JSON.stringify(parsed.metadata.contentEntities)!==JSON.stringify(rec.metadata.contentEntities)) error('Редактирай реда на Entities чрез управлението им, не чрез YAML.'); backupFiles([rec.file],'edit-article'); fs.writeFileSync(rec.file,payload.raw.endsWith('\n')?payload.raw:payload.raw+'\n'); result={saved:true}; }
      else if(req.url==='/api/entity/save') { const rec=articleRecord(payload.sector,payload.slug); if(!rec.metadata.contentEntities.includes(payload.id)) error('Entity не принадлежи на тази статия.'); const file=entityFileFor(payload.id,rec.metadata.id); const m=String(payload.raw||'').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/); if(!m)error('Невалиден Entity frontmatter.'); const meta=parse(m[1]); if(String(meta.id)!==String(payload.id)||String(meta.originArticleId)!==String(rec.metadata.id))error('Entity ID и originArticleId не могат да бъдат променени.'); if(!meta.title||!['intro','section'].includes(meta.kind))error('Entity трябва да има title и валиден kind.'); backupFiles([file],'edit-entity'); fs.writeFileSync(file,payload.raw.endsWith('\n')?payload.raw:payload.raw+'\n'); result={saved:true}; }
      else if(req.url==='/api/entity/create') result=createEntity(payload.sector,payload.slug,payload.title,payload.kind,payload.body);
      else if(req.url==='/api/entity/order') { const rec=articleRecord(payload.sector,payload.slug); const current=rec.metadata.contentEntities; if(!Array.isArray(payload.ids)||payload.ids.length!==current.length||new Set(payload.ids).size!==current.length||payload.ids.some(x=>!current.includes(x)))error('Невалиден ред на Entities.'); backupFiles([rec.file],'reorder-entities'); fs.writeFileSync(rec.file,yamlFile({...rec.metadata,contentEntities:payload.ids},rec.body)); result={saved:true}; }
      else if(req.url==='/api/entity/archive') result=archiveEntity(payload.sector,payload.slug,payload.id);
      else if(req.url==='/api/article/archive') result=archiveArticle(payload.sector,payload.slug);
      else if(req.url==='/api/archive/article/save') result=saveArchivedArticle(payload.key,payload.raw);
      else if(req.url==='/api/archive/entity/save') result=saveArchivedEntity(payload.key,payload.id,payload.raw);
      else if(req.url==='/api/archive/entity/order') { const rec=archivedArticleRecord(payload.key); const current=rec.manifest.entities.map(x=>String(typeof x==='string'?x:x.id)); if(!Array.isArray(payload.ids)||payload.ids.length!==current.length||new Set(payload.ids).size!==current.length||payload.ids.some(x=>!current.includes(String(x)))) error('Невалиден ред на архивираните Entities.'); backupFiles([path.join(rec.dir,'manifest.json')],'reorder-archived-entities'); const byId=new Map(rec.manifest.entities.map(x=>[String(typeof x==='string'?x:x.id),x])); rec.manifest.entities=payload.ids.map(id=>byId.get(String(id))); fs.writeFileSync(path.join(rec.dir,'manifest.json'),JSON.stringify(rec.manifest,null,2)+'\n'); result={saved:true}; }
      else if(req.url==='/api/draft/save') result=saveDraft(payload);
      else if(req.url==='/api/draft/delete') result=deleteDraft(payload.id);
      else result=restoreArchive(payload.type,payload.key);
      res.writeHead(200,headers);res.end(JSON.stringify(result));return;
    }
    res.writeHead(404, headers); res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    res.writeHead(e.status || 500, headers);
    res.end(JSON.stringify({ error: e.message || 'Вътрешна грешка' }));
  }
});
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`\nHAD IT GONE Admin: ${url}/admin`);
  console.log('Отвори http://127.0.0.1:' + PORT + '/admin. За спиране натисни Ctrl+C.\n');
});
