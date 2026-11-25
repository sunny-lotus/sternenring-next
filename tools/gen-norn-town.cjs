// ノルンの町の新しい骨格と、エルデ森林・小さな村・魔女の家への道（2026-11-25 STORY-NORN-MAP-20261125 revision 2）。
// 作者「じゃあ、さっきの絵の地図に加えて今話したことをもとにクロードにつくってもらおうか」（世界観・シナリオ室「Claude引渡し_ノルンとエルデ森林の地図制作_v01.md」、
// 参考図 ノルン_全体配置案_v01.png、ノルン全体の文字地図_v01.md、決定記録、エルデ森林と魔女の家_地理記録）。歩いて位置関係を確かめるための内部試作（status provisional）。
//
// 見開きの分け方（Claude の仮の技術判断。カメラはいつも南から北を見るので、東西は「ページをめくる」、北へは「奥へ入りこむ（dive）」、南へは「背景から出てくる（emerge）」）：
//   北門前（倉庫・荷置き場・入門を待つ所。北は第三城壁＝ノルンの北の壁、北門）
//        │ dive / emerge
//   西の通り・西門 ── 中央広場（大きめ。北のはしに時計台の案）── 商店通り・東門 ── 東門の外・王道（北に王道側の門）
//                    │（左下）           │
//        銀鹿亭前の通り（今の試作のまま）  南の通り・南門（南門の先は未定）
//   西門の外：エルデ森林・東 ── エルデ森林・分かれ道 ── 小さな村（西）
//                                         │ 南の森の奥へ
//                                   森の奥・魔女の家（村寄り）
// 決まりを守る：北の壁は第三城壁を共用（別の北壁・すき間を作らない）。王道は東壁の外。北門と王道側の門は別。どちらもカルディアへは通行の許可が要る
// （許可の取り方・料金・証書・審査は作らない。門は「開発中：入れない」の仮処理）。南門の先・村の名前・距離は決めない。新しい人物・事件は置かない。
// 銀鹿亭前の通り（ノルン導入の7場面・storyLock）はそのまま使い、東の出入口だけ新しい広場へつなぎかえる。前の広場（norn-plaza）は見比べ用に残す（開発の窓・ワープで行ける）。
// 使い方：<node> tools/gen-norn-town.cjs（ほかの町の道具・gen-norn-story.cjs のあとに流す。何度流しても同じ結果）
const fs = require('fs'), path = require('path');
const HOUSE = require('./norn-house-art.cjs');
const dir = path.join(__dirname, '..', 'data', 'maps');
const read = (id) => JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
const write = (m) => fs.writeFileSync(path.join(dir, m.id + '.json'), JSON.stringify(m, null, 2) + '\n');
const HOUSE_FILES = Object.keys(HOUSE.ART).filter((f) => !['house_merchant_3f.webp', 'inn_silver_deer.webp'].includes(f));
function rnd(seed) { let x = seed >>> 0 || 1; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296; }
const SRC = 'production/claude/scenario/Claude引渡し_ノルンとエルデ森林の地図制作_v01.md（STORY-NORN-MAP-20261125 revision 2）';
const inn = read('norn-inn-street');
const TOWN_ART = JSON.parse(JSON.stringify(inn.stage.townArt));
const FOREST_ART = JSON.parse(JSON.stringify(read('test-forest').stage.townArt)); delete FOREST_ART.doors; FOREST_ART.boards = { pine: FOREST_ART.boards.pine, rock: FOREST_ART.boards.rock, bush: FOREST_ART.boards.bush };
// 骨格の絵（2026-11-26 美術・演出室 ART-NIGHT-NORN-20261126、pixel/元絵/ノルン_骨格_v01 を tools/copy-norn-structure-art.py で写した。provisional）。壁は横にくり返して張る
Object.assign(TOWN_ART.boards, { 'town-wall': 'town_wall.webp', 'third-wall': 'third_wall.webp', 'gate-tower': 'gate_tower.webp', 'kardia-gate': 'kardia_gate.webp', 'clock-tower': 'clock_tower.webp' });
Object.assign(FOREST_ART.boards, { 'witch-house': 'witch_house.webp', signpost: 'signpost_forest.webp', herbs: 'herbs_forest.webp', firewood: 'firewood_forest.webp' });
const TOWN_BACK = inn.stage.layers.find((l) => l.band === 'backdrop').items[0];
const FOREST_BACK = { asset: 'placeholder:night-sky-ring', sink: 1, image: 'assets/backdrops/erde_night_v01.jpg', imageDay: 'assets/backdrops/erde_day_v01.jpg', imageNote: 'エルデ森林の奥の背景（美術・演出室 2026-11-26 ART-NIGHT-NORN、provisional）', x: 0, y: 0, h: 1, standH: 26 };
const CAM = { pitchDeg: 10, fovDeg: 75, distance: 6.5, follow: 'player', deadzone: [2, 1.5] };
const ORB_TOWN = { count: 10, alpha: 0.5, color: [1, 0.86, 0.62], size: 0.7, note: '町：暖かいほこりの粒（仮）' };

/** 地図の土台。kind: 'town'｜'forest' */
function base(id, title, W, H, kind, seed) {
  const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
  const M = { id, title, W, H, kind, g, items: { back: [], mid: [], front: [] }, exits: [], events: [], walkers: [], paved: [], roads: [], paths: [], R: rnd(seed) };
  M.wall = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j]?.[i] !== undefined) g[j][i] = '#'; };
  M.open = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j]?.[i] !== undefined) g[j][i] = '.'; };
  M.free = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i < 1 || j < 1 || i > W - 2 || j > H - 2 || g[j][i] !== '.') return false; return true; };
  M.put = (band, asset, x, y, w, h, standH, z = 0, solid = true, extra = {}) => { if (solid) M.wall(x, y, w, h); M.items[band].push({ asset: `placeholder:${asset}`, x, y, w, h, standH, zOffset: z, ...extra }); };
  /** 出入口（door のマスをあけて、行き先を書く） */
  M.exit = (eid, x, y, span, dir, effect, to) => { for (let k = 0; k < span; k++) { const [i, j] = dir === 'left' || dir === 'right' ? [x, y + k] : [x + k, y]; g[j][i] = 'D'; } M.exits.push({ id: eid, x, y, ...(span > 1 ? { span } : {}), dir, effect, to }); };
  /** 調べると出る言葉（門など） */
  M.note = (eid, x, y, dialogue) => M.events.push({ id: eid, x, y, trigger: 'examine', status: 'provisional', pages: [{ dialogue }] });
  /** 家並み：x0〜x1 の y 行から奥行き h の家を、壁どうしくっつけて並べる（家の絵はドアの高さから幅を決める。gen-norn.cjs と同じ決め方） */
  M.houses = (x0, x1, y, band = 'back', opts = {}) => {
    const h = band === 'back' ? 4 : 3; let x = x0;
    while (x < x1) {
      const fits = (f) => { const w = Math.round(HOUSE.boardSize(f).w); return x + w <= x1 + 1 && M.free(x, y, w, h); };
      const want = (opts.files || HOUSE_FILES)[Math.floor(M.R() * (opts.files || HOUSE_FILES).length)];
      const art = fits(want) ? want : (opts.files || HOUSE_FILES).filter(fits).sort((a, b) => HOUSE.boardSize(b).w - HOUSE.boardSize(a).w)[0];
      if (!art) { x++; continue; }
      const sz = HOUSE.boardSize(art), w = Math.round(sz.w);
      M.put(band, band === 'back' ? 'house-front' : 'house-small', x, y, w, h, Math.round(sz.h * 10) / 10, Math.round(M.R() * 10) / 100);
      M.items[band].at(-1).art = art;
      x += w + (M.R() < (opts.gap ?? 0.15) ? 1 : 0);
    }
  };
  /** 森の木：あいたマスに、密度 p で木・やぶ・岩（keep の所は空けておく） */
  /** 森の木：板は1マップ150枚までなので、道に近い所ほど多く置く（道ぞいが森らしく見える）。遠い所はまばら。南ほど、やぶ・岩が多い（南ほど自然が多い） */
  M.forest = (p, keep, south = 0, max = 140) => {
    const near = (x, y) => Math.min(...M.roads.map((r) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w - 1)), Math.max(r.y - y, 0, y - (r.y + r.h - 1)))), 99);
    const cells = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && !keep(x, y)) cells.push({ x, y, k: near(x, y) * (0.6 + M.R()) });
    cells.sort((a, b) => a.k - b.k);
    for (const { x, y } of cells) {
      if (M.items.back.length + M.items.mid.length >= max || g[y][x] !== '.') continue;
      const r = M.R(), sb = south * (y / H);
      const front = M.roads.some((q) => x >= q.x && x < q.x + q.w && y >= q.y + q.h && y < q.y + q.h + 4); // 道の手前（カメラ側）4マス：高い木はキャラを隠すので、やぶ・岩だけ（2026-11-26 サニーと画面で確認）
      if (r < p && !front) { const s = 4.4 + M.R() * 1.4; M.put('back', 'pine', x, y, 1, 1, Math.round(s * 10) / 10, 0, true, { showH: Math.round(s * 10) / 10 }); }
      else if (r < p + 0.12 + sb * 0.12) { const bush = M.R() < 0.65; M.put('mid', bush ? 'bush' : 'rock', x, y, 1, 1, bush ? 1 : 0.8, 0.02, true, { showH: bush ? 1 : 0.8 }); }
    }
  };
  return M;
}
/** 地図の JSON にする */
function finish(M, spawn, extra = {}) {
  const town = M.kind === 'town';
  const m = {
    format: 'sternenring-next-map', version: 1, id: M.id, title: M.title, kind: 'exterior', status: 'provisional',
    provenance: `2026-11-25 ${SRC} から、tools/gen-norn-town.cjs で作った歩ける内部試作。配置・広さ・建物の数は仮で、正式な地理ではない。`,
    width: M.W, height: M.H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', D: 'door' },
    ground: { tileset: 'tiles.pipoya-town', fill: 'paving', wall: 'wall', rows: null },
    exits: M.exits, spawns: { default: spawn }, events: M.events,
    ...(M.roads.length ? { roads: M.roads } : {}),
    collision: M.g.map((r) => r.join('')),
    stage: {
      camera: CAM,
      floor: town ? 'cobble' : 'soil',
      townArt: town ? TOWN_ART : FOREST_ART,
      ...(town ? { paved: M.paved } : { paths: M.paths }),
      orbs: town ? ORB_TOWN : { count: 26, alpha: 0.75, color: [0.8, 1, 0.7], size: 1, note: '森：木もれ日のような光の粒（仮）' },
      layers: [
        { band: 'backdrop', items: [{ ...(town && !M.forestBack ? TOWN_BACK : FOREST_BACK), x: 0, y: 0, w: M.W }] },
        { band: 'back', items: M.items.back }, { band: 'mid', items: M.items.mid }, { band: 'actors', items: [] }, { band: 'front', items: M.items.front },
      ],
    },
    ...(M.walkers.length ? { walkers: M.walkers } : {}),
    ...extra,
  };
  write(m); return m;
}
const GATE_NOTE = 'map.norn.gate-permit', SOUTH_NOTE = 'map.norn.gate-south', ROAD_NOTE = 'map.road-unbuilt';

// ---------- 中央広場（大きめ。作者「広場は大きめがいい」） ----------
{
  const M = base('norn-square', 'ノルン・中央広場', 42, 30, 'town', 101);
  M.paved.push({ x: 0, y: 0, w: 42, h: 30 });
  // 北：時計台の案（広場の北のはし、北門へ向かう通りの東）と、その両側の家並み
  M.houses(1, 17, 1, 'back'); M.houses(25, 40, 1, 'back');
  M.put('back', 'clock-tower', 23, 2, 4, 3, 11, 0.1); // 時計台（案）。形・用途は未定。遠くからの目印
  M.open(19, 1, 3, 4); // 北門へ向かう通り
  // 東西の家並み（広場を囲む。東の商店通り・西の通り・左下の銀鹿亭の通りへの口はあける）
  M.houses(1, 9, 6, 'back'); M.houses(33, 40, 6, 'back');
  M.houses(1, 9, 17, 'back'); M.houses(33, 40, 17, 'back');
  // 手前（南）：低い物だけ（カメラが主人公のうしろの低い所にあるので、高い家は画面をふさぐ）
  for (const [x, w] of [[2, 2], [8, 2], [25, 2], [31, 2], [37, 2]]) M.put('mid', 'planter', x, 27, w, 1, 1.2, 0.02);
  // 広場の中：屋台は外まわりに。まん中は人が行き交う所としてあける。井戸を目印に
  for (const [x, y] of [[11, 7], [28, 7], [11, 19], [28, 19]]) M.put('mid', 'stall', x, y, 3, 2, 3.2, 0.05);
  M.put('mid', 'well', 19, 14, 3, 2, 3.6, 0.05);
  for (const [x, y] of [[10, 12], [31, 12], [10, 24], [31, 24]]) M.put('mid', 'lamp', x, y, 1, 1, 3.8, 0.05);
  for (const [x, y] of [[15, 22], [26, 10]]) M.put('mid', 'bench', x, y, 2, 1, 1.2, 0.03);
  M.put('mid', 'tree', 15, 10, 1, 1, 6, 0.05); M.put('mid', 'tree', 26, 22, 1, 1, 6, 0.05);
  // 祭りの飾り（吊るす。ぶつからない）
  for (const [x, w] of [[1, 8], [27, 8]]) M.items.back.push({ asset: 'placeholder:bunting', x, y: 4, w, h: 1, standH: 5.6, zOffset: 0.3, prop: true, solid: false, festival: true });
  for (const x of [11, 21]) M.items.mid.push({ asset: 'placeholder:lantern-string', x, y: 9, w: 9, h: 1, standH: 6.4, zOffset: 0.02, prop: true, solid: false, festival: true });
  M.exit('north', 19, 0, 3, 'up', 'dive', { map: 'norn-north-gate', exit: 'south', arrive: { x: 18, y: 13, dir: 'up' } });
  M.exit('east', 41, 12, 3, 'right', 'page', { map: 'norn-east-street', exit: 'west', arrive: { x: 1, y: 7, dir: 'right' } });
  M.exit('west', 0, 12, 3, 'left', 'page', { map: 'norn-west-street', exit: 'east', arrive: { x: 42, y: 7, dir: 'left' } });
  M.exit('inn-street', 0, 23, 3, 'left', 'page', { map: 'norn-inn-street', exit: 'east-street', arrive: { x: 42, y: 6, dir: 'left' } }); // 左下：銀鹿亭の通り（広場の西南）
  M.exit('south', 19, 29, 3, 'down', 'emerge', { map: 'norn-south-street', exit: 'north', arrive: { x: 11, y: 1, dir: 'down' } });
  // 出口の目印（2026-11-26 夜の改善・学びノート題1「行きたい所を1画面に」）：広い広場は1画面に入らないので、どの出口にも両側に街灯を立て、遠くからでも口が分かるようにする
  for (const e of M.exits) {
    const side = e.dir === 'left' || e.dir === 'right' ? [[e.x + (e.dir === 'left' ? 1 : -1), e.y - 1], [e.x + (e.dir === 'left' ? 1 : -1), e.y + (e.span || 1)]] : [[e.x - 1, e.y + (e.dir === 'up' ? 1 : -1)], [e.x + (e.span || 1), e.y + (e.dir === 'up' ? 1 : -1)]];
    for (const [x, y] of side) if (M.free(x, y, 1, 1)) M.put('mid', 'lamp', x, y, 1, 1, 3.8, 0.05);
  }
  M.walkers.push({ id: 'sq-a', sprite: 'mob01', path: [[8, 13], [16, 13]], speed: 0.9 }, { id: 'sq-b', sprite: 'mob02', path: [[24, 17], [34, 17]], speed: 1 }, { id: 'sq-c', sprite: 'mob03', path: [[14, 11], [14, 21]], speed: 0.8, wait: 1800 }, { id: 'sq-d', sprite: 'mob04', path: [[27, 12], [27, 18]], speed: 1.1 });
  finish(M, { x: 20, y: 18, dir: 'up' });
}
// ---------- 商店通り・東門（東門が町の主な入口。門寄りに旅支度・荷物、広場寄りに食べ物・日用品の案） ----------
{
  const M = base('norn-east-street', 'ノルン・商店通りと東門', 48, 16, 'town', 202);
  M.paved.push({ x: 0, y: 5, w: 48, h: 7 });
  M.houses(1, 38, 1, 'back', { gap: 0.05 });
  for (const [x, a] of [[4, 'awning-red'], [12, 'awning-green'], [20, 'awning-wheat'], [28, 'awning-red']]) M.items.back.push({ asset: `placeholder:${a}`, x, y: 4, w: 3, h: 1, standH: 3.9, zOffset: 0.25 });
  for (const [x, a] of [[8, 'sign-bread'], [16, 'sign-cup'], [24, 'sign-shoe']]) M.items.back.push({ asset: `placeholder:${a}`, x, y: 4, w: 1, h: 1, standH: 5, zOffset: 0.25 });
  for (const [x, w] of [[4, 3], [11, 3], [19, 3], [27, 3]]) M.put('mid', 'stall', x, 12, w, 2, 3.2, 0.05);
  M.put('mid', 'cart', 33, 12, 3, 2, 2.4, 0.05); M.put('mid', 'crates', 37, 12, 2, 1, 1.4, 0.05); M.put('mid', 'sacks', 31, 4, 2, 1, 1.2, 0.05);
  for (const x of [8, 22, 36]) M.put('mid', 'lamp', x, 11, 1, 1, 3.8, 0.05);
  // 東門：町の東の壁（家並みの東）と門の塔。東の出入口は門の口
  M.wall(40, 1, 7, 4); M.put('back', 'town-wall', 40, 1, 7, 4, 4.6, 0.05, true);
  M.put('back', 'gate-tower', 42, 4, 3, 1, 7.5, 0.12); M.put('mid', 'gate-tower', 42, 12, 3, 2, 7.5, 0.06);
  M.wall(40, 13, 7, 2); M.put('mid', 'town-wall', 39, 13, 3, 2, 3.4, 0.03, true); M.put('mid', 'town-wall', 45, 13, 2, 2, 3.4, 0.03, true);
  M.exit('west', 0, 6, 3, 'left', 'page', { map: 'norn-square', exit: 'east', arrive: { x: 40, y: 13, dir: 'left' } });
  M.exit('east-gate', 47, 6, 3, 'right', 'page', { map: 'norn-kingsroad', exit: 'east-gate', arrive: { x: 6, y: 15, dir: 'right' } });
  M.walkers.push({ id: 'es-a', sprite: 'mob02', path: [[7, 8], [34, 8]], speed: 1 }, { id: 'es-b', sprite: 'mob03', path: [[30, 10], [9, 10]], speed: 0.8, wait: 1600 });
  finish(M, { x: 24, y: 8, dir: 'right' });
}
// ---------- 東門の外・王道（王道は東壁の外を南北に通る。北に王道側の門＝カルディアへ。通行の許可が要る） ----------
{
  const M = base('norn-kingsroad', '東門の外・王道', 28, 30, 'town', 303);
  M.paved.push({ x: 11, y: 0, w: 5, h: 30 }, { x: 0, y: 14, w: 12, h: 4 });
  // 北：カルディアの第三城壁と王道側の門
  M.put('back', 'third-wall', 1, 1, 26, 3, 7, 0.02); // 第三城壁は端から端まで1枚（門の絵の両わきにすき間ができないよう、門はこの手前に重ねる。2026-11-26 サニーと画面で確認）
  M.put('back', 'kardia-gate', 10, 1, 7, 3, 8, 0.08); M.wall(10, 1, 7, 3);
  M.note('kingsroad-gate', 13, 4, GATE_NOTE);
  // 西：ノルンの東の壁（東門の口だけあける）
  for (let y = 5; y < 28; y += 2) if (y < 13 || y > 18) M.put('back', 'town-wall', 1, y, 4, 2, 4.6, 0.04);
  M.put('back', 'gate-tower', 1, 12, 4, 1, 7.5, 0.1); M.put('mid', 'gate-tower', 1, 18, 4, 1, 7.5, 0.06);
  // 東：野と木
  for (const [x, y] of [[20, 6], [23, 9], [19, 13], [24, 16], [21, 20], [25, 24], [18, 26]]) M.put('mid', 'tree', x, y, 1, 1, 6, 0.05);
  M.put('mid', 'signpost', 17, 16, 1, 1, 2.2, 0.05);
  M.note('kingsroad-south', 13, 27, ROAD_NOTE);
  M.wall(11, 28, 5, 1);
  M.exit('east-gate', 0, 15, 3, 'left', 'page', { map: 'norn-east-street', exit: 'east-gate', arrive: { x: 46, y: 7, dir: 'left' } });
  M.walkers.push({ id: 'kr-a', sprite: 'mob04', path: [[12, 8], [12, 24]], speed: 0.7, wait: 2200 }, { id: 'kr-b', sprite: 'mob01', path: [[15, 25], [15, 9]], speed: 0.9 });
  finish(M, { x: 13, y: 15, dir: 'up' });
}
// ---------- 北門前（倉庫・荷置き場・入門を待つ所。北の壁は第三城壁そのもの） ----------
{
  const M = base('norn-north-gate', 'ノルン・北門前', 38, 16, 'town', 404);
  M.paved.push({ x: 15, y: 0, w: 8, h: 16 }, { x: 1, y: 6, w: 36, h: 5 });
  M.put('back', 'third-wall', 1, 1, 36, 3, 7, 0.02); // 第三城壁は端から端まで1枚（門はこの手前に重ねる）
  M.put('back', 'kardia-gate', 15, 1, 8, 3, 8, 0.08); M.wall(15, 1, 8, 3);
  M.note('north-gate', 18, 4, GATE_NOTE); M.note('north-gate-2', 19, 4, GATE_NOTE);
  // 西：倉庫と荷置き場
  M.put('back', 'house-warehouse', 2, 4, 10, 2, 7, 0.1, true, { art: 'house_d_workshop.webp' });
  for (const [a, x, y, w, h, s] of [['crates', 2, 11, 2, 1, 1.4], ['barrels', 5, 11, 2, 1, 1.4], ['sacks', 8, 11, 2, 1, 1.2], ['cart', 11, 11, 3, 2, 2.4], ['crates', 12, 4, 2, 1, 1.4]]) M.put('mid', a, x, y, w, h, s, 0.05);
  // 東：入門を待つ所（ベンチ・水桶）
  for (const x of [25, 29, 33]) M.put('mid', 'bench', x, 12, 2, 1, 1.2, 0.03);
  M.put('mid', 'trough', 28, 5, 3, 1, 1, 0.03); M.put('mid', 'lamp', 24, 5, 1, 1, 3.8, 0.05); M.put('mid', 'lamp', 14, 5, 1, 1, 3.8, 0.05);
  M.exit('south', 17, 15, 3, 'down', 'emerge', { map: 'norn-square', exit: 'north', arrive: { x: 20, y: 1, dir: 'down' } });
  M.walkers.push({ id: 'ng-a', sprite: 'mob03', path: [[26, 8], [35, 8]], speed: 0.6, wait: 3000 });
  finish(M, { x: 18, y: 8, dir: 'up' });
}
// ---------- 西の通り・西門（森へ向かう人の道） ----------
{
  const M = base('norn-west-street', 'ノルン・西の通りと西門', 44, 16, 'town', 505);
  M.paved.push({ x: 0, y: 5, w: 44, h: 7 });
  M.houses(9, 42, 1, 'back', { gap: 0.2 });
  M.items.back.push({ asset: 'placeholder:herbs', x: 14, y: 4, w: 2, h: 1, standH: 4.2, zOffset: 0.25 }, { asset: 'placeholder:awning-green', x: 26, y: 4, w: 3, h: 1, standH: 3.9, zOffset: 0.25 });
  M.put('mid', 'firewood', 18, 12, 2, 1, 0.8, 0.03); M.put('mid', 'fence', 22, 12, 4, 1, 1.5, 0.03); M.put('mid', 'crates', 30, 12, 2, 1, 1.4, 0.03); M.put('mid', 'tree', 36, 12, 1, 1, 6, 0.05);
  for (const x of [14, 28]) M.put('mid', 'lamp', x, 11, 1, 1, 3.8, 0.05);
  // 西門：町の西の壁と門の塔。西の出入口は門の口（森へ）
  M.put('back', 'town-wall', 1, 1, 7, 4, 4.6, 0.05, true);
  M.put('back', 'gate-tower', 2, 4, 3, 1, 7.5, 0.12); M.put('mid', 'gate-tower', 2, 12, 3, 2, 7.5, 0.06);
  M.put('mid', 'town-wall', 1, 13, 1, 2, 3.4, 0.03, true); M.put('mid', 'town-wall', 5, 13, 3, 2, 3.4, 0.03, true);
  M.exit('east', 43, 6, 3, 'right', 'page', { map: 'norn-square', exit: 'west', arrive: { x: 1, y: 13, dir: 'right' } });
  M.exit('west-gate', 0, 6, 3, 'left', 'page', { map: 'erde-forest-east', exit: 'east', arrive: { x: 46, y: 9, dir: 'left' } });
  M.walkers.push({ id: 'ws-a', sprite: 'mob04', path: [[12, 9], [36, 9]], speed: 0.8 });
  finish(M, { x: 22, y: 8, dir: 'left' });
}
// ---------- 南の通り・南門（住宅と小さな店。南門の先は未定） ----------
{
  const M = base('norn-south-street', 'ノルン・南の通りと南門', 26, 28, 'town', 606);
  M.paved.push({ x: 10, y: 0, w: 5, h: 26 }, { x: 1, y: 7, w: 24, h: 2 }, { x: 1, y: 15, w: 24, h: 2 });
  for (const y of [1, 9, 17]) { M.houses(1, 9, y, 'back'); M.houses(16, 24, y, 'back'); }
  for (const [x, y] of [[6, 6], [19, 14]]) M.put('mid', 'laundry', x, y, 4, 1, 4.2, 0.05, false);
  M.put('mid', 'planter', 8, 22, 2, 1, 1.2, 0.02); M.put('mid', 'door-pots', 16, 22, 2, 1, 1.1, 0.02);
  // 南門（手前のはし）。門の先は未定なので出られない
  M.put('front', 'town-wall', 1, 25, 8, 1, 2.6, 0.02); M.put('front', 'town-wall', 17, 25, 8, 1, 2.6, 0.02);
  M.put('front', 'gate-tower', 8, 24, 2, 1, 4.5, 0.03); M.put('front', 'gate-tower', 15, 24, 2, 1, 4.5, 0.03);
  M.wall(10, 26, 5, 1); M.note('south-gate', 12, 25, SOUTH_NOTE); M.note('south-gate-2', 11, 25, SOUTH_NOTE); M.note('south-gate-3', 13, 25, SOUTH_NOTE);
  M.exit('north', 11, 0, 3, 'up', 'dive', { map: 'norn-square', exit: 'south', arrive: { x: 20, y: 28, dir: 'up' } });
  M.walkers.push({ id: 'ss-a', sprite: 'mob02', path: [[11, 6], [11, 20]], speed: 0.7, wait: 2000 });
  finish(M, { x: 12, y: 12, dir: 'down' });
}
// ---------- エルデ森林・東（ノルンの西門から西へ。北は第三城壁寄りで木がまばら、南ほど自然が多い） ----------
const forestRoad = (M, pts, w = 3) => { // 道（街道あつかい・小道の絵）：折れ線の点をつなぐ
  M.paths.push({ pts: pts.map(([x, y]) => [x + 0.5, y + 0.5]), w: w - 0.6 });
  for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [pts[k], pts[k + 1]]; const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), rw = Math.abs(a[0] - b[0]) + w, rh = Math.abs(a[1] - b[1]) + w; const rx = Math.max(0, x - (w >> 1)), ry = Math.max(0, y - (w >> 1)); M.roads.push({ x: rx, y: ry, w: Math.min(M.W, x - (w >> 1) + rw) - rx, h: Math.min(M.H, y - (w >> 1) + rh) - ry }); }
};
const onRoad = (M, x, y, pad = 1) => M.roads.some((r) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad);
{
  const M = base('erde-forest-east', 'エルデ森林・ノルン寄り', 50, 20, 'forest', 707);
  forestRoad(M, [[0, 9], [14, 9], [18, 7], [30, 7], [34, 10], [49, 10]]);
  M.forest(0.45, (x, y) => onRoad(M, x, y) || (y < 4 && M.R() < 0.6), 1);
  M.exit('east', 49, 9, 3, 'right', 'page', { map: 'norn-west-street', exit: 'west-gate', arrive: { x: 1, y: 7, dir: 'right' } });
  M.exit('west', 0, 8, 3, 'left', 'page', { map: 'erde-forest-fork', exit: 'east', arrive: { x: 48, y: 8, dir: 'left' } });
  finish(M, { x: 40, y: 10, dir: 'left' });
}
// ---------- エルデ森林・分かれ道（ふつうの道は西の村へ。村寄りの所から南の森の奥へ分かれる） ----------
{
  const M = base('erde-forest-fork', 'エルデ森林・分かれ道', 50, 26, 'forest', 808);
  forestRoad(M, [[0, 8], [20, 8], [26, 10], [49, 10]]);
  forestRoad(M, [[12, 8], [12, 15], [16, 19], [16, 25]], 3); // 南の森の奥への小道（村寄り）
  M.forest(0.45, (x, y) => onRoad(M, x, y), 1.4);
  M.put('mid', 'signpost', 15, 6, 1, 1, 2.4, 0.05, true, { showH: 2.4 }); // 分かれ道の道しるべ（文字は無い。美術・演出室 2026-11-26）
  M.exit('east', 49, 9, 3, 'right', 'page', { map: 'erde-forest-east', exit: 'west', arrive: { x: 1, y: 9, dir: 'right' } });
  M.exit('west', 0, 7, 3, 'left', 'page', { map: 'erde-village', exit: 'east', arrive: { x: 40, y: 9, dir: 'left' } });
  M.exit('south', 15, 25, 3, 'down', 'emerge', { map: 'erde-deep', exit: 'north', arrive: { x: 16, y: 1, dir: 'down' } });
  finish(M, { x: 30, y: 10, dir: 'left' });
}
// ---------- 森の奥・魔女の家（家の外観は仮。中には入れない） ----------
{
  const M = base('erde-deep', 'エルデ森林・森の奥', 34, 30, 'forest', 909);
  forestRoad(M, [[16, 0], [16, 6], [11, 11], [11, 17], [17, 22], [17, 25]], 3);
  for (let y = 19; y < 28; y++) for (let x = 9; x < 27; x++) if (Math.hypot(x - 17.5, (y - 23) * 1.3) < 8.5) M.roads.push({ x, y, w: 1, h: 1 }); // 家の前の空き地
  M.put('back', 'witch-house', 14, 16, 7, 3, 6.5, 0.08); // 魔女の家（仮の外観）
  M.note('witch-house-door', 17, 19, 'map.erde.witch-house');
  M.put('mid', 'herbs', 22, 18, 3, 1, 1.6, 0.03, true, { showH: 1.6 }); M.put('mid', 'firewood', 10, 18, 2, 1, 0.8, 0.03, true, { showH: 0.8 }); // 干した薬草・薪（美術・演出室 2026-11-26）
  M.forest(0.5, (x, y) => onRoad(M, x, y) || (x >= 13 && x <= 21 && y >= 15 && y <= 19), 2);
  M.exit('north', 15, 0, 3, 'up', 'dive', { map: 'erde-forest-fork', exit: 'south', arrive: { x: 16, y: 24, dir: 'up' } });
  finish(M, { x: 17, y: 23, dir: 'up' }, { stageOrbsNote: '森の奥：苔と木もれ日（仮）' });
}
// ---------- 小さな村（村の名前・距離・既存の村との関係は未定。人は置かない） ----------
{
  const M = base('erde-village', '森を抜けた小さな村', 42, 20, 'town', 1010);
  // 村の道は石畳にしない（草の地面のまま）。土の道の絵は美術・演出室に依頼
  // 村らしく（2026-11-26 サニーと画面で確認：町の高い家と町の背景で、村に見えなかった）：背景は森、家は低い絵だけ。村の家の絵は美術・演出室に依頼
  M.forestBack = true; const LOW = ['house_b_sideroof.webp', 'house_d_workshop.webp', 'house_home_2f.webp'];
  M.houses(4, 14, 2, 'back', { gap: 0.6, files: LOW }); M.houses(22, 34, 2, 'back', { gap: 0.6, files: LOW });
  M.put('mid', 'well', 17, 4, 3, 2, 3.6, 0.05); M.put('mid', 'trough', 35, 6, 3, 1, 1, 0.03);
  for (const [x, y] of [[4, 13], [12, 13], [20, 13], [28, 13]]) M.put('mid', 'fence', x, y, 5, 1, 1.5, 0.03);
  for (const [x, y] of [[6, 15], [14, 15], [22, 15], [30, 15]]) M.put('mid', 'flowerbed', x, y, 3, 1, 0.9, 0.02);
  for (const [x, y] of [[2, 3], [38, 3], [2, 16], [38, 16], [36, 13]]) M.put('mid', 'tree', x, y, 1, 1, 6, 0.05);
  M.exit('east', 41, 8, 3, 'right', 'page', { map: 'erde-forest-fork', exit: 'west', arrive: { x: 1, y: 8, dir: 'right' } });
  finish(M, { x: 30, y: 9, dir: 'left' });
}
// ---------- 銀鹿亭前の通りの東の出入口を、新しい広場の左下へつなぎかえる ----------
{
  const m = read('norn-inn-street'), e = m.exits.find((x) => x.id === 'east-street');
  e.to = { map: 'norn-square', exit: 'inn-street', arrive: { x: 1, y: 24, dir: 'right' } };
  e.note = '2026-11-25 STORY-NORN-MAP：新しい中央広場の左下（広場の西南）へ。前の広場（norn-plaza）は見比べ用に残した';
  write(m);
}
{
  const m = read('norn-plaza'), e = m.exits.find((x) => x.id === 'west-street');
  if (e) { m.exits = m.exits.filter((x) => x !== e); m.collision = m.collision.map((row, y) => (y >= e.y && y < e.y + (e.span || 1) ? '#' + row.slice(1) : row)); m.oldNote = '2026-11-25 STORY-NORN-MAP：新しい中央広場（norn-square）ができたので、前の広場は見比べ用（開発の窓・ワープで行く）。西の出入口はふさいだ'; write(m); }
}
// ---------- 新しい町の人（2026-11-26 STORY-NIGHT-TOWN-LIFE-20261126：世界観・シナリオ室「新しい町の人の言葉_v01.md」7マップ16枠48本、provisional） ----------
// 言葉は .md の表からそのまま読む。話者はみな「町の人」。ふだん1 → ふだん2 → ふだん1…の順（pick は最初が気まぐれなので、life.nighttown.<人> の旗でページを切りかえる。物語の旗ではない）。
// story.norn.ended のあとは ended 後の1本を優先。置く所は、話題の物（井戸・屋台・時計台・荷・洗濯ひも・花）の近くの、通れて広い所（出入口から5マス以上・出来事のマス・着く所・せまい通路をさける）
{
  const LIFE_SRC = path.join(process.env.USERPROFILE || 'C:/Users/takhy', 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/scenario/新しい町の人の言葉_v01.md');
  const md = fs.readFileSync(LIFE_SRC, 'utf8');
  const rowsOf = (head) => md.split(/^## /m).find((x) => x.startsWith(head)).split('\n').filter((l) => /^\| *[^-|][^|]*\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((x) => x.trim())).slice(1);
  const lines = rowsOf('台詞本文'), slots = rowsOf('マップと人物枠の固定対応');
  const KIND = { ふだん1: 'normal-1', ふだん2: 'normal-2', ended後: 'ended' };
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), 'utf8'));
  for (const k of Object.keys(D.lines)) if (k.startsWith('life.nighttown.')) delete D.lines[k];
  for (const [, who, kind, text] of lines) D.lines[`life.nighttown.${who}.${KIND[kind]}`] = { lines: [{ who: '町の人', text }], status: 'provisional', source: 'production/claude/scenario/新しい町の人の言葉_v01.md' };
  if (Object.keys(D.lines).filter((k) => k.startsWith('life.nighttown.')).length !== 48) throw new Error('町の人の言葉が48本でない');
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), JSON.stringify(D, null, 2) + '\n');
  // 話題の物の近く（このマスの近くの、よい所を探す）
  const NEAR = { 'square-01': [18, 17], 'square-02': [12, 10], 'square-03': [25, 6], 'east-01': [7, 6], 'east-02': [37, 11], 'east-03': [39, 9], 'road-01': [16, 7], 'road-02': [10, 22],
    'north-01': [26, 11], 'north-02': [4, 10], 'west-01': [8, 9], 'west-02': [19, 11], 'south-01': [7, 7], 'south-02': [19, 15], 'village-01': [18, 7], 'village-02': [9, 14] };
  const IN = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] };
  const byMap = {};
  for (const [mapId, who, npcId] of slots) (byMap[mapId] = byMap[mapId] || []).push({ who, npcId });
  let k = 0;
  for (const [mapId, list] of Object.entries(byMap)) {
    const m = read(mapId), W = m.width, H = m.height, C = m.collision.map((r) => [...r]);
    const open = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && C[y][x] === '.';
    const exitCells = m.exits.flatMap((e) => Array.from({ length: e.span || 1 }, (_, i) => (e.dir === 'left' || e.dir === 'right' ? [e.x, e.y + i] : [e.x + i, e.y])));
    const bad = new Set([...(m.events || []).map((e) => `${e.x},${e.y}`), ...m.exits.map((e) => { const [dx, dy] = IN[e.dir]; return `${e.x + dx},${e.y + dy}`; })]);
    const taken = new Set();
    m.npcs = (m.npcs || []).filter((n) => !String(n.id).startsWith('night-town-'));
    for (const { who, npcId } of list) {
      const [ax, ay] = NEAR[who]; let best = null;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!open(x, y) || bad.has(`${x},${y}`) || taken.has(`${x},${y}`)) continue;
        if (exitCells.some(([ex, ey]) => Math.abs(ex - x) + Math.abs(ey - y) < 6)) continue; // 出入口から5マスより遠く
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy)).length < 4) continue; // せまい通路・壁ぎわに立たない（まわり4マスが通れる所）
        const d = Math.hypot(x - ax, y - ay); if (!best || d < best.d) best = { x, y, d };
      }
      if (!best) throw new Error(`${mapId} ${who} を置く所が無い`);
      taken.add(`${best.x},${best.y}`); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) taken.add(`${best.x + dx},${best.y + dy}`); // となりどうしにも立たせない
      const F = `life.nighttown.${who}`;
      m.npcs.push({ id: npcId, sprite: ['mob01', 'mob02', 'mob03', 'mob04'][k++ % 4], x: best.x, y: best.y, dir: 'down', status: 'provisional', note: `新しい町の人（${who}。名前・年齢・経歴は付けない仮の枠）。STORY-NIGHT-TOWN-LIFE-20261126`,
        pages: [{ when: { flags: { 'story.norn.ended': true } }, dialogue: `${F}.ended` }, { when: { flags: { [F]: true } }, dialogue: `${F}.normal-2`, set: { flags: { [F]: false } } }, { dialogue: `${F}.normal-1`, set: { flags: { [F]: true } } }] });
    }
    write(m);
  }
}
// ---------- 着く所は、行き先の出入口のいちばん端のマスの1つ内側（広い出入口では、出た列と同じ列に着く：field.transfer が lane を足す） ----------
{
  const ids = ['norn-square', 'norn-east-street', 'norn-kingsroad', 'norn-north-gate', 'norn-west-street', 'norn-south-street', 'erde-forest-east', 'erde-forest-fork', 'erde-deep', 'erde-village', 'norn-inn-street'];
  const maps = Object.fromEntries(ids.map((id) => [id, read(id)]));
  const IN = { left: [1, 0, 'right'], right: [-1, 0, 'left'], up: [0, 1, 'down'], down: [0, -1, 'up'] };
  for (const id of ids) for (const e of maps[id].exits) {
    if (id === 'norn-inn-street' && e.id !== 'east-street') continue;
    const t = maps[e.to.map]; if (!t) continue; const b = t.exits.find((x) => x.id === e.to.exit); if (!b) throw new Error(`${id}.${e.id} の行き先 ${e.to.map}.${e.to.exit} が無い`);
    if (b.to.map !== id || b.to.exit !== e.id) throw new Error(`${id}.${e.id} と ${e.to.map}.${b.id} が双方向でない`);
    const [dx, dy, d] = IN[b.dir]; e.to.arrive = { x: b.x + dx, y: b.y + dy, dir: d };
  }
  for (const id of ids) write(maps[id]);
}
// ---------- 一覧・曲・言葉 ----------
const NEW = ['norn-square', 'norn-east-street', 'norn-kingsroad', 'norn-north-gate', 'norn-west-street', 'norn-south-street', 'erde-forest-east', 'erde-forest-fork', 'erde-deep', 'erde-village'];
{
  const f = path.join(__dirname, '..', 'data', 'world.json'), w = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const id of NEW) if (!w.maps.includes(id)) w.maps.push(id);
  fs.writeFileSync(f, JSON.stringify(w, null, 2) + '\n');
}
{
  const f = path.join(__dirname, '..', 'data', 'audio.json'), a = JSON.parse(fs.readFileSync(f, 'utf8'));
  const bm = a.bgmByMap || a.byMap || Object.values(a).find((v) => v && typeof v === 'object' && 'norn-plaza' in v);
  if (bm) { const town = bm['norn-plaza'], forest = bm['test-forest']; for (const id of NEW) bm[id] = id.startsWith('erde-') && id !== 'erde-village' ? forest || town : town; }
  fs.writeFileSync(f, JSON.stringify(a, null, 2) + '\n');
}
{
  const f = path.join(__dirname, '..', 'data', 'dialogue.json'), D = JSON.parse(fs.readFileSync(f, 'utf8'));
  const P = (lines) => ({ lines, status: 'provisional', placeholder: '地図の試作の仮のお知らせ（Claude）。決定記録「両経路とも通行の許可が要る」の範囲で、許可の取り方・審査は書かない' });
  Object.assign(D.lines, {
    [GATE_NOTE]: P(['（カルディアへの門。通るには、通行の許可が要る。）', '〔開発中：この先はまだ作っていません〕']),
    [SOUTH_NOTE]: P(['（ノルンの南門。）', '〔開発中：南門の先は、まだ決まっていません〕']),
    [ROAD_NOTE]: P(['（王道は、南へ続いている。）', '〔開発中：この先はまだ作っていません〕']),
    'map.erde.witch-house': P(['（森の奥の家。戸は閉まっている。）', '〔開発中：家の外観と中は、まだ仮です〕']),
  });
  fs.writeFileSync(f, JSON.stringify(D, null, 2) + '\n');
}
console.log('ノルンの新しい骨格と森・村・魔女の家：', NEW.length, 'マップ');
