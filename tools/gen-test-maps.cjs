// 試験区画（森・ダンジョン）のマップを作る道具。2026-11-22 作者「歩ける広さをもっとめっちゃ大きく」。
// どちらも技術試験用の仮の区画（status: provisional）。場所・地理・中身は世界設定に無いもので、正式な舞台として扱わない。
// 使い方：<node> tools/gen-test-maps.cjs  → data/maps/test-forest.json と test-dungeon.json を書き直す
const fs = require('fs'), path = require('path');
const out = (id, obj) => fs.writeFileSync(path.join(__dirname, '..', 'data', 'maps', `${id}.json`), JSON.stringify(obj, null, 2) + '\n');
function rnd(seed) { let x = seed >>> 0 || 1; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296; }

// ---- 森（外・本の見開き）：64×30 ----
{
  const W = 64, H = 30, g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
  const items = { back: [], mid: [] }, R = rnd(2026);
  const free = (x, y, w, h) => { for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) { if (i < 1 || j < 1 || i > W - 2 || j > H - 2) return false; if (g[j][i] !== '.') return false; } return true; };
  const stamp = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = '#'; };
  // ダンジョンの入口（右上の岩肌の石のアーチ）
  const GX = 56; stamp(GX, 1, 4, 3); g[3][GX + 2] = 'D';
  items.back.push({ asset: 'placeholder:dungeon-gate', x: GX + 0.5, y: 1, w: 4, h: 3, standH: 5, zOffset: 0.1, doorExit: 'gate', cut: { x0: 0.3, x1: 0.7, y0: 0.42, y1: 1, arch: 0.14, hole: true }, peek: 'assets/interiors/test-dungeon/peek.webp', peekAspect: 1.6, peekPose: { rel: [0.006, 2.824, 8.144], q: [-0.0872, 0, 0, 0.9962], fov: 75, aspect: 1.6 } }); // 門の暗がりをくりぬき、奥に中の眺めの写し（2026-11-23 作者「ダンジョンに入るときも同様にしたい」）。注意：今の test-forest.json には、このスクリプトに無い south-path（手で足した出入口）がある
  const keep = (x, y, w, h) => (y + h > 5 && y < 10) /* 東西の道 */ || (x + w > GX - 2 && x < GX + 6 && y < 11) /* 入口の前 */ || (x < 12 && y > 3 && y < 12) /* 西の入口のまわり */;
  for (let gy = 2; gy < H - 3; gy += 5) for (let gx = 2; gx < W - 4; gx += 6) {
    const kind = R() < 0.5 ? 'pine' : R() < 0.5 ? 'rock' : 'bush';
    const [w, h, standH] = kind === 'pine' ? [3, 2, 5 + R() * 1.5] : kind === 'rock' ? [2, 1, 1.2 + R() * 0.6] : [3, 1, 1.4 + R() * 0.4];
    const x = gx + Math.floor(R() * 3), y = gy + Math.floor(R() * 2);
    if (keep(x, y, w, h) || !free(x, y, w, h)) continue;
    stamp(x, y, w, h);
    (kind === 'pine' ? items.back : items.mid).push({ asset: `placeholder:${kind}`, x, y, w, h, standH: Math.round(standH * 10) / 10 });
  }
  for (let k = 6; k <= 8; k++) g[k][0] = 'D'; // 西の出入口は3マス（2026-11-22 作者「エリア移動の入り口をもう少し広く」）
  out('test-forest', {
    format: 'sternenring-next-map', version: 1, id: 'test-forest', title: '試験区画・森（仮）', kind: 'exterior', status: 'provisional',
    provenance: '2026-11-22 作者の指示（相談チャット）で作った技術試験用の区画（tools/gen-test-maps.cjs で生成）。ページめくり（外どうし）とダンジョンの出入り、広いマップを試すためのもの。場所・地理・名前は世界設定に無い仮のもので、正式な舞台として扱わない。',
    width: W, height: H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', D: 'door' }, collision: g.map((r) => r.join('')),
    ground: { tileset: 'tiles.pipoya-town', fill: 'paving', wall: 'wall', rows: null },
    exits: [
      { id: 'west-road', x: 0, y: 6, span: 3, dir: 'left', effect: 'page', to: { map: 'norn-plaza', exit: 'east-road', arrive: { x: 54, y: 10, dir: 'left' } } },
      { id: 'gate', x: GX + 2, y: 3, dir: 'up', effect: 'nook-in', to: { map: 'test-dungeon', exit: 'front-gate', arrive: { x: 5, y: 62, dir: 'up' } } },
    ],
    spawns: { default: { x: 8, y: 7, dir: 'right' } }, events: [],
    // 見えている敵（2026-11-22 作者「森に敵が見えていて、ぶつかると戦闘」）。バトル試作の「通常戦（敵三体）」。勝つと消える
    encounters: [{ id: 'forest-beasts', x: 14, y: 10, battle: 'normal', note: '仮の見えている敵', symbol: ['battle/img/enemies/sr-norma.png'], symbolNote: '2026-11-22 作者「ゆるい猫ではなく戦う敵のシンボルにしてほしい」：戦闘の敵のドット絵' }, {"id":"road-beasts","x":30,"y":8,"battle":"swarm","note":"仮の見えている敵（街道の上）：バトル試作の「子獣の群れ」", symbol: ['battle/img/enemies/sr-pup.png'], symbolNote: '2026-11-22 作者「ゆるい猫ではなく戦う敵のシンボルにしてほしい」：戦闘の敵のドット絵'}],
    // 街道（2026-11-22 作者「森は街道を作って」「街道の上はシンボルエンカウントのみ、街道以外ではランダム」）
    roads: [{"x":0,"y":6,"w":60,"h":3},{"x":57,"y":4,"w":3,"h":2}], randomEncounters: {"rate":0.08,"minSteps":8,"battles":["normal","swarm","elements","casters"],"note":"街道の外だけ。8歩をこえたら1歩ごとに8%（仮）"},
    stage: { camera: { pitchDeg: 10, fovDeg: 75, distance: 6.5, follow: 'player', deadzone: [2, 1.5] }, floor: 'soil', orbs: {"count":26,"alpha":0.75,"color":[0.8,1,0.7],"size":1,"note":"森：木もれ日のような、緑がかった光の粒（仮）"}, layers: [
      { band: 'backdrop', items: [{ asset: 'placeholder:night-sky-ring', x: 0, y: 0, w: W, h: 1, standH: 6 }] },
      { band: 'back', items: items.back }, { band: 'mid', items: [...items.mid, { asset: 'placeholder:monster', x: 12, y: 10, w: 4, h: 1, standH: 3.4, zOffset: 0.05, encounter: 'forest-beasts' }, {"asset":"placeholder:monster","x":29,"y":8,"w":3,"h":1,"standH":3.1,"zOffset":0.05,"encounter":"road-beasts"}] }, { band: 'actors', items: [] }, { band: 'front', items: [] }] },
  });
  console.log('forest', W, H, 'boards', items.back.length + items.mid.length);
}

// ---- ダンジョン（中・ブックヌック）：横11×奥行き64の長い通路 ----
{
  const W = 11, H = 64, rows = [], pillars = [];
  rows.push('#'.repeat(W));
  for (let y = 1; y < H - 1; y++) {
    if ((y - 4) % 8 < 2 && y > 3 && y < H - 4) { rows.push('#.##...##.#'); if ((y - 4) % 8 === 0) pillars.push(y); } else rows.push('#' + '.'.repeat(W - 2) + '#');
  }
  rows.push('#####D#####');
  const mid = pillars.flatMap((y) => [{ asset: 'placeholder:stone-pillar', x: 2, y, w: 2, h: 2, standH: 4.5 }, { asset: 'placeholder:stone-pillar', x: 7, y, w: 2, h: 2, standH: 4.5 }]);
  out('test-dungeon', {
    format: 'sternenring-next-map', version: 1, id: 'test-dungeon', title: '試験区画・ダンジョン（仮）', kind: 'interior', status: 'provisional',
    provenance: '2026-11-22 作者の指示（相談チャット）で作った技術試験用のダンジョン（tools/gen-test-maps.cjs で生成）。見せ方はブックヌック（試作_ブックヌックが基準）。場所・中身・名前は世界設定に無い仮のもので、正式な舞台として扱わない。',
    width: W, height: H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', D: 'door' }, collision: rows,
    ground: { tileset: 'tiles.pipoya-town', fill: 'floor', wall: 'wall', rows: null },
    exits: [{ id: 'front-gate', x: 5, y: H - 1, dir: 'down', effect: 'nook-out', to: { map: 'test-forest', exit: 'gate', arrive: { x: 58, y: 4, dir: 'down' } } }],
    spawns: { default: { x: 5, y: H - 3, dir: 'up' } }, events: [],
    stage: { look: 'dungeon', camera: { pitchDeg: 10, fovDeg: 90, distance: 3, follow: 'player' }, orbs: {"count":14,"alpha":0.6,"color":[0.62,0.75,1],"size":0.8,"note":"ダンジョン：青白い、ひんやりした光の粒（仮）"}, layers: [
      { band: 'backdrop', items: [{ asset: 'placeholder:dungeon-back-wall', x: 0, y: 0, w: W, h: 1, standH: 4 }] },
      { band: 'back', items: [] }, { band: 'mid', items: mid }, { band: 'actors', items: [] }, { band: 'front', items: [] }] },
  });
  console.log('dungeon', W, H, 'pillars', pillars.length * 2);
}
