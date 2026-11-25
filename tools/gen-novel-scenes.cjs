// 立ち絵の出る会話（サウンドノベルの形）を入れる（2026-11-24 作者「立ち絵がでてサウンドノベル的な会話形式のイベントがあってもいいなと思ってて」）。
// 台本は世界観・シナリオ室の「会話イベント台本_v01.md」（2026-11-25 6:53 改訂版：作者「ナハトは寡黙ではない」を反映。status: provisional・作者確認待ち）の表から読む。文は変えていない。
// 置き場所はClaudeの仮（台本の「前提」に近い、いまある調べる場所）：
//   EVT-DAY-01 銀鹿亭で夕飯を頼む … 銀鹿亭一階の受付（counter）
//   EVT-DAY-02 店先の灯り       … 広場の灯りのある露店（stall-lamp）
//   EVT-DAY-03 働いた分の串焼き   … 銀鹿亭前の通りの木箱（life-st-crates）。オットーの店はまだ地図に無いので、荷の置き場で仮に
// 一度見たら、もとの言葉に戻る（旗 scene.day01 など）。ナハトとヴォルトが隊列にいるときだけ。
// 使い方：node tools/gen-novel-scenes.cjs（data/dialogue.json の scene.* と、3つの地図の出来事を書きかえる。何度流しても同じ結果）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const write = (f, d) => fs.writeFileSync(path.join(root, f), JSON.stringify(d, null, 2) + '\n');

const NAME = { nacht: 'ナハト', volt: 'ヴォルト' };
// [話す人, 表情, 文]。話す人が nacht / volt なら立ち絵、それ以外は名前だけ
const L = (who, face, text) => (NAME[who] ? { who: NAME[who], actor: who, face, text } : { who, text });

// 台本は .md の表（行・場面・話者・表情・代替・text）から読む（2026-11-25 6:53 の改訂「ナハトは寡黙ではない」を反映した版。文は変えない）
const SRC = path.join(process.env.USERPROFILE || 'C:/Users/takhy', 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/scenario/会話イベント台本_v01.md');
const md = fs.readFileSync(SRC, 'utf8');
const WHO = { ナハト: 'nacht', ヴォルト: 'volt' };
const TITLE = { 'EVT-DAY-01': ['銀鹿亭で夕飯を頼む', '銀鹿亭一階、夕食時'], 'EVT-DAY-02': ['店先の灯り', 'ノルンの通り、昼'], 'EVT-DAY-03': ['働いた分の串焼き', 'オットーの串焼き屋（地図はまだ無い。仮に通りの荷の置き場）'] };
const SCENES = {};
for (const [evt, [title, place]] of Object.entries(TITLE)) {
  const sec = md.split(/^## /m).find((x) => x.startsWith(evt)); if (!sec) throw new Error(evt + ' が台本に無い');
  const lines = sec.split('\n').filter((l) => /^\| \d\d \|/.test(l)).map((l) => { const c = l.split('|').slice(1, -1).map((x) => x.trim()); return L(WHO[c[2]] || c[2], c[3], c[5]); });
  if (lines.length < 5) throw new Error(evt + ' の台詞が少ない');
  SCENES['scene.' + evt.slice(4).toLowerCase().replace('-', '')] = { scene: evt, title, place, lines };
}
const PLACE = [
  ['data/maps/silver-deer-1f.json', 'counter', 'scene.day01'],
  ['data/maps/norn-plaza.json', 'stall-lamp', 'scene.day02'],
  ['data/maps/norn-inn-street.json', 'life-st-crates', 'scene.day03'],
];

const D = read('data/dialogue.json');
for (const [k, v] of Object.entries(SCENES)) D.lines[k] = { ...v, status: 'provisional', source: 'production/claude/scenario/会話イベント台本_v01.md' };
D.sceneNote = '2026-11-25：scene.* は立ち絵の出る会話（tools/gen-novel-scenes.cjs）。台本は世界観・シナリオ室の会話イベント台本_v01（provisional・作者確認待ち）。face は表情、顔の絵が無い人は名前だけ';
write('data/dialogue.json', D);

for (const [file, id, key] of PLACE) {
  const m = read(file), ev = (m.events || []).find((e) => e.id === id);
  if (!ev) throw new Error(`${file} に ${id} が無い`);
  const flag = key; // 旗の名前＝会話の名前
  ev.pages = ev.pages.filter((p) => p.dialogue !== key);
  ev.pages.unshift({ when: { flags: { [flag]: false } }, dialogue: key, set: { flags: { [flag]: true } }, party: ['nacht', 'volt'], mark: true }); // mark：しるしを出す（まだ見ていない立ち絵の会話）
  write(file, m);
}
console.log(`立ち絵の会話 ${Object.keys(SCENES).length} 本`);
