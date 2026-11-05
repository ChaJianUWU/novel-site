// 站点界面：样式、布局、各个页面、内联客户端脚本
//
// 约定：这个文件里的 HTML 用模板字符串写；但**页面内嵌的 <script> 代码里不要出现反引号或 ${**，
// 一律用字符串拼接，免得被外层模板提前求值。

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

export function fmtNum(n) {
  const v = Number(n) || 0
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'
  return String(v)
}

export const CSS = `
:root{color-scheme:light dark;--bg:#fbf9f5;--fg:#1f2328;--dim:#6b7280;--line:#e5e1d8;--card:#fff;--soft:#f3efe7;--accent:#8a5a2b;--danger:#b42318;--ok:#1f7a4d}
html[data-theme="dark"]{color-scheme:dark;--bg:#14151a;--fg:#e8e6e1;--dim:#9aa0a6;--line:#2b2d33;--card:#1b1d22;--soft:#22252b;--accent:#d8a06a;--danger:#ff8a80;--ok:#63d29a}
@media (prefers-color-scheme:dark){html:not([data-theme="light"]){color-scheme:dark;--bg:#14151a;--fg:#e8e6e1;--dim:#9aa0a6;--line:#2b2d33;--card:#1b1d22;--soft:#22252b;--accent:#d8a06a;--danger:#ff8a80;--ok:#63d29a}}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}
button,input,textarea,select{font:inherit;color:inherit}
.wrap{max-width:1060px;margin:0 auto;padding:0 18px;width:100%}
header.top{position:sticky;top:0;z-index:30;border-bottom:1px solid var(--line);background:var(--bg)}
header.top .wrap{display:flex;align-items:center;gap:12px;min-height:60px;padding-top:8px;padding-bottom:8px}
.brand{font-weight:700;font-size:17px;line-height:1.2;max-width:52vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brand i{display:block;font-style:normal;font-weight:400;font-size:11.5px;color:var(--dim);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
nav.links{margin-left:auto;display:flex;gap:4px;align-items:center;flex-wrap:wrap}
nav.links a{padding:7px 12px;border-radius:999px;font-size:14px;color:var(--dim);white-space:nowrap}
nav.links a:hover{background:var(--soft);color:var(--fg)}
nav.links a.on{background:var(--fg);color:var(--bg)}
main{flex:1;width:100%;padding:26px 0 60px}
footer.bot{border-top:1px solid var(--line);padding:22px 0;color:var(--dim);font-size:13px;text-align:center}
footer.bot a{color:var(--dim);border-bottom:1px dotted var(--line)}
h1{font-size:26px;line-height:1.3;margin:0 0 10px}
h2{font-size:17px;margin:34px 0 12px}
.hero{padding:14px 0 6px}
.hero h1{font-size:30px;letter-spacing:.5px}
.hero p{color:var(--dim);margin:6px 0 0;font-size:15px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.spacer{flex:1}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-size:14.5px;line-height:1.2;transition:.15s}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.pri{background:var(--fg);color:var(--bg);border-color:var(--fg);font-weight:600}
.btn.pri:hover{opacity:.88;color:var(--bg)}
.btn.danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,var(--line))}
.btn.sm{padding:6px 11px;font-size:13px;border-radius:8px}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.search{display:flex;gap:8px;margin:20px 0 24px}
.search input{flex:1;padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);outline:none}
.search input:focus{border-color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:14px}
.card{display:block;padding:17px 18px;border:1px solid var(--line);border-radius:14px;background:var(--card);transition:.16s}
.card:hover{transform:translateY(-2px);border-color:var(--accent);box-shadow:0 8px 22px -16px rgba(0,0,0,.4)}
.card h3{margin:0 0 6px;font-size:17px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .who{color:var(--accent);font-size:13.5px;font-weight:600}
.card .sum{color:var(--dim);font-size:13.5px;margin:8px 0 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:22px}
.card .meta{color:var(--dim);font-size:12.5px;margin-top:10px;display:flex;gap:10px;flex-wrap:wrap}
.notice{padding:12px 16px;border-radius:12px;background:var(--soft);border:1px solid var(--line);font-size:14px;color:var(--dim);margin:0 0 22px;white-space:pre-wrap}
.empty{padding:56px 20px;text-align:center;color:var(--dim);border:1px dashed var(--line);border-radius:16px}
.empty b{display:block;color:var(--fg);font-size:17px;margin-bottom:6px}
ul.ch{list-style:none;padding:0;margin:16px 0 0;border-top:1px solid var(--line)}
ul.ch li{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)}
ul.ch li span.n{color:var(--dim);font-size:12.5px;min-width:30px;text-align:right;font-variant-numeric:tabular-nums}
ul.ch li a{flex:1;padding:13px 2px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
ul.ch li a:hover{color:var(--accent)}
ul.ch li em{font-style:normal;color:var(--dim);font-size:12.5px}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0}
.tag{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--dim);border:1px solid var(--line)}
article.read{max-width:40em;margin:0 auto;font-family:Georgia,"Noto Serif SC","Songti SC",serif;font-size:19px;line-height:1.95;letter-spacing:.02em}
article.read h1{font-family:inherit;font-size:22px;margin:0 0 4px}
article.read .by{color:var(--dim);font-size:14px;margin-bottom:26px;font-family:system-ui,sans-serif}
article.read p{margin:0 0 1.05em;text-indent:2em;word-break:break-word}
article.read p.noind{text-indent:0}
.chapnav{max-width:40em;margin:36px auto 0;display:flex;gap:10px;justify-content:space-between;border-top:1px solid var(--line);padding-top:18px}
.chapnav a{flex:1;text-align:center;padding:11px;border:1px solid var(--line);border-radius:10px;font-size:14px;background:var(--card)}
.chapnav a:hover{border-color:var(--accent);color:var(--accent)}
.chapnav a.off{opacity:.4;pointer-events:none}
.field{margin:0 0 16px}
.field label{display:block;font-size:13.5px;color:var(--dim);margin-bottom:6px}
.field label b{color:var(--danger)}
.field input,.field textarea{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:var(--card);outline:none;resize:vertical}
.field input:focus,.field textarea:focus{border-color:var(--accent)}
.field .hint{font-size:12.5px;color:var(--dim);margin-top:6px}
.panel{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:20px;margin:0 0 20px}
.drop{border:2px dashed var(--line);border-radius:14px;padding:26px;text-align:center;color:var(--dim);background:var(--card);cursor:pointer;transition:.15s}
.drop:hover,.drop.over{border-color:var(--accent);color:var(--accent);background:var(--soft)}
.drop b{display:block;color:var(--fg);font-size:16px;margin-bottom:4px}
.preview{max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:12px;margin-top:14px}
.preview table{width:100%;border-collapse:collapse;font-size:13.5px}
.preview th,.preview td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.preview th{color:var(--dim);font-weight:500;position:sticky;top:0;background:var(--card)}
.preview td.n{color:var(--dim);font-variant-numeric:tabular-nums}
table.admin{width:100%;border-collapse:collapse;font-size:14px}
table.admin th,table.admin td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
table.admin th{color:var(--dim);font-weight:500;font-size:13px}
table.admin td.t{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.stat{flex:1;min-width:120px;border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--card)}
.stat b{display:block;font-size:22px;line-height:1.2}
.stat span{color:var(--dim);font-size:12.5px}
.split{display:grid;grid-template-columns:250px 1fr;gap:18px;align-items:start}
@media (max-width:780px){.split{grid-template-columns:1fr}}
.side{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden;max-height:70vh;overflow-y:auto}
.side div{padding:9px 13px;font-size:13.5px;border-bottom:1px solid var(--line);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side div:hover{background:var(--soft)}
.side div.on{background:var(--fg);color:var(--bg)}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);background:#111;color:#fff;padding:11px 18px;border-radius:10px;font-size:14px;opacity:0;pointer-events:none;transition:.22s;z-index:99;max-width:88vw}
.toast.on{opacity:1;transform:translate(-50%,0)}
.toast.bad{background:#b42318}
.toast.good{background:#1f7a4d}
.kbd{font:12px/1 ui-monospace,monospace;border:1px solid var(--line);border-radius:5px;padding:2px 5px;color:var(--dim)}
.muted{color:var(--dim);font-size:13.5px}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;background:var(--soft);padding:2px 7px;border-radius:6px;word-break:break-all}
`

const CLIENT = `
function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function toast(msg,kind){
  var el=document.getElementById('toast');
  el.textContent=msg; el.className='toast on '+(kind||'');
  clearTimeout(el.__t); el.__t=setTimeout(function(){el.className='toast'},2800);
}
function call(path,method,body,extra){
  var h={'content-type':'application/json'};
  if(extra) for(var k in extra) h[k]=extra[k];
  return fetch('/api'+path,{method:method||'GET',headers:h,body:body===undefined?undefined:JSON.stringify(body)})
    .then(function(r){return r.json().catch(function(){return {}}).then(function(d){
      if(!r.ok) { var err=new Error(d.error||('请求失败 '+r.status)); err.status=r.status; err.data=d; throw err }
      return d;
    })});
}
function saveKey(id,key){ try{localStorage.setItem('novel_key:'+id,key)}catch(e){} }
function loadKey(id){ try{return localStorage.getItem('novel_key:'+id)||''}catch(e){return ''} }
function clearKey(id){ try{localStorage.removeItem('novel_key:'+id)}catch(e){} }
function needKey(id){
  var k=loadKey(id);
  if(k) return k;
  k=window.prompt('这本书的编辑口令（创建时给你那串 18 位）：','');
  if(k){ k=k.trim(); saveKey(id,k); }
  return k||'';
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtNum(n){ n=Number(n)||0; return n>=10000?(n/10000).toFixed(1).replace(/\\.0$/,'')+' 万':String(n); }
function fmtTime(ts){ if(!ts) return '—'; var d=new Date(Number(ts)); if(isNaN(d.getTime())) return '—';
  function p(n){return n<10?'0'+n:''+n} return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
(function themeBoot(){
  var t=''; try{t=localStorage.getItem('novel_theme')||''}catch(e){}
  if(t) document.documentElement.setAttribute('data-theme',t);
})();
function toggleTheme(){
  var cur=document.documentElement.getAttribute('data-theme')||'';
  var dark=cur==='dark'||(!cur&&window.matchMedia('(prefers-color-scheme:dark)').matches);
  var next=dark?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('novel_theme',next)}catch(e){}
}
`

function nav(config, active) {
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'on' : ''}">${label}</a>`
  return `<header class="top"><div class="wrap">
  <a class="brand" href="/">${esc(config.title || '小说站')}<i>${esc(config.subtitle || '')}</i></a>
  <nav class="links">
    ${link('/', '书架', 'home')}
    ${link('/upload', '投稿 / 导入', 'upload')}
    ${link('/download', '下载整站', 'download')}
    <a href="javascript:toggleTheme()" title="切换深浅色">◐</a>
    ${link('/admin', '管理', 'admin')}
  </nav>
</div></header>`
}

export function layout(options, body, script) {
  const o = options || {}
  const config = o.config || {}
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title ? o.title + ' · ' + (config.title || '小说站') : config.title || '小说站')}</title>
<meta name="description" content="${esc(config.subtitle || '免登录写作，署上你的名字')}">
<style>${CSS}</style>
</head>
<body>
${nav(config, o.active)}
<main><div class="wrap">${body}</div></main>
<footer class="bot"><div class="wrap">
  <div>${esc(config.title || '小说站')} · 免登录写作，留名即可 · <a href="/upload">投稿</a> · <a href="/admin">管理</a></div>
  <div style="margin-top:6px;opacity:.75">内容由访客自行上传，署名责任自负</div>
</div></footer>
<div id="toast" class="toast"></div>
<script>${CLIENT}${script || ''}</script>
</body>
</html>`
}

// ---------------- 首页 ----------------

export function pageHome(config, novels, query) {
  const cards = novels.length
    ? novels
        .map(
          (n) => `<a class="card" href="/n/${esc(n.id)}" data-s="${esc((n.title + ' ' + (n.author || '') + ' ' + (n.summary || '')).toLowerCase())}">
  <div class="who">${esc(n.author || '佚名')}</div>
  <h3>${esc(n.title)}</h3>
  <p class="sum">${esc(n.summary || '（这本书还没有写简介）')}</p>
  <div class="meta"><span>${fmtNum(n.chapterCount)} 章</span><span>${fmtNum(n.chars)} 字</span><span>${fmtTime(n.updatedAt)}</span></div>
</a>`,
        )
        .join('')
    : `<div class="empty" style="grid-column:1/-1"><b>书架还空着</b>点右上角「投稿 / 导入」，粘一段正文或传个 txt，署上你的名字就能发。</div>`

  const body = `<section class="hero">
  <h1>${esc(config.title || '小说站')}</h1>
  <p>${esc(config.subtitle || '免登录写作，署上你的名字')} · 目前 ${fmtNum(novels.length)} 本</p>
</section>
${config.announcement ? `<div class="notice">${esc(config.announcement)}</div>` : ''}
<form class="search" action="/" method="get" onsubmit="return true">
  <input id="q" name="q" value="${esc(query || '')}" placeholder="搜书名、作者、简介…" autocomplete="off">
  <button class="btn pri" type="submit">搜索</button>
  ${config.allowPublicCreate === false ? '' : '<a class="btn" href="/upload">＋ 投稿</a>'}
</form>
<div class="grid" id="grid">${cards}</div>`

  const script = query
    ? ``
    : `(function(){var i=q('#q');if(!i)return;i.addEventListener('input',function(){
  var v=i.value.trim().toLowerCase();qa('#grid .card').forEach(function(c){
    c.style.display=(!v||c.getAttribute('data-s').indexOf(v)>=0)?'':'none';
  });});})();`
  return layout({ config, title: '', active: 'home' }, body, script)
}

// ---------------- 详情 ----------------

export function pageNovel(config, novel) {
  const chapters = (novel.chapters || [])
    .map(
      (c, i) => `<li><span class="n">${i + 1}</span><a href="/r/${esc(novel.id)}/${esc(c.id)}">${esc(c.title || '第' + (i + 1) + '章')}</a><em>${fmtNum(c.chars)}</em></li>`,
    )
    .join('')
  const first = novel.chapters && novel.chapters.length ? novel.chapters[0].id : ''
  const body = `<div class="row" style="margin-top:6px">
  <a class="btn sm" href="/">← 书架</a>
</div>
<h1 style="margin-top:16px">${esc(novel.title)}</h1>
<div class="row">
  <span class="tag" style="color:var(--accent);border-color:var(--accent)">作者 ${esc(novel.author || '佚名')}</span>
  <span class="tag">${fmtNum(novel.chapterCount)} 章</span>
  <span class="tag">${fmtNum(novel.chars)} 字</span>
  <span class="tag">更新 ${fmtTime(novel.updatedAt)}</span>
</div>
${novel.summary ? `<p class="muted" style="font-size:15px;margin:16px 0 0">${esc(novel.summary)}</p>` : ''}
<div class="row" style="margin:22px 0 4px">
  ${first ? `<a class="btn pri" href="/r/${esc(novel.id)}/${esc(first)}">开始阅读</a>` : ''}
  <a class="btn" href="/edit/${esc(novel.id)}">写 / 改</a>
  <a class="btn" href="/api/export/${esc(novel.id)}">导出 txt</a>
  <span class="spacer"></span>
  <button class="btn danger sm" onclick="delNovel('${esc(novel.id)}')">删除本书</button>
</div>
<h2>目录</h2>
<ul class="ch">${chapters || '<li style="padding:16px 2px;color:var(--dim)">还没有章节，去「写 / 改」里加。</li>'}</ul>`
  const script = `function delNovel(id){
  var k=needKey(id); if(!k) return;
  if(!window.confirm('确定删除这本书和它的全部章节？不可恢复。')) return;
  call('/novel/'+id,'DELETE',null,{'x-edit-key':k}).then(function(){
    clearKey(id); toast('已删除','good'); setTimeout(function(){location.href='/'},600);
  }).catch(function(e){toast(e.message,'bad')});
}`
  return layout({ config, title: novel.title, active: 'home' }, body, script)
}

// ---------------- 阅读页 ----------------

export function pageReader(config, data) {
  const { novel, chapter, prev, next } = data
  const paras = String(chapter.content || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${esc(s)}</p>`)
    .join('')
  const navBits = `<div class="chapnav">
  <a class="${prev ? '' : 'off'}" href="${prev ? '/r/' + esc(novel.id) + '/' + esc(prev) : '#'}">← 上一章</a>
  <a href="/n/${esc(novel.id)}">目录</a>
  <a class="${next ? '' : 'off'}" href="${next ? '/r/' + esc(novel.id) + '/' + esc(next) : '#'}">下一章 →</a>
</div>`
  const body = `<div class="row" style="max-width:40em;margin:0 auto 14px">
  <a class="btn sm" href="/n/${esc(novel.id)}">← ${esc(novel.title)}</a>
  <span class="spacer"></span>
  <button class="btn sm" onclick="setSize(-1)">A－</button>
  <button class="btn sm" onclick="setSize(1)">A＋</button>
</div>
<article class="read" id="art">
  <h1>${esc(chapter.title || '')}</h1>
  <div class="by">${esc(novel.author || '佚名')} · ${fmtNum(chapter.chars)} 字</div>
  ${paras || '<p class="muted">这一章还没有正文。</p>'}
</article>
${navBits}
<p class="muted" style="text-align:center;margin-top:26px">键盘 <span class="kbd">←</span> <span class="kbd">→</span> 翻章</p>`
  const script = `(function(){
  var art=q('#art'); var size=0;
  try{ size=Number(localStorage.getItem('novel_reader_size')||0)||0 }catch(e){}
  function apply(){ art.style.fontSize=(19+size)+'px'; }
  apply();
  window.setSize=function(d){ size=Math.max(-4,Math.min(8,size+d)); apply(); try{localStorage.setItem('novel_reader_size',String(size))}catch(e){} };
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft'&&q('.chapnav a:first-child:not(.off)')) location.href=q('.chapnav a:first-child').href;
    if(e.key==='ArrowRight'){ var n=q('.chapnav a:last-child'); if(n&&!n.classList.contains('off')) location.href=n.href; }
  });
})();`
  return layout({ config, title: chapter.title, active: 'home' }, body, script)
}

// ---------------- 投稿 / 导入 ----------------

export function pageUpload(config) {
  const closed = config.allowPublicCreate === false
  const body = `<h1>投稿 / 导入</h1>
<p class="muted">可以直接贴正文，也可以传 <b>txt / md</b> 文件。系统会自动按「第X章」「序章」「Chapter N」「## 标题」分章；认不出来就按字数分段。</p>
${closed ? '<div class="notice">站长暂时关闭了公开投稿。你仍然可以用编辑口令修改自己的书。</div>' : ''}
<div class="panel">
  <div class="field"><label>书名 <b>*</b></label><input id="title" placeholder="例如：夜航船" maxlength="60"></div>
  <div class="field"><label>作者名 <b>*</b>（本站没有登录，靠署名认人，必须填）</label><input id="author" placeholder="你的笔名" maxlength="30"></div>
  <div class="field"><label>简介（可选）</label><textarea id="summary" rows="2" placeholder="一句话说清这本书" maxlength="300"></textarea></div>
  <div class="field"><label>正文来源</label>
    <div class="drop" id="drop"><b>点这里选文件，或把 txt 拖进来</b><span id="fname">支持 .txt / .md / .text，单文件 5MB 以内</span>
      <input type="file" id="file" accept=".txt,.md,.text,text/plain" style="display:none">
    </div>
    <div class="field" style="margin-top:14px"><label>或者直接粘贴</label>
      <textarea id="text" rows="8" placeholder="把正文粘进来，会自动分章"></textarea>
    </div>
  </div>
  <div class="row">
    <button class="btn" id="btnPreview">检测分章</button>
    <button class="btn pri" id="btnPublish" ${closed ? 'disabled' : ''}>发布</button>
    <span class="muted" id="stat"></span>
  </div>
  <div id="pv"></div>
</div>`
  const script = `(function(){
  var fileEl=q('#file'), dropEl=q('#drop'), textEl=q('#text'), pv=q('#pv'), stat=q('#stat');
  var parsed=null;
  dropEl.addEventListener('click',function(){fileEl.click()});
  ['dragenter','dragover'].forEach(function(t){dropEl.addEventListener(t,function(e){e.preventDefault();dropEl.classList.add('over')})});
  ['dragleave','drop'].forEach(function(t){dropEl.addEventListener(t,function(e){e.preventDefault();dropEl.classList.remove('over')})});
  dropEl.addEventListener('drop',function(e){ if(e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
  fileEl.addEventListener('change',function(){ if(fileEl.files[0]) readFile(fileEl.files[0]); });
  function readFile(f){
    if(f.size>5*1024*1024){ toast('文件太大（超过 5MB）','bad'); return; }
    var r=new FileReader();
    r.onload=function(){
      textEl.value=String(r.result||'');
      q('#fname').textContent=f.name+' · '+(f.size/1024).toFixed(1)+' KB';
      if(!q('#title').value) q('#title').value=f.name.replace(/\\.[^.]+$/,'').slice(0,60);
      preview();
    };
    r.readAsText(f,'utf-8');
  }
  function preview(){
    var text=textEl.value;
    if(!text.trim()){ pv.innerHTML=''; stat.textContent=''; parsed=null; return; }
    stat.textContent='正在检测…';
    call('/split','POST',{text:text}).then(function(d){
      parsed=d;
      stat.textContent='共 '+d.chars+' 字，识别出 '+d.chapters.length+' 章';
      var rows=d.chapters.map(function(c,i){
        return '<tr><td class="n">'+(i+1)+'</td><td>'+esc(c.title)+'</td><td class="n">'+c.chars+' 字</td><td class="muted" style="max-width:260px">'+esc(c.head)+'</td></tr>';
      }).join('');
      pv.innerHTML='<div class="preview"><table><thead><tr><th>#</th><th>章节名</th><th>字数</th><th>开头</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    }).catch(function(e){ stat.textContent=''; toast(e.message,'bad') });
  }
  q('#btnPreview').addEventListener('click',preview);
  textEl.addEventListener('input',function(){ clearTimeout(textEl.__t); textEl.__t=setTimeout(preview,600); });
  q('#btnPublish').addEventListener('click',function(){
    var title=q('#title').value.trim(), author=q('#author').value.trim(), summary=q('#summary').value.trim();
    var text=textEl.value;
    if(!title) return toast('书名得填','bad');
    if(!author) return toast('作者名必须填——本站靠署名认人','bad');
    if(!text.trim()) return toast('正文还是空的','bad');
    var btn=q('#btnPublish'); btn.disabled=true; btn.textContent='发布中…';
    function send(force){
      return call('/import','POST',{title:title,author:author,summary:summary,text:text,force:!!force}).then(function(d){
        saveKey(d.id,d.editKey);
        toast('发布成功，共 '+d.chapterCount+' 章','good');
        pv.innerHTML='<div class="notice" style="margin-top:16px">发布成功：<a href="/n/'+d.id+'"><b>'+esc(d.title)+'</b></a> · '+d.chapterCount+' 章 · '+d.chars+' 字<br>编辑口令 <span class="mono">'+d.editKey+'</span> 已存在这台浏览器，换设备要自己记好。</div>';
        btn.textContent='已发布';
        setTimeout(function(){location.href='/n/'+d.id},1200);
      });
    }
    send(false).catch(function(e){
      if(e.status===409){
        if(window.confirm(e.message+'\n\n确定再建一本？')){ return send(true).catch(function(err){ toast(err.message,'bad'); btn.disabled=false; btn.textContent='发布' }) }
        btn.disabled=false; btn.textContent='发布'; return;
      }
      toast(e.message,'bad'); btn.disabled=false; btn.textContent='发布'
    });
  });
})();`
  return layout({ config, title: '投稿', active: 'upload' }, body, script)
}

// ---------------- 编辑页 ----------------

export function pageEdit(config, novel) {
  const chapters = novel.chapters || []
  const side = chapters
    .map((c, i) => `<div data-cid="${esc(c.id)}" class="${i === 0 ? 'on' : ''}">${i + 1}. ${esc(c.title)}</div>`)
    .join('')
  const body = `<div class="row"><a class="btn sm" href="/n/${esc(novel.id)}">← 回到书页</a><span class="spacer"></span>
  <span class="muted">${esc(novel.title)} · ${esc(novel.author || '佚名')}</span></div>
<h1 style="margin-top:14px">编辑</h1>
<div class="split">
  <div>
    <div class="side" id="side">${side || '<div style="color:var(--dim);padding:12px">还没有章节</div>'}</div>
    <button class="btn sm" id="btnAdd" style="width:100%;margin-top:10px;justify-content:center">＋ 新增空章节</button>
  </div>
  <div>
    <div class="panel">
      <div class="field"><label>章节名</label><input id="ctitle" placeholder="第X章 ..." maxlength="80"></div>
      <div class="field"><label>正文</label><textarea id="cbody" rows="18" placeholder="这一章的内容"></textarea></div>
      <div class="row">
        <button class="btn pri" id="btnSave">保存这一章</button>
        <button class="btn danger sm" id="btnDelCh">删除这一章</button>
        <span class="spacer"></span><span class="muted" id="chstat"></span>
      </div>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">书籍信息</h2>
      <div class="field"><label>书名</label><input id="ntitle" value="${esc(novel.title)}" maxlength="60"></div>
      <div class="field"><label>作者名</label><input id="nauthor" value="${esc(novel.author || '')}" maxlength="30"></div>
      <div class="field"><label>简介</label><textarea id="nsummary" rows="3" maxlength="300">${esc(novel.summary || '')}</textarea></div>
      <button class="btn" id="btnSaveMeta">保存书籍信息</button>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">追加导入（续写/补章）</h2>
      <p class="muted" style="margin-top:0">贴一段或传 txt，自动分章后接到本书末尾，原有章节不动。</p>
      <div class="field"><textarea id="itext" rows="5" placeholder="要追加的正文"></textarea></div>
      <div class="row">
        <input type="file" id="ifile" accept=".txt,.md,.text,text/plain" style="max-width:230px">
        <button class="btn" id="btnAppend">分章并追加</button>
        <span class="muted" id="istat"></span>
      </div>
    </div>
  </div>
</div>`
  const script = `(function(){
  var ID='${esc(novel.id)}';
  var key=needKey(ID);
  if(!key){ location.href='/n/'+ID; return; }
  var chapters=${JSON.stringify(chapters.map((c) => ({ id: c.id, title: c.title })))};
  var cur=chapters.length?chapters[0].id:null;
  function hdr(){ return {'x-edit-key':key} }
  function mark(cid){
    qa('#side div').forEach(function(d){ d.classList.toggle('on',d.getAttribute('data-cid')===cid) });
    cur=cid;
  }
  function loadChapter(cid){
    call('/novel/'+ID+'/'+cid).then(function(d){
      q('#ctitle').value=d.chapter.title||'';
      q('#cbody').value=d.chapter.content||'';
      q('#chstat').textContent=(d.chapter.chars||0)+' 字';
      mark(cid);
    }).catch(function(e){toast(e.message,'bad')});
  }
  qa('#side div').forEach(function(d){
    d.addEventListener('click',function(){ var cid=d.getAttribute('data-cid'); if(cid) loadChapter(cid) });
  });
  if(cur) loadChapter(cur); else { q('#chstat').textContent='0 字' }
  q('#cbody').addEventListener('input',function(){ q('#chstat').textContent=(q('#cbody').value.replace(/\\s+/g,'').length)+' 字' });
  q('#btnSave').addEventListener('click',function(){
    var body={title:q('#ctitle').value.trim(),content:q('#cbody').value};
    if(!cur){
      call('/novel/'+ID+'/chapter','POST',body,hdr()).then(function(d){
        chapters.push({id:d.chapter.id,title:d.chapter.title});
        q('#side').innerHTML=chapters.map(function(c,i){
          return '<div data-cid="'+c.id+'" class="'+(c.id===d.chapter.id?'on':'')+'">'+(i+1)+'. '+esc(c.title)+'</div>';
        }).join('');
        bindSide(); cur=d.chapter.id; toast('已创建章节','good');
      }).catch(function(e){toast(e.message,'bad')});
      return;
    }
    call('/novel/'+ID+'/chapter/'+cur,'PUT',body,hdr()).then(function(d){
      var idx=-1; chapters.forEach(function(c,i){ if(c.id===cur) idx=i });
      if(idx>=0){ chapters[idx].title=d.chapter.title; var el=qa('#side div')[idx]; if(el) el.textContent=(idx+1)+'. '+d.chapter.title }
      toast('已保存','good');
    }).catch(function(e){toast(e.message,'bad')});
  });
  function bindSide(){
    qa('#side div').forEach(function(d){
      d.addEventListener('click',function(){ var cid=d.getAttribute('data-cid'); if(cid) loadChapter(cid) });
    });
  }
  q('#btnAdd').addEventListener('click',function(){
    call('/novel/'+ID+'/chapter','POST',{title:'新章节',content:''},hdr()).then(function(d){
      chapters.push({id:d.chapter.id,title:d.chapter.title});
      q('#side').innerHTML=chapters.map(function(c,i){
        return '<div data-cid="'+c.id+'" class="'+(c.id===d.chapter.id?'on':'')+'">'+(i+1)+'. '+esc(c.title)+'</div>';
      }).join('');
      bindSide();
      q('#ctitle').value=d.chapter.title; q('#cbody').value=''; cur=d.chapter.id;
      toast('已新增','good');
    }).catch(function(e){toast(e.message,'bad')});
  });
  q('#btnDelCh').addEventListener('click',function(){
    if(!cur) return toast('先选一章','bad');
    if(!window.confirm('删掉这一章？')) return;
    call('/novel/'+ID+'/chapter/'+cur,'DELETE',null,hdr()).then(function(){
      chapters=chapters.filter(function(c){return c.id!==cur});
      q('#side').innerHTML=chapters.length?chapters.map(function(c,i){
        return '<div data-cid="'+c.id+'">'+(i+1)+'. '+esc(c.title)+'</div>';
      }).join(''):'<div style="color:var(--dim);padding:12px">还没有章节</div>';
      bindSide(); cur=null; q('#ctitle').value=''; q('#cbody').value=''; toast('已删除','good');
    }).catch(function(e){toast(e.message,'bad')});
  });
  q('#btnSaveMeta').addEventListener('click',function(){
    call('/novel/'+ID,'PUT',{title:q('#ntitle').value.trim(),author:q('#nauthor').value.trim(),summary:q('#nsummary').value.trim()},hdr())
      .then(function(){ toast('书籍信息已保存','good') }).catch(function(e){toast(e.message,'bad')});
  });
  q('#ifile').addEventListener('change',function(){
    var f=q('#ifile').files[0]; if(!f) return;
    var r=new FileReader();
    r.onload=function(){ q('#itext').value=String(r.result||''); q('#istat').textContent='已读入 '+f.name };
    r.readAsText(f,'utf-8');
  });
  q('#btnAppend').addEventListener('click',function(){
    var text=q('#itext').value;
    if(!text.trim()) return toast('没有内容','bad');
    q('#istat').textContent='处理中…';
    call('/novel/'+ID+'/import','POST',{text:text},hdr()).then(function(d){
      q('#istat').textContent='追加了 '+d.added+' 章';
      chapters=chapters.concat(d.chapters.map(function(c){return {id:c.id,title:c.title}}));
      q('#side').innerHTML=chapters.map(function(c,i){
        return '<div data-cid="'+c.id+'">'+(i+1)+'. '+esc(c.title)+'</div>';
      }).join('');
      bindSide(); q('#itext').value=''; toast('已追加 '+d.added+' 章','good');
    }).catch(function(e){ q('#istat').textContent=''; toast(e.message,'bad') });
  });
})();`
  return layout({ config, title: '编辑 ' + novel.title, active: 'home' }, body, script)
}

// ---------------- 管理页 ----------------

export function pageAdmin(config) {
  const body = `<h1>管理后台</h1>
<p class="muted">用站长密钥进入。密钥在服务器启动日志的「管理员密钥」一行，也在服务器的 <span class="mono">data/admin-key.txt</span> 里。填一次会记在这台浏览器，下次打开直接进。</p>
<div class="panel" id="login">
  <div class="field"><label>管理员密钥</label><input id="akey" type="password" placeholder="粘进来，回车即可" autocomplete="off"></div>
  <button class="btn pri" id="btnLogin">进入</button>
</div>
<div id="panel" style="display:none">
  <div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn sm" id="btnLogout">退出后台</button></div>
  <div class="stats" id="stats"></div>
  <div class="panel">
    <h2 style="margin-top:0">站点设置</h2>
    <div class="field"><label>站名</label><input id="stitle"></div>
    <div class="field"><label>副标题</label><input id="ssub"></div>
    <div class="field"><label>首页公告（可空）</label><textarea id="sann" rows="3"></textarea></div>
    <div class="field"><label>允许访客投稿</label>
      <select id="sopen"><option value="1">允许</option><option value="0">关闭（只能改已有的书）</option></select>
    </div>
    <button class="btn pri" id="btnSaveCfg">保存设置</button>
  </div>
  <div class="panel">
    <h2 style="margin-top:0">全部书目 <span class="muted" id="cnt"></span></h2>
    <div style="overflow:auto"><table class="admin" id="tbl"></table></div>
  </div>
</div>`
  const script = `(function(){
  var key='';
  try{ key=localStorage.getItem('novel_admin_key')||'' }catch(e){}
  if(!key){ try{ key=sessionStorage.getItem('novel_admin')||'' }catch(e){} }
  try{ var mk=/[?&]k=([^&]+)/.exec(location.search); if(mk){ var qk=decodeURIComponent(mk[1]).trim(); if(qk) key=qk } }catch(e){}
  function remember(v){ try{ localStorage.setItem('novel_admin_key',v) }catch(e){} try{ sessionStorage.setItem('novel_admin',v) }catch(e){} }
  function forget(){ try{ localStorage.removeItem('novel_admin_key') }catch(e){} try{ sessionStorage.removeItem('novel_admin') }catch(e){} }
  function hdr(){ return {'x-admin-key':key} }
  function fmt(t){ if(!t) return '—'; var d=new Date(Number(t)); function p(n){return n<10?'0'+n:''+n}
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()) }
  function enter(){
    var typed=String(q('#akey').value||'').trim();
    if(typed) key=typed;
    if(!key) return toast('先填密钥','bad');
    call('/admin/login','POST',{key:key}).then(function(){
      remember(key);
      q('#login').style.display='none'; q('#panel').style.display='';
      refresh();
    }).catch(function(e){
      forget();
      key=''; q('#akey').value='';
      toast(e.message||'密钥不对','bad');
    });
  }
  q('#btnLogin').addEventListener('click',enter);
  q('#akey').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); enter() } });
  function refresh(){
    call('/admin/overview','GET',undefined,hdr()).then(function(d){
      var t=d.totals;
      q('#stats').innerHTML=
        '<div class="stat"><b>'+t.novels+'</b><span>本书</span></div>'+
        '<div class="stat"><b>'+t.chapters+'</b><span>章</span></div>'+
        '<div class="stat"><b>'+fmtNum(t.chars)+'</b><span>总字数</span></div>'+
        '<div class="stat"><b>'+d.authors+'</b><span>位作者</span></div>';
      q('#cnt').textContent='（'+d.novels.length+'）';
      var rows=d.novels.map(function(n){
        return '<tr><td class="t"><a href="/n/'+n.id+'"><b>'+esc(n.title)+'</b></a></td>'+
          '<td>'+esc(n.author||'佚名')+'</td>'+
          '<td>'+n.chapterCount+'</td><td>'+fmtNum(n.chars)+'</td>'+
          '<td class="muted">'+fmt(n.updatedAt)+'</td>'+
          '<td><a class="btn sm" href="/edit/'+n.id+'">改</a> '+
          '<a class="btn sm" href="/api/export/'+n.id+'">导出</a> '+
          '<button class="btn sm danger" data-del="'+n.id+'" data-t="'+esc(n.title)+'">删除</button></td></tr>';
      }).join('');
      q('#tbl').innerHTML='<thead><tr><th>书名</th><th>作者</th><th>章</th><th>字数</th><th>更新</th><th>操作</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="muted">还没有书</td></tr>')+'</tbody>';
      qa('[data-del]').forEach(function(b){
        b.addEventListener('click',function(){
          var id=b.getAttribute('data-del'), t=b.getAttribute('data-t');
          if(!window.confirm('删除《'+t+'》及其全部章节？')) return;
          call('/novel/'+id,'DELETE',null,{'x-admin-key':key}).then(function(){ toast('已删除','good'); refresh() })
            .catch(function(e){toast(e.message,'bad')});
        });
      });
      var c=d.config||{};
      q('#stitle').value=c.title||''; q('#ssub').value=c.subtitle||''; q('#sann').value=c.announcement||'';
      q('#sopen').value=c.allowPublicCreate===false?'0':'1';
    }).catch(function(e){
      toast(e.message,'bad');
      if(e.status===401||e.status===403){
        forget();
        key=''; q('#panel').style.display='none'; q('#login').style.display=''; q('#akey').focus();
      }
    });
  }
  q('#btnLogout').addEventListener('click',function(){
    forget(); key=''; q('#akey').value='';
    q('#panel').style.display='none'; q('#login').style.display=''; q('#akey').focus();
    toast('已退出后台','good');
  });
  q('#btnSaveCfg').addEventListener('click',function(){
    call('/admin/config','PUT',{title:q('#stitle').value.trim(),subtitle:q('#ssub').value.trim(),
      announcement:q('#sann').value.trim(),allowPublicCreate:q('#sopen').value==='1'},hdr())
      .then(function(){ toast('设置已保存','good'); setTimeout(function(){location.reload()},700) })
      .catch(function(e){toast(e.message,'bad')});
  });
  if(key){ enter() }
})();`
  return layout({ config, title: '管理', active: 'admin' }, body, script)
}

export function pageError(config, message, code) {
  const body = `<div class="empty" style="margin-top:40px"><b>${esc(code || 404)}</b>${esc(message || '没有这个页面')}
  <div style="margin-top:18px"><a class="btn" href="/">回书架</a></div></div>`
  return layout({ config, title: String(code || 404), active: '' }, body, '')
}

export function pageDownload(config) {
  const mirror = 'https://ghproxy.net/https://raw.githubusercontent.com/ChaJianUWU/novel-site/main/packages/novel-site-1.1.0-win.zip'
  const cdn = 'https://cdn.jsdelivr.net/gh/ChaJianUWU/novel-site@main/packages/novel-site-1.1.0-win.zip'
  const raw = 'https://github.com/ChaJianUWU/novel-site/raw/main/packages/novel-site-1.1.0-win.zip'
  const body = `
  <div class="card">
    <h2 style="margin:0 0 8px">把小说站搬到自己电脑上</h2>
    <p class="muted" style="margin:0 0 16px;line-height:1.9">
      这个压缩包就是本站的完整程序（Node 零依赖，约 45 KB）。下载解压 → 装 Node.js → 双击
      <code>windows\\一键启动.bat</code>，你自己的电脑上就会出现一个一模一样的小说站，
      <b>不需要 DeepSeek，不需要数据库，断网也能读</b>。想给朋友看，再双击 <code>windows\\一键公网.bat</code> 拿一个 https 网址。
    </p>
    <p style="margin:0 0 18px"><a class="btn" href="/download/pkg.zip">直接下载（走本站，网速最快）</a></p>
    <p class="muted" style="margin:0;line-height:2">
      本站没开或者打不开时，用下面的备用地址（三个都是同一个文件）：<br>
      · 国内镜像 <a href="${mirror}" target="_blank" rel="noreferrer">ghproxy</a><br>
      · CDN <a href="${cdn}" target="_blank" rel="noreferrer">jsDelivr</a><br>
      · GitHub <a href="${raw}" target="_blank" rel="noreferrer">原始地址</a>
    </p>
  </div>
  <div class="card">
    <h3 style="margin:0 0 10px">装好之后看这两份文档</h3>
    <ul class="muted" style="margin:0;line-height:2;padding-left:20px">
      <li><b>新手教程</b>：<a href="https://github.com/ChaJianUWU/novel-site/blob/main/docs/%E6%96%B0%E6%89%8B%E6%95%99%E7%A8%8B.md" target="_blank" rel="noreferrer">docs/新手教程.md</a>（压缩包里也有）</li>
      <li><b>怎么让别人打开</b>：<a href="https://github.com/ChaJianUWU/novel-site/blob/main/docs/%E4%B8%8A%E5%85%AC%E7%BD%91.md" target="_blank" rel="noreferrer">docs/上公网.md</a></li>
    </ul>
    <p class="muted" style="margin:14px 0 0">压缩包里的 <code>开始读我.txt</code> 是最短的三十秒版说明。</p>
  </div>`
  return layout({ config, title: '下载', active: '' }, body, '')
}

