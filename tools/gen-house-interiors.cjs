// 町の家すべてに、中の部屋（仮）を作る道具。2026-11-24 作者「今夜町の家全部中を作っておいて」。
// 使い方: <node> tools/gen-house-interiors.cjs
// - norn-inn-street・norn-plaza の家の板（placeholder:house-*）ごとに、扉のマスと出入口を足し、中の部屋のマップ（norn-house-*）を作る。
// - 中の部屋は、銀鹿亭の客室（silver-deer-room-a）と同じ作り（ブックヌック・内装の手ざわり）。家具は寝台・食卓・敷物・樽・暖炉を、家の幅に合わせて置く。
// - 間取り・住む人・品物は決めない（status: provisional）。正式な中身は4室の確定待ち。
// - 何度流しても同じ結果になる（前に作った出入口・マップは作りなおす）。
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), MAPS = path.join(ROOT, 'data', 'maps');
const read = (id) => JSON.parse(fs.readFileSync(path.join(MAPS, id + '.json'), 'utf8'));
const write = (id, m) => fs.writeFileSync(path.join(MAPS, id + '.json'), JSON.stringify(m, null, 2) + '\n');
const SRC = [['norn-inn-street', 'street'], ['norn-plaza', 'plaza']];
const room = read('silver-deer-room-a'); // 見本（手ざわり・カメラ・オーブ）
const made = [];

for (const [outId, short] of SRC) {
  const out = read(outId), doors = out.stage.townArt?.doors || {};
  out.exits = out.exits.filter((e) => !String(e.id).startsWith('house-'));
  const rows = out.collision.map((r) => [...r]);
  let n = 0;
  for (const layer of out.stage.layers) for (const it of layer.items) {
    if (!/^placeholder:house-/.test(it.asset)) continue;
    delete it.doorExit;
    n++;
    const id = `norn-house-${short}-${String(n).padStart(2, '0')}`, exitId = `house-${String(n).padStart(2, '0')}`;
    const row = it.y + it.h - 1, want = it.x + (doors[it.art]?.x ?? 0.5) * it.w;
    // 扉のマス：絵の扉の位置にいちばん近く、家の中にあって、すぐ下（外）が通れるマス
    let col = -1;
    for (const c of [...Array(it.w).keys()].map((k) => it.x + k).sort((a, b) => Math.abs(a + 0.5 - want) - Math.abs(b + 0.5 - want))) {
      if (rows[row]?.[c] === undefined || rows[row + 1]?.[c] !== '.') continue;
      if (!['#', 'D'].includes(rows[row][c])) continue;
      if (out.exits.some((e) => e.x === c && e.y === row)) continue;
      col = c; break;
    }
    if (col < 0) { console.log('扉を置けない', outId, it.art, it.x, it.y); n--; continue; }
    rows[row][col] = 'D';
    // 中の部屋の大きさ：家の幅から（7〜11マス）、奥行き 7
    const W = Math.max(7, Math.min(11, it.w + 1)), H = 7, dx = Math.floor(W / 2);
    out.exits.push({ id: exitId, x: col, y: row, dir: 'up', effect: 'nook-in', to: { map: id, exit: 'door', arrive: { x: dx, y: H - 2, dir: 'up' } } });
    it.doorExit = exitId;
    // 家具（奥の壁ぞい）：左に寝台、右に暖炉（幅9以上）か樽、真ん中に敷物と食卓
    const col2 = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || x === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
    col2[H - 1][dx] = 'D';
    const block = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) col2[j][i] = '#'; };
    const back = [], mid = [];
    back.push({ asset: 'placeholder:rug', x: 2, y: 3, w: W - 4, h: 2, standH: 0.05 });
    mid.push({ asset: 'placeholder:bed', x: 1, y: 1, w: 2, h: 2, standH: 1 }); block(1, 1, 2, 2);
    if (W >= 9) { back.push({ asset: 'tiles.pipoya-town', region: 'hearth', x: W - 4, y: 1, w: 3, h: 2, zOffset: 0.1 }); block(W - 4, 1, 3, 2); }
    else { mid.push({ asset: 'placeholder:barrels', x: W - 2, y: 1, w: 1, h: 1, standH: 1.3 }); block(W - 2, 1, 1, 1); }
    const tx = Math.max(3, Math.floor(W / 2) - 1);
    mid.push({ asset: 'tiles.pipoya-town', region: 'table', x: tx, y: 3, w: 2, h: 2 }); block(tx, 3, 2, 2);
    if (W >= 8) { mid.push({ asset: 'placeholder:barrels', x: W - 2, y: 4, w: 1, h: 1, standH: 1.3 }); block(W - 2, 4, 1, 1); }
    if (n % 2 === 0) { // 1軒おきに左右を入れかえる（どの家も同じ並びに見えないように）。板の絵は反転しない（置く場所だけ入れかえる）
      for (const it2 of [...back, ...mid]) it2.x = W - it2.x - it2.w;
      for (const r of col2) r.reverse();
      col2[H - 1] = col2[H - 1].map(() => '#'); col2[H - 1][dx] = 'D'; // 扉は入れかえずに真ん中のまま（幅が偶数だとずれる）
    }
    const m = {
      format: 'sternenring-next-map', version: 1, id, title: 'ノルン・家の中（仮）', kind: 'interior', footsteps: 'wood', status: 'provisional',
      provenance: `2026-11-24 作者「今夜町の家全部中を作っておいて」で tools/gen-house-interiors.cjs が作った仮の部屋（${outId} の ${it.art} の家）。間取り・住む人・品物は4室の確定待ち。`,
      width: W, height: H, tileSize: 32, legend: { '.': 'floor', '#': 'wall', 'D': 'door' },
      collision: col2.map((r) => r.join('')),
      ground: { tileset: 'tiles.pipoya-town', fill: 'floor', wall: 'wall', rows: null },
      exits: [{ id: 'door', x: dx, y: H - 1, dir: 'down', effect: 'nook-out', to: { map: outId, exit: exitId, arrive: { x: col, y: row + 1, dir: 'down' } } }],
      spawns: { default: { x: dx, y: H - 2, dir: 'up' } },
      events: [],
      stage: {
        camera: room.stage.camera, textures: room.stage.textures, backWindows: false, orbs: room.stage.orbs,
        layers: [{ band: 'backdrop', items: [] }, { band: 'back', items: back }, { band: 'mid', items: mid }, { band: 'actors', items: [] }, { band: 'front', items: [] }],
      },
    };
    write(id, m); made.push(id);
  }
  out.collision = rows.map((r) => r.join(''));
  write(outId, out);
}
// 一覧に足す（前に作ったものは入れなおす）
const wp = path.join(ROOT, 'data', 'world.json'), world = JSON.parse(fs.readFileSync(wp, 'utf8'));
world.maps = world.maps.filter((id) => !id.startsWith('norn-house-')).concat(made);
fs.writeFileSync(wp, JSON.stringify(world, null, 2) + '\n');
// 曲：家の中も町と同じ曲（2026-11-24 作者「家の中も同じ曲で」）。出入りで頭に戻さない
const ap = path.join(ROOT, 'data', 'audio.json'), audio = JSON.parse(fs.readFileSync(ap, 'utf8'));
for (const k of Object.keys(audio.bgmByMap)) if (k.startsWith('norn-house-')) delete audio.bgmByMap[k];
for (const id of made) audio.bgmByMap[id] = audio.bgmByMap['norn-plaza'];
fs.writeFileSync(ap, JSON.stringify(audio, null, 2) + '\n');
for (const f of fs.readdirSync(MAPS)) if (f.startsWith('norn-house-') && !made.includes(f.replace('.json', ''))) fs.unlinkSync(path.join(MAPS, f));
console.log('作った部屋', made.length);
// 家の中を作りなおすと、町のにぎわい（住人・家具を調べる出来事）が消えるので、続けて入れなおす（2026-11-24）
require('./gen-town-life.cjs');
