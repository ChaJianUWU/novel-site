// 小说站核心：路由 + API + 页面渲染
//
// 运行环境：Node（server.mjs 动态 import）或 Cloudflare Worker。
// 存储：env.SITE_DB（KV 风格：get/put/delete/list）
//
// KV 键（必须与旧数据兼容，勿改）：
//   config                站点配置
//   index                 { novels: [书目摘要...] }
//   novel:<id>            书元信息 + 章节目录（不含正文）
//   chapter:<id>:<cid>    单章正文
//
// 写入鉴权：x-edit-key（该书口令）或 x-admin-key（站长密钥），也接受 body.key。

import { countChars, normalizeText, novelToText, previewChapters, splitChapters } from './txt.js'
import {
  esc,
  fmtNum,
  fmtTime,
  layout,
  pageAdmin,
  pageEdit,
  pageError,
  pageHome,
  pageNovel,
  pageReader,
  pageUpload,
} from './ui.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
const MAX_TEXT = 5 * 1024 * 1024
const MAX_CHAPTERS = 400

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: JSON_HEADERS })
}

function text(body, status, headers) {
  return new Response(body, { status: status || 200, headers: Object.assign({}, HTML_HEADERS, headers || {}) })
}

function rnd(n) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  let out = ''
  const g = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(n)) : null
  for (let i = 0; i < n; i += 1) {
    const v = g ? g[i] : Math.floor(Math.random() * 256)
    out += alphabet[v % 36]
  }
  return out
}

function now() {
  return Date.now()
}

// ---------------- 存储层 ----------------

async function readConfig(env) {
  const cfg = (await env.SITE_DB.get('config', 'json')) || {}
  return {
    title: cfg.title || env.SITE_TITLE || '我的小说站',
    subtitle: cfg.subtitle || '免登录写作，署上你的名字',
    announcement: cfg.announcement || '',
    allowPublicCreate: cfg.allowPublicCreate === false ? false : true,
    updatedAt: cfg.updatedAt || 0,
  }
}

async function writeConfig(env, patch) {
  const cur = (await env.SITE_DB.get('config', 'json')) || {}
  const next = Object.assign({}, cur, patch, { updatedAt: now() })
  await env.SITE_DB.put('config', JSON.stringify(next))
  return next
}

async function readIndex(env) {
  const idx = (await env.SITE_DB.get('index', 'json')) || null
  if (idx && Array.isArray(idx.novels)) return idx
  return rebuildIndex(env)
}

async function rebuildIndex(env) {
  const novels = []
  let cursor
  do {
    const page = await env.SITE_DB.list({ prefix: 'novel:' })
    for (const key of page.keys || []) {
      const meta = await env.SITE_DB.get(key.name, 'json')
      if (meta) novels.push(summaryOf(meta))
    }
    cursor = page.cursor
    if (page.list_complete || !page.cursor) break
  } while (cursor)
  novels.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const idx = { novels, updatedAt: now() }
  await env.SITE_DB.put('index', JSON.stringify(idx))
  return idx
}

function summaryOf(meta) {
  const chapters = Array.isArray(meta.chapters) ? meta.chapters : []
  return {
    id: meta.id,
    title: meta.title,
    author: meta.author || '佚名',
    summary: meta.summary || '',
    chapterCount: chapters.length,
    chars: chapters.reduce((sum, c) => sum + (Number(c.chars) || 0), 0),
    createdAt: meta.createdAt || 0,
    updatedAt: meta.updatedAt || 0,
  }
}

async function readNovel(env, id) {
  if (!id) return null
  const meta = await env.SITE_DB.get('novel:' + id, 'json')
  if (!meta) return null
  if (!Array.isArray(meta.chapters)) meta.chapters = []
  return meta
}

async function putNovel(env, novel) {
  novel.updatedAt = now()
  if (!novel.createdAt) novel.createdAt = novel.updatedAt
  await env.SITE_DB.put('novel:' + novel.id, JSON.stringify(novel))
  const idx = (await env.SITE_DB.get('index', 'json')) || { novels: [] }
  const list = (idx.novels || []).filter((n) => n.id !== novel.id)
  list.push(summaryOf(novel))
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  await env.SITE_DB.put('index', JSON.stringify({ novels: list, updatedAt: now() }))
  return novel
}

async function deleteNovelDeep(env, novel) {
  for (const c of novel.chapters || []) {
    await env.SITE_DB.delete('chapter:' + novel.id + ':' + c.id)
  }
  await env.SITE_DB.delete('novel:' + novel.id)
  const idx = (await env.SITE_DB.get('index', 'json')) || { novels: [] }
  const list = (idx.novels || []).filter((n) => n.id !== novel.id)
  await env.SITE_DB.put('index', JSON.stringify({ novels: list, updatedAt: now() }))
}

async function readChapter(env, novelId, cid) {
  return (await env.SITE_DB.get('chapter:' + novelId + ':' + cid, 'json')) || null
}

async function putChapter(env, novelId, chapter) {
  await env.SITE_DB.put('chapter:' + novelId + ':' + chapter.id, JSON.stringify(chapter))
  return chapter
}

async function deleteChapterKey(env, novelId, cid) {
  await env.SITE_DB.delete('chapter:' + novelId + ':' + cid)
}

// ---------------- 鉴权 ----------------

function adminKeyOf(env) {
  return env.ADMIN_KEY || env.SYNC_KEY || ''
}

function providedKeys(request, body) {
  const h = request.headers
  return {
    editKey: (h.get('x-edit-key') || (body && body.key) || '').trim(),
    adminKey: (h.get('x-admin-key') || (body && body.adminKey) || (body && body.key) || '').trim(),
  }
}

function isAdmin(env, request, body) {
  const admin = adminKeyOf(env)
  const provided = providedKeys(request, body)
  return !!admin && provided.adminKey === admin
}

function assertCanEdit(env, request, body, novel) {
  if (isAdmin(env, request, body)) return
  const key = providedKeys(request, body).editKey
  if (key && novel && key === novel.editKey) return
  throw new HttpError(403, novel && novel.editKey ? '编辑口令不对（创建时给你的那串 18 位）' : '这本书没有设置编辑口令，用管理员密钥改')
}

// ---------------- 字段校验 ----------------

function cleanTitle(value) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  if (!s) throw new HttpError(400, '书名必须填写')
  return s.slice(0, 60)
}

function cleanAuthor(value) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  if (!s) throw new HttpError(400, '作者名必须填写（留作者名是本站的规矩）。')
  return s.slice(0, 30)
}

function cleanSummary(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, 300)
}

function newChapter(title, content) {
  const body = normalizeText(content || '')
  return {
    id: rnd(12),
    title: String(title || '').trim().slice(0, 80) || '未命名',
    content: body,
    chars: countChars(body),
    updatedAt: now(),
  }
}

// 把 [ {title, content} ] 落成真章节（写正文 + 更新目录）
async function appendChapters(env, novel, list) {
  const created = []
  for (const item of list.slice(0, MAX_CHAPTERS)) {
    const ch = newChapter(item.title, item.content)
    if (!ch.chars && !String(ch.title || '').trim()) continue
    await putChapter(env, novel.id, ch)
    novel.chapters.push({ id: ch.id, title: ch.title, chars: ch.chars, updatedAt: ch.updatedAt })
    created.push({ id: ch.id, title: ch.title, chars: ch.chars })
  }
  return created
}

function metaOfNovel(novel) {
  return {
    id: novel.id,
    title: novel.title,
    author: novel.author || '佚名',
    summary: novel.summary || '',
    chapterCount: novel.chapters.length,
    chars: novel.chapters.reduce((s, c) => s + (Number(c.chars) || 0), 0),
    createdAt: novel.createdAt || 0,
    updatedAt: novel.updatedAt || 0,
    chapters: novel.chapters,
  }
}

// ---------------- API ----------------

async function readBody(request) {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      return await request.json()
    } catch (e) {
      throw new HttpError(400, '请求体不是合法 JSON')
    }
  }
  const raw = await request.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new HttpError(400, '请求体不是合法 JSON')
  }
}

async function handleApi(request, env, url, parts) {
  const method = request.method.toUpperCase()
  const config = await readConfig(env)

  // ---- 站点信息 ----
  if (parts[0] === 'site' && parts.length === 1 && method === 'GET') {
    const idx = await readIndex(env)
    return json({ config, count: idx.novels.length, novels: idx.novels })
  }
  if (parts[0] === 'novels' && parts.length === 1 && method === 'GET') {
    const idx = await readIndex(env)
    return json({ novels: idx.novels })
  }

  // ---- 分章预览（不写库）----
  if (parts[0] === 'split' && method === 'POST') {
    const body = await readBody(request)
    const src = String(body.text || '')
    if (!src.trim()) throw new HttpError(400, '没有正文')
    if (src.length > MAX_TEXT) throw new HttpError(413, '文本太大（上限 5MB）')
    const chapters = previewChapters(src, { targetSize: body.targetSize })
    return json({ chars: countChars(src), chapters })
  }

  // ---- 新建（可带正文自动分章）----
  if (parts[0] === 'import' && parts.length === 1 && method === 'POST') {
    if (config.allowPublicCreate === false) throw new HttpError(403, '站长暂时关闭了公开投稿')
    const body = await readBody(request)
    const title = cleanTitle(body.title)
    const author = cleanAuthor(body.author)
    const summary = cleanSummary(body.summary)
    const src = String(body.text || '')
    if (!src.trim()) throw new HttpError(400, '正文是空的')
    if (src.length > MAX_TEXT) throw new HttpError(413, '文本太大（上限 5MB）')
    const list = splitChapters(src, { targetSize: body.targetSize })
    if (!list.length) throw new HttpError(400, '分不出章节，检查一下文本')
    const novel = {
      id: rnd(12),
      title,
      author,
      summary,
      editKey: rnd(18),
      chapters: [],
      createdAt: now(),
      updatedAt: now(),
    }
    await appendChapters(env, novel, list)
    await putNovel(env, novel)
    return json({ id: novel.id, title: novel.title, editKey: novel.editKey, chapterCount: novel.chapters.length, chars: metaOfNovel(novel).chars })
  }

  if (parts[0] === 'novel' && parts.length === 1 && method === 'POST') {
    if (config.allowPublicCreate === false) throw new HttpError(403, '站长暂时关闭了公开投稿')
    const body = await readBody(request)
    const novel = {
      id: rnd(12),
      title: cleanTitle(body.title),
      author: cleanAuthor(body.author),
      summary: cleanSummary(body.summary),
      editKey: rnd(18),
      chapters: [],
      createdAt: now(),
      updatedAt: now(),
    }
    if (body.text && String(body.text).trim()) {
      await appendChapters(env, novel, splitChapters(String(body.text)))
    } else if (body.content && String(body.content).trim()) {
      await appendChapters(env, novel, [{ title: body.chapterTitle || '第一章', content: String(body.content) }])
    }
    await putNovel(env, novel)
    return json({ id: novel.id, title: novel.title, editKey: novel.editKey, chapterCount: novel.chapters.length })
  }

  // ---- 口令找回 ----
  if (parts[0] === 'keys') {
    const body = method === 'POST' ? await readBody(request) : {}
    const title = (method === 'GET' ? url.searchParams.get('title') : body.title) || ''
    const author = (method === 'GET' ? url.searchParams.get('author') : body.author) || ''
    if (!title || !author) throw new HttpError(400, '要书名和作者名都一致才能找回')
    const idx = await readIndex(env)
    const hit = idx.novels.find((n) => n.title === title.trim() && n.author === author.trim())
    if (!hit) throw new HttpError(404, '没有完全对上的书（书名、作者都要一字不差）')
    const novel = await readNovel(env, hit.id)
    return json({ id: hit.id, editKey: novel.editKey || '' })
  }

  // ---- 管理员 ----
  if (parts[0] === 'admin') {
    if (parts[1] === 'login' && method === 'POST') {
      const body = await readBody(request)
      if (!isAdmin(env, request, body)) throw new HttpError(403, '密钥不对')
      return json({ ok: true })
    }
    if (!isAdmin(env, request, {})) throw new HttpError(403, '密钥不对')
    if (parts[1] === 'overview' && method === 'GET') {
      const idx = await readIndex(env)
      const authors = new Set(idx.novels.map((n) => n.author || '佚名'))
      const totals = {
        novels: idx.novels.length,
        chapters: idx.novels.reduce((s, n) => s + (n.chapterCount || 0), 0),
        chars: idx.novels.reduce((s, n) => s + (n.chars || 0), 0),
      }
      return json({ config, novels: idx.novels, totals, authors: authors.size })
    }
    if (parts[1] === 'config' && method === 'PUT') {
      const body = await readBody(request)
      const patch = {}
      if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 40) || '我的小说站'
      if (body.subtitle !== undefined) patch.subtitle = String(body.subtitle).trim().slice(0, 80)
      if (body.announcement !== undefined) patch.announcement = String(body.announcement).trim().slice(0, 500)
      if (body.allowPublicCreate !== undefined) patch.allowPublicCreate = !!body.allowPublicCreate
      const next = await writeConfig(env, patch)
      return json({ config: await readConfig(env), raw: next })
    }
    if (parts[1] === 'rebuild' && method === 'POST') {
      const idx = await rebuildIndex(env)
      return json({ count: idx.novels.length })
    }
    throw new HttpError(404, '没有这个管理接口')
  }

  // ---- 同步（部署端 -> 本站）----
  if (parts[0] === 'sync' && method === 'POST') {
    const expect = env.SYNC_KEY || ''
    const got = request.headers.get('x-sync-key') || ''
    if (expect && got !== expect) throw new HttpError(401, '同步密钥不对')
    const body = await readBody(request)
    if (body.config) await writeConfig(env, body.config)
    const incoming = Array.isArray(body.novels) ? body.novels : []
    const keep = new Set()
    let count = 0
    for (const src of incoming) {
      const id = String(src.id || '').trim() || rnd(12)
      const meta = await readNovel(env, id)
      const novel = meta || { id, chapters: [], createdAt: now(), updatedAt: now() }
      novel.title = cleanTitle(src.title || novel.title || '未命名')
      novel.author = cleanAuthor(src.author || novel.author || '佚名')
      novel.summary = cleanSummary(src.summary !== undefined ? src.summary : novel.summary)
      if (!novel.editKey || src.editKey) novel.editKey = String(src.editKey || novel.editKey || rnd(18))
      const had = new Set((novel.chapters || []).map((c) => c.id))
      novel.chapters = []
      for (const c of Array.isArray(src.chapters) ? src.chapters : []) {
        const cid = String(c.id || '').trim() || rnd(12)
        const chapter = {
          id: cid,
          title: String(c.title || '未命名').slice(0, 80),
          content: normalizeText(c.content || ''),
          chars: countChars(c.content || ''),
          updatedAt: Number(c.updatedAt) || now(),
        }
        await putChapter(env, novel.id, chapter)
        novel.chapters.push({ id: cid, title: chapter.title, chars: chapter.chars, updatedAt: chapter.updatedAt })
      }
      // 清掉本次没出现的旧章节
      for (const old of had) {
        if (!novel.chapters.some((c) => c.id === old)) await deleteChapterKey(env, novel.id, old)
      }
      await putNovel(env, novel)
      keep.add(novel.id)
      count += 1
    }
    // 同步是「以远端为准」，本地多出来的书删掉
    const idx = await readIndex(env)
    for (const n of idx.novels) {
      if (keep.has(n.id)) continue
      const stale = await readNovel(env, n.id)
      if (stale) await deleteNovelDeep(env, stale)
    }
    return json({ count })
  }

  // ---- 单本 ----
  if (parts[0] === 'novel' && parts.length >= 2) {
    const id = parts[1]
    const novel = await readNovel(env, id)
    if (!novel) throw new HttpError(404, '这本书不存在')

    if (parts.length === 2) {
      if (method === 'GET') return json({ novel: metaOfNovel(novel), editable: !!novel.editKey })
      if (method === 'PUT') {
        const body = await readBody(request)
        assertCanEdit(env, request, body, novel)
        if (body.title !== undefined) novel.title = cleanTitle(body.title)
        if (body.author !== undefined) novel.author = cleanAuthor(body.author)
        if (body.summary !== undefined) novel.summary = cleanSummary(body.summary)
        await putNovel(env, novel)
        return json({ novel: metaOfNovel(novel) })
      }
      if (method === 'DELETE') {
        const body = await readBody(request).catch(() => ({}))
        assertCanEdit(env, request, body, novel)
        await deleteNovelDeep(env, novel)
        return json({ ok: true })
      }
    }

    // 追加导入
    if (parts[2] === 'import' && method === 'POST') {
      const body = await readBody(request)
      assertCanEdit(env, request, body, novel)
      const src = String(body.text || '')
      if (!src.trim()) throw new HttpError(400, '没有内容')
      if (src.length > MAX_TEXT) throw new HttpError(413, '文本太大（上限 5MB）')
      const list = splitChapters(src, { targetSize: body.targetSize })
      if (!list.length) throw new HttpError(400, '分不出章节')
      const created = await appendChapters(env, novel, list)
      await putNovel(env, novel)
      return json({ added: created.length, chapters: created })
    }

    // /novel/:id/chapter
    if (parts[2] === 'chapter') {
      if (parts.length === 3 && method === 'POST') {
        const body = await readBody(request)
        assertCanEdit(env, request, body, novel)
        const ch = newChapter(body.title || '新章节', body.content || '')
        await putChapter(env, novel.id, ch)
        novel.chapters.push({ id: ch.id, title: ch.title, chars: ch.chars, updatedAt: ch.updatedAt })
        await putNovel(env, novel)
        return json({ chapter: { id: ch.id, title: ch.title, chars: ch.chars } })
      }
      const cid = parts[3]
      if (cid) {
        const existing = await readChapter(env, novel.id, cid)
        if (!existing) throw new HttpError(404, '这一章不存在')
        if (method === 'GET') return json({ chapter: existing })
        if (method === 'PUT') {
          const body = await readBody(request)
          assertCanEdit(env, request, body, novel)
          if (body.title !== undefined) existing.title = String(body.title).trim().slice(0, 80) || existing.title
          if (body.content !== undefined) {
            existing.content = normalizeText(body.content)
            existing.chars = countChars(existing.content)
          }
          existing.updatedAt = now()
          await putChapter(env, novel.id, existing)
          const slot = novel.chapters.find((c) => c.id === cid)
          if (slot) {
            slot.title = existing.title
            slot.chars = existing.chars
            slot.updatedAt = existing.updatedAt
          }
          await putNovel(env, novel)
          return json({ chapter: { id: cid, title: existing.title, chars: existing.chars } })
        }
        if (method === 'DELETE') {
          const body = await readBody(request).catch(() => ({}))
          assertCanEdit(env, request, body, novel)
          await deleteChapterKey(env, novel.id, cid)
          novel.chapters = novel.chapters.filter((c) => c.id !== cid)
          await putNovel(env, novel)
          return json({ ok: true })
        }
      }
    }

    // /novel/:id/:cid 读正文（旧接口）
    if (parts.length === 3 && method === 'GET') {
      const ch = await readChapter(env, novel.id, parts[2])
      if (!ch) throw new HttpError(404, '这一章不存在')
      return json({ chapter: ch, novel: { id: novel.id, title: novel.title, author: novel.author } })
    }
  }

  // ---- 导出 ----
  if (parts[0] === 'export' && parts[1] && method === 'GET') {
    const novel = await readNovel(env, parts[1])
    if (!novel) throw new HttpError(404, '这本书不存在')
    const chapters = []
    for (const c of novel.chapters) {
      const body = await readChapter(env, novel.id, c.id)
      chapters.push({ title: c.title, content: body ? body.content : '' })
    }
    const name = encodeURIComponent((novel.title || 'novel') + '.txt')
    return new Response(novelToText(novel, chapters), {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': "attachment; filename*=UTF-8''" + name,
        'cache-control': 'no-store',
      },
    })
  }

  throw new HttpError(404, '没有这个接口')
}

// ---------------- 页面 ----------------

async function handlePage(env, url, parts) {
  const config = await readConfig(env)

  if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
    const idx = await readIndex(env)
    const q = (url.searchParams.get('q') || '').trim()
    let novels = idx.novels
    if (q) {
      const low = q.toLowerCase()
      novels = novels.filter((n) =>
        (n.title + ' ' + (n.author || '') + ' ' + (n.summary || '')).toLowerCase().includes(low),
      )
    }
    return text(pageHome(config, novels, q))
  }

  if (parts[0] === 'upload') return text(pageUpload(config))
  if (parts[0] === 'admin') return text(pageAdmin(config))

  if (parts[0] === 'n' && parts[1]) {
    const novel = await readNovel(env, parts[1])
    if (!novel) return text(pageError(config, '这本书不在了', 404), 404)
    return text(pageNovel(config, metaOfNovel(novel)))
  }

  if (parts[0] === 'edit' && parts[1]) {
    const novel = await readNovel(env, parts[1])
    if (!novel) return text(pageError(config, '这本书不在了', 404), 404)
    return text(pageEdit(config, metaOfNovel(novel)))
  }

  if (parts[0] === 'r' && parts[1] && parts[2]) {
    const novel = await readNovel(env, parts[1])
    if (!novel) return text(pageError(config, '这本书不在了', 404), 404)
    const idx = novel.chapters.findIndex((c) => c.id === parts[2])
    if (idx < 0) return text(pageError(config, '这一章不在了', 404), 404)
    const chapter = await readChapter(env, novel.id, parts[2])
    if (!chapter) return text(pageError(config, '这一章还没写正文', 404), 404)
    return text(
      pageReader(config, {
        novel: { id: novel.id, title: novel.title, author: novel.author },
        chapter: { id: chapter.id, title: chapter.title, content: chapter.content, chars: chapter.chars },
        prev: idx > 0 ? novel.chapters[idx - 1].id : '',
        next: idx + 1 < novel.chapters.length ? novel.chapters[idx + 1].id : '',
      }),
    )
  }

  return text(pageError(config, '没有这个页面', 404), 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const parts = path.split('/').filter(Boolean)

    try {
      if (path === '/healthz') return json({ ok: true })
      if (parts[0] === 'api') return await handleApi(request, env, url, parts.slice(1))
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, '不支持的方法')
      return await handlePage(env, url, parts)
    } catch (err) {
      if (err instanceof HttpError) {
        if (parts[0] === 'api') return json({ error: err.message }, err.status)
        return text(pageError(await readConfig(env), err.message, err.status), err.status)
      }
      console.error('[site] 处理失败', err)
      if (parts[0] === 'api') return json({ error: '服务器出错了：' + (err && err.message ? err.message : String(err)) }, 500)
      return text(pageError({ title: '小说站' }, '服务器出错了', 500), 500)
    }
  },
}
