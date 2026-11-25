// 町の人ひとりひとりの名前と話し方（2026-11-26 STORY-NPC-IDENTITY-20261126：世界観・シナリオ室「町の人の名簿_v01.md」「町の人の会話差替え_v01.json」、provisional・担当室の内部採用）を data/dialogue.json に当てる。
// 作者「会話を子供は子供らしく、一人ひとり名前も付けてほしい」「子供だけでなく女性や男性一人ひとり見た目と性格を合わせてほしい」。
// - ownedLineEdits：key と JSON pointer の行が expected（who・text）と同じときだけ、who・text を replacement にする（ほかの属性・並び・act・flags はそのまま）。すでに replacement なら何もしない。どちらでもなければ報告して残す。
// - sharedStageVariants：物語のあいだの町の人の言葉（story.norn.mob.*）は共有のキーなので上書きせず、その人用のキー（suggestedKey）を足し、銀鹿亭前の通りの storyLock.variants に「その人がそのキーを話すときはこちら」を書く（field が使う）。
// 使い方：<node> tools/apply-npc-identity.cjs（gen-norn-story.cjs・gen-norn-town.cjs のあとに流す。何度流しても同じ結果）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(process.env.USERPROFILE || 'C:/Users/takhy', 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/scenario/町の人の会話差替え_v01.json');
const X = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const dp = path.join(ROOT, 'data', 'dialogue.json'), D = JSON.parse(fs.readFileSync(dp, 'utf8'));
const at = (obj, pointer) => { const parts = pointer.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~')); let o = obj; for (const p of parts) { if (o == null) return null; o = o[Array.isArray(o) ? Number(p) : p]; } return o; };
let done = 0, already = 0; const miss = [];
for (const e of X.ownedLineEdits) {
  const entry = D.lines[e.key]; const line = entry && at(entry, e.pointer);
  if (!line || typeof line !== 'object') { miss.push(`${e.key}${e.pointer}：行が無い`); continue; }
  if (line.who === e.replacement.who && line.text === e.replacement.text) { already++; continue; }
  if ((line.who ?? undefined) === (e.expected.who ?? undefined) && line.text === e.expected.text) { if (e.replacement.who !== undefined) line.who = e.replacement.who; line.text = e.replacement.text; done++; continue; }
  miss.push(`${e.key}${e.pointer}：今の文が資料の expected とちがう`);
}
// 物語のあいだの言葉：その人用のキーを足す
const variants = {};
for (const v of X.sharedStageVariants || []) {
  const src = D.lines[v.sourceKey]; if (!src) { miss.push(`${v.sourceKey}：共有のキーが無い`); continue; }
  const first = src.lines ? src.lines[0] : Array.isArray(src) ? src[0] : null;
  if (!first || first.text !== v.expectedSourceText) { miss.push(`${v.sourceKey}：共有の文が資料とちがう`); continue; }
  D.lines[v.suggestedKey] = { lines: [{ who: v.who, text: v.text }], status: 'provisional', source: 'production/claude/scenario/町の人の会話差替え_v01.json（STORY-NPC-IDENTITY-20261126）' };
  (variants[v.npcId] = variants[v.npcId] || {})[v.sourceKey] = v.suggestedKey;
}
fs.writeFileSync(dp, JSON.stringify(D, null, 2) + '\n');
// storyLock.variants（銀鹿亭前の通り）
const mp = path.join(ROOT, 'data', 'maps', 'norn-inn-street.json'), m = JSON.parse(fs.readFileSync(mp, 'utf8'));
if (m.storyLock) { m.storyLock.variants = variants; fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n'); }
// 名簿（町の人の id → 名前・年代・性格・見た目・話し方・絵の原型）を data に残す（絵の割り当て・あとの確認用）
fs.writeFileSync(path.join(ROOT, 'data', 'npc-roster.json'), JSON.stringify({ format: 'sternenring-next-npc-roster', version: 1, status: 'provisional', source: 'production/claude/scenario/町の人の名簿_v01.md・町の人の会話差替え_v01.json（STORY-NPC-IDENTITY-20261126）', npcs: X.npcIdentities }, null, 2) + '\n');
console.log(`町の人の名前と話し方：差しかえ ${done}、すでに済み ${already}、合わない ${miss.length}、物語のあいだのその人用の言葉 ${Object.values(variants).reduce((a, o) => a + Object.keys(o).length, 0)}`);
if (miss.length) console.log(miss.slice(0, 20).join('\n'));
