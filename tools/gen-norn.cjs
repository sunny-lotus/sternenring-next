// ノルン（仮の技術試験区画）を広げる道具。2026-11-22 作者「ノルンの街をもっと広く」。
// 今の広場（24×19：宿の入口・露店・植えこみ）は左上にそのまま残し、東と南に家並み・露店・植えこみの通りを足す。
// 町の正式な地理・建物は世界観・シナリオ室の確定待ち。これは仮の配置（status: provisional）。
// 使い方：<node> tools/gen-norn.cjs（data/maps/norn-plaza.json を書き直す。元の広場は data/maps/norn-plaza.base24.json から読む）
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'maps');
const basePath = path.join(dir, 'norn-plaza.base24.json');
if (!fs.existsSync(basePath)) fs.copyFileSync(path.join(dir, 'norn-plaza.json'), basePath);
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const W = 56, H = 40, GX = W - 1, GY = 11; // 東の端の道（森へ）
function rnd(seed) { let x = seed >>> 0 || 1; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296; }
const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
// 元の広場を写す（外の壁は、東の x=23 と南の y=18 だけ開ける＝通りでつながる）
for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
  let c = [...base.collision[y]][x];
  if ((x === base.width - 1 && y > 0) || (y === base.height - 1 && x > 0)) c = '.'; // 東と南の壁（角も）を開ける
  if (c === 'D' && !(x === 5 && y === 5)) c = '.'; // 東の道（23,11）は東の端へ移す
  if (c === 'D' && x === 5 && y === 5) c = '#'; // 宿の入口は見開き「銀鹿亭前の通り」へ移した（2026-11-22 景観案）。ここの宿はふつうの家にする
  g[y][x] = c;
}
const items = { back: [], mid: [] };
for (const l of base.stage.layers) if (l.band === 'back' || l.band === 'mid') items[l.band].push(...l.items.map((it) => (it.asset === 'placeholder:inn-front' ? { ...it, asset: 'placeholder:house-front' } : it)));
const R = rnd(4242);
const free = (x, y, w, h) => { for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) { if (i < 1 || j < 1 || i > W - 2 || j > H - 2) return false; if (g[j][i] !== '.') return false; } return true; };
const stamp = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = '#'; };
const keep = (x, y, w, h) => (y + h > 9 && y < 14) /* 東西の大通り（森への道） */ || (x + w > 10 && x < 15 && y > 15) /* 南へのびる通り */ || (x < 24 && y < 19) /* 元の広場 */ || (x + w > 36 && x < 40) /* 東の南北の通り */;
// 家並み（2026-11-22 作者「家ってもっと詰めて並んでいるように」）：通りに面して家を壁どうしくっつけて一列に並べる。
// 列の奥行き4マス＋路地2マスで6マスごと。ときどき1マスのすき間（裏へ抜ける細い路地）をあける。
const inside = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { if (i < 1 || j < 1 || i > W - 2 || j > H - 2 || g[j][i] !== '.') return false; } return true; };
for (let ry = 2; ry < H - 5; ry += 6) {
  let x = 1;
  while (x < W - 2) {
    const front = R() < 0.6;
    const [w, h, standH, band, dy] = front ? [5 + Math.floor(R() * 2), 4, 5, 'back', 0] : [4, 3, 3.5, 'mid', 1];
    const y = ry + dy;
    if (keep(x, ry, w, 4) || !inside(x, ry, w, 4)) { x++; continue; }
    stamp(x, y, w, h);
    items[band].push({ asset: `placeholder:${front ? 'house-front' : 'house-small'}`, x, y, w, h, standH, zOffset: Math.round(R() * 10) / 100 });
    x += w + (R() < 0.18 ? 1 : 0);
  }
}
// 路地の入口に植えこみを少し
for (let ry = 2; ry < H - 5; ry += 6) for (let x = 2; x < W - 3; x++) if (R() < 0.04 && !keep(x, ry + 4, 2, 1) && inside(x, ry + 4, 2, 1) && inside(x, ry + 5, 2, 1)) { stamp(x, ry + 4, 2, 1); items.mid.push({ asset: 'placeholder:planter', x, y: ry + 4, w: 2, h: 1, standH: 1.2, zOffset: 0 }); x += 3; }
for (let k = -1; k <= 1; k++) { g[GY + k][GX] = 'D'; g[11 + k][0] = 'D'; } // 東西の出入口は3マス（2026-11-22 作者「エリア移動の入り口をもう少し広く」） // 西の端：ページをめくって見開き「銀鹿亭前の通り」へ（2026-11-22 景観案）
const m = JSON.parse(JSON.stringify(base));
m.width = W; m.height = H; m.collision = g.map((r) => r.join(''));
m.provenance = base.provenance + ' 2026-11-22 作者の指示で 56×40 に広げた（tools/gen-norn.cjs。元の広場は左上にそのまま。東と南の通りは仮の配置）。';
m.exits = base.exits.filter((e) => e.id !== 'east-road' && e.id !== 'inn-door');
m.exits.push({ id: 'west-street', x: 0, y: 10, span: 3, dir: 'left', effect: 'page', to: { map: 'norn-inn-street', exit: 'east-street', arrive: { x: 32, y: 6, dir: 'left' } } });
m.exits.push({ id: 'east-road', x: GX, y: GY - 1, span: 3, dir: 'right', effect: 'page', to: { map: 'test-forest', exit: 'west-road', arrive: { x: 1, y: 6, dir: 'right' } } });
{ const { layers, ...rest } = m.stage; m.stage = { ...rest, floor: 'cobble', paved: [{"x":1,"y":1,"w":23,"h":18},{"x":0,"y":9,"w":56,"h":5},{"x":10,"y":14,"w":5,"h":25},{"x":36,"y":1,"w":4,"h":38}] /* 石畳は元の広場・東西の大通り・南の通り・東の通りだけ */, orbs: {"count":10,"alpha":0.5,"color":[1,0.86,0.62],"size":0.7,"note":"町：導機灯や窓の灯りに舞う、暖かいほこりの粒（仮）"}, layers }; } // 光の玉は場所ごとに（仮）
for (const l of m.stage.layers) {
  if (l.band === 'backdrop') l.items = [{ asset: 'placeholder:night-sky-ring', image: 'assets/backdrops/title_bg_temp.jpg', imageNote: '今だけの仮（作者「背景をもっと高く、試しにバトルのタイトルの背景を、今だけ」）', x: 0, y: 0, w: W, h: 1, standH: 26 }];
  if (l.band === 'back') l.items = items.back;
  if (l.band === 'mid') l.items = items.mid;
}
fs.writeFileSync(path.join(dir, 'norn-plaza.json'), JSON.stringify(m, null, 2) + '\n');
console.log('norn', W, H, 'boards', items.back.length + items.mid.length);
console.log(m.collision.join('\n'));
