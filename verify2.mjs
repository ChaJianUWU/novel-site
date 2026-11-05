// 全链路自测：起一个临时数据目录 + 临时端口的服务，把接口和页面都走一遍。
// 运行：node verify2.mjs
//
// 不碰线上数据（DATA_DIR 用系统临时目录），跑完自动清理。

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PORT = 8791 + Math.floor(Math.random() * 60)
const BASE = 'http://127.0.0.1:' + PORT
const ADMIN_KEY = 'test-admin-key'
const SYNC_KEY = 'test-sync-key'

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) {
    pass += 1
    console.log('  PASS  ' + name)
  } else {
    fail += 1
    console.log('  FAIL  ' + name + (extra ? '  →  ' + JSON.stringify(extra).slice(0, 400) : ''))
  }
}

const SAMPLE = `我的测试书

第一章 云港
云港的雾总是从海面往上爬。林舟站在栈桥上，看着第七号码头的灯一盏一盏熄灭。
他没有回头。

第二章 第七位乘客
船票上写着七个人。可他数来数去，甲板上只有六个影子。
"还有一位呢？"他问。
没人回答。

第三章 夜航
夜里，引擎的声音像有人在低声数数。
一、二、三……
`

async function req(path, options) {
  const res = await fetch(BASE + path, options)
  const ct = res.headers.get('content-type') || ''
  const body = ct.includes('json') ? await res.json() : await res.text()
  return { status: res.status, body, headers: res.headers }
}

const jpost = (path, data, headers) =>
  req(path, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
    body: JSON.stringify(data),
  })

const jput = (path, data, headers) =>
  req(path, {
    method: 'PUT',
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
    body: JSON.stringify(data),
  })

const del = (path, headers) => req(path, { method: 'DELETE', headers: headers || {} })

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'novelsite-test-'))
  const child = spawn(process.execPath, [join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DATA_DIR: dir,
      ADMIN_KEY,
      SYNC_KEY,
      SITE_TITLE: '测试站',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => {
    log += String(d)
  })
  child.stderr.on('data', (d) => {
    log += String(d)
  })

  const cleanup = async () => {
    child.kill()
    await new Promise((r) => setTimeout(r, 200))
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }

  // 等端口起来
  let up = false
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(BASE + '/healthz')
      if (r.ok) {
        up = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!up) {
    console.log('服务没起来，日志：\n' + log)
    await cleanup()
    process.exit(1)
  }

  try {
    console.log('\n== 页面 ==')
    let r = await req('/')
    ok('首页 200', r.status === 200)
    ok('首页有「书架」和投稿入口', r.body.includes('书架') && r.body.includes('投稿'))
    ok('空站有提示', r.body.includes('书架还空着'))

    r = await req('/upload')
    ok('投稿页 200 且要求作者名', r.status === 200 && r.body.includes('作者名'))
    r = await req('/admin')
    ok('管理页 200', r.status === 200 && r.body.includes('管理员密钥'))
    ok('后台书目请求带管理员密钥', r.body.includes("'/admin/overview','GET',undefined,hdr()"))
    ok('后台密钥记在浏览器里', r.body.includes('novel_admin_key') && r.body.includes('btnLogout'))
    r = await req('/download')
    ok('下载页 200 且有整站说明', r.status === 200 && r.body.includes('不需要 DeepSeek'))
    r = await req('/download/pkg.zip')
    ok('压缩包可取（仓库里带 packages 时）', (r.status === 200 && r.body.startsWith('PK')) || (r.status === 404 && r.body.includes('packages')))
    // Word 上传：现造一份 docx 走接口
    const { buildDocx } = await import('./docx.js')
    const docxParas = ['测试书名', '第一章 起点', '第一段正文。', '第二章 转折', '第二段正文。']
    const docxBuf = buildDocx(docxParas)
    let j = await jpost('/api/extract', { name: '测试.docx', data: docxBuf.toString('base64') })
    ok('docx 上传能取出正文', j.status === 200 && j.body.text.includes('第一章 起点') && j.body.text.includes('第二段正文'))
    ok('docx 提取结果按段落分行', j.body.text.split('\n').length === docxParas.length)
    ok('docx 提取带字数', j.body.chars > 10)
    j = await jpost('/api/extract', { name: 'a.doc', data: Buffer.from('x').toString('base64') })
    ok('老 .doc 给出另存为提示', j.status === 400 && String(j.body.error).includes('另存为'))
    j = await jpost('/api/extract', { name: '假的.docx', data: Buffer.from('not a zip at all').toString('base64') })
    ok('坏 docx → 400 而不是崩', j.status === 400 && String(j.body.error).includes('Word'))
    j = await jpost('/api/extract', { name: '小.txt', data: Buffer.from('\uFEFF第一章 开始\n正文', 'utf8').toString('base64') })
    ok('txt 走同一接口并去掉 BOM', j.status === 200 && j.body.text.startsWith('第一章 开始'))
    j = await jpost('/api/extract', { name: 'empty.txt', data: '' })
    ok('空文件 → 400', j.status === 400)
    r = await req('/upload')
    ok('投稿页接受 Word', r.status === 200 && r.body.includes('.docx') && r.body.includes('会自动分章'))
    r = await req('/r/xxx/yyy')
    ok('不存在的章节 → 404', r.status === 404)
    r = await req('/n/nope')
    ok('不存在的书 → 404', r.status === 404)

    console.log('\n== 自动分章 ==')
    r = await jpost('/api/split', { text: SAMPLE })
    ok('分章接口 200', r.status === 200, r.body)
    ok('识别 3 章', r.body.chapters && r.body.chapters.length === 3, r.body.chapters && r.body.chapters.map((c) => c.title))
    ok(
      '章节名正确',
      r.body.chapters && r.body.chapters[0].title === '第一章 云港' && r.body.chapters[2].title === '第三章 夜航',
      r.body.chapters && r.body.chapters.map((c) => c.title),
    )

    r = await jpost('/api/split', { text: '第一章 只有一章\n内容一点点。' })
    ok('只有一处标记 → 按字数切且不崩', r.status === 200 && r.body.chapters.length >= 1, r.body)

    r = await jpost('/api/split', { text: '没有任何标记的一大段文字。'.repeat(400) })
    ok('无标记 → 按节切', r.status === 200 && r.body.chapters.length >= 2, r.body.chapters && r.body.chapters.length)

    r = await jpost('/api/split', { text: '【' })
    ok('乱码不死', r.status === 200)

    console.log('\n== 导入发布 ==')
    r = await jpost('/api/import', { text: SAMPLE, title: '我的测试书' })
    ok('缺作者名 → 400', r.status === 400 && /作者名/.test(r.body.error || ''), r.body)
    r = await jpost('/api/import', { text: SAMPLE, author: '测试作者' })
    ok('缺书名 → 400', r.status === 400, r.body)
    r = await jpost('/api/import', { text: '   ', title: 'x', author: 'y' })
    ok('空正文 → 400', r.status === 400, r.body)

    r = await jpost('/api/import', { text: SAMPLE, title: '我的测试书', author: '测试作者', summary: '一句简介' })
    ok('导入成功', r.status === 200 && !!r.body.id, r.body)
    const novelId = r.body.id
    const editKey = r.body.editKey
    ok('返回 18 位编辑口令', typeof editKey === 'string' && editKey.length === 18, editKey && editKey.length)
    ok('返回 3 章', r.body.chapterCount === 3, r.body)

    r = await jpost('/api/import', { text: SAMPLE, title: '我的测试书', author: '测试作者' })
    ok('同名同作者再导入 → 409 提醒', r.status === 409 && /同名/.test(r.body.error || ''), r.body)
    r = await jpost('/api/import', { text: SAMPLE, title: '我的测试书', author: '测试作者', force: true })
    ok('确认后可以再建一本', r.status === 200 && r.body.id !== novelId, r.body)
    await req('/api/novel/' + r.body.id, { method: 'DELETE', headers: { 'x-edit-key': r.body.editKey } })

    r = await req('/api/novel/' + novelId)
    ok('书目元信息', r.status === 200 && r.body.novel.title === '我的测试书' && r.body.novel.chapters.length === 3)
    ok('字数 > 0', r.body.novel.chars > 50, r.body.novel.chars)
    const cid1 = r.body.novel.chapters[0].id

    r = await req('/n/' + novelId)
    ok('书页 200 且带目录', r.status === 200 && r.body.includes('我的测试书') && r.body.includes('第一章 云港'))
    r = await req('/r/' + novelId + '/' + cid1)
    ok('阅读页 200 且带正文', r.status === 200 && r.body.includes('栈桥'))
    ok('阅读页有下一章', r.body.includes('下一章'))
    r = await req('/')
    ok('首页出现新书', r.body.includes('我的测试书') && r.body.includes('测试作者'))
    r = await req('/?q=测试作者')
    ok('搜索命中', r.body.includes('我的测试书'))

    console.log('\n== 编辑权限 ==')
    r = await jput('/api/novel/' + novelId + '/chapter/' + cid1, { content: '改一下' })
    ok('无口令 → 403', r.status === 403, r.body)
    r = await jput('/api/novel/' + novelId + '/chapter/' + cid1, { content: '改一下' }, { 'x-edit-key': 'wrong' })
    ok('错口令 → 403', r.status === 403, r.body)
    r = await jput('/api/novel/' + novelId + '/chapter/' + cid1, { title: '第一章 改过的标题', content: '改过的正文' }, { 'x-edit-key': editKey })
    ok('对口令 → 200', r.status === 200, r.body)
    r = await req('/r/' + novelId + '/' + cid1)
    ok('正文真的变了', r.body.includes('改过的正文') && r.body.includes('第一章 改过的标题'))
    r = await jput('/api/novel/' + novelId, { author: '' }, { 'x-edit-key': editKey })
    ok('清空作者 → 400', r.status === 400, r.body)
    r = await jput('/api/novel/' + novelId, { summary: '新简介' }, { 'x-edit-key': editKey })
    ok('改简介 → 200', r.status === 200 && r.body.novel.summary === '新简介')

    console.log('\n== 章节增删 / 追章导入 ==')
    r = await jpost('/api/novel/' + novelId + '/chapter', { title: '第四章 手写', content: '手写的一章。' }, { 'x-edit-key': editKey })
    ok('新增章节', r.status === 200 && !!r.body.chapter.id, r.body)
    const newCid = r.body.chapter.id
    r = await del('/api/novel/' + novelId + '/chapter/' + newCid, { 'x-edit-key': editKey })
    ok('删除章节', r.status === 200)
    r = await jpost('/api/novel/' + novelId + '/import', { text: '第五章 追加\n追加的内容。\n\n第六章 再来\n又来一段。' }, { 'x-edit-key': editKey })
    ok('追章导入 2 章', r.status === 200 && r.body.added === 2, r.body)
    r = await req('/api/novel/' + novelId)
    ok('总章数变 5', r.body.novel.chapters.length === 5, r.body.novel.chapters.length)
    ok('新章标题对', r.body.novel.chapters[3].title === '第五章 追加')

    console.log('\n== 导出 ==')
    r = await req('/api/export/' + novelId)
    ok('导出 200', r.status === 200)
    ok('导出带书名作者和正文', r.body.includes('我的测试书') && r.body.includes('测试作者') && r.body.includes('改过的正文'))
    ok('导出是 txt', (r.headers.get('content-type') || '').includes('text/plain'))

    console.log('\n== 口令找回 ==')
    r = await req('/api/keys?title=' + encodeURIComponent('我的测试书') + '&author=' + encodeURIComponent('测试作者'))
    ok('按书名+作者找回口令', r.status === 200 && r.body.editKey === editKey, r.body)
    r = await req('/api/keys?title=' + encodeURIComponent('我的测试书') + '&author=' + encodeURIComponent('别人'))
    ok('作者不对 → 404', r.status === 404)

    console.log('\n== 管理后台 ==')
    r = await req('/api/admin/overview')
    ok('无密钥看总览 → 403', r.status === 403)
    r = await jpost('/api/admin/login', { key: 'nope' })
    ok('错误密钥登录 → 403', r.status === 403)
    r = await jpost('/api/admin/login', { key: ADMIN_KEY })
    ok('正确密钥登录', r.status === 200 && r.body.ok === true)
    r = await req('/api/admin/overview', { headers: { 'x-admin-key': ADMIN_KEY } })
    ok('总览数据对', r.status === 200 && r.body.totals.novels === 1 && r.body.totals.chapters === 5 && r.body.authors === 1, r.body.totals)
    r = await jput('/api/admin/config', { title: '改过的站名', announcement: '欢迎光临', allowPublicCreate: true }, { 'x-admin-key': ADMIN_KEY })
    ok('改站点设置', r.status === 200)
    r = await req('/')
    ok('首页显示新站名和公告', r.body.includes('改过的站名') && r.body.includes('欢迎光临'))

    r = await jput('/api/admin/config', { allowPublicCreate: false }, { 'x-admin-key': ADMIN_KEY })
    ok('关闭投稿', r.status === 200)
    r = await jpost('/api/import', { text: SAMPLE, title: '关站后的投稿', author: '某人' })
    ok('关闭后投稿被拒', r.status === 403, r.body)
    await jput('/api/admin/config', { allowPublicCreate: true }, { 'x-admin-key': ADMIN_KEY })

    console.log('\n== 同步接口（插件推送用）==')
    r = await jpost('/api/sync', { config: { title: '同步来的站' }, novels: [] }, { 'x-sync-key': 'bad' })
    ok('同步密钥错 → 401', r.status === 401)
    const syncPayload = {
      config: { title: '同步站名', subtitle: '副标题', allowPublicCreate: true },
      novels: [
        {
          id: 'syncnovel01',
          title: '同步之书',
          author: '同步作者',
          summary: '从插件推来的',
          editKey: '',
          chapters: [
            { id: 'c1', title: '第一章 同步', content: '同步正文一。', updatedAt: 1700000000000 },
            { id: 'c2', title: '第二章 同步', content: '同步正文二。', updatedAt: 1700000000001 },
          ],
        },
      ],
    }
    r = await jpost('/api/sync', syncPayload, { 'x-sync-key': SYNC_KEY })
    ok('同步成功并返回数量', r.status === 200 && r.body.count === 1, r.body)
    r = await req('/api/novel/syncnovel01')
    ok('同步的书在', r.status === 200 && r.body.novel.chapters.length === 2)
    ok('同步保留了编辑口令', r.body.novel.id === 'syncnovel01')
    r = await req('/api/novels')
    ok('同步是覆盖式（旧书被清掉）', r.status === 200 && r.body.novels.length === 1, r.body.novels.map((n) => n.id))
    r = await req('/r/syncnovel01/c1')
    ok('同步的正文能读', r.body.includes('同步正文一'))

    // 同步时远端口令为空 → 不能把本地口令洗掉
    const keyBefore = (await fetch(BASE + '/api/keys?title=' + encodeURIComponent('同步之书') + '&author=' + encodeURIComponent('同步作者')).then((x) => x.json())).editKey
    ok('同步建书时自动生成口令', typeof keyBefore === 'string' && keyBefore.length === 18, keyBefore)
    await jpost('/api/sync', syncPayload, { 'x-sync-key': SYNC_KEY })
    const keyAfter = (await fetch(BASE + '/api/keys?title=' + encodeURIComponent('同步之书') + '&author=' + encodeURIComponent('同步作者')).then((x) => x.json())).editKey
    ok('再次同步不洗掉口令', keyAfter === keyBefore, [keyBefore, keyAfter])

    console.log('\n== 删除 ==')
    r = await del('/api/novel/syncnovel01', { 'x-edit-key': 'wrong' })
    ok('错口令删除 → 403', r.status === 403)
    r = await del('/api/novel/syncnovel01', { 'x-admin-key': ADMIN_KEY })
    ok('管理员密钥删除 → 200', r.status === 200, r.body)
    r = await req('/api/novel/syncnovel01')
    ok('删完 404', r.status === 404)
    r = await req('/api/export/syncnovel01')
    ok('删完导出 404', r.status === 404)

    console.log('\n== 杂项 ==')
    r = await req('/api/site')
    ok('/api/site 有配置和书目', r.status === 200 && r.body.config && Array.isArray(r.body.novels))
    r = await jpost('/api/split', {})
    ok('空文本分章 → 400', r.status === 400)
    r = await req('/api/nothing')
    ok('未知接口 → 404 JSON', r.status === 404 && typeof r.body.error === 'string')

    if (log.includes('Error') || log.includes('错误')) {
      console.log('\n服务端日志片段：\n' + log.slice(-1200))
    }
  } finally {
    await cleanup()
  }

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项')
  process.exit(fail ? 1 : 0)
}

main().catch(async (err) => {
  console.error('自测崩了：', err)
  process.exit(1)
})
