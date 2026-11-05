// 公网站点 · Cloudflare Worker（Module 语法）
//
// 这个文件不是被 Node 引入的，而是被 lib/host.js 当文本读走、上传成 Cloudflare Worker 的源码。
// 上传时由宿主注入绑定：
//   SITE_DB   KV 命名空间（正文与索引都放这里）
//   SYNC_KEY  本地插件的同步密钥（有它 = 站长权限，可整站覆写）
//   SITE_TITLE 兜底站点名
//
// 站点行为：任何人可以上传/编辑，不需要登录，但「作者名」必填；
// 建书时服务器发一个 editKey，浏览器存在 localStorage 里，之后编辑/删章节凭它认人（不是账号体系）。

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache',
}
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const json = (data, status) => new Response(JSON.stringify(data), { status: status || 200, headers: JSON_HEADERS })
const fail = (message, status, extra) => json(Object.assign({ error: message }, extra || {}), status || 400)
const html = (body) => new Response(body, { headers: HTML_HEADERS })

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('')

const clamp = (s, n) => String(s === undefined || s === null ? '' : s).slice(0, n).trim()

// ---------- 存储 ----------

const readConfig = async (env) => {
  const c = await env.SITE_DB.get('config', 'json')
  return Object.assign({ title: env.SITE_TITLE || '小说站', subtitle: '', allowPublicCreate: true }, c || {})
}
const readIndex = async (env) => (await env.SITE_DB.get('index', 'json')) || []
const readNovel = async (env, id) => env.SITE_DB.get('novel:' + id, 'json')
const readChapter = async (env, id, cid) => env.SITE_DB.get('chapter:' + id + ':' + cid, 'json')
const putIndex = async (env, list) => env.SITE_DB.put('index', JSON.stringify(list))
const putNovel = async (env, novel) => env.SITE_DB.put('novel:' + novel.id, JSON.stringify(novel))
const putChapter = async (env, id, chapter) =>
  env.SITE_DB.put('chapter:' + id + ':' + chapter.id, JSON.stringify(chapter))

const pub = (novel) => ({
  id: novel.id,
  title: novel.title,
  author: novel.author,
  summary: novel.summary,
  createdAt: novel.createdAt,
  updatedAt: novel.updatedAt,
  chapters: novel.chapters || [],
})

const pubBrief = (novel) => ({
  id: novel.id,
  title: novel.title,
  author: novel.author,
  summary: novel.summary,
  updatedAt: novel.updatedAt,
  chapterCount: (novel.chapters || []).length,
})

async function upsertIndex(env, novel) {
  const list = await readIndex(env)
  const at = list.findIndex((n) => n.id === novel.id)
  if (at >= 0) list[at] = pubBrief(novel)
  else list.push(pubBrief(novel))
  await putIndex(env, list)
}

async function dropFromIndex(env, id) {
  const list = (await readIndex(env)).filter((n) => n.id !== id)
  await putIndex(env, list)
}

// ---------- 鉴权（无账号体系：站长密钥 / 书的 editKey） ----------

const isOwner = (req, env) => {
  const sent = req.headers.get('x-sync-key') || ''
  return Boolean(env.SYNC_KEY) && sent === env.SYNC_KEY
}

function keyMatches(req, novel, body) {
  const supplied = (body && body.editKey) || req.headers.get('x-edit-key') || ''
  return Boolean(novel.editKey) && supplied === novel.editKey
}

// ---------- 常规请求体 ----------

async function readBody(req) {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > 8 * 1024 * 1024) throw new Error('请求体过大（上限 8MB），请分章提交。')
  try {
    return await req.json()
  } catch {
    throw new Error('请求体不是合法 JSON。')
  }
}

function checkAuthor(author) {
  const a = clamp(author, 40)
  if (!a) throw new Error('作者名必须填写（留作者名是本站的规矩）。')
  return a
}

function checkTitle(title) {
  const t = clamp(title, 120)
  if (!t) throw new Error('书名不能为空。')
  return t
}

async function writeChapters(env, novelId, list) {
  const metas = []
  for (const raw of list) {
    const chapter = {
      id: raw.id || uid(),
      title: clamp(raw.title, 120) || '无题',
      content: String(raw.content || ''),
      updatedAt: Date.now(),
    }
    await putChapter(env, novelId, chapter)
    metas.push(chapter)
  }
  return metas
}

// ---------- API ----------

async function api(req, env, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const method = req.method.toUpperCase()
  const owner = isOwner(req, env)

  if (!env.SITE_DB) return fail('站点未绑定 KV（SITE_DB），请让插件重新发布。', 500)

  // GET /api/site
  if (parts[0] === 'site' && method === 'GET') {
    return json({ config: await readConfig(env), novels: await readIndex(env) })
  }

  // GET /api/novel/:id  ·  PUT /api/novel/:id  ·  DELETE /api/novel/:id
  if (parts[0] === 'novel' && parts[1]) {
    const id = parts[1]
    const novel = await readNovel(env, id)
    if (!novel) return fail('这本不存在（可能已被删除）。', 404)

    if (method === 'GET' && !parts[2]) return json({ novel: pub(novel) })

    // GET /api/novel/:id/:cid
    if (method === 'GET' && parts[2]) {
      const chapter = await readChapter(env, id, parts[2])
      if (!chapter) return fail('这一章不存在。', 404)
      const at = novel.chapters.findIndex((c) => c.id === parts[2])
      return json({
        chapter,
        prev: at > 0 ? novel.chapters[at - 1].id : null,
        next: at >= 0 && at + 1 < novel.chapters.length ? novel.chapters[at + 1].id : null,
        novel: { id: novel.id, title: novel.title, author: novel.author },
      })
    }

    if (method === 'PUT' && !parts[2]) {
      const body = await readBody(req)
      if (!owner && !keyMatches(req, novel, body)) return fail('没有这本书的编辑口令，改不了。', 403)
      if (body.title !== undefined) novel.title = checkTitle(body.title)
      if (body.author !== undefined) novel.author = checkAuthor(body.author)
      if (body.summary !== undefined) novel.summary = clamp(body.summary, 2000)
      if (Array.isArray(body.chapters)) novel.chapters = await writeChapters(env, id, body.chapters)
      novel.updatedAt = Date.now()
      await putNovel(env, novel)
      await upsertIndex(env, novel)
      return json({ ok: true, novel: pub(novel) })
    }

    if (method === 'DELETE' && !parts[2]) {
      const body = await readBody(req).catch(() => ({}))
      if (!owner && !keyMatches(req, novel, body)) return fail('没有这本书的编辑口令，删不了。', 403)
      await dropFromIndex(env, id)
      await env.SITE_DB.delete('novel:' + id)
      return json({ ok: true })
    }

    // 章节：POST /api/novel/:id/chapter  ·  PUT/DELETE /api/novel/:id/chapter/:cid
    if (parts[2] === 'chapter') {
      const body = await readBody(req)
      if (!owner && !keyMatches(req, novel, body)) return fail('没有这本书的编辑口令，改不了。', 403)

      if (method === 'POST') {
        const list = await writeChapters(env, id, [{ title: body.title, content: body.content }])
        novel.chapters.push(list[0])
        novel.updatedAt = Date.now()
        await putNovel(env, novel)
        await upsertIndex(env, novel)
        return json({ ok: true, chapter: { id: list[0].id, title: list[0].title } })
      }
      if (method === 'PUT' && parts[3]) {
        const at = novel.chapters.findIndex((c) => c.id === parts[3])
        if (at < 0) return fail('这一章不存在。', 404)
        const list = await writeChapters(env, id, [{ id: parts[3], title: body.title, content: body.content }])
        novel.chapters[at] = list[0]
        novel.updatedAt = Date.now()
        await putNovel(env, novel)
        await upsertIndex(env, novel)
        return json({ ok: true })
      }
      if (method === 'DELETE' && parts[3]) {
        novel.chapters = novel.chapters.filter((c) => c.id !== parts[3])
        novel.updatedAt = Date.now()
        await putNovel(env, novel)
        await upsertIndex(env, novel)
        await env.SITE_DB.delete('chapter:' + id + ':' + parts[3])
        return json({ ok: true })
      }
    }

    return fail('不支持的操作。', 405)
  }

  // POST /api/novel —— 任何人不登录就能发书
  if (parts[0] === 'novel' && !parts[1] && method === 'POST') {
    const config = await readConfig(env)
    if (!owner && config.allowPublicCreate === false) return fail('站长关闭了公开投递。', 403)
    const body = await readBody(req)
    const novel = {
      id: uid(),
      title: checkTitle(body.title),
      author: checkAuthor(body.author),
      summary: clamp(body.summary, 2000),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      editKey: rnd(),
      chapters: [],
    }
    const incoming = Array.isArray(body.chapters) && body.chapters.length
      ? body.chapters
      : [{ title: body.chapterTitle || '第一章', content: body.content || '' }]
    novel.chapters = await writeChapters(env, novel.id, incoming.filter((c) => String(c.content || '').trim() || c.title))
    await putNovel(env, novel)
    await upsertIndex(env, novel)
    return json({ ok: true, id: novel.id, editKey: novel.editKey })
  }

  // POST /api/keys —— 忘口令时凭书名+作者名找回（站点无账号，只在能对上时才认）
  if (parts[0] === 'keys' && method === 'POST') {
    const body = await readBody(req)
    const id = clamp(body.id, 40)
    const novel = id ? await readNovel(env, id) : null
    if (!novel) return fail('这本不存在。', 404)
    if (clamp(body.author, 40) !== novel.author) return fail('作者名对不上。', 403)
    return json({ ok: true, editKey: novel.editKey })
  }

  // POST /api/sync —— 本地插件整批推送（凭站长同步密钥）
  if (parts[0] === 'sync' && method === 'POST') {
    if (!isOwner(req, env)) return fail('同步密钥不对。', 403)
    const body = await readBody(req)
    if (body.config) {
      const config = await readConfig(env)
      await env.SITE_DB.put('config', JSON.stringify(Object.assign(config, {
        title: clamp(body.config.title, 120) || config.title,
        subtitle: clamp(body.config.subtitle, 200),
        allowPublicCreate: body.config.allowPublicCreate !== false,
      })))
    }
    const novels = Array.isArray(body.novels) ? body.novels : []
    const nextIndex = []
    for (const incoming of novels) {
      const id = clamp(incoming.id, 40) || uid()
      const existing = await readNovel(env, id)
      const novel = {
        id,
        title: checkTitle(incoming.title),
        author: checkAuthor(incoming.author),
        summary: clamp(incoming.summary, 2000),
        createdAt: existing ? existing.createdAt : Date.now(),
        updatedAt: Date.now(),
        // 已有的 editKey 必须保住，否则访客手里的稿子就再也改不了了
        editKey: existing && existing.editKey ? existing.editKey : (clamp(incoming.editKey, 64) || rnd()),
        chapters: await writeChapters(env, id, incoming.chapters || []),
      }
      await putNovel(env, novel)
      nextIndex.push(pubBrief(novel))
    }
    await putIndex(env, nextIndex)
    return json({ ok: true, count: novels.length })
  }

  return fail('没有这个接口。', 404)
}

// ---------- 前端应用 ----------

const APP_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小说站</title>
<style>
:root{color-scheme:light dark;--bg:#fbf9f5;--fg:#1f2328;--dim:#6b7280;--line:#e5e1d8;--card:#fff;--accent:#8a5a2b;--danger:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e6e3dd;--dim:#9aa4b2;--line:#2a2f36;--card:#1b1e23;--accent:#d7a86e;--danger:#e06c5b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.85 "Source Han Serif SC","Songti SC","Noto Serif CJK SC",Georgia,serif}
a{color:inherit;text-decoration:none}
.wrap{max-width:800px;margin:0 auto;padding:0 20px}
header.site{border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0;z-index:9}
header.site .wrap{display:flex;align-items:center;gap:14px;height:60px}
header.site b{font-size:17px}
header.site nav{margin-left:auto;display:flex;gap:14px;font-size:14px;color:var(--dim);font-family:system-ui,sans-serif}
header.site nav a:hover{color:var(--accent)}
h1{font-size:28px;line-height:1.35;margin:28px 0 6px}
.meta{color:var(--dim);font-size:14px;font-family:system-ui,sans-serif;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.intro{margin:14px 0 26px;color:var(--dim);font-family:system-ui,sans-serif;font-size:15px}
ul.books{list-style:none;padding:0;margin:22px 0 60px;display:grid;gap:14px}
ul.books li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
ul.books li:hover{border-color:var(--accent)}
ul.books h2{margin:0 0 4px;font-size:19px}
ul.books p{margin:6px 0 0;color:var(--dim);font-size:14px;font-family:system-ui,sans-serif}
ul.chapters{list-style:none;padding:0;margin:18px 0 40px;border-top:1px solid var(--line)}
ul.chapters li{border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
ul.chapters a{display:flex;flex:1;gap:12px;padding:13px 4px;align-items:baseline}
ul.chapters a:hover{color:var(--accent)}
ul.chapters span{color:var(--dim);font-size:13px;font-family:system-ui,sans-serif;margin-left:auto}
article.reader{padding:18px 0 60px}
article.reader h1{font-size:24px}
article.reader .body p{margin:0 0 1.05em}
.pager{display:flex;justify-content:space-between;gap:14px;border-top:1px solid var(--line);margin-top:36px;padding-top:16px;font-family:system-ui,sans-serif;font-size:14px}
.pager a{color:var(--accent)}
.empty{color:var(--dim);padding:60px 0;text-align:center;font-family:system-ui,sans-serif}
footer.site{border-top:1px solid var(--line);color:var(--dim);font-size:13px;font-family:system-ui,sans-serif;padding:18px 0 40px;margin-top:40px}
label{display:block;font-family:system-ui,sans-serif;font-size:13px;color:var(--dim);margin:16px 0 6px}
input,textarea,select{width:100%;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;font:inherit;font-family:system-ui,sans-serif}
textarea{min-height:180px;line-height:1.8;font-family:"Source Han Serif SC","Songti SC",Georgia,serif}
textarea.body{min-height:420px}
button{font-family:system-ui,sans-serif;font-size:14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:8px 14px;cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
button.ghost{border-color:transparent;color:var(--dim)}
button.danger{color:var(--danger);border-color:var(--danger)}
button:disabled{opacity:.55;cursor:default}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.row.end{justify-content:flex-end}
.hint{font-family:system-ui,sans-serif;font-size:12.5px;color:var(--dim);margin:6px 0 0}
.msg{font-family:system-ui,sans-serif;font-size:13.5px;margin:12px 0 0;padding:9px 12px;border-radius:8px;display:none}
.msg.ok{display:block;background:rgba(22,163,74,.12);color:#15803d}
.msg.err{display:block;background:rgba(180,35,24,.12);color:var(--danger)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:16px 0 40px}
.keys{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:var(--dim);word-break:break-all}
</style>
</head>
<body>
<header class="site"><div class="wrap">
  <b><a href="/" data-link>小说站</a></b>
  <nav><a href="/" data-link>书架</a><a href="/new" data-link>发布新书</a></nav>
</div></header>
<main class="wrap" id="root"></main>
<footer class="site"><div class="wrap">免登录写作 · 请务必署上作者名</div></footer>
<script>
(function () {
  var root = document.getElementById('root');
  var cache = { config: null, novels: [] };
  var esc = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var fmt = function (ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  var paras = function (text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      line = line.trim();
      if (!line) return '';
      return '<p>' + esc(line) + '</p>';
    }).join('');
  };
  var keys = function () {
    try { return JSON.parse(localStorage.getItem('novelShareKeys') || '{}'); } catch (e) { return {}; }
  };
  var setKey = function (id, k) {
    var all = keys(); all[id] = k;
    try { localStorage.setItem('novelShareKeys', JSON.stringify(all)); } catch (e) {}
  };
  var api = function (path, method, body) {
    return fetch('/api' + path, {
      method: method || 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ('请求失败 ' + r.status));
        return data;
      });
    });
  };
  var note = function (id, text, bad) {
    var box = document.getElementById(id);
    if (!box) return;
    box.textContent = text;
    box.className = 'msg ' + (bad ? 'err' : 'ok');
  };
  var go = function (path) {
    history.pushState({}, '', path);
    render();
  };

  function shell(title, body) {
    var conf = cache.config || { title: '小说站', subtitle: '' };
    document.title = title ? title + ' · ' + conf.title : conf.title;
    var brand = document.querySelector('header.site b a');
    if (brand) brand.textContent = conf.title || '小说站';
    var nav = document.querySelector('header.site nav');
    if (nav) {
      nav.innerHTML = '<a href="/" data-link>书架</a><a href="/new" data-link>发布新书</a>';
    }
    root.innerHTML = body;
  }

  function home() {
    return api('/site').then(function (data) {
      cache.config = data.config; cache.novels = data.novels;
      var list = data.novels.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      var items = list.length ? list.map(function (n) {
        return '<li><a href="/n/' + esc(n.id) + '" data-link><h2>' + esc(n.title) + '</h2>' +
          '<p>' + esc(n.author || '佚名') + ' · ' + (n.chapterCount || 0) + ' 章 · ' + esc(fmt(n.updatedAt)) + '</p>' +
          (n.summary ? '<p>' + esc(n.summary) + '</p>' : '') + '</a></li>';
      }).join('') : '<div class="empty">书架还空着，点右上角发布第一本。</div>';
      shell('', '<h1>' + esc(data.config.title || '小说站') + '</h1>' +
        '<div class="intro">' + esc(data.config.subtitle || '') + '</div>' +
        '<ul class="books">' + items + '</ul>');
    });
  }

  function novelPage(id) {
    return api('/novel/' + encodeURIComponent(id)).then(function (data) {
      var n = data.novel;
      cache.config = cache.config || { title: '小说站' };
      var mine = keys()[n.id];
      var chapters = n.chapters.map(function (c, i) {
        return '<li><a href="/read/' + esc(n.id) + '/' + esc(c.id) + '" data-link>' +
          esc(c.title || ('第' + (i + 1) + '章')) + '<span>' + esc(fmt(c.updatedAt)) + '</span></a></li>';
      }).join('');
      shell(n.title, '<h1>' + esc(n.title) + '</h1>' +
        '<div class="meta"><span>作者：' + esc(n.author) + '</span><span>更新：' + esc(fmt(n.updatedAt)) + '</span></div>' +
        (n.summary ? '<div class="intro">' + esc(n.summary) + '</div>' : '') +
        '<div class="row">' +
        (mine ? '<button class="primary" id="btn-edit">编辑这本书</button><button class="danger" id="btn-del">删除</button>' : '') +
        '<button id="btn-key">我有编辑口令</button></div>' +
        '<div class="msg" id="note"></div>' +
        '<ul class="chapters">' + (chapters || '<li><a href="#">还没有章节</a></li>') + '</ul>');
      var edit = document.getElementById('btn-edit');
      if (edit) edit.onclick = function () { go('/edit/' + n.id); };
      var del = document.getElementById('btn-del');
      if (del) del.onclick = function () {
        if (!confirm('删掉《' + n.title + '》和它的全部章节？')) return;
        api('/novel/' + n.id, 'DELETE', { editKey: keys()[n.id] })
          .then(function () { alert('已删除。'); go('/'); })
          .catch(function (e) { note('note', e.message, true); });
      };
      document.getElementById('btn-key').onclick = function () {
        var k = prompt('粘贴这本书的编辑口令（创建时那串字符）：');
        if (k) { setKey(n.id, k.trim()); alert('已记住，刷新后会出现编辑按钮。'); go('/n/' + n.id); }
      };
    });
  }

  function readPage(id, cid) {
    return api('/novel/' + encodeURIComponent(id) + '/' + encodeURIComponent(cid)).then(function (data) {
      var c = data.chapter, n = data.novel;
      shell(c.title, '<article class="reader"><h1>' + esc(c.title) + '</h1>' +
        '<div class="meta"><a href="/n/' + esc(n.id) + '" data-link>' + esc(n.title) + '</a><span>' + esc(n.author) + '</span></div>' +
        '<div class="body">' + paras(c.content) + '</div>' +
        '<div class="pager"><span>' + (data.prev ? '<a href="/read/' + esc(n.id) + '/' + esc(data.prev) + '" data-link>← 上一章</a>' : '') + '</span>' +
        '<a href="/n/' + esc(n.id) + '" data-link>目录</a>' +
        '<span>' + (data.next ? '<a href="/read/' + esc(n.id) + '/' + esc(data.next) + '" data-link>下一章 →</a>' : '') + '</span></div></article>');
    });
  }

  function countChapters(text) {
    var re = /^[\s　]*(第[0-9零一二三四五六七八九十百千两〇]+[章节回][^\n]{0,40})$/gm;
    var n = 0, m;
    while ((m = re.exec(String(text || ''))) !== null) n++;
    return n;
  }

  function splitChapters(text) {
    var re = /^[\s　]*(第[0-9零一二三四五六七八九十百千两〇]+[章节回][^\n]{0,40})$/gm;
    var out = [], last = null, m, mark;
    var src = String(text || '');
    var marks = [];
    while ((m = re.exec(src)) !== null) marks.push({ title: m[1].trim(), at: m.index, end: m.index + m[0].length });
    if (!marks.length) return [{ title: '正文', content: src.trim() }];
    if (marks[0].at > 0 && src.slice(0, marks[0].at).trim()) {
      out.push({ title: '楔子', content: src.slice(0, marks[0].at).trim() });
    }
    for (var i = 0; i < marks.length; i++) {
      mark = marks[i];
      var stop = i + 1 < marks.length ? marks[i + 1].at : src.length;
      out.push({ title: mark.title, content: src.slice(mark.end, stop).trim() });
    }
    return out;
  }

  function newPage() {
    shell('发布新书', '<h1>发布新书</h1>' +
      '<div class="card">' +
      '<label>书名</label><input id="f-title" placeholder="必填">' +
      '<label>作者名（必填，本站不给匿名稿）</label><input id="f-author" placeholder="笔名也算，但不能空">' +
      '<label>简介</label><textarea id="f-summary" style="min-height:90px"></textarea>' +
      '<label>正文（一次性贴进来，会自动按章节切开；只有一章也行）</label>' +
      '<textarea id="f-body" class="body" placeholder="第一章 ..."></textarea>' +
      '<p class="hint" id="f-count">识别到 0 章</p>' +
      '<div class="row end" style="margin-top:14px"><button class="primary" id="f-send">发布</button></div>' +
      '<div class="msg" id="note"></div></div>');
    var body = document.getElementById('f-body');
    var count = document.getElementById('f-count');
    body.oninput = function () {
      var n = countChapters(body.value);
      var parts = splitChapters(body.value);
      count.textContent = '识别到 ' + (n || 1) + ' 章，共 ' + parts.length + ' 段';
    };
    document.getElementById('f-send').onclick = function () {
      var btn = this;
      var payload = {
        title: document.getElementById('f-title').value,
        author: document.getElementById('f-author').value,
        summary: document.getElementById('f-summary').value,
        chapters: splitChapters(body.value)
      };
      if (!payload.author.trim()) { note('note', '作者名必须填。', true); return; }
      if (!payload.title.trim()) { note('note', '书名必须填。', true); return; }
      btn.disabled = true; btn.textContent = '提交中…';
      api('/novel', 'POST', payload).then(function (res) {
        setKey(res.id, res.editKey);
        alert('发布成功。编辑口令已存在本机浏览器里，换设备就得自己记着：' + res.editKey);
        go('/n/' + res.id);
      }).catch(function (e) {
        note('note', e.message, true);
        btn.disabled = false; btn.textContent = '发布';
      });
    };
  }

  function editPage(id) {
    return api('/novel/' + encodeURIComponent(id)).then(function (data) {
      var n = data.novel;
      var k = keys()[n.id];
      if (!k) {
        shell(n.title, '<h1>需要编辑口令</h1><div class="card"><p class="hint">这本书的编辑口令不在本机浏览器里。</p>' +
          '<label>编辑口令</label><input id="k-in"><div class="row end" style="margin-top:12px"><button class="primary" id="k-go">进入编辑</button></div></div>');
        document.getElementById('k-go').onclick = function () {
          var v = document.getElementById('k-in').value.trim();
          if (v) { setKey(n.id, v); go('/edit/' + n.id); }
        };
        return;
      }
      shell('编辑 ' + n.title, '<h1>编辑《' + esc(n.title) + '》</h1>' +
        '<div class="card"><div class="row"><span class="meta">作者：' + esc(n.author) + '</span>' +
        '<button id="m-save" class="primary" style="margin-left:auto">保存资料</button></div>' +
        '<label>书名</label><input id="m-title" value="' + esc(n.title) + '">' +
        '<label>作者名</label><input id="m-author" value="' + esc(n.author) + '">' +
        '<label>简介</label><textarea id="m-summary" style="min-height:90px">' + esc(n.summary || '') + '</textarea>' +
        '<div class="msg" id="note"></div></div>' +
        '<div class="card"><div class="row"><b>章节</b><button id="c-new" style="margin-left:auto">新增章节</button></div>' +
        '<ul class="chapters" id="c-list"></ul>' +
        '<label id="c-label">章节名</label><input id="c-title">' +
        '<label>正文</label><textarea id="c-body" class="body"></textarea>' +
        '<div class="row end" style="margin-top:12px"><button id="c-del" class="danger">删除本章</button>' +
        '<button id="c-save" class="primary">保存本章</button></div></div>');

      var state = { chapters: n.chapters.slice(), current: n.chapters.length ? n.chapters[0].id : null };
      var listEl = document.getElementById('c-list');
      var titleEl = document.getElementById('c-title');
      var bodyEl = document.getElementById('c-body');
      var labelEl = document.getElementById('c-label');

      function paintList() {
        listEl.innerHTML = state.chapters.length ? state.chapters.map(function (c) {
          var on = c.id === state.current ? ' style="color:var(--accent);font-weight:700"' : '';
          return '<li><a href="#" data-cid="' + esc(c.id) + '"' + on + '>' + esc(c.title) + '</a></li>';
        }).join('') : '<li><a href="#">还没有章节</a></li>';
      }
      function loadCurrent() {
        if (!state.current) { titleEl.value = ''; bodyEl.value = ''; return; }
        api('/novel/' + n.id + '/' + state.current).then(function (d) {
          titleEl.value = d.chapter.title; bodyEl.value = d.chapter.content;
        }).catch(function (e) { note('note', e.message, true); });
      }
      listEl.onclick = function (ev) {
        var a = ev.target.closest('a[data-cid]');
        if (!a) return;
        ev.preventDefault();
        state.current = a.getAttribute('data-cid');
        paintList(); loadCurrent();
      };
      document.getElementById('m-save').onclick = function () {
        api('/novel/' + n.id, 'PUT', {
          editKey: k,
          title: document.getElementById('m-title').value,
          author: document.getElementById('m-author').value,
          summary: document.getElementById('m-summary').value
        }).then(function () { note('note', '资料已保存。'); })
          .catch(function (e) { note('note', e.message, true); });
      };
      document.getElementById('c-new').onclick = function () {
        api('/novel/' + n.id + '/chapter', 'POST', { editKey: k, title: '新章节', content: '' })
          .then(function (res) {
            state.chapters.push({ id: res.chapter.id, title: res.chapter.title, updatedAt: Date.now() });
            state.current = res.chapter.id;
            paintList();
            titleEl.value = '新章节'; bodyEl.value = '';
            note('note', '已新增一章，写完点保存本章。');
          }).catch(function (e) { note('note', e.message, true); });
      };
      document.getElementById('c-save').onclick = function () {
        if (!state.current) { note('note', '先选一章。', true); return; }
        api('/novel/' + n.id + '/chapter/' + state.current, 'PUT', { editKey: k, title: titleEl.value, content: bodyEl.value })
          .then(function () {
            state.chapters = state.chapters.map(function (c) {
              return c.id === state.current ? Object.assign({}, c, { title: titleEl.value }) : c;
            });
            paintList(); note('note', '本章已保存。');
          }).catch(function (e) { note('note', e.message, true); });
      };
      document.getElementById('c-del').onclick = function () {
        if (!state.current || !confirm('删掉这一章？')) return;
        api('/novel/' + n.id + '/chapter/' + state.current, 'DELETE', { editKey: k })
          .then(function () {
            state.chapters = state.chapters.filter(function (c) { return c.id !== state.current; });
            state.current = state.chapters.length ? state.chapters[0].id : null;
            paintList(); loadCurrent(); note('note', '本章已删除。');
          }).catch(function (e) { note('note', e.message, true); });
      };
      paintList(); loadCurrent();
    });
  }

  function render() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var seg = path.split('/').filter(Boolean);
    var task;
    if (path === '/' || path === '') task = home();
    else if (seg[0] === 'new') task = Promise.resolve(newPage());
    else if (seg[0] === 'n' && seg[1]) task = novelPage(seg[1]);
    else if (seg[0] === 'read' && seg[1] && seg[2]) task = readPage(seg[1], seg[2]);
    else if (seg[0] === 'edit' && seg[1]) task = editPage(seg[1]);
    else task = Promise.resolve(shell('找不到页面', '<div class="empty">这一页不存在。<a href="/" data-link>回书架</a></div>'));
    Promise.resolve(task).catch(function (e) {
      shell('出错了', '<div class="empty">' + esc(e.message) + '<br><a href="/" data-link>回书架</a></div>');
    });
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('a[data-link]');
    if (!a) return;
    if (ev.metaKey || ev.ctrlKey) return;
    ev.preventDefault();
    go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', render);
  render();
})();
</script>
</body>
</html>`

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type,x-edit-key,x-sync-key',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
      })
    }
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url)
      if (url.pathname === '/healthz') return json({ ok: true })
      return html(APP_HTML)
    } catch (error) {
      const message = String((error && error.message) || error)
      if (url.pathname.startsWith('/api/')) return fail(message, 400)
      return new Response('服务器错误：' + message, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  },
}
