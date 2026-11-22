// @ts-check
// 固定時間刻み（1/60秒）の更新と、描画の呼び出し。

export const FIXED_MS = 1000 / 60;

/**
 * 経過時間を固定刻みに分けて update を呼ぶ（タブ復帰などで大きく飛んだら最大 maxSteps 回で打ち切る）。
 * @param {{ acc: number }} clock
 * @param {number} elapsed
 * @param {(dt:number)=>void} update
 * @param {number} [maxSteps]
 */
export function stepFixed(clock, elapsed, update, maxSteps = 10) {
  clock.acc += Math.max(0, elapsed);
  let n = 0;
  while (clock.acc >= FIXED_MS && n < maxSteps) { update(FIXED_MS); clock.acc -= FIXED_MS; n++; }
  if (n === maxSteps) clock.acc = 0;
  return n;
}

/**
 * ブラウザの requestAnimationFrame で回す。
 * @param {(dt:number)=>void} update
 * @param {()=>void} draw
 */
export function startLoop(update, draw) {
  const clock = { acc: 0 };
  let last = performance.now();
  let running = true;
  const frame = (/** @type {number} */ now) => {
    if (!running) return;
    stepFixed(clock, now - last, update);
    last = now;
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return { stop: () => { running = false; } };
}
