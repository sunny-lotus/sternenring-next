// @ts-check
// 追いかけるカメラ。遊びの範囲（deadzone）を出たら追い、マップの端で止まる。小さなマップは中央に固定。
// 単位はマス。描画側で「ドットの格子」に丸める。

/**
 * @param {{ x:number, y:number }} cam 現在のカメラ中心（マス）。書きかえる
 * @param {{ x:number, y:number }} target 追う点（マス・キャラの中心）
 * @param {{ width:number, height:number }} map
 * @param {{ w:number, h:number }} view 画面に入るマス数
 * @param {[number, number]} [deadzone]
 */
export function followCamera(cam, target, map, view, deadzone = [0, 0]) {
  const [dzx, dzy] = deadzone;
  if (target.x - cam.x > dzx) cam.x = target.x - dzx;
  if (cam.x - target.x > dzx) cam.x = target.x + dzx;
  if (target.y - cam.y > dzy) cam.y = target.y - dzy;
  if (cam.y - target.y > dzy) cam.y = target.y + dzy;
  cam.x = clampAxis(cam.x, map.width, view.w);
  cam.y = clampAxis(cam.y, map.height, view.h);
  return cam;
}

/** @param {number} c @param {number} size @param {number} viewSize */
function clampAxis(c, size, viewSize) {
  if (viewSize >= size) return size / 2;
  return Math.min(size - viewSize / 2, Math.max(viewSize / 2, c));
}
