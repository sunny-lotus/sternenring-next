// 町の追加物12点を、銀鹿亭前の通りと広場に置く（2026-11-25 サニー「12点とも入れて」）。
// 絵：美術・演出室の pixel/元絵/町_ノルン_追加_v01（2026-11-24、作者採用前）を、town-prep.ps1 と同じ決まり（透明でない所を切り出し、長い辺512、WebP 質88）で assets/town/norn に。
// 置き場所はClaudeの仮（井戸を広場に置くのは、美術・演出室の「採用未定の配置案」）。
// 使い方：node tools/add-town-props.cjs（gen-norn.cjs・gen-norn-inn-street.cjs で地図を作り直したら、そのあとにもう一度流す。何度流しても同じ結果）
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data', 'maps');
const BOARDS = {
  crates: 'crates.webp', barrels: 'barrels.webp', well: 'well.webp', bench: 'bench.webp', 'notice-board': 'notice_board.webp', signpost: 'signpost.webp',
  trough: 'trough.webp', sacks: 'sacks.webp', firewood: 'firewood.webp', fence: 'fence.webp', laundry: 'laundry.webp', 'door-pots': 'door_pots.webp',
};
// [板の名前, x, y, 幅, 奥行き, 高さ（マス）, 帯, ぶつかるか]
const ADD = {
  'norn-inn-street': [
    ['door-pots', 20, 5, 2, 1, 1.1, 'mid', true], // 角の家の鉢植え（扉の真横だと入口をふさいで見えた。2026-11-25 サニー「家の前に花壇があって入り口を邪魔している」で2マス離した）
    ['bench', 29, 5, 2, 1, 1.2, 'mid', true], // 家の前のベンチ
  ],
  'norn-plaza': [
    ['well', 16, 12, 3, 2, 3.6, 'mid', true], // 広場の井戸（美術・演出室の配置案。11列目と13〜15列目は北の端まで歩ける道として空けておく）
    ['trough', 8, 8, 3, 1, 1.0, 'mid', true], // 水桶
    ['notice-board', 8, 6, 2, 1, 3.2, 'mid', true], // 掲示板
    ['bench', 3, 13, 2, 1, 1.2, 'mid', true],
    ['barrels', 21, 8, 2, 1, 1.4, 'mid', true],
    ['door-pots', 20, 6, 2, 1, 1.1, 'mid', true], // 扉（18,5）から離す
    ['signpost', 52, 13, 1, 1, 2.2, 'mid', true], // 森への道の道しるべ（文字は書いていない）
    ['fence', 48, 7, 4, 1, 1.5, 'mid', true], // 旅人（53,8）の手前の空き地のふち
    ['firewood', 51, 5, 2, 1, 0.8, 'mid', true],
    ['laundry', 21, 3, 4, 1, 4.2, 'back', false], // 家と家の間の路地に渡した洗濯ひも（両はしは家の陰）
  ],
};
// 扉の真横の植えこみを、扉から離す（2026-11-25 サニー「家の前に花壇があって入り口を邪魔している」）。[地図, もとの x,y, 新しい x]。同じ所の「調べる」出来事もいっしょに動かす
const MOVE = { 'norn-plaza': [[17, 36, 19], [42, 36, 40]] };
// 星環祭の飾りと、歩き回る町の人（2026-11-25 サニー「祭り感あるうごきやかざりつけ」。飾りはコードで描いた仮、本物の絵は美術・演出室に依頼）。
// 飾りはぶつからない。[板の名前, x, y, 幅, 奥行き, 高さ, 帯, ぶつかるか]
const FESTIVAL = {
  'norn-inn-street': [
    ['bunting', 3, 4, 11, 1, 5.6, 'back', false], ['bunting', 15, 4, 8, 1, 5.6, 'back', false], ['bunting', 24, 4, 9, 1, 5.6, 'back', false], ['bunting', 34, 4, 8, 1, 5.6, 'back', false], // 家の正面に沿った小旗
    ['festival-banner', 14, 4, 1, 1, 4.6, 'back', false], ['festival-banner', 33, 4, 1, 1, 4.6, 'back', false], // 路地の口の垂れ幕
    ['lantern-string', 1, 7, 42, 1, 6.4, 'mid', false], // 通りの上に渡した提灯
  ],
  'norn-plaza': [
    ['bunting', 2, 5, 20, 1, 5.4, 'back', false], ['bunting', 24, 5, 8, 1, 5.4, 'back', false],
    ['festival-banner', 22, 5, 1, 1, 4.4, 'back', false],
    ['lantern-string', 1, 9, 54, 1, 6.6, 'mid', false], ['lantern-string', 1, 13, 22, 1, 6.2, 'mid', false],
  ],
};
// 歩き回る町の人：道をたどって行き来する（端で少し立ち止まる）。マスは通りの空いた所。隣のマップへの出入口から5マス以上離す（2026-11-25 サニー「隣のマップに行く場所の前にモブが立っているのどけて」）
const WALKERS = {
  'norn-inn-street': [
    { id: 'st-a', sprite: 'mob01', path: [[2, 8], [30, 8]], speed: 1.1 }, { id: 'st-b', sprite: 'mob02', path: [[37, 9], [12, 9]], speed: 0.9 },
    { id: 'st-c', sprite: 'mob03', path: [[19, 14], [19, 9], [34, 9]], speed: 1.4, wait: 600 }, { id: 'st-d', sprite: 'mob04', path: [[22, 6], [37, 6]], speed: 0.8, wait: 2400 },
  ],
  'norn-plaza': [
    { id: 'pl-a', sprite: 'mob01', path: [[6, 11], [30, 11]], speed: 1 }, { id: 'pl-b', sprite: 'mob02', path: [[48, 10], [24, 10]], speed: 0.9 },
    { id: 'pl-c', sprite: 'mob03', path: [[5, 6], [5, 12], [12, 12]], speed: 1.5, wait: 500 }, { id: 'pl-d', sprite: 'mob04', path: [[12, 30], [12, 16]], speed: 0.8, wait: 2000 },
    { id: 'pl-e', sprite: 'mob02', path: [[38, 30], [38, 15]], speed: 1 },
  ],
};
// いまのコードの木箱のうち、別の物にするもの（通り）
const SWAP = { 'norn-inn-street': { '17,11': 'sacks', '16,15': 'firewood', '23,1': 'barrels' } };

for (const id of Object.keys(ADD)) {
  const file = path.join(dir, `${id}.json`), m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const g = m.collision.map((r) => [...r]);
  Object.assign(m.stage.townArt.boards, BOARDS);
  for (const l of m.stage.layers) { // 前に置いた物を外す（ぶつかる所も戻す）
    for (const it of l.items.filter((x) => x.prop)) if (it.solid) for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) g[j][i] = '.';
    l.items = l.items.filter((x) => !x.prop);
  }
  for (const l of m.stage.layers) for (const it of l.items) { const k = SWAP[id]?.[`${it.x},${it.y}`]; if (k && /^placeholder:(crates|sacks|firewood|barrels)$/.test(it.asset)) it.asset = `placeholder:${k}`; }
  for (const [name, x, y, w, h, standH, band, solid] of ADD[id]) {
    if (solid) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (g[j][i] !== '.') throw new Error(`${id} ${name}：(${i},${j}) は空いていない（${g[j][i]}）`);
      if ([...(m.events || []), ...(m.npcs || [])].some((e) => e.x === i && e.y === j)) throw new Error(`${id} ${name}：(${i},${j}) に出来事か町の人がいる`);
      g[j][i] = '#';
    }
    m.stage.layers.find((l) => l.band === band).items.push({ asset: `placeholder:${name}`, x, y, w, h, standH, zOffset: band === 'back' ? 0.1 : 0.03, prop: true, solid });
  }
  for (const [x0, y0, x1] of MOVE[id] || []) {
    const it = m.stage.layers.flatMap((l) => l.items).find((i) => (i.x === x0 || i.x === x1) && i.y === y0 && /planter|flowerbed/.test(i.asset)); if (!it) throw new Error(id + ' 動かす植えこみが無い');
    if (it.x === x0) { // まだ動かしていない
      for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) g[j][i] = '.';
      it.x = x1; for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) { if (g[j][i] !== '.') throw new Error(id + ' 植えこみの行き先がふさがっている'); g[j][i] = '#'; }
    }
    for (const e of m.events || []) if (e.y === y0 && e.x >= x0 && e.x < x0 + it.w && !(e.x >= x1 && e.x < x1 + it.w)) e.x += x1 - x0; // gen-town-life.cjs を流し直すと出来事はもとの所に戻るので、毎回そろえる
  }
  for (const [name, x, y, w, h, standH, band] of FESTIVAL[id] || []) m.stage.layers.find((l) => l.band === band).items.push({ asset: `placeholder:${name}`, x, y, w, h, standH, zOffset: band === 'back' ? 0.3 : 0.02, prop: true, solid: false, festival: true });
  m.walkers = WALKERS[id] || [];
  m.collision = g.map((r) => r.join(''));
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  console.log(id, ADD[id].length, '点');
}
