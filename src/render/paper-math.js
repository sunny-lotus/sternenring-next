// @ts-check
// 紙の舞台（paper-stage）の計算だけ。WebGL にも DOM にも依存しない（Node のテストで確かめる）。
// 座標：1マス＝1単位。マップの (x, y) は 3D の (x, 0, y)。y が大きいほど手前。
// 板はすべて同じ向き（カメラの正面）を向く。前後は「足もとの奥行き z」だけで決まる（板どうしは平行で交差しない）。

/** @typedef {{ x:number, z:number, w:number, h:number, band:string, alpha:number, air:number }} Board */

/** 舞台の見た目の設定（data/stage-style.json）。数値は作者のスマホで見て調整する仮の値。 */
export const DEFAULT_STYLE = Object.freeze({
  boardFacing: 'camera', // 'camera'＝カメラの正面を向く（ドットがつぶれない）／'upright'＝地面に垂直
  edge: { dx: 1, dy: 1, dz: 0.02, color: [0.42, 0.37, 0.29] }, // 紙の厚み（ドット単位のずれ）
  shadow: { dx: 4, dy: 3, dz: 0.12, alpha: 0.3, color: [0.20, 0.19, 0.33] }, // 板の後ろに落ちる影（ドット単位のずれ）
  air: { backdrop: 0.35, back: 0.12, mid: 0, actors: 0, front: 0, color: [0.11, 0.11, 0.18] }, // 奥の帯ほど淡く暗く
  ground: { length: 0.45, skew: 0.35, alpha: 0.26 }, // 板の形を地面に寝かせた影（奥へ length 倍、右へ skew 倍に倒す）
  footShadow: 0.32, // キャラの足もとの丸い影の濃さ
  clear: [0.106, 0.102, 0.133],
  // 本（DEV-BOOK-001）：床をページに見立て、まわりに表紙（革）とページの束のふちを敷く。色は仮。keepCover＝演出のあとも表紙を残す
  book: { margin: 0.6, edge: 0.18, depth: 0.06, cover: [0.23, 0.14, 0.09], pageEdge: [0.85, 0.78, 0.64], keepCover: true },
  // 六角形の光の玉（オーブ）：作者の希望。うすい青紫。count 0 で出さない
  orbs: { count: 18, alpha: 0.7, color: [0.86, 0.88, 1.0] },
});

const BANDS = ['backdrop', 'back', 'mid', 'actors', 'front'];

/**
 * 設定の確かめ（足りない値は既定で補う。不正なら理由を返す）。
 * @param {any} raw
 * @returns {{ style: typeof DEFAULT_STYLE, errors: string[] }}
 */
export function readStyle(raw) {
  const errors = [];
  const s = structuredClone(DEFAULT_STYLE);
  if (raw && typeof raw === 'object') {
    if (raw.boardFacing !== undefined) {
      if (raw.boardFacing === 'camera' || raw.boardFacing === 'upright') s.boardFacing = raw.boardFacing; else errors.push(`stage-style: boardFacing ${raw.boardFacing} が不正`);
    }
    for (const k of /** @type {const} */ (['edge', 'shadow', 'air', 'ground', 'book', 'orbs'])) if (raw[k] && typeof raw[k] === 'object') Object.assign(s[k], raw[k]);
    if (typeof raw.footShadow === 'number') s.footShadow = raw.footShadow;
    if (Array.isArray(raw.clear) && raw.clear.length === 3) s.clear = raw.clear;
  }
  for (const k of ['dx', 'dy', 'dz']) {
    // @ts-ignore
    if (!(typeof s.edge[k] === 'number' && s.edge[k] >= 0)) errors.push(`stage-style: edge.${k} は0以上の数`);
    // @ts-ignore
    if (!(typeof s.shadow[k] === 'number' && s.shadow[k] >= 0)) errors.push(`stage-style: shadow.${k} は0以上の数`);
  }
  if (!(s.shadow.alpha >= 0 && s.shadow.alpha <= 1)) errors.push('stage-style: shadow.alpha は0〜1');
  if (!(s.ground.alpha >= 0 && s.ground.alpha <= 1 && s.ground.length >= 0 && s.ground.length <= 2 && Math.abs(s.ground.skew) <= 2)) errors.push('stage-style: ground は alpha 0〜1・length 0〜2・skew -2〜2');
  if (!(Number.isInteger(s.orbs.count) && s.orbs.count >= 0 && s.orbs.count <= 64 && s.orbs.alpha >= 0 && s.orbs.alpha <= 1)) errors.push('stage-style: orbs は count 0〜64 の整数・alpha 0〜1');
  if (!(s.book.margin >= 0 && s.book.margin <= 3 && s.book.edge >= 0 && s.book.edge <= s.book.margin && s.book.depth > 0 && s.book.depth <= 0.5)) errors.push('stage-style: book は margin 0〜3・edge 0〜margin・depth 0〜0.5');
  for (const b of BANDS) if (!(s.air[b] >= 0 && s.air[b] <= 1)) errors.push(`stage-style: air.${b} は0〜1`);
  return { style: s, errors };
}

/**
 * 帯ごとの板の置き場所。footprint（x,y,w,h）はマップの衝突と同じマス。
 * - backdrop：footprint の奥の端に立てる
 * - back：footprint のいちばん手前の行の奥の線に立てる（扉の行は板の手前に残る）
 * - mid / front：footprint のいちばん手前の行の中央に立てる（キャラと同じ決め方）
 * zOffset（0〜0.3）は同じ帯の中の紙の重なり（大きいほど手前）。
 * 板の高さは standH（あれば）か h。画像のある板は、画像の大きさ（ドット）÷ tileSize。
 * @param {any} it stage の項目
 * @param {string} band
 * @param {number} tileSize
 * @param {[number, number] | null} imgPx 画像のドット数（仮の板は null）
 * @returns {{ x:number, z:number, w:number, h:number }}
 */
export function placeBoard(it, band, tileSize, imgPx) {
  const zo = it.zOffset || 0;
  const foot = band === 'backdrop' ? it.y : band === 'back' ? it.y + it.h - 1 : it.y + it.h - 0.5;
  if (imgPx) {
    const w = it.repeat === 'x' ? it.w : imgPx[0] / tileSize;
    const h = imgPx[1] / tileSize;
    return { x: it.x + (it.w - w) / 2, z: foot + zo, w, h };
  }
  return { x: it.x, z: foot + zo, w: it.w, h: it.standH ?? it.h };
}

/**
 * キャラの板。足もとをマスの中央に合わせ、絵の anchor（足もとのドット）を地面に置く。
 * @param {{ x:number, y:number }} a 補間した位置（マス）
 * @param {{ frame:number[], anchor:number[] }} entry
 * @param {number} tileSize
 */
export function placeActor(a, entry, tileSize) {
  const [fw, fh] = entry.frame, [ax, ay] = entry.anchor;
  return { x: a.x + 0.5 - ax / tileSize, z: a.y + 0.5, w: fw / tileSize, h: fh / tileSize, below: (fh - ay) / tileSize };
}

/**
 * 板の向き（横軸と縦軸）。横軸は常に +x（左右反転しない）。
 * @param {'camera'|'upright'} facing
 * @param {number} pitchDeg 見下ろす角度（0＝水平、90＝真上）
 */
export function boardAxes(facing, pitchDeg) {
  const lean = facing === 'camera' ? (90 - pitchDeg) * Math.PI / 180 : 0;
  return { ax: [1, 0, 0], ay: [0, Math.cos(lean), -Math.sin(lean)], lean };
}

/** 板の面に垂直で、カメラ側を向く単位ベクトル（ふちと影はこの逆へ下げる） @param {number[]} ay */
export const boardNormal = (ay) => [0, -ay[2], ay[1]];

/**
 * シートの1コマの UV（画像の左上が原点）。u0 < u1 を必ず守る（左右反転しない）。
 * @param {{ sx:number, sy:number, sw:number, sh:number }} f
 * @param {number} imgW @param {number} imgH
 */
export function frameUV(f, imgW, imgH) {
  const u0 = f.sx / imgW, u1 = (f.sx + f.sw) / imgW;
  if (!(u1 > u0)) throw Error('UV の左右が逆（反転は使わない）');
  return [u0, f.sy / imgH, u1, (f.sy + f.sh) / imgH];
}

/**
 * カメラ。注視点（地面の上）から、見下ろす角度の方向へ距離 D 離す。
 * D は「注視点の地面で、画面の縦の 1 ドット＝内部解像度の 1 画素」になるよう決める（板が等倍で見える）。
 * @param {{ x:number, y:number }} look 注視点（マス）
 * @param {number} pitchDeg @param {number} fovDeg
 * @param {number} innerH 内部解像度の高さ（画素） @param {number} tileSize
 */
export function cameraEye(look, pitchDeg, fovDeg, innerH, tileSize) {
  const p = pitchDeg * Math.PI / 180;
  const D = innerH / (2 * tileSize * Math.tan(fovDeg * Math.PI / 360));
  return { eye: [look.x, D * Math.sin(p), look.y + D * Math.cos(p)], target: [look.x, 0, look.y], D };
}

/**
 * 開始演出の「本全体を見る」カメラ（DEV-BOOK-001）。舞台の中央を、ふだんより高い角度から、表紙まで入る距離で見る。
 * @param {{ width:number, height:number }} map @param {number} margin 表紙の張り出し（マス）
 * @param {number} fovDeg @param {number} aspect 横÷縦 @param {number} [pitchDeg]
 */
export function bookWideEye(map, margin, fovDeg, aspect, pitchDeg = 38) {
  const p = pitchDeg * Math.PI / 180, fovy = fovDeg * Math.PI / 180;
  const target = [map.width / 2, 0, map.height / 2];
  const corners = [[-margin, -margin], [map.width + margin, -margin], [-margin, map.height + margin], [map.width + margin, map.height + margin]];
  // 表紙の四隅と、立った板の頭（高さ3マス）が画面の内側（0.92）に入るまで、少しずつ遠ざける
  const pts = corners.flatMap(([x, z]) => [[x, 0, z], [x, 3, z]]);
  let D = Math.max(map.width, map.height) * 0.5, eye = target;
  for (let i = 0; i < 80; i++, D *= 1.05) {
    eye = [target[0], D * Math.sin(p), target[2] + D * Math.cos(p)];
    const m = mul(perspective(fovy, aspect, 0.5, D * 4 + 40), lookAt(eye, target, [0, 1, 0]));
    if (pts.every((q) => { const [x, y, z] = project(m, q); return z < 1 && Math.abs(x) <= 0.92 && Math.abs(y) <= 0.92; })) break;
  }
  return { eye, target, D };
}

/**
 * 本の片側（床の半分）の置き方。背（x=幅/2）を軸に、coverRad だけ起き上がる（0＝平ら）。
 * side -1＝左ページ、+1＝右ページ。返す o・ax は quad（o + ax*横 + ay*縦）にそのまま使える。ax は常に +x 向き（左右反転しない）。
 * @param {-1|1} side @param {number} width 舞台の幅 @param {number} coverRad @param {number} [extra] 外側への張り出し
 */
export function bookHalf(side, width, coverRad, extra = 0) {
  const c = Math.cos(coverRad), sn = Math.sin(coverRad), spine = width / 2, len = width / 2 + extra;
  if (side > 0) return { o: [spine, 0, 0], ax: [c, sn, 0], n: [-sn, c, 0], len };
  return { o: [spine - len * c, len * sn, 0], ax: [c, -sn, 0], n: [sn, c, 0], len };
}

/** 板の縦軸を、寝ている（k=0：奥へ倒れる）から立つ（k=1）まで回す。k>1 は少し手前へ行きすぎる @param {number} lean ふだんの傾き（ラジアン） @param {number} k */
export function risingAy(lean, k) {
  const phi = lean + (1 - k) * (Math.PI / 2 - lean);
  return [0, Math.cos(phi), -Math.sin(phi)];
}

/** 画面に入る地面のマス数のめやす（カメラの追従と端の止まり方に使う） */
export function viewTiles(innerW, innerH, tileSize, pitchDeg) {
  return { w: innerW / tileSize, h: innerH / tileSize / Math.max(0.3, Math.sin(pitchDeg * Math.PI / 180)) };
}

/** 位置をドットの格子に丸める（スクロールでドットが揺れない） */
export const snap = (/** @type {number} */ v, /** @type {number} */ tileSize) => Math.round(v * tileSize) / tileSize;

// ---- 行列（列優先、WebGL と同じ並び） ----
/** @param {number} fovy ラジアン @param {number} aspect @param {number} near @param {number} far */
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
/** @param {number[]} e @param {number[]} c @param {number[]} up */
export function lookAt(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
/** a×b（列優先） @param {number[]} a @param {number[]} b */
export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** 点を画面の正規化座標へ（テスト用） @param {number[]} m @param {number[]} p */
export function project(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x / w, y / w, z / w];
}
