// @ts-check
// キャラの絵の切り出し（描画に依存しない計算だけ）。
// 左右は台帳の directions の別の行を使う。反転（負の拡大）では作らない。

/**
 * @param {{ frame:number[], anchor:number[], directions:string[], frames:number, frameMs:number, noFlip:boolean }} entry
 * @param {string} dir
 * @param {number} animMs
 */
export function sheetFrame(entry, dir, animMs) {
  if (entry.noFlip !== true) throw Error('noFlip:true でない絵は描かない');
  const row = entry.directions.indexOf(dir);
  if (row < 0) throw Error(`向き ${dir} の行が無い`);
  const col = Math.floor(Math.max(0, animMs) / entry.frameMs) % entry.frames;
  const [fw, fh] = entry.frame;
  return { sx: col * fw, sy: row * fh, sw: fw, sh: fh, ax: entry.anchor[0], ay: entry.anchor[1], scaleX: 1 };
}

/** 整数倍の拡大率（ドットをにじませない）。画面に最低 minW×minH マスが入る最大の整数。 */
export function integerScale(pxW, pxH, tile, minW = 9, minH = 11) {
  return Math.max(1, Math.floor(Math.min(pxW / (minW * tile), pxH / (minH * tile))));
}
