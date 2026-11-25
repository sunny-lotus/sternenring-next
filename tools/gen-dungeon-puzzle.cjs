// ダンジョンを「部屋と通路」の形にし、謎解きの大きな出来事を置く（2026-11-25 サニー「ダンジョンが迷宮すぎる、見づらい、方向的に謎解き系にしていきたいから　そこまで迷路にしなくていいよ」「大きなイベントを作ってみて」）。
// 技術試験用の仮の区画（status: provisional）。文は世界観・シナリオ室の差替え版（下の「文」）。設定（魔法の体系・ナハトの出自など）にはふれない。
//
// 出来事「封じられた奥の間」：
//   入口の間 → 南の通路 → 中央の広間。北に石の扉（閉じている）。
//   西の部屋と東の部屋に古いレバー（きらきら光る）。2つとも倒すと、石の扉が開く（マップの gates。旗 du.lever.w と du.lever.e）。
//   扉の奥の番人の間に、見えている敵（番人）。勝つと、奥の間への細い口が通れる。奥の間に宝の台。
// 使い方：<node> tools/gen-dungeon-puzzle.cjs（test-dungeon.json と dialogue.json の du.* を書きかえる。何度流しても同じ結果）
const fs = require('fs'), path = require('path');
const P = (id) => path.join(__dirname, '..', 'data', 'maps', `${id}.json`);
const read = (id) => JSON.parse(fs.readFileSync(P(id), 'utf8'));
const write = (id, m) => fs.writeFileSync(P(id), JSON.stringify(m, null, 2) + '\n');

const W = 25, H = 35, CX = 12; // 真ん中の列
const g = Array.from({ length: H }, () => Array(W).fill('#'));
const open = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = '.'; };
open(8, 1, 9, 5);    // 奥の間（宝の台）
open(CX, 6, 1, 1);   // 番人の間から奥の間への細い口
open(5, 7, 15, 5);   // 番人の間
open(11, 12, 3, 1);  // 石の扉のマス（地図では床。閉じている間は gates が通さない）
open(7, 13, 11, 9);  // 中央の広間
open(1, 14, 5, 7);   // 西の部屋
open(6, 16, 1, 3);   //   西の部屋への口
open(19, 14, 5, 7);  // 東の部屋
open(18, 16, 1, 3);  //   東の部屋への口
open(11, 22, 3, 6);  // 南の通路
open(8, 28, 9, 5);   // 入口の間
open(11, 33, 3, 1);
g[H - 1][CX] = 'D';  // 入口（森へ）

const items = [];
const solid = (asset, x, y, w, h, standH, extra = {}) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = '#'; items.push({ asset: `placeholder:${asset}`, x, y, w, h, standH, ...extra }); };
// 柱：奥の間と入口の間の両わき
for (const [x, y] of [[8, 1], [15, 1], [8, 28], [15, 28]]) solid('stone-pillar', x, y, 2, 2, 4.5);
// レバー（西・東の部屋の奥の壁ぎわ）
solid('lever', 2, 14, 1, 1, 1.5);
solid('lever', 22, 14, 1, 1, 1.5);
// 石の壁の板：床に面した壁のマスだけ（外周はブックヌックの箱の壁なので、内側だけ）。横に続く所はまとめる
const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
const edge = (x, y) => inside(x, y) && g[y][x] === '#' && !items.some((it) => x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h)
  && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => ['.', 'D'].includes(g[y + dy]?.[x + dx]));
const used = Array.from({ length: H }, () => Array(W).fill(false)), walls = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!edge(x, y) || used[y][x]) continue; let w = 1; while (w < 5 && edge(x + w, y) && !used[y][x + w]) w++;
  for (let i = 0; i < w; i++) used[y][x + i] = true; walls.push({ asset: 'placeholder:stone-wall', x, y, w, h: 1, standH: 1.9, fadeNearPlayer: true }); // 内側の壁は低め（キャラ2.5より低く、向こうが見える）
}
// 石の扉（開くと消える）
const gate = { asset: 'placeholder:stone-gate', x: 11, y: 12, w: 3, h: 1, standH: 3.2, gate: 'du-gate' };

const m = read('test-dungeon');
m.width = W; m.height = H; m.collision = g.map((r) => r.join(''));
m.exits = [{ ...m.exits[0], x: CX, y: H - 1 }];
m.spawns = { default: { x: CX, y: H - 3, dir: 'up' } };
m.gates = [{ id: 'du-gate', x: 11, y: 12, w: 3, h: 1, open: { flags: { 'du.lever.w': true, 'du.lever.e': true } }, note: '2026-11-25 仕掛けの扉（仮）：西と東のレバーを2つとも倒すと開く' }];
m.encounters = [{ id: 'du-guardian', x: CX, y: 7, battle: 'normal', symbol: ['battle/img/enemies/sr-norma.png'], note: '奥の間の番人（仮）：バトル試作の「通常戦（敵三体）」。序盤の場所なので、目安Lv8の「甲殻と疾風」から目安Lv1に下げた（2026-11-25 サニー「戦闘とフィールドの設定がちぐはぐ」）。勝つと消え、奥の間への口が通れる' }];
const L = (band) => m.stage.layers.find((l) => l.band === band);
L('mid').items = [...items, gate, { asset: 'placeholder:monster', x: CX - 1, y: 7, w: 3, h: 1, standH: 3.4, zOffset: 0.05, encounter: 'du-guardian' }, ...walls]; // 番人の絵（見えている敵の板）
L('backdrop').items = [{ asset: 'placeholder:dungeon-back-wall', x: 0, y: 0, w: W, h: 1, standH: 4 }];

// 出来事（調べる）
const lever = (id, x, y, me, other) => ({ id: `du-lever-${id}`, x, y, trigger: 'examine', status: 'provisional', sparkle: { flag: `du.lever.${me}` }, pages: [
  { when: { flags: { [`du.lever.${me}`]: true } }, dialogue: 'du.lever.done' },
  { when: { flags: { [`du.lever.${other}`]: true } }, dialogue: 'du.lever.last', set: { flags: { [`du.lever.${me}`]: true } } },
  { dialogue: 'du.lever.first', set: { flags: { [`du.lever.${me}`]: true } } }] });
m.events = (m.events || []).filter((e) => !/^(sparkle-du-|dungeon-altar|du-)/.test(e.id));
m.events.push(lever('w', 2, 14, 'w', 'e'), lever('e', 22, 14, 'e', 'w'));
m.events.push({ id: 'du-gate-look', x: CX, y: 12, trigger: 'examine', status: 'provisional', pages: [
  { when: { flags: { 'du.lever.w': true, 'du.lever.e': true } }, dialogue: 'du.gate.opened' },
  { when: { flags: { 'du.lever.w': true } }, dialogue: 'du.gate.half' },
  { when: { flags: { 'du.lever.e': true } }, dialogue: 'du.gate.half' },
  { dialogue: 'du.gate.closed' }] });
m.events.push({ id: 'dungeon-altar', x: CX, y: 2, trigger: 'examine', status: 'provisional', sparkle: { flag: 'dungeon.altar' }, pages: [
  { when: { flags: { 'dungeon.altar': true } }, dialogue: 'dungeon.altar.again' },
  { dialogue: 'dungeon.altar.first', set: { flags: { 'dungeon.altar': true } }, give: { gold: 50, items: { '霊水': 2 } } }] });
// きらきら光る所（部屋の隅に3つ）
const kinds = [[1, 20, 'mats', '光る苔', 2, '湿った石のすきまで、光る苔がまたたいている。'], [23, 20, 'items', '霊水', 1, '崩れた石の下に、古い霊水のびんが埋もれていた。'], [9, 32, 'items', '気付け薬', 1, '壁のくぼみに、だれかが隠した気付け薬があった。']];
const D = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), 'utf8'));
for (const k of Object.keys(D.lines)) if (/^(du\.|sparkle\.du-)/.test(k)) delete D.lines[k];
kinds.forEach(([x, y, kind, name, n, text], i) => {
  const id = `du-${i + 1}`, flag = `sparkle.${id}`;
  if (g[y][x] !== '.') throw new Error(`光る所 ${x},${y} が床でない`);
  m.events.push({ id: `sparkle-${id}`, x, y, trigger: 'examine', sparkle: { flag }, status: 'provisional', pages: [{ when: { flags: { [flag]: true } }, dialogue: 'sparkle.empty' }, { dialogue: `sparkle.${id}`, set: { flags: { [flag]: true } }, give: { [kind]: { [name]: n } } }] });
  D.lines[`sparkle.${id}`] = ['足もとが、きらきら光っている。', text];
});
// 文：世界観・シナリオ室「ダンジョン謎解き_会話差替え_v01.md」（STORY-DUNGEON-20261125、status provisional・担当室の内部採用）をそのまま写した。
// 人物の行は member（その仲間が隊列にいるときだけ）。地の文だけでも手がかりと結果がわかる
const v = (text) => ({ member: 'volt', text }), n = (text) => ({ member: 'nacht', text });
Object.assign(D.lines, {
  'du.gate.closed': ['大きな石の扉。押しても引いても、動かない。', '中央の丸い紋から、細い溝が左右の壁へ伸びている。西と東の部屋へ続いているようだ。', v('溝をたどってみよう。西と東、両方に何かありそうだ。'), n('押すだけで開いたら、楽だったんだけどね。左右を見てこよう。')],
  'du.gate.half': ['扉の中央の紋が、半分だけ光っている。扉はまだ動かない。', v('片方だけじゃ足りないか。もう一方の部屋も見よう。'), n('あと半分。ここまで来たら、続きを見たいね。')],
  'du.gate.opened': ['石の扉は開き、奥へ続く道が見える。', n('よし、通れる。奥はどうなってるかな。')],
  'du.lever.first': ['古い木のレバーがある。力を込めて倒すと、壁の溝の奥で、ごとりと石が動く音がした。', 'レバーは倒れた位置で止まった。', n('よし、動いた。扉の方も変わってるかな。')],
  'du.lever.last': ['残るレバーを倒すと、北の広間の方から、重い石がずれる音が響いた。', v('北からだな。扉を確かめよう。'), n('今度は押さずに通れるといいね。')],
  'du.lever.done': ['レバーはすでに倒れている。これ以上は動かない。'],
  'dungeon.altar.first': ['奥の間に、古い石の台がある。台の上には、小さな革袋が置かれている。', v('袋があるな。中を確かめよう。'), '袋を開くと、硬貨と霊水の瓶が入っていた。', n('うん、これなら帰りの足取りも軽くなるね。')],
  'dungeon.altar.again': { pick: [['古い石の台。袋はもう回収してある。'], ['古い石の台。袋はもう回収してある。', { member: 'flare', text: '帰りにレバーも見ていこうかな。あんなに大きな扉が動くの、面白いね。' }], ['古い石の台。袋はもう回収してある。', { member: 'serena', text: '戻る前に、忘れ物がないか確かめておきましょう。' }]] },
});
D.dungeonNote = '2026-11-25：du.* と dungeon.altar.* は世界観・シナリオ室のダンジョン謎解き_会話差替え_v01（provisional・担当室の内部採用）。仕掛け・旗・報酬は tools/gen-dungeon-puzzle.cjs';
fs.writeFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), JSON.stringify(D, null, 2) + '\n');
m.provenance = (m.provenance || '').replace(/ 2026-11-25 作者「ダンジョンも迷宮っぽく.*$/, '') + ' 2026-11-25 サニー「そこまで迷路にしなくていいよ」「大きなイベントを作ってみて」：tools/gen-dungeon-puzzle.cjs で部屋と通路の形に（25×35）。西と東のレバーで石の扉が開き、番人を倒すと奥の間。';
write('test-dungeon', m);
const f = read('test-forest'), gt = f.exits.find((e) => e.id === 'gate'); gt.to.arrive = { x: CX, y: H - 3, dir: 'up' }; write('test-forest', f);
console.log('ダンジョン', W + '×' + H, '壁の板', walls.length);
console.log(m.collision.join('\n'));
