// @ts-check
// ヴォルトの足あと追従と、転送時の並び直し（設計書 §5）。
import { DIR_VEC } from './map.js';

/**
 * 転送で着いたとき、仲間を置くマス：向きの反対側 → 右手/左手の横 → 同じマス（重ね）
 * （DEV-DESIGN-001 examples/check-examples.mjs の placeFollower と同じ順）
 * @param {{ passable:(x:number,y:number)=>boolean, exitAt:(x:number,y:number)=>any }} q
 * @param {{x:number,y:number,dir:string}} arrive
 * @param {{x:number,y:number}[]} [taken] もう人が立っているマス（5人になって同じマスに重ならないように。2026-11-24）
 */
export function placeFollower(q, arrive, taken = []) {
  const [dx, dy] = DIR_VEC[arrive.dir];
  const cands = [[-dx, -dy], [dy, dx], [-dy, -dx]];
  for (const [cx, cy] of cands) {
    const x = arrive.x + cx, y = arrive.y + cy;
    if (q.passable(x, y) && !q.exitAt(x, y) && !taken.some((t) => t.x === x && t.y === y)) return { x, y };
  }
  return { x: arrive.x, y: arrive.y };
}

/**
 * 足あと列：プレイヤーが1マス進むたびに、もとの位置を先頭に積む。仲間 i は i 番目へ向かう。
 * @param {{x:number,y:number}[]} trail
 * @param {{x:number,y:number}} from
 * @param {number} followers
 */
export function pushTrail(trail, from, followers) {
  trail.unshift({ x: from.x, y: from.y });
  trail.length = Math.min(trail.length, followers);
  return trail;
}

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
export function dirBetween(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
}
