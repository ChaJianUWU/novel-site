import fs from 'node:fs';
const s = fs.readFileSync('ui.js', 'utf8');
// 找出所有「反斜杠 + n」出现的位置（单反斜杠，即在模板字符串里会变真换行）
const lines = s.split('\n');
lines.forEach((l, i) => {
  if (/[^\\]\\n/.test(l) || /^\\n/.test(l.trim())) console.log((i + 1) + ': ' + l.trim().slice(0, 140));
});
