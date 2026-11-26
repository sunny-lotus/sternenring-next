// @ts-check
// キーボードとタッチの十字ボタンを、入力の意図（InputState）へつなぐ。

const KEY_DIR = /** @type {Record<string,string>} */ ({
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
});

/** @param {import('../core/input.js').InputState} input */
export function bindKeyboard(input) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') { input.run = true; return; } // 走る（押している間）
    if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') && !e.repeat) { e.preventDefault(); input.pressAction(); return; } // 調べる
    const dir = KEY_DIR[e.code];
    if (!dir) return;
    e.preventDefault();
    if (!e.repeat) input.press(dir);
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') input.run = false; const dir = KEY_DIR[e.code]; if (dir) input.release(dir); });
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

/**
 * 浮くスティック：画面（舞台）の左半分のどこをさわっても、そこがまん中になって歩ける（スマホ・タッチだけ）。
 * 指をずらした向き（いちばん大きく動いた軸）へ歩き、指を離すと止まる。十字ボタンはそのまま使える。
 * @param {HTMLElement[]} areas さわれる所（舞台のキャンバス）
 * @param {HTMLElement} pad 十字ボタン（向きの光り方をそろえる）
 * @param {HTMLElement} ring 浮くスティックの見た目
 * @param {import('../core/input.js').InputState} input
 * @param {() => boolean} [blocked] 会話中などで使わないとき true
 */
export function bindFloatStick(areas, pad, ring, input, blocked = () => false) {
  const DEAD = 14, MAX = 44; // 動かしはじめの遊び・つまみの動く半径（px）
  /** @type {{id:number, x:number, y:number, dir:string|null}|null} */
  let cur = null;
  const knob = /** @type {HTMLElement|null} */ (ring.firstElementChild);
  const light = (/** @type {string|null} */ d, /** @type {boolean} */ on) => { if (d) pad.querySelector(`[data-dir="${d}"]`)?.classList.toggle('on', on); };
  const setDir = (/** @type {string|null} */ dir) => {
    if (!cur || cur.dir === dir) return;
    if (cur.dir) { input.release(cur.dir); light(cur.dir, false); }
    cur.dir = dir; if (dir) { input.press(dir); light(dir, true); }
  };
  const down = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType === 'mouse' || cur || blocked() || e.clientX > window.innerWidth / 2) return;
    e.preventDefault();
    cur = { id: e.pointerId, x: e.clientX, y: e.clientY, dir: null };
    ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.hidden = false;
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
    try { /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId); } catch { /* 捕まえられなくても pointerup で離す */ }
  };
  const move = (/** @type {PointerEvent} */ e) => {
    if (!cur || e.pointerId !== cur.id) return;
    const dx = e.clientX - cur.x, dy = e.clientY - cur.y, len = Math.hypot(dx, dy);
    const k = len > MAX ? MAX / len : 1;
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    setDir(len < DEAD ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const up = (/** @type {PointerEvent} */ e) => { if (!cur || e.pointerId !== cur.id) return; setDir(null); cur = null; ring.hidden = true; };
  for (const a of areas) {
    a.addEventListener('pointerdown', down); a.addEventListener('pointermove', move);
    a.addEventListener('pointerup', up); a.addEventListener('pointercancel', up); a.addEventListener('lostpointercapture', up);
  }
  // 会話が始まったら止める（押しっぱなしにしない）
  return () => { if (cur) { setDir(null); cur = null; ring.hidden = true; } };
}
