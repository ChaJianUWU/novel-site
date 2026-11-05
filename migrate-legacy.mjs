// 一次性迁移：把旧版 novel:<id> 里内嵌的章节正文搬到 chapter:<id>:<cid>，
// 目录只留 {id,title,chars,updatedAt}，并把 index 从「裸数组」升级成 {novels:[...]}。
// 幂等，可以重复跑。
//
// 用法：node migrate-legacy.mjs [DATA_DIR]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countChars } from './txt.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.argv[2] || process.env.DATA_DIR || join(ROOT, 'data')
const KV_FILE = join(DATA_DIR, 'kv.json')

const store = JSON.parse(await readFile(KV_FILE, 'utf8'))
let moved = 0
let cleaned = 0

const novelKeys = Object.keys(store).filter((k) => k.startsWith('novel:'))
const summaries = []

for (const key of novelKeys) {
  let meta
  try {
    meta = JSON.parse(store[key])
  } catch {
    console.warn('跳过坏数据：' + key)
    continue
  }
  if (!Array.isArray(meta.chapters)) meta.chapters = []
  const next = []
  for (const ch of meta.chapters) {
    const id = String(ch.id || '')
    const chapterKey = 'chapter:' + meta.id + ':' + id
    let content = typeof ch.content === 'string' ? ch.content : null
    if (content !== null && (content.length || !store[chapterKey])) {
      if (!store[chapterKey] || JSON.parse(store[chapterKey]).content !== content) {
        store[chapterKey] = JSON.stringify({
          id,
          title: String(ch.title || '未命名'),
          content,
          chars: countChars(content),
          updatedAt: Number(ch.updatedAt) || Number(meta.updatedAt) || Date.now(),
        })
        moved += 1
      }
    } else if (store[chapterKey]) {
      try {
        content = JSON.parse(store[chapterKey]).content || ''
      } catch {
        content = ''
      }
    }
    const chars = Number(ch.chars) || countChars(content || '')
    next.push({ id, title: String(ch.title || '未命名'), chars, updatedAt: Number(ch.updatedAt) || Number(meta.updatedAt) || 0 })
  }
  if (meta.chapters.some((c) => 'content' in c)) cleaned += 1
  meta.chapters = next
  store[key] = JSON.stringify(meta)
  summaries.push({
    id: meta.id,
    title: meta.title,
    author: meta.author || '佚名',
    summary: meta.summary || '',
    chapterCount: next.length,
    chars: next.reduce((s, c) => s + c.chars, 0),
    createdAt: meta.createdAt || 0,
    updatedAt: meta.updatedAt || 0,
  })
}

summaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
store.index = JSON.stringify({ novels: summaries, updatedAt: Date.now() })

// 清掉无主章节（所属书已经不存在的）
for (const key of Object.keys(store)) {
  if (!key.startsWith('chapter:')) continue
  const novelId = key.split(':')[1]
  if (!Object.prototype.hasOwnProperty.call(store, 'novel:' + novelId)) {
    delete store[key]
    console.log('清理无主章节：' + key)
  }
}

await mkdir(DATA_DIR, { recursive: true })
const tmp = KV_FILE + '.tmp'
await writeFile(tmp, JSON.stringify(store), 'utf8')
const { rename } = await import('node:fs/promises')
await rename(tmp, KV_FILE)

console.log('迁移完成：' + novelKeys.length + ' 本，搬正文 ' + moved + ' 章，清理目录 ' + cleaned + ' 本')
for (const s of summaries) console.log('  ' + s.title + ' / ' + s.author + ' / ' + s.chapterCount + ' 章 / ' + s.chars + ' 字')
