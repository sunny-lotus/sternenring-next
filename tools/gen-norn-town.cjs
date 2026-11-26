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
const TOWN_ART = JSON.parse(JSON.stringify(inn.stage.townArt)); TOWN_ART.doors = HOUSE.doorsForMap(); TOWN_ART.boards['shop-*'] = ['shop_travel.webp', 'shop_transport.webp', 'shop_bakery.webp', 'shop_eatery.webp', 'shop_general.webp', 'shop_herbal.webp', 'shop_repair.webp', 'shop_cloth.webp']; Object.assign(TOWN_ART.boards, { 'kardia-great-gate': 'kardia_great_gate.webp', 'gastel-great-gate': 'gastel_great_gate.webp', 'norn-east-gate': 'norn_east_gate.webp' }); // 店の正面・大門・東門（2026-11-26 美術・演出室） TOWN_ART.ground.square = 'tex_cobble_square.webp'; // 広場の扇形の石畳（2026-11-26 サニー「広場は雰囲気ちがう石畳でもいいね」）
const FOREST_ART = JSON.parse(JSON.stringify(read('test-forest').stage.townArt)); delete FOREST_ART.doors; FOREST_ART.boards = { pine: FOREST_ART.boards.pine, rock: FOREST_ART.boards.rock, bush: FOREST_ART.boards.bush };
// 骨格の絵（2026-11-26 美術・演出室 ART-NIGHT-NORN-20261126、pixel/元絵/ノルン_骨格_v01 を tools/copy-norn-structure-art.py で写した。provisional）。壁は横にくり返して張る
Object.assign(TOWN_ART.boards, { 'town-wall': 'town_wall.webp', 'third-wall': 'third_wall.webp', 'gate-tower': 'gate_tower.webp', 'kardia-gate': 'kardia_gate.webp', 'clock-tower': 'clock_tower.webp' });
Object.assign(FOREST_ART.boards, { 'witch-house': 'witch_house.webp', signpost: 'signpost_forest.webp', herbs: 'herbs_forest.webp', firewood: 'firewood_forest.webp' });
// 森の奥の家の庭の小物（2026-11-26 サニー「魔女の家はもっとおとぎ話に出てくるような大きく庭も素敵な感じに」）：町の絵を借りる（森の絵の置き場所から ../town/norn/ を読む）。庭の絵は美術室に依頼
Object.assign(FOREST_ART.boards, { flowerbed: '../town/norn/flowerbed.webp', planter: '../town/norn/planter.webp', fence: '../town/norn/fence.webp', bench: '../town/norn/bench.webp', 'door-pots': '../town/norn/door_pots.webp', 'tree-small': '../town/norn/tree_small.webp', well: '../town/norn/well.webp' });
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
  /** 店の正面：files の順に、x0 から右へ並べる（入らなければ止める） */
  M.shops = (files, x0, x1, y = 1) => { let x = x0; for (const art of files) { const sz = HOUSE.boardSize(art), w = Math.round(sz.w); if (x + w > x1 + 1 || !M.free(x, y, w, 4)) break; M.put('back', 'house-front', x, y, w, 4, Math.round(sz.h * 10) / 10, 0.03, true, { art, shop: art.replace(/^shop_|\.webp$/g, '') }); x += w; } };
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
  M.paved.push({ x: 0, y: 0, w: 42, h: 30, plaza: true }); // 広場はわだちの無い扇形の石畳（2026-11-26 サニー）
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
  for (const x of [11, 21]) M.items.mid.push({ asset: 'placeholder:flag-string', x, y: 9, w: 9, h: 1, standH: 6.4, zOffset: 0.02, prop: true, solid: false, festival: true });
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
  M.shops(['shop_bakery.webp', 'shop_eatery.webp', 'shop_general.webp'], 1, 19); M.shops(['shop_herbal.webp', 'shop_transport.webp', 'shop_travel.webp'], 23, 38); // 店の正面（2026-11-26 ART-SHOP-FRONTS。広場寄りに食べ物・日用品、門寄りに旅支度・荷物）。20〜22列は北東の地区への道
  // 店が並ぶ通り（2026-11-26 サニー「東はもっとお店にしたい」）：どの家の1階にも庇、看板を多く、通りの南側は屋台と花屋・荷を並べ、店先の品（樽・袋・木箱）も
  const AW = ['awning-red', 'awning-green', 'awning-wheat'], SG = ['sign-bread', 'sign-cup', 'sign-shoe'];
  M.items.back.filter((it) => /house-/.test(it.asset) && !it.shop).forEach((h, i) => { M.items.back.push({ asset: `placeholder:${AW[i % 3]}`, x: h.x + Math.max(0, Math.floor(h.w / 2) - 1), y: 4, w: 3, h: 1, standH: 3.9, zOffset: 0.25 }, { asset: `placeholder:${SG[i % 3]}`, x: h.x + h.w - 1, y: 4, w: 1, h: 1, standH: 5, zOffset: 0.25 }); });
  for (const [x, w] of [[3, 3], [9, 3], [15, 3], [25, 3]]) M.put('mid', 'stall', x, 12, w, 2, 3.2, 0.05); // 21〜23列は南東の地区への道
  M.put('mid', 'flower-stall', 30, 12, 3, 2, 3.2, 0.05);
  for (const [a, x] of [['barrels', 6], ['sacks', 12], ['crates', 18], ['barrels', 34]]) M.put('mid', a, x, 14, 2, 1, 1.3, 0.03);
  M.put('mid', 'cart', 33, 12, 3, 2, 2.4, 0.05); M.put('mid', 'crates', 37, 12, 2, 1, 1.4, 0.05); M.put('mid', 'sacks', 31, 4, 2, 1, 1.2, 0.05);
  for (const x of [8, 22, 36]) M.put('mid', 'lamp', x, 11, 1, 1, 3.8, 0.05);
  // 東門：町の東の壁（家並みの東）と門の塔。東の出入口は門の口
  // 東門（2026-11-26 サニー：東門が門に見えない）：通りの奥（北）に町の壁と門の塔を2本立て、そのあいだの口（42〜43列）を奥へ抜けて王道へ
  M.put('back', 'norn-east-gate', 40, 1, 6, 4, 6.2, 0.12, false, { showH: 6.2 }); M.wall(39, 1, 3, 4); M.wall(44, 1, 3, 4); // ノルンの東門（美術・演出室 2026-11-26。開いたアーチの口を 42〜43列に合わせる）
  M.paved.push({ x: 42, y: 0, w: 2, h: 5 }); M.wall(39, 12, 8, 3);
  for (const x of [40, 45]) M.put('mid', 'lamp', x, 11, 1, 1, 3.8, 0.05);
  M.exit('west', 0, 6, 3, 'left', 'page', { map: 'norn-square', exit: 'east', arrive: { x: 40, y: 13, dir: 'left' } });
  M.exit('north', 20, 0, 3, 'up', 'dive', { map: 'norn-ne', exit: 'south', arrive: { x: 20, y: 14, dir: 'up' } });
  M.exit('south', 21, 15, 3, 'down', 'emerge', { map: 'norn-se', exit: 'north', arrive: { x: 20, y: 1, dir: 'down' } });
  M.exit('east-gate', 42, 0, 2, 'up', 'dive', { map: 'norn-kingsroad', exit: 'east-gate', arrive: { x: 1, y: 15, dir: 'right' } }); // 東門の口を奥へ抜けて、王道へ
  M.walkers.push({ id: 'es-a', sprite: 'mob02', path: [[7, 8], [34, 8]], speed: 1 }, { id: 'es-b', sprite: 'mob03', path: [[30, 10], [9, 10]], speed: 0.8, wait: 1600 });
  finish(M, { x: 24, y: 8, dir: 'right' });
}
// ---------- 東門の外・王道（2026-11-26 サニー「王道はもっと広く壮大に」「門はカルディア行きの大門と、ガステル行きの大門がある」）。
// 正本：南の王道はカルディア（西）とガステル（東）の区画の境目。王道の北のはし、第三城壁の西側にカルディア行き、東側にガステル行きの大門（位置・名前・通行の決まりの細部は未定）。
// 西はノルンの東の壁と東門。壁の見せ方は作者が見比べられるよう、案A（このマップ）・B・C（見比べ用のマップ norn-kingsroad-wall-b／-c、ワープで行く）を作る ----------
function kingsroad(id, title, wallStyle, withExits) {
  const M = base(id, title, 40, 32, 'town', 303);
  M.paved.push({ x: 13, y: 0, w: 13, h: 32 }, { x: 1, y: 4, w: 38, h: 6 }, { x: 0, y: 14, w: 14, h: 5 });
  // 北：第三城壁（端から端まで1枚）と、二つの大門
  M.put('back', 'third-wall', 1, 1, 38, 3, 8, 0.02);
  M.put('back', 'kardia-great-gate', 4, 1, 9, 3, 11, 0.08, true, { showH: 11 }); // カルディア行きの大門（西側。美術・演出室 2026-11-26）
  M.put('back', 'gastel-great-gate', 27, 1, 9, 3, 11, 0.08, true, { showH: 11 }); // ガステル行きの大門（東側。美術・演出室 2026-11-26）
  for (const x of [7, 8, 9]) M.note(`kardia-gate-${x}`, x, 4, GATE_NOTE);
  for (const x of [30, 31, 32]) M.note(`gastel-gate-${x}`, x, 4, 'map.norn.gate-gastel');
  // 王道の両側に街灯の列（壮大に）
  for (let y = 11; y <= 29; y += 4) { M.put('mid', 'lamp', 12, y, 1, 1, 3.8, 0.05); M.put('mid', 'lamp', 26, y, 1, 1, 3.8, 0.05); }
  // 東：野と木の列
  for (let y = 11; y <= 29; y += 3) { M.put('mid', 'tree', 29 + (y % 2), y, 1, 1, 6, 0.05); if (y % 6 === 5) M.put('mid', 'tree', 34, y, 1, 1, 6, 0.05); }
  M.put('mid', 'signpost', 27, 16, 1, 1, 2.2, 0.05); M.note('kingsroad-signpost', 27, 16, 'map.norn.signpost');
  // 西：ノルンの東の壁と東門（14〜18行は東門の口）
  const door = (y) => y >= 13 && y <= 19;
  if (wallStyle === 'A') { // 案A：壁の絵を前後に重ねて縦に並べる（いままで）
    for (let y = 5; y < 30; y += 2) if (!door(y) && !door(y + 1)) M.put('back', 'town-wall', 1, y, 5, 2, 4.6, 0.04);
  } else if (wallStyle === 'B') { // 案B：低い壁を1マスずつつなげ、うしろに木（段々を目立たせない）
    for (let y = 5; y < 30; y++) if (!door(y)) { M.put('back', 'town-wall', 1, y, 5, 1, 2.2, 0.04); if (y % 3 === 0) M.put('back', 'tree', 2, y, 1, 1, 6, 0.02, false); }
  } else { // 案C：壁は見せず、木の列で隠して、東門の塔だけ立てる
    for (let y = 5; y < 30; y += 2) if (!door(y)) M.put('back', 'tree', 2 + (y % 4 === 1 ? 1 : 0), y, 1, 1, 6.5, 0.04, true, { showH: 6.5 });
    M.wall(1, 5, 1, 25); for (let y = 13; y <= 19; y++) M.open(1, y, 1, 1);
  }
  M.put('back', 'gate-tower', 1, 13, 4, 1, 12, 0.1, true, { showH: 12 }); M.put('mid', 'gate-tower', 1, 19, 4, 1, 12, 0.06, true, { showH: 12 });
  M.note('kingsroad-south', 19, 30, ROAD_NOTE);
  if (withExits) M.exit('east-gate', 0, 15, 3, 'left', 'page', { map: 'norn-east-street', exit: 'east-gate', arrive: { x: 42, y: 1, dir: 'down' } });
  M.walkers.push({ id: 'kr-a', sprite: 'mob04', path: [[16, 11], [16, 27]], speed: 0.7, wait: 2200 }, { id: 'kr-b', sprite: 'mob01', path: [[22, 27], [22, 11]], speed: 0.9 }, { id: 'kr-c', sprite: 'mob02', path: [[18, 12], [18, 24]], speed: 0.6, wait: 3000 });
  finish(M, { x: 19, y: 14, dir: 'up' }, withExits ? {} : { compareNote: '2026-11-26 作者が東の壁の見せ方を見比べるためのマップ（出入口なし。ワープで来る）' });
}
kingsroad('norn-kingsroad', '東門の外・王道', 'A', true);
kingsroad('norn-kingsroad-wall-b', '王道（東の壁 案B：低い壁と木）', 'B', false);
kingsroad('norn-kingsroad-wall-c', '王道（東の壁 案C：木の列）', 'C', false);
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
  M.exit('west', 0, 7, 3, 'left', 'page', { map: 'norn-nw', exit: 'east', arrive: { x: 42, y: 7, dir: 'left' } });
  M.exit('east', 37, 7, 3, 'right', 'page', { map: 'norn-ne', exit: 'west', arrive: { x: 1, y: 7, dir: 'right' } });
  M.walkers.push({ id: 'ng-a', sprite: 'mob03', path: [[24, 8], [30, 8]], speed: 0.6, wait: 3000 });
  finish(M, { x: 18, y: 8, dir: 'up' });
}
// ---------- 西の通り・西門（森へ向かう人の道） ----------
{
  const M = base('norn-west-street', 'ノルン・西の通りと西門', 44, 16, 'town', 505);
  M.paved.push({ x: 0, y: 5, w: 44, h: 7 });
  M.shops(['shop_travel.webp'], 9, 22); M.houses(15, 22, 1, 'back', { gap: 0.2 }); M.houses(27, 42, 1, 'back', { gap: 0.2 }); // 西門のそばに旅支度の店（森へ向かう人の道）。23〜26列は北西の地区への道
  M.items.back.push({ asset: 'placeholder:herbs', x: 14, y: 4, w: 2, h: 1, standH: 4.2, zOffset: 0.25 }, { asset: 'placeholder:awning-green', x: 26, y: 4, w: 3, h: 1, standH: 3.9, zOffset: 0.25 });
  M.put('mid', 'firewood', 18, 12, 2, 1, 0.8, 0.03); M.put('mid', 'fence', 22, 12, 4, 1, 1.5, 0.03); M.put('mid', 'crates', 30, 12, 2, 1, 1.4, 0.03); M.put('mid', 'tree', 36, 12, 1, 1, 6, 0.05);
  for (const x of [14, 28]) M.put('mid', 'lamp', x, 11, 1, 1, 3.8, 0.05);
  // 西門：町の西の壁と門の塔。西の出入口は門の口（森へ）
  M.put('back', 'town-wall', 1, 1, 7, 4, 4.6, 0.05, true);
  M.put('back', 'gate-tower', 2, 4, 3, 1, 12, 0.12, true, { showH: 12 }); M.put('mid', 'gate-tower', 2, 12, 3, 2, 12, 0.06, true, { showH: 12 });
  M.put('mid', 'town-wall', 1, 13, 1, 2, 3.4, 0.03, true); M.put('mid', 'town-wall', 5, 13, 3, 2, 3.4, 0.03, true);
  M.exit('east', 43, 6, 3, 'right', 'page', { map: 'norn-square', exit: 'west', arrive: { x: 1, y: 13, dir: 'right' } });
  M.exit('north', 24, 0, 3, 'up', 'dive', { map: 'norn-nw', exit: 'south', arrive: { x: 20, y: 14, dir: 'up' } });
  M.exit('south', 13, 15, 1, 'down', 'emerge', { map: 'norn-inn-street', exit: 'north', arrive: { x: 14, y: 1, dir: 'down' } }); // 銀鹿亭前の通りの細い路地へ
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
  M.put('front', 'gate-tower', 8, 24, 2, 1, 12, 0.03, true, { showH: 12 }); M.put('front', 'gate-tower', 15, 24, 2, 1, 12, 0.03, true, { showH: 12 }); // 門の塔は扉がキャラくらいになる大きさ（2026-11-26 サニー「門の扉小さい」「南門も直す」）
  M.wall(10, 26, 5, 1); M.note('south-gate', 12, 25, SOUTH_NOTE); M.note('south-gate-2', 11, 25, SOUTH_NOTE); M.note('south-gate-3', 13, 25, SOUTH_NOTE);
  M.exit('north', 11, 0, 3, 'up', 'dive', { map: 'norn-square', exit: 'south', arrive: { x: 20, y: 28, dir: 'up' } });
  M.exit('east', 25, 6, 3, 'right', 'page', { map: 'norn-se', exit: 'west', arrive: { x: 1, y: 7, dir: 'right' } });
  M.walkers.push({ id: 'ss-a', sprite: 'mob02', path: [[11, 6], [11, 20]], speed: 0.7, wait: 2000 });
  finish(M, { x: 12, y: 12, dir: 'down' });
}
// ---------- エルデ森林・東（ノルンの西門から西へ。北は第三城壁寄りで木がまばら、南ほど自然が多い） ----------
const forestRoad = (M, pts, w = 3) => { // 道（街道あつかい・小道の絵）：折れ線の点をつなぐ
  M.paths.push({ pts: pts.map(([x, y]) => [x + 0.5, y + 0.5]), w: w - 0.6 });
  for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [pts[k], pts[k + 1]]; const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), rw = Math.abs(a[0] - b[0]) + w, rh = Math.abs(a[1] - b[1]) + w; const rx = Math.max(0, x - (w >> 1)), ry = Math.max(0, y - (w >> 1)); M.roads.push({ x: rx, y: ry, w: Math.min(M.W, x - (w >> 1) + rw) - rx, h: Math.min(M.H, y - (w >> 1) + rh) - ry }); }
};
// 道を外れた所の落とし物（2026-11-26 サニー「アイテムが落ちている場所のようなところも欲しい。道でないところを探す楽しさと、道を外れるとランダムエンカウントの駆け引き」）。
// 中身と言葉は、試しの森と同じ（光る苔・苦い根・気付け薬。tools/gen-maze-maps.cjs の sparkle.fo-*）。旗は場所ごと。まわりの木は空けて、小さな空き地にする
const TREASURE = { 'fo-ne': { mats: { 光る苔: 2 } }, 'fo-sw': { mats: { 苦い根: 1 } }, 'fo-se': { items: { 気付け薬: 1 } } };
function treasures(M, list) { M.treasureAt = M.treasureAt || []; for (const [x, y, kind] of list) { const id = `sparkle-${M.id}-${x}-${y}`, flag = `sparkle.${M.id}.${x}-${y}`; M.events.push({ id, x, y, trigger: 'examine', sparkle: { flag }, status: 'provisional', pages: [{ when: { flags: { [flag]: true } }, dialogue: 'sparkle.empty' }, { dialogue: `sparkle.${kind}`, set: { flags: { [flag]: true } }, give: TREASURE[kind] }] }); M.treasureAt.push([x, y]); } }
const nearTreasure = (M, x, y) => (M.treasureAt || []).some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1);
const FOREST_RE = { rate: 0.08, minSteps: 8, battles: ['normal', 'swarm'], note: 'エルデ森林：道（roads）の外だけ。8歩をこえたら1歩ごとに8%（2026-11-26 サニー「エンカウントりつは戻していいや　道はエンカウントしないから」で元の率に。2026-11-26 サニー「道を外れるとモンスターをランダムエンカウントするということの駆け引き」）' };
const onRoad = (M, x, y, pad = 1) => M.roads.some((r) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad);
{
  const M = base('erde-forest-east', 'エルデ森林・ノルン寄り', 50, 20, 'forest', 707);
  forestRoad(M, [[0, 9], [6, 9], [9, 13], [16, 13], [19, 8], [26, 6], [31, 6], [34, 11], [40, 13], [44, 10], [49, 10]]); // くねくね（2026-11-26 サニー「森が一本道すぎる」）
  treasures(M, [[4, 3, 'fo-ne'], [27, 15, 'fo-sw'], [45, 3, 'fo-se']]);
  M.forest(0.45, (x, y) => onRoad(M, x, y) || nearTreasure(M, x, y) || (y < 4 && M.R() < 0.6), 1);
  M.exit('east', 49, 9, 3, 'right', 'page', { map: 'norn-west-street', exit: 'west-gate', arrive: { x: 1, y: 7, dir: 'right' } });
  M.exit('west', 0, 8, 3, 'left', 'page', { map: 'erde-forest-fork', exit: 'east', arrive: { x: 48, y: 8, dir: 'left' } });
  finish(M, { x: 40, y: 10, dir: 'left' }, { randomEncounters: FOREST_RE });
}
// ---------- エルデ森林・分かれ道（ふつうの道は西の村へ。村寄りの所から南の森の奥へ分かれる） ----------
{
  const M = base('erde-forest-fork', 'エルデ森林・分かれ道', 50, 26, 'forest', 808);
  forestRoad(M, [[0, 8], [5, 8], [8, 5], [14, 5], [17, 9], [24, 11], [30, 7], [36, 7], [40, 12], [46, 12], [49, 10]]); // くねくね
  forestRoad(M, [[17, 9], [15, 14], [19, 18], [16, 22], [16, 25]], 3); // 南の森の奥への小道（村寄り）
  treasures(M, [[28, 3, 'fo-se'], [33, 18, 'fo-ne'], [6, 16, 'fo-sw']]);
  M.forest(0.45, (x, y) => onRoad(M, x, y) || nearTreasure(M, x, y), 1.4);
  M.put('mid', 'signpost', 15, 6, 1, 1, 2.4, 0.05, true, { showH: 2.4 }); // 分かれ道の道しるべ（文字は無い。美術・演出室 2026-11-26）
  M.note('fork-signpost', 15, 6, 'map.erde.signpost'); // 調べられる（2026-11-26 サニー「これも調べられるように」）
  M.exit('east', 49, 9, 3, 'right', 'page', { map: 'erde-forest-east', exit: 'west', arrive: { x: 1, y: 9, dir: 'right' } });
  M.exit('west', 0, 7, 3, 'left', 'page', { map: 'erde-village', exit: 'east', arrive: { x: 40, y: 9, dir: 'left' } });
  M.exit('south', 15, 25, 3, 'down', 'emerge', { map: 'erde-deep', exit: 'north', arrive: { x: 16, y: 1, dir: 'down' } });
  finish(M, { x: 30, y: 10, dir: 'left' }, { randomEncounters: FOREST_RE });
}
// ---------- 森の奥・魔女の家（家の外観は仮。中には入れない） ----------
{
  const M = base('erde-deep', 'エルデ森林・森の奥', 34, 30, 'forest', 909);
  forestRoad(M, [[16, 0], [16, 6], [11, 11], [11, 17], [17, 22], [17, 25]], 3);
  for (let y = 15; y < 29; y++) for (let x = 5; x < 30; x++) if (Math.hypot(x - 17.5, (y - 22) * 1.1) < 12) M.roads.push({ x, y, w: 1, h: 1 }); // 家のまわりの広い空き地（庭）
  M.put('back', 'witch-house', 13, 15, 9, 4, 9, 0.08, true, { showH: 9 }); // 魔女の家（おとぎ話のように大きく。絵は仮）
  // 庭：家の前の小道（16〜18列）はあけて、両側に花壇・植木鉢、ベンチ、井戸、柵、小さな木
  for (const [a, x, y, w, h, s] of [['flowerbed', 9, 20, 3, 1, 0.9], ['flowerbed', 23, 20, 3, 1, 0.9], ['flowerbed', 9, 23, 3, 1, 0.9], ['flowerbed', 23, 23, 3, 1, 0.9], ['door-pots', 13, 19, 2, 1, 1.1], ['door-pots', 20, 19, 2, 1, 1.1], ['bench', 12, 25, 2, 1, 1.2], ['well', 24, 25, 3, 2, 3.6], ['planter', 6, 21, 2, 1, 1.2], ['planter', 27, 21, 2, 1, 1.2], ['fence', 5, 27, 5, 1, 1.5], ['fence', 25, 27, 5, 1, 1.5], ['tree-small', 7, 17, 1, 1, 2.8], ['tree-small', 27, 17, 1, 1, 2.8]]) M.put('mid', a, x, y, w, h, s, 0.03);
  M.exit('witch-door', 17, 18, 1, 'up', 'nook-in', { map: 'erde-witch-house', exit: 'door', arrive: { x: 5, y: 6, dir: 'up' } }); M.items.back.find((it) => it.asset === 'placeholder:witch-house').doorExit = 'witch-door'; // 扉から入れる（2026-11-26 サニー「いいよ作って試しに」）
  M.put('mid', 'herbs', 22, 18, 3, 1, 1.6, 0.03, true, { showH: 1.6 }); M.put('mid', 'firewood', 10, 18, 2, 1, 0.8, 0.03, true, { showH: 0.8 }); // 干した薬草・薪（美術・演出室 2026-11-26）
  treasures(M, [[27, 8, 'fo-sw'], [5, 25, 'fo-ne']]);
  M.forest(0.5, (x, y) => onRoad(M, x, y) || nearTreasure(M, x, y) || (x >= 5 && x <= 29 && y >= 14 && y <= 28), 2);
  M.exit('north', 15, 0, 3, 'up', 'dive', { map: 'erde-forest-fork', exit: 'south', arrive: { x: 16, y: 24, dir: 'up' } });
  finish(M, { x: 17, y: 23, dir: 'up' }, { stageOrbsNote: '森の奥：苔と木もれ日（仮）', randomEncounters: FOREST_RE });
}
// ---------- 森の奥の家の中（試し。2026-11-26 サニー「いいよ作って試しに」）：民家の内装の絵で、薬草の家らしく。住む人・持ち物・間取りは物語に関わるので仮（provisional）。正式な中は作者・シナリオ室・美術室で ----------
{
  const home = read('norn-house-plaza-02'), W = 11, H = 8;
  const C = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || x === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
  C[H - 1][5] = 'D';
  const block = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) C[j][i] = '#'; };
  const back = [], mid = [];
  back.push({ asset: 'placeholder:rug', x: 3, y: 3, w: 5, h: 3, standH: 0.05 });
  for (const x of [1, 4, 7]) back.push({ asset: 'placeholder:home-herbs', x, y: 1, w: 2, h: 1, standH: 0.7 }); // 天井いっぱいの干した薬草
  back.push({ asset: 'tiles.pipoya-town', region: 'hearth', x: 7, y: 1, w: 3, h: 2, zOffset: 0.1 }); block(7, 1, 3, 2);
  mid.push({ asset: 'placeholder:home-pot', x: 6, y: 2, w: 1, h: 1, standH: 1.6 }); block(6, 2, 1, 1); // かまどの鍋
  mid.push({ asset: 'placeholder:home-cupboard', x: 1, y: 1, w: 1, h: 1, standH: 2.4 }); block(1, 1, 1, 1);
  mid.push({ asset: 'placeholder:home-cupboard', x: 2, y: 1, w: 1, h: 1, standH: 2.4 }); block(2, 1, 1, 1); // 瓶の棚が2つ
  mid.push({ asset: 'placeholder:bed', x: 1, y: 4, w: 2, h: 2, standH: 1 }); block(1, 4, 2, 2);
  mid.push({ asset: 'tiles.pipoya-town', region: 'table', x: 5, y: 3, w: 2, h: 2 }); block(5, 3, 2, 2);
  mid.push({ asset: 'placeholder:home-chest', x: 9, y: 4, w: 1, h: 1, standH: 0.6 }); block(9, 4, 1, 1);
  mid.push({ asset: 'placeholder:home-washtub', x: 9, y: 5, w: 1, h: 1, standH: 0.8 }); block(9, 5, 1, 1);
  const m = {
    format: 'sternenring-next-map', version: 1, id: 'erde-witch-house', title: 'エルデ森林・森の奥の家（試し）', kind: 'interior', footsteps: 'wood', status: 'provisional',
    provenance: '2026-11-26 作者「いいよ作って試しに」で tools/gen-norn-town.cjs が作った試しの部屋。民家の内装の絵を借りた。フレアの家の中・持ち物・住む人は物語に関わるので未定（作者・シナリオ室・美術室で決める）。',
    width: W, height: H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', D: 'door' }, collision: C.map((r) => r.join('')),
    ground: { tileset: 'tiles.pipoya-town', fill: 'floor', wall: 'wall', rows: null },
    exits: [{ id: 'door', x: 5, y: H - 1, dir: 'down', effect: 'nook-out', to: { map: 'erde-deep', exit: 'witch-door', arrive: { x: 17, y: 19, dir: 'down' } } }],
    spawns: { default: { x: 5, y: H - 2, dir: 'up' } },
    events: [{ id: 'witch-shelf', x: 1, y: 1, trigger: 'examine', status: 'provisional', pages: [{ dialogue: 'map.erde.witch-shelf' }] }, { id: 'witch-pot', x: 6, y: 2, trigger: 'examine', status: 'provisional', pages: [{ dialogue: 'map.erde.witch-pot' }] }],
    stage: { look: 'home', camera: home.stage.camera, textures: home.stage.textures, backWindows: false, orbs: { count: 18, alpha: 0.7, color: [0.75, 1, 0.65], size: 0.8, note: '森の奥の家：薬草の香りのような、緑の光の粒（仮）' },
      layers: [{ band: 'backdrop', items: [] }, { band: 'back', items: back }, { band: 'mid', items: mid }, { band: 'actors', items: [] }, { band: 'front', items: [] }] },
  };
  write(m);
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
// ---------- 四地区（2026-11-26 作者採用：北東＝交易と荷、北西＝職人と森の恵み、南東＝住まいと日用品、南西＝宿と旅支度＝銀鹿亭前の通り）。
// サニー「ノルンの街中はすべて道でつながっているようにしたい。南東・北東・北西・南西にも地図が欲しい」「各地区で特色がわかる見た目にしたい」。
// 3×3 のつながり：北西─北門前─北東／西の通り─中央広場─商店通り／銀鹿亭前（南西）─南の通り─南東。地区らしい小物は今ある絵で置き、地区ごとの絵は美術室に依頼中 ----------
function district(id, title, seed, opt) {
  const M = base(id, title, 44, 16, 'town', seed);
  M.paved.push({ x: 0, y: 5, w: 44, h: 7 });
  if (opt.shopFirst) M.shops(opt.shopFirst, 1, 10); // 地区の店（左はし）
  if (opt.topExit) { M.houses(1, opt.topExit - 2, 1, 'back', { files: opt.files, gap: 0.1 }); M.houses(opt.topExit + 4, 42, 1, 'back', { files: opt.files, gap: 0.1 }); M.paved.push({ x: opt.topExit, y: 0, w: 3, h: 5 }); }
  else M.houses(1, 42, 1, 'back', { files: opt.files, gap: 0.1 });
  if (opt.botExit) M.paved.push({ x: opt.botExit, y: 11, w: 3, h: 5 });
  opt.props(M);
  for (const x of [8, 24, 36]) if (M.free(x, 11, 1, 1)) M.put('mid', 'lamp', x, 11, 1, 1, 3.8, 0.05);
  return M;
}
{ // 北東：交易と荷（倉庫・荷置き場・荷車・袋や樽の山）
  const M = district('norn-ne', 'ノルン・北東（交易と荷）', 1101, { botExit: 20, files: ['house_d_workshop.webp', 'house_b_sideroof.webp', 'house_f_corner.webp'], props: (M) => {
    for (const [a, x, y, w, h, s] of [['crates', 2, 12, 2, 1, 1.4], ['crates', 4, 12, 2, 1, 1.8], ['barrels', 7, 12, 2, 1, 1.4], ['sacks', 10, 12, 2, 1, 1.2], ['cart', 13, 12, 3, 2, 2.4], ['crates', 25, 12, 2, 1, 1.4], ['sacks', 28, 12, 2, 1, 1.2], ['barrels', 31, 12, 2, 1, 1.4], ['cart', 34, 12, 3, 2, 2.4], ['crates', 39, 12, 2, 1, 1.8]]) M.put('mid', a, x, y, w, h, s, 0.05);
    M.put('mid', 'trough', 40, 5, 3, 1, 1, 0.03);
  } });
  M.exit('west', 0, 6, 3, 'left', 'page', { map: 'norn-north-gate', exit: 'east', arrive: { x: 36, y: 7, dir: 'left' } });
  M.exit('south', 20, 15, 3, 'down', 'emerge', { map: 'norn-east-street', exit: 'north', arrive: { x: 20, y: 1, dir: 'down' } });
  M.walkers.push({ id: 'ne-a', sprite: 'mob01', path: [[8, 8], [32, 8]], speed: 0.7, wait: 1500 }, { id: 'ne-b', sprite: 'mob04', path: [[30, 10], [12, 10]], speed: 0.6, wait: 2500 });
  finish(M, { x: 22, y: 8, dir: 'up' });
}
{ // 北西：職人と森の恵み（小さな工房・干した薬草・薪・柵・荷車）
  const M = district('norn-nw', 'ノルン・北西（職人と森の恵み）', 1202, { botExit: 20, shopFirst: ['shop_repair.webp'], files: ['house_d_workshop.webp', 'house_home_2f.webp', 'house_c_stepgable.webp'], props: (M) => {
    for (const x of [4, 13, 28, 37]) M.items.back.push({ asset: 'placeholder:herbs', x, y: 4, w: 2, h: 1, standH: 4.2, zOffset: 0.25 });
    for (const [a, x, y, w, h, s] of [['firewood', 2, 12, 2, 1, 0.8], ['firewood', 5, 12, 2, 1, 0.8], ['fence', 9, 12, 4, 1, 1.5], ['cart', 14, 12, 3, 2, 2.4], ['crates', 25, 12, 2, 1, 1.4], ['fence', 28, 12, 4, 1, 1.5], ['firewood', 33, 12, 2, 1, 0.8], ['tree-small', 37, 12, 1, 1, 2.8], ['tree', 41, 12, 1, 1, 6]]) M.put('mid', a, x, y, w, h, s, 0.05);
  } });
  M.exit('east', 43, 6, 3, 'right', 'page', { map: 'norn-north-gate', exit: 'west', arrive: { x: 1, y: 7, dir: 'right' } });
  M.exit('south', 20, 15, 3, 'down', 'emerge', { map: 'norn-west-street', exit: 'north', arrive: { x: 24, y: 1, dir: 'down' } });
  M.walkers.push({ id: 'nw-a', sprite: 'mob02', path: [[9, 9], [33, 9]], speed: 0.8, wait: 1800 });
  finish(M, { x: 22, y: 8, dir: 'up' });
}
{ // 南東：住まいと日用品（民家・パン屋の看板・洗濯物・植木鉢・花壇）
  const M = district('norn-se', 'ノルン・南東（住まいと日用品）', 1303, { topExit: 20, shopFirst: ['shop_cloth.webp'], files: ['house_home_2f.webp', 'house_c_stepgable.webp', 'house_a_narrow.webp', 'house_b_sideroof.webp'], props: (M) => {
    for (const [a, x] of [['sign-bread', 6], ['sign-cup', 30], ['sign-bread', 38]]) M.items.back.push({ asset: 'placeholder:' + a, x, y: 4, w: 1, h: 1, standH: 5, zOffset: 0.25 });
    for (const [a, x] of [['awning-wheat', 3], ['awning-red', 27], ['awning-green', 35]]) M.items.back.push({ asset: 'placeholder:' + a, x, y: 4, w: 3, h: 1, standH: 4.2, zOffset: 0.25 });
    for (const x of [10, 31]) M.items.back.push({ asset: 'placeholder:laundry', x, y: 4, w: 4, h: 1, standH: 4.2, zOffset: 0.3 });
    for (const [a, x, y, w, h, s] of [['planter', 2, 12, 2, 1, 1.2], ['flowerbed', 5, 13, 3, 1, 0.9], ['door-pots', 10, 12, 2, 1, 1.1], ['bench', 14, 12, 2, 1, 1.2], ['flowerbed', 26, 13, 3, 1, 0.9], ['planter', 30, 12, 2, 1, 1.2], ['door-pots', 34, 12, 2, 1, 1.1], ['tree-small', 39, 12, 1, 1, 2.8]]) M.put('mid', a, x, y, w, h, s, 0.03);
  } });
  M.exit('north', 20, 0, 3, 'up', 'dive', { map: 'norn-east-street', exit: 'south', arrive: { x: 21, y: 14, dir: 'up' } });
  M.exit('west', 0, 6, 3, 'left', 'page', { map: 'norn-south-street', exit: 'east', arrive: { x: 24, y: 7, dir: 'left' } });
  M.walkers.push({ id: 'se-a', sprite: 'mob03', path: [[10, 9], [32, 9]], speed: 0.7, wait: 2200 });
  finish(M, { x: 24, y: 8, dir: 'up' });
}
{ // 銀鹿亭前の通り（南西）：北の細い路地（14列）を、西の通りへの道に（物語のあいだは出られない：storyLock）
  const m = read('norn-inn-street'), C = m.collision.map((r) => [...r]);
  for (let y = 1; y <= 4; y++) if (C[y][14] !== '.') throw new Error('銀鹿亭前の路地がふさがっている');
  C[0][14] = 'D'; m.collision = C.map((r) => r.join(''));
  m.exits = m.exits.filter((e) => e.id !== 'north');
  m.exits.push({ id: 'north', x: 14, y: 0, dir: 'up', effect: 'dive', to: { map: 'norn-west-street', exit: 'south', arrive: { x: 13, y: 14, dir: 'up' } }, note: '2026-11-26 四地区：南西（宿と旅支度）から西の通りへ抜ける細い路地' });
  write(m);
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
// ---------- どの家にも入れるように（2026-11-26 サニー「家の中も入れるようにどこも」。STORY-INTERIOR-CONTENTS-20261126：シナリオ室「店と住まいの内装対応_v01.md」）。
// 新しい地図の家の板ごとに、扉のマスと出入口を足し、中の部屋（norn-room-<地図>-NN）を作る。作りは gen-house-interiors と同じ（ブックヌック・民家の内装の絵）。
// 部屋の型：商店通り＝店（売り台の代わりに卓・棚・樽。8種の店の絵が届いたら差しかえ）、北東＝倉庫・荷運びの家、北西＝小工房・薬草の仕分け場、ほか＝民家。村＝村の住まい。
// 住む人・店主は置かない（資料：店主不明は家具あり無人。屋外の町の人を中へ複製しない）。売買・店名・家族は作らない ----------
{
  const homeRoom = read('norn-house-plaza-02');
  const ROOM_OF = { 'norn-east-street': 'shop', 'norn-ne': 'store', 'norn-nw': 'work', 'erde-village': 'village' };
  const SHORT = { 'norn-square': 'sq', 'norn-east-street': 'ea', 'norn-west-street': 'we', 'norn-south-street': 'so', 'norn-north-gate': 'no', 'norn-ne': 'ne', 'norn-nw': 'nw', 'norn-se': 'se', 'erde-village': 'vi' };
  const made = [];
  for (const [outId, short] of Object.entries(SHORT)) {
    const out = read(outId), doors = out.stage.townArt?.doors || {}, rows = out.collision.map((r) => [...r]);
    out.exits = out.exits.filter((e) => !String(e.id).startsWith('room-'));
    let n = 0;
    for (const layer of out.stage.layers) for (const it of layer.items) {
      if (!/^placeholder:house-/.test(it.asset) || !it.art) continue;
      delete it.doorExit;
      const row = it.y + it.h - 1, want = it.x + (doors[it.art]?.x ?? 0.5) * it.w;
      let col = -1;
      for (const c of [...Array(it.w).keys()].map((k) => it.x + k).sort((a, b) => Math.abs(a + 0.5 - want) - Math.abs(b + 0.5 - want))) {
        if (rows[row]?.[c] !== '#' || rows[row + 1]?.[c] !== '.') continue;
        if (out.exits.some((e) => Math.abs(e.x - c) <= 0 && e.y === row)) continue;
        col = c; break;
      }
      if (col < 0) continue;
      n++; rows[row][col] = 'D';
      const nn = String(n).padStart(2, '0'), id = `norn-room-${short}-${nn}`, exitId = `room-${nn}`;
      const kind = it.shop ? 'shop' : ROOM_OF[outId] === 'store' ? (n % 2 ? 'store' : 'home') : ROOM_OF[outId] === 'work' ? (n % 2 ? 'work' : 'herb') : ROOM_OF[outId] || 'home';
      const W = Math.max(8, Math.min(11, it.w + 1)), H = 7, dx = Math.floor(W / 2);
      out.exits.push({ id: exitId, x: col, y: row, dir: 'up', effect: 'nook-in', to: { map: id, exit: 'door', arrive: { x: dx, y: H - 2, dir: 'up' } } });
      it.doorExit = exitId;
      const C = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || x === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
      C[H - 1][dx] = 'D';
      const block = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) C[j][i] = '#'; };
      const back = [], mid = [];
      const put = (asset, x, y, w, h, standH, extra = {}) => { if (C[y]?.[x] !== '.') return; mid.push({ asset, x, y, w, h, ...(standH ? { standH } : {}), ...extra }); block(x, y, w, h); };
      back.push({ asset: 'placeholder:rug', x: 2, y: 3, w: W - 4, h: 2, standH: 0.05 });
      if (kind === 'shop') { // 店：手前に売り台（卓）、奥の壁に棚、品の樽
        put('tiles.pipoya-town', dx - 1, 3, 2, 2, 0, { region: 'table' }); put('placeholder:home-cupboard', 1, 1, 1, 1, 2.4); put('placeholder:home-cupboard', 2, 1, 1, 1, 2.4); put('placeholder:home-cupboard', W - 2, 1, 1, 1, 2.4);
        put('placeholder:barrels', W - 2, 3, 1, 1, 1.3); put('placeholder:home-chest', 1, 4, 1, 1, 0.6); back.push({ asset: 'placeholder:home-herbs', x: 4, y: 1, w: 2, h: 1, standH: 0.7 });
      } else if (kind === 'store') { // 北東・倉庫：荷を壁ぎわに積み、通路をあける
        for (const [x, y] of [[1, 1], [2, 1], [W - 3, 1], [W - 2, 1], [1, 3], [W - 2, 3]]) put('placeholder:barrels', x, y, 1, 1, 1.3);
        put('placeholder:home-chest', 1, 4, 1, 1, 0.6); put('placeholder:home-chest', W - 2, 4, 1, 1, 0.6); put('tiles.pipoya-town', dx - 1, 2, 2, 2, 0, { region: 'table' });
      } else if (kind === 'work' || kind === 'herb') { // 北西・小工房／薬草の仕分け場：作業台（卓）・棚・吊るした薬草
        put('tiles.pipoya-town', dx - 1, 2, 2, 2, 0, { region: 'table' }); put('placeholder:home-cupboard', 1, 1, 1, 1, 2.4); put('placeholder:barrels', W - 2, 1, 1, 1, 1.3);
        for (const x of [2, W - 4]) back.push({ asset: 'placeholder:home-herbs', x, y: 1, w: 2, h: 1, standH: 0.7 });
        if (kind === 'herb') { put('placeholder:home-washtub', W - 2, 4, 1, 1, 0.8); put('placeholder:home-chest', 1, 4, 1, 1, 0.6); } else put('placeholder:home-chest', W - 2, 4, 1, 1, 0.6);
      } else { // 民家・村の住まい：寝台・食卓・食器棚・かまど（幅9以上）か樽・香草・長持ち
        put('placeholder:bed', 1, 1, 2, 2, 1);
        if (W >= 9) { back.push({ asset: 'tiles.pipoya-town', region: 'hearth', x: W - 4, y: 1, w: 3, h: 2, zOffset: 0.1 }); block(W - 4, 1, 3, 2); } else put('placeholder:barrels', W - 2, 1, 1, 1, 1.3);
        put('tiles.pipoya-town', Math.max(3, dx - 1), 3, 2, 2, 0, { region: 'table' }); put('placeholder:home-cupboard', dx === 3 ? 4 : 3, 1, 1, 1, 2.4);
        back.push({ asset: 'placeholder:home-herbs', x: 1, y: 1, w: 2, h: 1, standH: 0.7 });
        if (n % 3 === 0) put('placeholder:home-chest', 1, 4, 1, 1, 0.6); else if (n % 3 === 1) put('placeholder:home-washtub', W - 2, 4, 1, 1, 0.8);
      }
      for (let y = 1; y < H - 1; y++) C[y][dx] = C[y][dx] === '#' && y >= H - 2 ? '.' : C[y][dx]; // 扉の前は通れる
      C[H - 2][dx] = '.';
      const SHOPNAME = { travel: '旅支度の店', transport: '荷物と運送の店', bakery: 'パン屋', eatery: '食堂', general: '雑貨屋', herbal: '薬草の店', repair: '修理の店', cloth: '服と布の店' };
      const TITLE = { shop: '商店通りの店（仮・無人）', store: '北東の倉庫（仮）', work: '北西の小工房（仮）', herb: '北西の薬草の仕分け場（仮）', village: '村の住まい（仮）', home: '家の中（仮）' };
      write({
        format: 'sternenring-next-map', version: 1, id, title: 'ノルン・' + (it.shop ? SHOPNAME[it.shop] + '（仮・無人）' : TITLE[kind]), kind: 'interior', footsteps: 'wood', status: 'provisional',
        provenance: `2026-11-26 作者「家の中も入れるようにどこも」で tools/gen-norn-town.cjs が作った仮の部屋（${outId} の ${it.art} の家、型：${kind}。シナリオ室「店と住まいの内装対応_v01.md」に合わせ、店主・住人は置かない）。地区・店ごとの内装の絵が届いたら差しかえる。`,
        width: W, height: H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', D: 'door' }, collision: C.map((r) => r.join('')),
        ground: { tileset: 'tiles.pipoya-town', fill: 'floor', wall: 'wall', rows: null },
        exits: [{ id: 'door', x: dx, y: H - 1, dir: 'down', effect: 'nook-out', to: { map: outId, exit: exitId, arrive: { x: col, y: row + 1, dir: 'down' } } }],
        spawns: { default: { x: dx, y: H - 2, dir: 'up' } }, events: [],
        stage: { look: 'home', camera: homeRoom.stage.camera, textures: homeRoom.stage.textures, backWindows: false, orbs: homeRoom.stage.orbs,
          layers: [{ band: 'backdrop', items: [] }, { band: 'back', items: back }, { band: 'mid', items: mid }, { band: 'actors', items: [] }, { band: 'front', items: [] }] },
      });
      made.push(id);
    }
    out.collision = rows.map((r) => r.join(''));
    write(out);
  }
  for (const f of fs.readdirSync(dir)) if (f.startsWith('norn-room-') && !made.includes(f.replace('.json', ''))) fs.unlinkSync(path.join(dir, f));
  const wp = path.join(__dirname, '..', 'data', 'world.json'), w = JSON.parse(fs.readFileSync(wp, 'utf8'));
  w.maps = w.maps.filter((id) => !id.startsWith('norn-room-')).concat(made); fs.writeFileSync(wp, JSON.stringify(w, null, 2) + '\n');
  const ap = path.join(__dirname, '..', 'data', 'audio.json'), au = JSON.parse(fs.readFileSync(ap, 'utf8'));
  for (const k of Object.keys(au.bgmByMap)) if (k.startsWith('norn-room-')) delete au.bgmByMap[k];
  for (const id of made) au.bgmByMap[id] = au.bgmByMap['norn-plaza']; fs.writeFileSync(ap, JSON.stringify(au, null, 2) + '\n');
  console.log('入れる家の部屋', made.length);
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
  const ids = ['norn-square', 'norn-east-street', 'norn-kingsroad', 'norn-north-gate', 'norn-west-street', 'norn-south-street', 'erde-forest-east', 'erde-forest-fork', 'erde-deep', 'erde-village', 'norn-ne', 'norn-nw', 'norn-se', 'norn-inn-street'];
  const maps = Object.fromEntries(ids.map((id) => [id, read(id)]));
  const IN = { left: [1, 0, 'right'], right: [-1, 0, 'left'], up: [0, 1, 'down'], down: [0, -1, 'up'] };
  for (const id of ids) for (const e of maps[id].exits) {
    if (id === 'norn-inn-street' && !['east-street', 'north'].includes(e.id)) continue;
    const t = maps[e.to.map]; if (!t) continue; const b = t.exits.find((x) => x.id === e.to.exit); if (!b) throw new Error(`${id}.${e.id} の行き先 ${e.to.map}.${e.to.exit} が無い`);
    if (b.to.map !== id || b.to.exit !== e.id) throw new Error(`${id}.${e.id} と ${e.to.map}.${b.id} が双方向でない`);
    const [dx, dy, d] = IN[b.dir]; e.to.arrive = { x: b.x + dx, y: b.y + dy, dir: d };
  }
  for (const id of ids) write(maps[id]);
}
// ---------- 歩いている人・座っている人と話せるように（2026-11-26 サニー「あるいている、座っている人にもぶつかり判定、話もできるように」） ----------
// 言葉は Claude の仮（provisional）。町の人ひとりひとりの名前・性格・話し方はシナリオ室に依頼中（依頼_町の人の名前と性格_シナリオ室.md）。届いたら一人ずつの言葉に差しかえる
{
  const P = (pick) => ({ pick: pick.map((t) => [{ who: '町の人', text: t }]), status: 'provisional', placeholder: 'Claudeの仮。シナリオ室の名簿・言葉に差しかえる' });
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), 'utf8'));
  Object.assign(D.lines, {
    'life.walker.festival': P(['祭りの日は、歩くだけで楽しいね。', 'おっと、ごめんよ。人が多くて前が見えなくてね。', 'あっちの屋台、もう行ったかい？', 'のんびり見て回るのが、いちばんさ。']),
    'life.seated.home': P(['いらっしゃい。祭りの日でも、うちはいつもどおりさ。', 'ひと休みしてるんだ。外はにぎやかだからね。', '温かいお茶が、いちばんのごちそうだよ。']),
    'life.seated.inn': P(['ここの食事は、旅の疲れが取れるよ。', '明日の朝には発つんだ。今夜はゆっくりするよ。', '祭りの音が、ここまで聞こえてくるね。']),
  });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), JSON.stringify(D, null, 2) + '\n');
  const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'world.json'), 'utf8'));
  for (const id of W.maps) {
    const m = read(id); let ch = false;
    for (const w of m.walkers || []) if (!w.pages) { w.pages = [{ dialogue: 'life.walker.festival' }]; ch = true; }
    for (const n of m.stage?.npcs || []) if (n.pose === 'sit' && /^mob/.test(n.sprite || '') && !n.pages) { n.pages = [{ dialogue: id.startsWith('silver-deer') ? 'life.seated.inn' : 'life.seated.home' }]; ch = true; }
    if (ch) write(m);
  }
}
// ---------- 庇は家の扉の真上に（2026-11-26 サニー「こういう布の置く位置は考えてね」：庇が壁のまん中に浮いていた） ----------
{
  const AR = 194 / 384, W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'world.json'), 'utf8'));
  const towns = [...new Set([...W.maps, 'norn-ne', 'norn-nw', 'norn-se'])].filter((x) => /^norn-(inn-street|square|east-street|west-street|south-street|north-gate|ne|nw|se)$/.test(x));
  for (const id of towns) {
    if (!fs.existsSync(path.join(dir, id + '.json'))) continue;
    const m = read(id), back = m.stage.layers.find((l) => l.band === 'back'); let ch = false;
    const houses = back.items.filter((h) => /^placeholder:(house-|inn-)/.test(h.asset) && h.art && HOUSE.ART[h.art]);
    for (const a of back.items.filter((it) => /^placeholder:awning-/.test(it.asset))) {
      const c = a.x + a.w / 2, h = houses.find((q) => c >= q.x && c < q.x + q.w); if (!h) continue;
      const sz = HOUSE.boardSize(h.art), dx = h.x + h.w / 2 - sz.w / 2 + sz.w * HOUSE.ART[h.art].x, hh = a.w * AR;
      a.x = +(dx - a.w / 2).toFixed(2); a.standH = +(HOUSE.DOOR_H + 0.15 + hh).toFixed(2); a.y = h.y + h.h - 1; a.zOffset = 0.25; a.note = '扉の真上（2026-11-26 サニー「布の置く位置は考えてね」）'; ch = true;
    }
    const seen = new Set(); back.items = back.items.filter((it) => { if (!/^placeholder:awning-/.test(it.asset)) return true; const k = Math.round(it.x * 2); if (seen.has(k)) { ch = true; return false; } seen.add(k); return true; }); // 同じ扉に庇が2つ重なったら1つに
    if (ch) write(m);
  }
}
// ---------- 一覧・曲・言葉 ----------
const NEW = ['erde-witch-house', 'norn-kingsroad-wall-b', 'norn-kingsroad-wall-c', 'norn-square', 'norn-east-street', 'norn-kingsroad', 'norn-north-gate', 'norn-west-street', 'norn-south-street', 'erde-forest-east', 'erde-forest-fork', 'erde-deep', 'erde-village', 'norn-ne', 'norn-nw', 'norn-se'];
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
    'map.norn.gate-gastel': P(['（ガステルへの大門。）', '〔開発中：この先はまだ作っていません〕']),
    'map.erde.witch-shelf': P(['（棚に、薬草を詰めた小さな瓶が並んでいる。）']),
    'map.erde.witch-pot': P(['（鍋から、草の香りがかすかにする。）']),
    'map.erde.signpost': P(['（古い道しるべ。文字は書いていない。）', '（板の先は、西と南を指している。）']),
    'map.norn.signpost': P(['（道しるべ。文字は書いていない。）', '（板の先は、北と南を指している。）']),
    'map.erde.witch-house': P(['（森の奥の家。戸は閉まっている。）', '〔開発中：家の外観と中は、まだ仮です〕']),
  });
  fs.writeFileSync(f, JSON.stringify(D, null, 2) + '\n');
}
console.log('ノルンの新しい骨格と森・村・魔女の家：', NEW.length, 'マップ');
