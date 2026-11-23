// @ts-check
// 紙の舞台のカメラ角度を、作者とClaudeが画面を見ながら選ぶための調整パネル。
// 2026-11-22 作者「カメラアングルの調整あると嬉しいけど、ボタンで開けるようにしておいて」：右上の「カメラ」ボタンで開け閉めする（?cam=1 なら開いた状態で始まる）。
// 2026-11-22 作者チャットで作った仮パネルを、DEV-PAPER-001 rev3 で技術担当が整えた（作者の決定：このパネルは残す）。
// - 見下ろす角度（pitch：0＝真横、90＝真上）と画角（fov）をスライダーで変える。変えるまではマップの値のまま。
// - 「マップの値に戻す」で上書きを消す。決まった値は data/maps/*.json の stage.camera に書く（パネルは保存しない）。
// - URL で始めの値を渡せる：?cam=1&pitch=15&fov=20
// - 上書きは window.SR_CAM（paper-stage.js が読む）。ブラウザの保存領域は使わない。

export const CAM_LIMITS = Object.freeze({ pitch: [3, 80], fov: [10, 110], dist: [1.5, 30] }); // 2026-11-23 作者がブックヌックで画角90・距離3（いっぱい）まで試したので、もっと先まで試せるように広げた
export const DIST_DEFAULT = 9; // three-stage.js のカメラの距離の既定（マス）。2026-11-22 作者の希望で距離もパネルで変えられるようにした
export const CAM_DEFAULTS = Object.freeze({ pitchDeg: 50, fovDeg: 24 }); // paper-stage.js の既定と同じ

/** @param {unknown} v @param {number[]} range */
function clampOrUndef(v, range) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(range[1], Math.max(range[0], Math.round(n)));
}

/**
 * URL の pitch・fov を上書きの始めの値にする（無い・数でないものは無視、範囲外は範囲に収める）。
 * @param {URLSearchParams} params
 * @returns {{pitchDeg?:number, fovDeg?:number}}
 */
export function overrideFromParams(params) {
  /** @type {{pitchDeg?:number, fovDeg?:number}} */
  const o = {};
  const p = clampOrUndef(params.get('pitch'), CAM_LIMITS.pitch), f = clampOrUndef(params.get('fov'), CAM_LIMITS.fov), dd = clampOrUndef(params.get('dist'), CAM_LIMITS.dist);
  if (p !== undefined) o.pitchDeg = p;
  if (f !== undefined) o.fovDeg = f;
  if (dd !== undefined) o.distance = dd;
  return o;
}

/**
 * いま画面に使われる値（上書き → マップ → 既定の順）。paper-stage.js と同じ決め方。
 * @param {{pitchDeg?:number, fovDeg?:number}|undefined} override
 * @param {{pitchDeg?:number, fovDeg?:number}|undefined} mapCam
 */
export function effectiveCam(override, mapCam) {
  const o = override || {}, m = mapCam || {};
  return {
    pitchDeg: o.pitchDeg ?? m.pitchDeg ?? CAM_DEFAULTS.pitchDeg,
    fovDeg: o.fovDeg ?? m.fovDeg ?? CAM_DEFAULTS.fovDeg,
    distance: o.distance ?? m.distance ?? DIST_DEFAULT,
    overridden: o.pitchDeg !== undefined || o.fovDeg !== undefined || o.distance !== undefined,
  };
}

/**
 * パネルを作る（はじめは閉じている。?cam=1 なら開いている）。
 * @param {URLSearchParams} params
 * @param {() => ({pitchDeg?:number, fovDeg?:number}|undefined)} getMapCam いまのマップの stage.camera
 * @returns {{ sync: () => void, setOpen: (open:boolean) => void, isOpen: () => boolean }}
 */
export function createCamPanel(params, getMapCam) {
  const w = /** @type {any} */ (window);
  w.SR_CAM = overrideFromParams(params);
  const box = document.createElement('div');
  box.id = 'cam-panel';
  // 右上（表示切替ボタンの下）。左下の十字ボタンと重ならない位置
  box.style.cssText = 'position:fixed;right:max(8px,env(safe-area-inset-right));top:calc(max(10px,env(safe-area-inset-top)) + 62px);z-index:50;background:rgba(10,12,30,.85);color:#f6e2a8;padding:8px 10px;border:1px solid #c9a050;border-radius:8px;font:13px sans-serif;display:grid;grid-template-columns:auto minmax(90px,140px) 3.2em;gap:6px;align-items:center;touch-action:auto';
  box.innerHTML = '<span>見下ろす角度</span><input id="cam-p" type="range" step="1"><b id="cam-pv"></b>'
    + '<span>画角</span><input id="cam-f" type="range" step="1"><b id="cam-fv"></b>'
    + '<span>距離</span><input id="cam-d" type="range" step="1"><b id="cam-dv"></b>'
    + '<small id="cam-note" style="grid-column:1/3;opacity:.8"></small><button type="button" id="cam-reset" style="font:12px sans-serif">戻す</button>';
  box.hidden = params.get('cam') !== '1';
  document.body.appendChild(box);
  const p = /** @type {HTMLInputElement} */ (box.querySelector('#cam-p')), f = /** @type {HTMLInputElement} */ (box.querySelector('#cam-f'));
  p.min = String(CAM_LIMITS.pitch[0]); p.max = String(CAM_LIMITS.pitch[1]);
  f.min = String(CAM_LIMITS.fov[0]); f.max = String(CAM_LIMITS.fov[1]);
  const dd = /** @type {HTMLInputElement} */ (box.querySelector('#cam-d')); dd.min = String(CAM_LIMITS.dist[0]); dd.max = String(CAM_LIMITS.dist[1]);
  const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (box.querySelector(s));
  const sync = () => {
    const mc = getMapCam() || {}, e = effectiveCam(w.SR_CAM, mc);
    p.value = String(e.pitchDeg); f.value = String(e.fovDeg); dd.value = String(e.distance); q('#cam-dv').textContent = String(e.distance);
    q('#cam-pv').textContent = e.pitchDeg + '°'; q('#cam-fv').textContent = e.fovDeg + '°';
    q('#cam-note').textContent = e.overridden ? `試し中（マップ：${mc.pitchDeg ?? '-'}°／${mc.fovDeg ?? '-'}°）` : 'マップの値のまま';
  };
  p.addEventListener('input', () => { w.SR_CAM.pitchDeg = +p.value; sync(); });
  f.addEventListener('input', () => { w.SR_CAM.fovDeg = +f.value; sync(); });
  dd.addEventListener('input', () => { w.SR_CAM.distance = +dd.value; sync(); });
  q('#cam-reset').addEventListener('click', () => { w.SR_CAM = {}; sync(); });
  // スライダーを矢印キーで動かすとき、キャラは歩かせない。指で触ってもキャラの十字ボタンにはならない
  for (const el of [p, f, dd]) el.addEventListener('keydown', (e) => e.stopPropagation());
  sync();
  return { sync, setOpen: (open) => { box.hidden = !open; if (open) sync(); }, isOpen: () => !box.hidden };
}
