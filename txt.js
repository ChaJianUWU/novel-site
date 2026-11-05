// 文本处理：编码/空白归一化、自动分章、字数统计
//
// 分章策略（按优先级）：
//   1. 章节标记行（第X章/第X回/序章/楔子/番外/Chapter N/## 标题/（一））—— 命中 >= 2 处就按标记切
//   2. 没有标记时按段落块切，每块约 targetSize 字，标题「第N节」
//   3. 单行巨长的纯文本按句子切
//
// 所有函数都很保守：宁可少切，也不要把正文切碎。

const ZH = '0-9０-９零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟'

const RULES = [
  // 第1章 / 第十二回 / 第 3 卷 / 第三节 云港
  new RegExp('^第[ \\t　]*[' + ZH + ']{1,8}[ \\t　]*[章节節回卷篇集部幕]([ \\t　·、:：—-].*)?$'),
  // 序章 / 楔子 / 尾声 / 番外一
  /^(序章|序言|序幕|楔子|引子|前言|尾声|尾聲|终章|終章|大结局|大結局|後記|后记|番外|外传|外傳|附录|附錄|完本感言)([ \t　·、:：—-].{0,20})?$/,
  // Chapter 12 / CHAPTER 3 The sea
  /^(Chapter|CHAPTER|chapter|Ch\.)[ \t]*[0-9]{1,4}([ \t:：.-].{0,40})?$/,
  // Markdown 标题 ## 第一章
  /^#{1,4}[ \t]+.{1,60}$/,
  // （一） / (12)
  /^[（(][0-9]{1,4}[)）][ \t　]?.{0,30}$/,
]

/** 统一换行、去 BOM、去零宽字符、压掉 3 个以上连续空行 */
export function normalizeText(raw) {
  let text = String(raw == null ? '' : raw)
  text = text.replace(/^\uFEFF/, '')
  text = text.replace(/\r\n?/g, '\n')
  text = text.replace(/[\u200b-\u200f\u2028\u2029]/g, '')
  text = text.replace(/\u00a0/g, ' ')
  text = text.replace(/[ \t　]+$/gm, '')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/** 这一行是不是章节标题 */
export function isMarkerLine(line) {
  const s = String(line || '').trim()
  if (!s || s.length > 80) return false
  for (const re of RULES) if (re.test(s)) return true
  return false
}

/** 把标记行洗成干净的章节名 */
export function cleanTitle(line) {
  let s = String(line || '').trim()
  s = s.replace(/^#{1,4}[ \t]+/, '')
  s = s.replace(/^[（(]([0-9]{1,4})[)）][ \t　]?/, '第$1节 ')
  s = s.replace(/[ \t　]+/g, ' ')
  s = s.replace(/[\s·、:：—.-]+$/, '')
  return s.slice(0, 60) || '未命名'
}

/** 正文字数：不算空白 */
export function countChars(text) {
  return String(text || '').replace(/\s+/g, '').length
}

function splitBySize(text, size) {
  const out = []
  let blocks = text.split(/\n[ \t　]*\n/).map((s) => s.trim()).filter(Boolean)
  if (blocks.length < 3) {
    // 没有空行分段：按句子切
    const sentences = text.split(/(?<=[。！？!?…」』”])/).map((s) => s.trim()).filter(Boolean)
    blocks = sentences.length >= 3 ? sentences : text.match(/[\s\S]{1,400}/g) || [text]
  }
  let buf = []
  let len = 0
  const flush = () => {
    const content = buf.join('\n\n').trim()
    if (content) out.push({ title: '第' + (out.length + 1) + '节', content })
    buf = []
    len = 0
  }
  for (const block of blocks) {
    buf.push(block)
    len += block.length
    if (len >= size) flush()
  }
  flush()
  return out
}

/**
 * 自动分章
 * @param {string} raw 原始文本
 * @param {{targetSize?:number, maxChapters?:number}} [options]
 * @returns {{title:string, content:string}[]}
 */
export function splitChapters(raw, options) {
  const opts = options || {}
  const targetSize = Math.max(600, Number(opts.targetSize) || 3000)
  const maxChapters = Math.max(1, Number(opts.maxChapters) || 1000)
  const text = normalizeText(raw)
  if (!text) return []

  const lines = text.split('\n')
  const marks = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue
    if (isMarkerLine(lines[i])) marks.push(i)
  }

  let chapters = []
  if (marks.length >= 2) {
    const head = lines.slice(0, marks[0]).join('\n').trim()
    for (let k = 0; k < marks.length; k += 1) {
      const start = marks[k]
      const end = k + 1 < marks.length ? marks[k + 1] : lines.length
      chapters.push({
        title: cleanTitle(lines[start]),
        content: lines.slice(start + 1, end).join('\n').trim(),
      })
    }
    // 第一个标记之前如果有一大段（书名页/简介/前言），保留成「开篇」
    if (countChars(head) >= 60) chapters.unshift({ title: '开篇', content: head })
  } else {
    chapters = splitBySize(text, targetSize)
  }

  chapters = chapters.filter((c) => countChars(c.content) > 0 || c.title)
  if (!chapters.length) chapters = [{ title: '正文', content: text }]
  return chapters.slice(0, maxChapters)
}

/** 只返回目录，不返回正文（导入前预览用） */
export function previewChapters(raw, options) {
  return splitChapters(raw, options).map((c) => ({
    title: c.title,
    chars: countChars(c.content),
    head: c.content.slice(0, 40).replace(/\s+/g, ' '),
  }))
}

/** 导出一本为 txt */
export function novelToText(novel, chapters) {
  const parts = []
  parts.push(novel.title + (novel.author ? '\n作者：' + novel.author : ''))
  if (novel.summary) parts.push('\n' + novel.summary)
  parts.push('')
  for (const c of chapters) {
    parts.push('')
    parts.push(c.title || '')
    parts.push('')
    parts.push(String(c.content || ''))
  }
  return parts.join('\n')
}
