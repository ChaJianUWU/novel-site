// Netlify Functions（v2）入口：把请求原样交给 site-core.js，存储换成 Netlify Blobs。
// 这样整站不需要任何常开的机器，Netlify 托管运行，电脑关机照样能开。
import { getStore } from '@netlify/blobs'
import worker from '../../site-core.js'
import seed from '../../seed/kv.json'

const STORE_NAME = 'novel-site'

// 首次运行时把仓库里的 seed/kv.json 灌进云端存储，之后云端就是唯一的数据源。
// 这样部署完不需要任何手工配置，小说和编辑口令都原样保留。
let seedDone = false
async function ensureSeed(store) {
  if (seedDone) return
  try {
    const has = await store.get('index', { type: 'text' })
    if (has) { seedDone = true; return }
    for (const [k, v] of Object.entries(seed)) {
      await store.set(k, typeof v === 'string' ? v : JSON.stringify(v))
    }
    seedDone = true
  } catch {
    // 存储暂时不可用时静默跳过，下个请求再试
  }
}

function makeKV(store) {
  return {
    async get(key, type) {
      const value = await store.get(key, { type: 'text' })
      if (value === null || value === undefined) return null
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
      await store.set(key, String(value))
    },
    async delete(key) {
      await store.delete(key)
    },
    async list(options) {
      const prefix = (options && options.prefix) || ''
      const keys = []
      let cursor
      do {
        const page = await store.list({ prefix, cursor })
        for (const blob of page.blobs || []) keys.push({ name: blob.key })
        cursor = page.cursor
      } while (cursor)
      return { keys, list_complete: true }
    },
  }
}

export default async function handler(request) {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' })
  await ensureSeed(store)
  const env = {
    SITE_DB: makeKV(store),
    SYNC_KEY: process.env.SYNC_KEY || '',
    ADMIN_KEY: process.env.ADMIN_KEY || '',
    SITE_TITLE: process.env.SITE_TITLE || '小说站',
  }
  return worker.fetch(request, env)
}
