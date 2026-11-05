// Word (.docx) 提取纯文本 —— 零依赖
//
// docx 就是一个 zip 包，正文在 word/document.xml 里。
// 这里自己解 zip（支持 store / deflate）和 XML，不引第三方库。
//
// 只处理 .docx。老的 .doc 是 OLE 二进制，不在这里处理。

import { inflateRawSync } from 'node:zlib'

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

function findEocd(buf) {
  const min = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  return -1
}

// 读 zip 里的所有条目 -> Map<名字, Buffer>
export function unzip(buf) {
  const out = new Map()
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('这不是一个 Word 文档（找不到 zip 结构）')

  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (p === 0xffffffff) throw new Error('这个文件用了 zip64，请用 Word 另存为一份新的 docx')

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/')

    if (localOff + 30 <= buf.length && buf.readUInt32LE(localOff) === SIG_LOCAL) {
      const lNameLen = buf.readUInt16LE(localOff + 26)
      const lExtraLen = buf.readUInt16LE(localOff + 28)
      const start = localOff + 30 + lNameLen + lExtraLen
      const raw = buf.subarray(start, start + compSize)
      try {
        if (method === 0) out.set(name, Buffer.from(raw))
        else if (method === 8) out.set(name, inflateRawSync(raw))
      } catch {
        // 单个条目坏掉不影响整体
      }
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  if (!out.size) throw new Error('Word 文档里没读到内容')
  return out
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

// word/document.xml -> 纯文本（一段一行）
function documentXmlToText(xml) {
  // 制表符 / 软换行 / 硬回车
  let s = xml
    .replace(/<w:tab\s*\/>/g, '\u0009')
    .replace(/<w:br\s*\/>|<w:cr\s*\/>/g, '\u000b')

  const lines = []
  const paraRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g
  let m
  while ((m = paraRe.exec(s))) {
    let block = m[1]
    // 只保留 <w:t> 里的可见文字（含超链接、域结果里的 run）
    block = block.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_, t) => '\u0001' + t + '\u0002')
    block = block.replace(/<[^>]*>/g, '')
    block = block.replace(/[\u0001\u0002]/g, '')
    const line = unescapeXml(block).replace(/\u000b/g, '\n').replace(/[ \t\u00a0]+$/g, '')
    if (line.trim()) lines.push(line)
  }

  // 段落里没有 <w:p> 的极端情况：退回全量取 <w:t>
  if (!lines.length) {
    const all = []
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    while ((m = tRe.exec(s))) all.push(unescapeXml(m[1]))
    if (all.length) lines.push(all.join(''))
  }
  return lines.join('\n')
}

// 主入口：Buffer/Uint8Array -> 纯文本
export function docxToText(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.length < 4 || b.readUInt32LE(0) !== SIG_LOCAL) {
    throw new Error('这不是一个 docx 文件（可能是改了后缀的 .doc 或别的格式）')
  }
  const files = unzip(b)
  let xml = files.get('word/document.xml')
  if (!xml) {
    for (const [name, data] of files) {
      if (/^word\/document\d*\.xml$/.test(name)) {
        xml = data
        break
      }
    }
  }
  if (!xml) throw new Error('这个 docx 里没有正文（word/document.xml）')
  const text = documentXmlToText(xml.toString('utf8'))
  if (!text.trim()) throw new Error('这个 Word 文档里没有文字（可能全是图片）')
  return text
}

// ---- 下面两个只用于自测和导出：造一个最小可读的 docx ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function zipStore(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const crc = crc32(data)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(SIG_LOCAL, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(0, 8) // store
    lh.writeUInt16LE(0, 10)
    lh.writeUInt16LE(0x21, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(SIG_CENTRAL, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(0, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0x21, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)

    locals.push(lh, nameBuf, data)
    centrals.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(SIG_EOCD, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralBuf, eocd])
}

// 把若干段落做成一个能被 Word 打开、也能被本文件解析的 docx
export function buildDocx(paragraphs) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const body = paragraphs
    .map((p) => '<w:p><w:r><w:t xml:space="preserve">' + esc(p) + '</w:t></w:r></w:p>')
    .join('')
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>' +
    '</w:body></w:document>'
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  return zipStore([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/document.xml', document],
  ])
}
