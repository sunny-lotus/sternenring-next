// プロローグの文を入れる（2026-11-25 STORY-OPENING-20261125 revision 2）。
// 世界観・シナリオ室「プロローグ_v01.md」（status provisional・担当室の内部採用）の「表示本文」の表（行・文・見出しか）を、そのまま data/prologue.json へ。文は変えない。
// 見出しの行（6行目「ノルンの星環祭」）より前は「歴史の語り」（mood: dark：背景を暗く沈める）、見出しから後は「祭りの昼」（mood: bright）。
// 使い方：<node> tools/gen-prologue.cjs
const fs = require('fs'), path = require('path');
const SRC = path.join(process.env.USERPROFILE || 'C:/Users/takhy', 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/scenario/プロローグ_v01.md');
const md = fs.readFileSync(SRC, 'utf8');
const body = md.split(/^## /m).find((x) => x.startsWith('表示本文')); if (!body) throw new Error('表示本文が無い');
const rows = body.split('\n').filter((l) => /^\| *\d+ *\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((x) => x.trim()));
if (rows.length < 8) throw new Error('行が少ない');
let seenTitle = false;
const lines = rows.map(([, text, head]) => { const title = head === 'はい'; if (title) seenTitle = true; return { text, ...(title ? { style: 'title' } : {}), mood: seenTitle ? 'bright' : 'dark' }; });
const out = {
  format: 'sternenring-next-prologue', version: 1, status: 'provisional',
  note: '2026-11-25 STORY-OPENING-20261125 revision 2：世界観・シナリオ室「プロローグ_v01.md」の表示本文16行（見出しは6行目だけ）。tools/gen-prologue.cjs が写した。はじめての冒険で、表紙を押したあと本がひらく前に流し、最後の行のあと本がひらいてノルン導入の場面1（串焼きを一口食べる所から）につなぐ。mood：dark＝冒頭の歴史の語り（背景を暗く）、bright＝祭りの昼',
  source: 'production/claude/scenario/プロローグ_v01.md',
  backdrop: 'assets/backdrops/norn_day_v02.jpg',
  lines,
};
fs.writeFileSync(path.join(__dirname, '..', 'data', 'prologue.json'), JSON.stringify(out, null, 2) + '\n');
console.log('プロローグ', lines.length, '行（見出し', lines.filter((l) => l.style === 'title').map((l) => l.text).join('・'), '）');
