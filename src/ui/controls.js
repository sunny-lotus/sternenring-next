// @ts-check
// キーボードとタッチの十字ボタンを、入力の意図（InputState）へつなぐ。

const KEY_DIR = /** @type {Record<string,string>} */ ({
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
});

/** @param {import('../core/input.js').InputState} input */
export function bindKeyboard(input) {
  window.addEventListener('keydown', (e) => {
    const dir = KEY_DIR[e.code];
    if (!dir) return;
    e.preventDefault();
    if (!e.repeat) input.press(dir);
  });
  window.addEventListener('keyup', (e) => { const dir = KEY_DIR[e.code]; if (dir) input.release(dir); });
  // 別ウィンドウへ移ったら押しっぱなしを解除する（旧 input.js の考え方）
  window.addEventListener('blur', () => { input.releaseAll(); input.clearQueue(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { input.releaseAll(); input.clearQueue(); } });
}

/**
 * 十字ボタン（data-dir を持つボタン）。指を置いている間は押しっぱなし。
 * @param {HTMLElement} pad
 * @param {import('../core/input.js').InputState} input
 */
export function bindTouchpad(pad, input) {
  /** @type {Map<number, string>} */
  const active = new Map();
  const dirAt = (/** @type {number} */ x, /** @type {number} */ y) => {
    const el = /** @type {HTMLElement|null} */ (document.elementFromPoint(x, y)?.closest('[data-dir]') ?? null);
    return el && pad.contains(el) ? el.dataset.dir ?? null : null;
  };
  const set = (/** @type {number} */ id, /** @type {string|null} */ dir) => {
    const prev = active.get(id) ?? null;
    if (prev === dir) return;
    if (prev) { input.release(prev); pad.querySelector(`[data-dir="${prev}"]`)?.classList.remove('on'); }
    if (dir) { active.set(id, dir); input.press(dir); pad.querySelector(`[data-dir="${dir}"]`)?.classList.add('on'); }
    else active.delete(id);
  };
  pad.addEventListener('pointerdown', (e) => {
    const dir = dirAt(e.clientX, e.clientY);
    if (!dir) return;
    e.preventDefault();
    set(e.pointerId, dir);
    try { pad.setPointerCapture(e.pointerId); } catch { /* 捕まえられなくても歩ける（pointerup/cancel で離す） */ }
  });
  // 指をすべらせて別の方向へ移れる
  pad.addEventListener('pointermove', (e) => { if (active.has(e.pointerId)) set(e.pointerId, dirAt(e.clientX, e.clientY) ?? active.get(e.pointerId) ?? null); });
  const end = (/** @type {PointerEvent} */ e) => set(e.pointerId, null);
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  pad.addEventListener('lostpointercapture', end);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
}
