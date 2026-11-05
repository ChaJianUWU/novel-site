// 打包一份给普通人用的绿色压缩包：node tools/make-package.mjs
// 产物：packages/novel-site-<版本>-win.zip 和同名 .sha256
import { copyFileSync, existsSync, mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const VERSION = pkg.version || '0.0.0'
const NAME = `novel-site-${VERSION}-win`
const OUT = join(ROOT, 'packages')
const STAGE = join(OUT, '.stage', 'novel-site')

const FILES = [
  'server.mjs',
  'site-core.js',
  'txt.js',
  'ui.js',
  'package.json',
  'README.md',
  'Dockerfile',
  'render.yaml',
  'Procfile',
  'migrate-legacy.mjs',
  'verify2.mjs',
  'docs/新手教程.md',
  'docs/上公网.md',
  'windows/一键启动.bat',
  'windows/一键公网.bat',
  'windows/停止.bat'
]

const missing = FILES.filter((f) => !existsSync(join(ROOT, f)))
if (missing.length) {
  console.error('缺文件：', missing.join(', '))
  process.exit(1)
}

rmSync(join(OUT, '.stage'), { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })
mkdirSync(join(STAGE, 'data'), { recursive: true })

for (const f of FILES) {
  const dest = join(STAGE, f)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(ROOT, f), dest)
}

// 空数据目录里放一句说明，避免用户以为漏了东西
writeFileSync(join(STAGE, 'data', '这里放数据.txt'), '首次启动会自动生成 kv.json（全部书本和章节）和 admin-key.txt、sync-key.txt（密钥）。备份就复制整个 data 目录。\r\n', 'utf8')

writeFileSync(join(STAGE, '开始读我.txt'), [
  '小说站 绿色版 ' + VERSION,
  '',
  '1) 装 Node.js（只有第一次）：https://nodejs.org/zh-cn 下 LTS，一路下一步。',
  '2) 双击 windows\\一键启动.bat  → 浏览器自动打开 http://127.0.0.1:8787',
  '3) 想让别人也能打开：先保持上一步窗口不关，再双击 windows\\一键公网.bat，等它打印 https 网址。',
  '4) 管理后台：http://127.0.0.1:8787/admin  密钥在启动窗口里，也在 data\\admin-key.txt',
  '',
  '详细步骤看 docs\\新手教程.md，长期在线看 docs\\上公网.md',
  ''
].join('\r\n'), 'utf8')

const zip = join(OUT, NAME + '.zip')
rmSync(zip, { force: true })
execFileSync('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path '${join(OUT, '.stage', 'novel-site')}' -DestinationPath '${zip}' -CompressionLevel Optimal`
], { stdio: 'inherit' })

const buf = readFileSync(zip)
const sha = createHash('sha256').update(buf).digest('hex')
writeFileSync(zip + '.sha256', `${sha}  ${NAME}.zip\r\n`, 'utf8')
rmSync(join(OUT, '.stage'), { recursive: true, force: true })

console.log(`打包完成：${basename(zip)}`)
console.log(`大小：${(statSync(zip).size / 1024).toFixed(1)} KB`)
console.log(`SHA256：${sha}`)
