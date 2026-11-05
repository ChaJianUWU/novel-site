// 公网小说站 · 自建版（Node 18+，零依赖）
//
// 和 Cloudflare 版跑的是同一份站点代码（site-core.js），只是把 KV 换成本地文件，
// 这样能扔到任何支持 Node 或 Docker 的地方：Render / Koyeb / Zeabur / 自己的 VPS。
//
// 环境变量：
//   PORT       监听端口（平台一般会自己注入）
//   DATA_DIR   数据目录，默认 ./data（要挂持久卷就把这里指到挂载点）
//   SYNC_KEY   站长同步密钥；不填就自动生成一个存到 DATA_DIR/sync-key.txt
//   ADMIN_KEY  管理员密钥（/admin 后台）；不填就自动生成到 DATA_DIR/admin-key.txt
//   SITE_TITLE 站点兜底标题

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data')
const KV_FILE = join(DATA_DIR, 'kv.json')
const KEY_FILE = join(DATA_DIR, 'sync-key.txt')
const CORE_FILE = process.env.CORE_FILE || join(ROOT, 'site-core.js')
const PORT = Number(process.env.PORT || 8787)

// ---------- 文件版 KV（接口对齐 Cloudflare KV 用到的部分） ----------

let store = {}
let ready = null
let queue = Promise.resolve()

const load = () => {
  if (ready) return ready
  ready = (async () => {
    await mkdir(DATA_DIR, { recursive: true })
    try {
      const raw = await readFile(KV_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      store = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      store = {}
    }
  })()
  return ready
}

const flush = () => {
  const snapshot = JSON.stringify(store)
  queue = queue
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true })
      const tmp = KV_FILE + '.tmp'
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, KV_FILE)
    })
    .catch((error) => console.error('[kv] 落盘失败：', error && error.message))
  return queue
}

const KV = {
  async get(key, type) {
    await load()
    if (!Object.prototype.hasOwnProperty.call(store, key)) return null
    const value = store[key]
    if (type === 'json') {
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    }
    return value
  },
  async put(key, value) {
    await load()
    store[key] = String(value)
    await flush()
  },
  async delete(key) {
    await load()
    delete store[key]
    await flush()
  },
  async list(options) {
    await load()
    const prefix = (options && options.prefix) || ''
    const keys = Object.keys(store)
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }))
    return { keys, list_complete: true }
  },
}

// ---------- 同步密钥 ----------

const cryptoRandom = () =>
  Array.from(webcrypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')

async function resolveSyncKey() {
  const fromEnv = String(process.env.SYNC_KEY || '').trim()
  if (fromEnv) return fromEnv
  await mkdir(DATA_DIR, { recursive: true })
  try {
    const saved = (await readFile(KEY_FILE, 'utf8')).trim()
    if (saved) return saved
  } catch {}
  const generated = cryptoRandom()
  await writeFile(KEY_FILE, generated + '\n', 'utf8')
  return generated
}

// ---------- 站长（管理员）密钥 ----------

const ADMIN_FILE = join(DATA_DIR, 'admin-key.txt')

async function resolveAdminKey() {
  const fromEnv = String(process.env.ADMIN_KEY || '').trim()
  if (fromEnv) return fromEnv
  await mkdir(DATA_DIR, { recursive: true })
  try {
    const saved = (await readFile(ADMIN_FILE, 'utf8')).trim()
    if (saved) return saved
  } catch {}
  const generated = cryptoRandom()
  await writeFile(ADMIN_FILE, generated + '\n', 'utf8')
  return generated
}

// ---------- 载入站点核心（标准 ESM 模块，支持 import） ----------

const worker = (await import(pathToFileURL(CORE_FILE).href)).default
if (!worker || typeof worker.fetch !== 'function') {
  throw new Error('站点核心没有导出 fetch：' + CORE_FILE)
}

const SYNC_KEY = await resolveSyncKey()
const ADMIN_KEY = await resolveAdminKey()
const env = {
  SITE_DB: KV,
  SYNC_KEY,
  ADMIN_KEY,
  SITE_TITLE: process.env.SITE_TITLE || '小说站',
}

// ---------- HTTP ----------

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length'])

const server = createServer(async (req, res) => {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? Buffer.concat(chunks) : null

    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
    const host = req.headers.host || 'localhost'
    const url = proto + '://' + host + (req.url || '/')

    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      if (HOP.has(name.toLowerCase())) continue
      try {
        headers.set(name, Array.isArray(value) ? value.join(',') : String(value))
      } catch {}
    }

    const method = (req.method || 'GET').toUpperCase()
    const request = new Request(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body || undefined,
    })

    const response = await worker.fetch(request, env)
    const payload = Buffer.from(await response.arrayBuffer())

    const out = {}
    response.headers.forEach((value, name) => {
      if (!HOP.has(name.toLowerCase())) out[name] = value
    })
    out['content-length'] = String(payload.length)
    res.writeHead(response.status, out)
    res.end(payload)
  } catch (error) {
    const message = String((error && error.stack) || error)
    console.error('[http]', message)
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end('服务器错误：' + String((error && error.message) || error))
  }
})

server.listen(PORT, () => {
  console.log('小说站已启动：http://127.0.0.1:' + PORT)
  console.log('数据目录：' + DATA_DIR)
  console.log('同步密钥：' + SYNC_KEY)
  console.log('管理员密钥：' + ADMIN_KEY)
  console.log('后台 /admin 用管理员密钥进入；单本书的编辑口令在创建时发给作者。')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    try {
      await queue
    } catch {}
    process.exit(0)
  })
}
