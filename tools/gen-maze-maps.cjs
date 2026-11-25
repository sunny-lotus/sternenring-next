// 森を迷路っぽく、ダンジョンを入り組んだ迷宮に（2026-11-25 作者「森をもっとめいろっぽく」「ダンジョンも迷宮っぽく入り組んだ形に」）。
// どちらも技術試験用の仮の区画（status: provisional）。いまの test-forest.json・test-dungeon.json を読み、地形（collision）と壁の板だけを作りかえる。
// 出入口・敵・調べる所・森の絵の設定は残す。光る所（sparkle）は行き止まりへ移す。乱数は固定（何度流しても同じ）。
// 使い方：<node> tools/gen-maze-maps.cjs
const fs = require('fs'), path = require('path');
const P = (id) => path.join(__dirname, '..', 'data', 'maps', `${id}.json`);
const read = (id) => JSON.parse(fs.readFileSync(P(id), 'utf8'));
const write = (id, m) => fs.writeFileSync(P(id), JSON.stringify(m, null, 2) + '\n');
function rnd(seed) { let x = seed >>> 0 || 1; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296; }

/**
 * 迷路を作る：cw×ch の部屋（通路の幅 c マス、壁 1 マス）。DFS で一本道の迷路を作り、loop の割合だけ壁を抜いて回り道を作る
 * @returns {{ g: string[][], cell: (cx:number, cy:number) => {x:number,y:number} }}
 */
function maze(W, H, cw, ch, c, R, loop) {
  const g = Array.from({ length: H }, () => Array(W).fill('#')), S = c + 1;
  const cell = (cx, cy) => ({ x: 1 + cx * S, y: 1 + cy * S });
  const open = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j > 0 && i > 0 && j < H - 1 && i < W - 1) g[j][i] = '.'; };
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { const p = cell(cx, cy); open(p.x, p.y, c, c); }
  const seen = new Set(['0,0']), st = [[0, 0]];
  const knock = (cx, cy, nx, ny) => { const p = cell(cx, cy); if (nx > cx) open(p.x + c, p.y, 1, c); else if (nx < cx) open(p.x - 1, p.y, 1, c); else if (ny > cy) open(p.x, p.y + c, c, 1); else open(p.x, p.y - 1, c, 1); };
  while (st.length) {
    const [cx, cy] = st[st.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !seen.has(x + ',' + y));
    if (!nb.length) { st.pop(); continue; }
    const [nx, ny] = nb[Math.floor(R() * nb.length)]; knock(cx, cy, nx, ny); seen.add(nx + ',' + ny); st.push([nx, ny]);
  }
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { if (R() < loop && cx + 1 < cw) knock(cx, cy, cx + 1, cy); if (R() < loop && cy + 1 < ch) knock(cx, cy, cx, cy + 1); }
  return { g, cell, open };
}
/** 通れるマス（'.'）だけをたどって、start から各マスへの道のり */
function dist(g, sx, sy) {
  const H = g.length, W = g[0].length, d = Array.from({ length: H }, () => Array(W).fill(-1)), q = [[sx, sy]]; d[sy][sx] = 0;
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || d[ny][nx] >= 0 || g[ny][nx] === '#') continue; d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); } }
  return d;
}
/** 行き止まり（通路の部屋で、まわりの壁が3方向）を、入口から遠い順に */
function deadEnds(g, cell, cw, ch, c, d) {
  const out = [];
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const p = cell(cx, cy), mid = Math.floor(c / 2); let walls = 0;
    if (g[p.y + mid][p.x - 1] === '#') walls++; if (g[p.y + mid][p.x + c] === '#') walls++; if (g[p.y - 1][p.x + mid] === '#') walls++; if (g[p.y + c]?.[p.x + mid] === '#') walls++;
    const dd = d[p.y + mid][p.x + mid]; if (walls >= 3 && dd > 0) out.push({ x: p.x + mid, y: p.y + mid, d: dd });
  }
  return out.sort((a, b) => b.d - a.d);
}
/** 壁のマスを、横に続く所はまとめて（長さ max まで）四角に。残りは縦にまとめる */
function wallRects(g, inside, maxLen) {
  const H = g.length, W = g[0].length, used = Array.from({ length: H }, () => Array(W).fill(false)), out = [];
  const wall = (x, y) => inside(x, y) && g[y][x] === '#' && !used[y][x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!wall(x, y)) continue; let w = 1; while (w < maxLen && wall(x + w, y)) w++;
    if (w >= 2) { for (let i = 0; i < w; i++) used[y][x + i] = true; out.push({ x, y, w, h: 1 }); }
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (!wall(x, y)) continue; let h = 1; while (h < maxLen && wall(x, y + h)) h++;
    for (let j = 0; j < h; j++) used[y + j][x] = true; out.push({ x, y, w: 1, h });
  }
  return out;
}

// ================= 森（64×30、通路3マス・しげみの壁1マス） =================
{
  const m = read('test-forest'), W = m.width, H = m.height, R = rnd(2511);
  const { g, open } = maze(W, H, 15, 7, 3, R, 0.12);
  // 端の余り（x 61・62）は壁に。外周は壁
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x >= W - 3 || y === H - 1) g[y][x] = '#';
  // 残す広場：西の入口・門の前・調べる所（焚き火の跡など）・南の出口・見えている敵
  open(1, 5, 9, 5);                 // 西の入口（出入口は x0・y6〜8）
  open(53, 4, 8, 4);                // 門の前（門は x56〜59・y1〜3、扉は 58,3）
  open(18, 9, 12, 3);               // 焚き火の跡・薬草・石碑の空き地（20/24/28, 10）
  open(28, 25, 7, 4);               // 南の出口（30〜32, 29）へ
  open(13, 9, 3, 3); open(29, 7, 3, 3); // 敵（14,10）（30,8）
  for (let x = 56; x < 60; x++) for (let y = 1; y < 4; y++) g[y][x] = '#'; g[3][58] = 'D'; // 門
  for (let k = 6; k <= 8; k++) g[k][0] = 'D';
  for (let x = 30; x <= 32; x++) g[H - 1][x] = 'D';
  // 入口から全部つながっているか（つながらない所は壁に）
  const d = dist(g.map((r) => r.map((c) => (c === 'D' ? '.' : c))), 1, 7);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && d[y][x] < 0) g[y][x] = '#';
  for (const [x, y] of [[58, 4], [1, 7], [31, 28], [20, 10], [24, 10], [28, 10], [14, 10], [30, 8]]) if (d[y][x] < 0) throw new Error(`森：${x},${y} へ行けない`);
  // 光る所を、入口から遠い行き止まりへ（同じ広場の近くは避ける）
  const S = 4, cellF = (cx, cy) => ({ x: 1 + cx * S, y: 1 + cy * S });
  const ends = deadEnds(g, cellF, 15, 7, 3, d).filter((e) => !(e.x < 12 && e.y < 12) && !(e.x > 50 && e.y < 9));
  const pickEnds = []; for (const e of ends) if (pickEnds.every((p) => Math.abs(p.x - e.x) + Math.abs(p.y - e.y) > 14)) pickEnds.push(e);
  const spk = ['sparkle-fo-ne', 'sparkle-fo-sw', 'sparkle-fo-se'];
  spk.forEach((id, i) => { const ev = m.events.find((e) => e.id === id), e = pickEnds[i]; if (ev && e) { ev.x = e.x; ev.y = e.y; } });
  // しげみの壁：横に続く壁はまとめた茂み、縦の壁は小さな茂み。曲がり角の一部に木（背が高く、迷路の目印）
  const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && !(x >= 56 && x < 60 && y < 4);
  // 木の壁（2026-11-25：茂みの絵は横に広い低いシダで、迷路の壁に見えなかった）：横に続く壁は背の高い木を3マスおき、縦に続く壁は少し小さい木を3.5マスおき。
  // 枝が重なって木の壁に見える。板は150枚まで（設計書 §3.3）
  const rects = wallRects(g, inside, 99), back = [], mid = [];
  const tree = (x, y, sh) => back.push({ asset: 'placeholder:pine', x: x - 0.5, y, w: 1, h: 1, showH: sh, standH: sh, maze: true });
  for (const r of rects) {
    if (r.h === 1) { const n = Math.max(1, Math.round(r.w / 3)); for (let k = 0; k < n; k++) tree(r.x + (k + 0.5) * r.w / n, r.y, Math.round((4 + R() * 1.2) * 10) / 10); }
    else { const n = Math.max(1, Math.round(r.h / 3.5)); for (let k = 0; k < n; k++) tree(r.x + 0.5, r.y + Math.floor((k + 0.5) * r.h / n), Math.round((3.2 + R() * 0.8) * 10) / 10); }
  }
  const L = (band) => m.stage.layers.find((l) => l.band === band);
  L('back').items = [...L('back').items.filter((it) => !/pine/.test(it.asset)), ...back];
  L('mid').items = [...L('mid').items.filter((it) => !/(rock|bush)/.test(it.asset)), ...mid];
  // 小道の絵：入口から門へ、南の出口へ、迷路の正しい道をたどる（曲がり角だけ）
  const route = (sx, sy, tx, ty) => { const dd = dist(g.map((r) => r.map((c) => (c === 'D' ? '.' : c))), tx, ty), pts = [[sx, sy]]; let x = sx, y = sy, pdx = 0, pdy = 0;
    while (!(x === tx && y === ty)) { let best = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = dd[y + dy]?.[x + dx]; if (v >= 0 && v < dd[y][x]) { best = [dx, dy]; if (dx === pdx && dy === pdy) break; } } if (!best) break;
      if ((best[0] !== pdx || best[1] !== pdy) && pts.length) pts.push([x + 0.5, y + 0.5]); [pdx, pdy] = best; x += best[0]; y += best[1]; }
    pts.push([tx + 0.5, ty + 0.5]); return pts; };
  m.stage.paths = [{ pts: route(1, 7, 58, 4), w: 2.2 }, { pts: route(20, 10, 31, 28), w: 2 }];
  m.stage.pathsNote = '2026-11-25 迷路の森（tools/gen-maze-maps.cjs）：小道の絵は、入口から門・南の出口への正しい道をたどる';
  m.roads = [{ x: 0, y: 5, w: 10, h: 5 }, { x: 53, y: 4, w: 8, h: 4 }];
  m.collision = g.map((r) => r.join(''));
  m.provenance += ' 2026-11-25 作者「森をもっとめいろっぽく」：tools/gen-maze-maps.cjs で迷路に（通路3マス・しげみの壁、ところどころ回り道。光る所は行き止まり）。';
  write('test-forest', m);
  console.log('森', W + '×' + H, '壁の板', back.length + mid.length, '光る所', pickEnds.slice(0, 3).map((e) => `${e.x},${e.y}`).join(' '));
}

// ================= ダンジョン（25×41、通路2マス・石の壁1マス） =================
{
  const m = read('test-dungeon'), R = rnd(4207), CW = 8, CH = 13, W = 1 + CW * 3, H = 1 + CH * 3 + 1;
  const { g, open } = maze(W, H, CW, CH, 2, R, 0.08);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y >= H - 2) g[y][x] = '#';
  // 入口の間（下の真ん中）：扉は一番下の行
  const EX = 1 + 4 * 3; // 4つめの部屋の左のマス（x 13・14）
  open(EX - 3, H - 5, 8, 3); g[H - 2][EX] = '.'; g[H - 2][EX + 1] = '.'; g[H - 1][EX] = 'D';
  // 奥の間（いちばん奥の真ん中）：宝の台
  open(EX - 3, 1, 8, 3);
  const d = dist(g.map((r) => r.map((c) => (c === 'D' ? '.' : c))), EX, H - 2);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && d[y][x] < 0) g[y][x] = '#';
  if (d[2][EX] < 0) throw new Error('ダンジョン：奥へ行けない');
  const cellD = (cx, cy) => ({ x: 1 + cx * 3, y: 1 + cy * 3 });
  const ends = deadEnds(g, cellD, CW, CH, 2, d).filter((e) => e.y > 4 && e.y < H - 6);
  const picks = []; for (const e of ends) if (picks.every((p) => Math.abs(p.x - e.x) + Math.abs(p.y - e.y) > 10)) picks.push(e);
  // 石の壁（内側だけ。外周はブックヌックの箱の壁）。横に続く壁はまとめて、近づくと透ける
  const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 2;
  const walls = wallRects(g, inside, 4).map((r) => ({ asset: 'placeholder:stone-wall', x: r.x, y: r.y, w: r.w, h: r.h, standH: 2.6, fadeNearPlayer: true, maze: true }));
  // 柱：奥の間と入口の間の両わき
  const pillars = [[EX - 3, 1], [EX + 3, 1], [EX - 3, H - 5], [EX + 3, H - 5]].map(([x, y]) => ({ asset: 'placeholder:stone-pillar', x, y, w: 2, h: 2, standH: 4.5 }));
  for (const [x, y] of [[EX - 3, 1], [EX + 3, 1], [EX - 3, H - 5], [EX + 3, H - 5]]) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) g[y + j][x + i] = '#';
  m.width = W; m.height = H; m.collision = g.map((r) => r.join(''));
  m.exits = [{ ...m.exits[0], x: EX, y: H - 1 }];
  m.spawns = { default: { x: EX, y: H - 3, dir: 'up' } };
  const L = (band) => m.stage.layers.find((l) => l.band === band);
  L('mid').items = [...pillars, ...walls];
  L('backdrop').items = [{ asset: 'placeholder:dungeon-back-wall', x: 0, y: 0, w: W, h: 1, standH: 4 }];
  // 光る所（行き止まり3つ）と、奥の間の宝の台（仮）
  const kinds = [['mats', '光る苔', 2, '湿った石のすきまで、光る苔がまたたいている。'], ['items', '霊水', 1, '崩れた石の下に、古い霊水のびんが埋もれていた。'], ['items', '気付け薬', 1, '壁のくぼみに、だれかが隠した気付け薬があった。']];
  m.events = (m.events || []).filter((e) => !/^(sparkle-du-|dungeon-altar)/.test(e.id));
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), 'utf8'));
  picks.slice(0, 3).forEach((e, i) => { const [kind, name, n, text] = kinds[i], id = `du-${i + 1}`, flag = `sparkle.${id}`;
    m.events.push({ id: `sparkle-${id}`, x: e.x, y: e.y, trigger: 'examine', sparkle: { flag }, status: 'provisional', pages: [{ when: { flags: { [flag]: true } }, dialogue: 'sparkle.empty' }, { dialogue: `sparkle.${id}`, set: { flags: { [flag]: true } }, give: { [kind]: { [name]: n } } }] });
    D.lines[`sparkle.${id}`] = ['足もとが、きらきら光っている。', text]; });
  m.events.push({ id: 'dungeon-altar', x: EX, y: 2, trigger: 'examine', status: 'provisional', sparkle: { flag: 'dungeon.altar' }, pages: [
    { when: { flags: { 'dungeon.altar': true } }, dialogue: 'dungeon.altar.again' },
    { dialogue: 'dungeon.altar.first', set: { flags: { 'dungeon.altar': true } }, give: { gold: 50, items: { '霊水': 2 } } }] });
  Object.assign(D.lines, {
    'dungeon.altar.first': ['迷宮のいちばん奥に、古い石の台がある。', '台の上に、小さな革袋が置かれていた。', { member: 'volt', text: '……やっと着いた。帰り道、覚えてるか？' }, { member: 'nacht', text: '……たぶんな。' }, { member: 'volt', text: '「たぶん」かよ。' }],
    'dungeon.altar.again': { pick: [['古い石の台。もう何も置かれていない。'], ['古い石の台。もう何も置かれていない。', { member: 'flare', text: 'ここまで来たの、すごいよね！' }], ['古い石の台。もう何も置かれていない。', { member: 'serena', text: '少し休んでから戻りましょう。' }]] },
  });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'dialogue.json'), JSON.stringify(D, null, 2) + '\n');
  m.provenance += ' 2026-11-25 作者「ダンジョンも迷宮っぽく入り組んだ形に」：tools/gen-maze-maps.cjs で迷宮に（25×41、通路2マス・石の壁。行き止まりに光る所、奥の間に宝の台）。';
  write('test-dungeon', m);
  // 森の門から着く所も合わせる
  const f = read('test-forest'), gate = f.exits.find((e) => e.id === 'gate'); gate.to.arrive = { x: EX, y: H - 3, dir: 'up' }; write('test-forest', f);
  console.log('ダンジョン', W + '×' + H, '壁の板', walls.length, '光る所', picks.slice(0, 3).map((e) => `${e.x},${e.y}`).join(' '), '入口', EX + ',' + (H - 1));
}
