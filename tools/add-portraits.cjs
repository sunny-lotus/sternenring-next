// 会話の立ち絵（体＋顔の差分）を素材台帳に載せる（2026-11-25）。
// 絵は 道具/portrait-faces.ps1 が、美術・演出室の「立ち絵_v01」（ナハト・ヴォルト poseA と表情7種、作者採用前）から作った：
//   体＝透過の原画（stand_pencil_v01_transparent）を 0.75 倍。顔＝表情の画像と土台の差のある所だけを、同じ縮尺で切り出したもの。
// 台帳の項目は kind: portrait。path を持たない（起動時に読まない。会話の画面を開くときに読む）。
// 使い方：node tools/add-portraits.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const file = path.join(root, 'data', 'assets.json');
const L = JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const SRC = {
  nacht: { art: 'pixel/元絵/立ち絵_v01/nacht_poseA_*.png（美術・演出室 ART-DIALOGUE-20261125、作者採用前）', orig: 'バトル試作/_作業/新立ち絵/nacht_stand_pencil_v01_transparent.png', side: '刀は左の腰' },
  volt: { art: 'pixel/元絵/立ち絵_v01/volt_poseA_*.png（美術・演出室 ART-DIALOGUE-20261125、作者採用前）', orig: 'バトル試作/_作業/新立ち絵/volt_stand_pencil_v01_transparent.png', side: '右手に杖・右の義足（服で隠れる）' },
  // 2026-11-25 残り3人（作者「これでいい　立ち絵」のあと、同じ作り方で）
  flare: { art: 'pixel/元絵/立ち絵_v01/flare_poseA_*.png（美術・演出室 ART-DIALOGUE-20261125 第2段）', orig: 'バトル試作/_作業/新立ち絵/flare_stand_pencil_v02_transparent.png', side: '左の腰に剣' },
  serena: { art: 'pixel/元絵/立ち絵_v01/serena_poseA_*.png（美術・演出室 ART-DIALOGUE-20261125 第2段）', orig: 'バトル試作/_作業/新立ち絵/serena_stand_pencil_v01_transparent.png', side: '左の腰に剣' },
  licht: { art: 'pixel/元絵/立ち絵_v01/licht_poseA_*.png（美術・演出室 ART-DIALOGUE-20261125 第2段）', orig: 'バトル試作/_作業/新立ち絵/licht_stand_pencil_v01_transparent.png', side: 'マントの内に背負った鞘' },
};
for (const id of Object.keys(SRC)) {
  const dir = `assets/portraits/${id}`;
  // 切り出した範囲は portrait-faces.ps1 の rects.json（台帳に載せたあとは消してよい。無ければ台帳の今の値を使う）
  const rf = path.join(root, dir, 'rects.json'), old = L.assets.find((a) => a.id === `portrait.${id}`);
  const r = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8').replace(/^﻿/, ''))
    : { size: old.size, faces: Object.fromEntries(Object.entries(old.faces).map(([k, f]) => [k, f.rect])) };
  const faces = {};
  for (const [face, rect] of Object.entries(r.faces)) { const p = `${dir}/face_${face}.png`; faces[face] = { file: p, rect, sha256: sha(p) }; }
  const entry = {
    id: `portrait.${id}`, kind: 'portrait', path: null, body: `${dir}/body.png`, size: r.size, faces, noFlip: true, status: 'provisional',
    note: '会話の立ち絵。normal は体の絵そのまま。ほかの表情は faces の絵を rect（体の絵の上の x, y, 幅, 高さ）に重ねる',
    source: '道具 portrait-faces.ps1（2026-11-25、0.75倍、差のある所を切り出し）', sourceArt: SRC[id].art, origin: SRC[id].orig, equipmentSide: SRC[id].side,
    sha256: sha(`${dir}/body.png`),
    ...(old?.poseB ? { poseB: old.poseB } : {}), // 2つ目のポーズは tools/make-portrait-poseb.py が書く（ここでは消さない）
  };
  const i = L.assets.findIndex((a) => a.id === entry.id);
  if (i >= 0) L.assets[i] = entry; else L.assets.push(entry);
  const p = [...(L.party || []), ...(L.cast || [])].find((x) => x.id === id); if (p) p.portrait = entry.id; // 仲間は party か cast にいる
}
fs.writeFileSync(file, JSON.stringify(L, null, 2) + '\n');
console.log('立ち絵を台帳に載せた');
