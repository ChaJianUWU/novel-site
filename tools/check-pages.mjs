import vm from 'node:vm';

const base = 'http://127.0.0.1:8787';
const site = await (await fetch(base + '/api/site')).json();
const novel = site.novels?.[0];
const routes = ['/', '/upload', '/admin', '/download'];
if (novel) {
  routes.push('/n/' + novel.id, '/edit/' + novel.id);
  const one = await (await fetch(base + '/api/novel/' + novel.id)).json();
  const ch = one.novel?.chapters?.[0];
  if (ch) routes.push('/r/' + novel.id + '/' + ch.id);
}

let bad = 0;
for (const r of routes) {
  const res = await fetch(base + r);
  const html = await res.text();
  const blocks = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
  let ok = true;
  blocks.forEach((b, i) => {
    const code = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    if (!code.trim()) return;
    try { new vm.Script(code); } catch (e) { ok = false; bad++; console.log(`  ✗ ${r} 脚本#${i}: ${e.message}`); }
  });
  console.log(`${ok ? '✓' : '✗'} ${r}  状态${res.status}  脚本块${blocks.length}  页面${html.length}字`);
}
console.log(bad === 0 ? '\n全部页面内联脚本语法正常' : `\n有 ${bad} 处脚本错误`);
