// 用 jsdom 真跑一遍站点的前端脚本，确认页面在浏览器里能渲染（不是只看 HTML 字符串）
import { JSDOM, VirtualConsole } from 'jsdom'

const BASE = process.env.BASE || 'http://127.0.0.1:8787'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(path, expect, label) {
  const html = await (await fetch(BASE + path)).text()
  const errors = []
  const vc = new VirtualConsole()
  vc.on('jsdomError', (e) => errors.push(String(e && e.message)))
  vc.on('error', (e) => errors.push('console.error: ' + e))

  const dom = new JSDOM(html, {
    url: BASE + path,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (input, init) => fetch(new URL(input, BASE).toString(), init)
      window.localStorage.clear?.()
    },
  })

  await wait(1200)
  const text = dom.window.document.body.textContent.replace(/\s+/g, ' ')
  const hit = expect.every((e) => text.includes(e))
  console.log((hit ? 'PASS ' : 'FAIL ') + label + '  ' + path)
  if (!hit) {
    console.log('  期望包含: ' + JSON.stringify(expect))
    console.log('  实际文本: ' + text.slice(0, 400))
  }
  if (errors.length) console.log('  页面错误: ' + errors.slice(0, 3).join(' | '))
  dom.window.close()
  return hit
}

const site = await (await fetch(BASE + '/api/site')).json()
const list = site.novels || []
console.log('站点配置: ' + JSON.stringify(site.config))
console.log('书架数量: ' + list.length)

let ok = true
if (list.length) {
  ok = (await run('/', [list[0].title, list[0].author], '首页书架')) && ok
  const n = list[0]
  ok = (await run('/n/' + n.id, [n.title, n.author], '书籍详情')) && ok
  const detail = await (await fetch(BASE + '/api/novel/' + n.id)).json()
  const c = (detail.novel?.chapters || []).filter((x) => x.content)[0]
  if (c) ok = (await run('/read/' + n.id + '/' + c.id, [c.content.slice(0, 12)], '阅读页')) && ok
} else {
  ok = (await run('/', ['书架还空着'], '空书架')) && ok
}
console.log(ok ? '\n全部通过' : '\n有失败项')
process.exit(ok ? 0 : 1)
