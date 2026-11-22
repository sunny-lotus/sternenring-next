// 見開き「銀鹿亭前の通り」（仮）を作る道具。2026-11-22 作者が貼った景観案：
//   「まず具体化するなら、《銀鹿亭》の入口と屋台がある通りを、一つの見開きとして組むのがよさそう。宿の暖かさ、交易の賑わい、導機のある暮らしを、最初の一画面で見せられる」
//   「家を一枚ずつ離して置くより、屋根・庇・看板・植木を前後に重ねる。建物の間に細い道がのぞき、歩くと隠れていた店先が見えてくる」
//   「一つの見開きには、覚えてもらう場所を一つ置きたい。銀鹿亭前なら鹿の看板」
// 景観案は案で、地区名・間取り・銀鹿亭の所在は世界観・シナリオ室と作者の確定待ち。これは仮の配置（status: provisional）。
// 使い方：<node> tools/gen-norn-inn-street.cjs（data/maps/norn-inn-street.json を書き直す）
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, '..', 'data', 'maps', 'norn-inn-street.json');
const HOUSE = require('./norn-house-art.cjs');
const W = 44, H = 18;
const INN_ART = 'house_e_archway.webp', INN_DOOR_X = 8;
const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
const wall = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = '#'; };
const items = { back: [], mid: [], front: [] };
const put = (band, asset, x, y, w, h, standH, zOffset = 0, solid = true) => { if (solid) wall(x, y, w, h); items[band].push({ asset: `placeholder:${asset}`, x, y, w, h, standH, zOffset }); };

// 北の家並み（通りの奥）：壁どうしくっつけ、ところどころ細い路地（行き止まり）がのぞく。
// 2026-11-23 作者「家のドアとキャラの大きさを同じくらいにしてほしい」：家の絵はドアがキャラと同じ高さ（tools/norn-house-art.cjs）になる大きさで立てる。
// 家が大きくなったので、通りを 34 → 44 マスに広げ、家の数を減らした。家の絵は地図で決める（art）。足もとの幅＝絵の幅（四捨五入）
const house = (asset, art, x, zOffset = 0) => { const sz = HOUSE.boardSize(art), w = Math.round(sz.w); put('back', asset, x, 1, w, 4, Math.round(sz.h * 10) / 10, zOffset); items.back.at(-1).art = art; return { x, w, door: x + (w - sz.w) / 2 + HOUSE.ART[art].x * sz.w }; };
//   x=1〜3 は細い路地（奥に荷箱と木）
const inn = house('inn-tall', INN_ART, 4); // 銀鹿亭（いまは仮に house_e_archway の扉を入口にしている。2026-11-22 作者「酒場っぽくないのと、入れるスペースがないように見える」。本当の正面は美術・演出室に依頼中）。入口 (8,4) が絵の扉の真ん中に来る位置
if (Math.floor(inn.door) !== INN_DOOR_X) throw new Error(`銀鹿亭の絵の扉が入口のマスからずれている：${inn.door.toFixed(2)}`);
//   x=14 は細い路地
house('house-tall', 'house_f_corner.webp', 15, 0.02);
//   x=23 は細い路地（奥に荷箱）
house('house-ochre', 'house_home_2f.webp', 24, 0.04);
//   x=33 は細い路地
house('house-mid', 'house_c_stepgable.webp', 34, 0.02);
put('mid', 'crates', 2, 1, 1, 1, 1.2); // 路地の奥の荷箱
put('mid', 'crates', 23, 1, 1, 1, 1.2);
put('mid', 'tree-small', 41, 2, 1, 1, 2.2, 0.03);
g[4][INN_DOOR_X] = 'D'; // 銀鹿亭の入口

// 店先：家の前に張り出す庇（下をくぐって歩ける）と吊り看板（板の上のほうにだけ描く）
// 看板と庇は、家の壁にくっつける（家の正面と同じ列、ほんの少し手前）。前は1.5マス手前に立っていて、宙に浮いて見えた（2026-11-22 作者「看板と布は相変わらず」）
// 家が大きくなったので、庇はドア（2.5マス）の上、看板は2階の高さに上げた（2026-11-23）
put('back', 'awning-green', 19, 4, 3, 1, 3.9, 0.25, false); // 角の家の1階の窓の上
put('back', 'awning-red', 28, 4, 3, 1, 3.9, 0.25, false);
put('back', 'awning-wheat', 36, 4, 3, 1, 3.9, 0.25, false); // 段の破風の家のドアの上
put('back', 'sign-deer', 11, 4, 2, 1, 5.4, 0.25, false); // 覚えてもらう目印：銀の鹿の看板（入口の右、2階の窓の横）
put('back', 'sign-bread', 15, 4, 1, 1, 5, 0.25, false);
put('back', 'sign-shoe', 31, 4, 1, 1, 5, 0.25, false);
put('back', 'sign-cup', 34, 4, 1, 1, 5, 0.25, false);
put('mid', 'crates', 6, 5, 1, 1, 1.3, 0.05); // 宿の入口の脇の旅人の荷物
put('mid', 'planter', 10, 5, 1, 1, 1.4, 0.05); // 入口の脇の花鉢

// 導機灯（大通りに一定の間隔で）
for (const x of [4, 17, 31, 40]) put('mid', 'lamp', x, 10, 1, 1, 3.8, 0.05);
put('mid', 'tree', 1, 9, 2, 1, 4.2, 0.05); // 通りの木

// 南側（手前）：屋台が並び、そのうしろにも家。屋台の間はすき間をあけ、手前の家並みの路地へ抜けられる
for (const [x, w] of [[6, 3], [12, 3], [26, 3], [35, 3]]) put('mid', 'stall', x, 11, w, 2, 2.6, 0.05);
put('mid', 'flower-stall', 21, 11, 3, 2, 2.8, 0.05); // 花屋（2026-11-22 作者「花は？」）
put('mid', 'crates', 17, 11, 2, 1, 1.4, 0.05);
put('mid', 'cart', 39, 11, 3, 2, 2.4, 0.05);
// 手前のはし：カメラは低く主人公のうしろ（約9マス）にあるので、高い家を置くと画面をふさぐ（画面で確認）。低い植えこみ・荷箱・樽だけを置き、本の手前のふちを見せる
for (const [x, w] of [[3, 2], [19, 2], [36, 2]]) put('mid', 'planter', x, 15, w, 1, 1.2, 0.02);
for (const [x, w] of [[10, 3], [27, 3]]) put('mid', 'flowerbed', x, 15, w, 1, 0.9, 0.02); // 花壇
put('mid', 'tree-small', 42, 13, 1, 1, 2.2, 0.03); // 小さな木（緑の町）
put('mid', 'crates', 16, 15, 2, 1, 1.2, 0.02); put('mid', 'crates', 32, 15, 2, 1, 1.2, 0.02);

// 東の端：ページをめくって広場へ（景観案の「市場通り → 星環祭の広場」の見開きができるまでの仮）
const EX = W - 1, EY = 6; for (let k = 0; k < 3; k++) g[EY + k][EX] = 'D'; // 出入口は3マス（2026-11-22 作者「エリア移動の入り口をもう少し広く」）

const m = {
  format: 'sternenring-next-map', version: 1, id: 'norn-inn-street', title: 'ノルン・銀鹿亭前', kind: 'exterior', status: 'provisional',
  provenance: '2026-11-22 作者が貼った景観案（銀鹿亭の入口と屋台がある通りを一つの見開きに）から、tools/gen-norn-inn-street.cjs で作った仮の配置。地区名・間取り・銀鹿亭の所在は4室と作者の確定待ち。',
  width: W, height: H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', D: 'door' },
  ground: { tileset: 'tiles.pipoya-town', fill: 'paving', wall: 'wall', rows: null },
  exits: [
    { id: 'inn-door', x: INN_DOOR_X, y: 4, dir: 'up', effect: 'nook-in', to: { map: 'silver-deer-1f', exit: 'front-door', arrive: { x: 10, y: 12, dir: 'up' } } },
    { id: 'east-street', x: EX, y: EY, span: 3, dir: 'right', effect: 'page', to: { map: 'norn-plaza', exit: 'west-street', arrive: { x: 1, y: 10, dir: 'right' } } },
  ],
  spawns: { default: { x: 8, y: 6, dir: 'down' } },
  events: [],
  collision: g.map((r) => r.join('')),
  stage: {
    camera: { pitchDeg: 10, fovDeg: 60, follow: 'player', deadzone: [2, 1.5] },
    // 光の玉は場所ごとに変える（2026-11-22 作者「オーブは場所によって変えるようにしたい」）。値は仮
    floor: 'cobble',
    townArt: { doorH: HOUSE.DOOR_H, doors: HOUSE.doorsForMap(), "note":"ノルンの町の絵（美術・演出室 2026-11-22、pixel/元絵/町_ノルン を tools の town-prep.ps1 で小さくしたもの）。板の名前ごとの絵。家は位置で選ぶ","base":"assets/town/norn/","ground":{"paved":"tex_cobble_street.webp","grass":"tex_grass.webp"},"boards":{"house-*":["house_home_2f.webp","house_a_narrow.webp","house_b_sideroof.webp","house_c_stepgable.webp","house_d_workshop.webp","house_e_archway.webp","house_f_corner.webp"],"inn-tall":"house_e_archway.webp","lamp":"lamp_post.webp","stall":"stall.webp","flower-stall":"flower_stall.webp","cart":"cart.webp","planter":"planter.webp","flowerbed":"flowerbed.webp","tree":"tree_street.webp","tree-small":"tree_small.webp","herbs":"herbs_drying.webp","awning-green":"awnings-1.webp","awning-red":"awnings-2.webp","awning-wheat":"awnings-3.webp","sign-bread":"signs-1.webp","sign-shoe":"signs-2.webp","sign-cup":"signs-3.webp","sign-deer":"signs-4.webp"}}, // 町の絵（2026-11-22 作者「テクスチャができました、ノルンの」）
    paved: [{"x":0,"y":5,"w":W,"h":9}], // 石畳は通り（5〜13行目）だけ。ほかは土か芝生（作者「道や広場は石畳、ほかは土か芝生」） // 仮の床：石畳（2026-11-22 作者「床を仮に作ってほしい」）
    orbs: {"count":10,"alpha":0.5,"color":[1,0.86,0.62],"size":0.7,"note":"町：導機灯や窓の灯りに舞う、暖かいほこりの粒（仮）"},
    layers: [
      { band: 'backdrop', items: [{ asset: 'placeholder:night-sky-ring', sink: 1, image: 'assets/backdrops/norn_night_v02.jpg', imageNightNote: '夜の背景（美術・演出室 2026-11-22 pixel/元絵/背景_ノルン/norn_night_backdrop_v02、試作）', imageDay: 'assets/backdrops/norn_day_v02.jpg', imageDayNote: '昼の背景（美術・演出室 2026-11-22 norn_day_backdrop_v02。手前の家を一階・扉まで描き直したもの。作者「背景を書かせなおす、家の窓やドアがあるように」）', imageNote: '今だけの仮（作者「背景をもっと高く、試しにバトルのタイトルの背景を、今だけ」）。カルディアの城壁とレグナス城の背景の元絵を依頼中', x: 0, y: 0, w: W, h: 1, standH: 22 }] },
      { band: 'back', items: items.back },
      { band: 'mid', items: items.mid },
      { band: 'actors', items: [] },
      { band: 'front', items: items.front },
    ],
  },
};
// 並び：format〜ground、exits、spawns、events、collision、stage（ほかのマップと同じ順）
fs.writeFileSync(out, JSON.stringify(m, null, 2) + '\n');
console.log('norn-inn-street', W, H, 'boards', items.back.length + items.mid.length);
console.log(m.collision.join('\n'));
