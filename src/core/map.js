// @ts-check
// マップJSONの検証と、通行・出入口の問い合わせ。描画に依存しない（Node のテストでそのまま動く）。

export const DIRS = /** @type {const} */ (['down', 'left', 'right', 'up']);
/** @type {Record<string, [number, number]>} */
export const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const BANDS = ['backdrop', 'back', 'mid', 'actors', 'front'];

/**
 * 1枚のマップを検証する。問題を日本語の文の配列で返す（空なら合格）。
 * @param {any} map
 * @param {{ collision: any, ledger: any, regions?: Record<string, Record<string, number[]>> }} ctx
 */
export function validateMap(map, ctx) {
  const errs = [];
  const err = (/** @type {string} */ m) => errs.push(`${map?.id ?? '(id無し)'}: ${m}`);
  if (!map || map.format !== 'sternenring-next-map' || map.version !== 1) { err('format/version が違う'); return errs; }
  if (typeof map.id !== 'string' || !/^[a-z0-9-]+$/.test(map.id)) err('id が不正');
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1) { err('width/height が不正'); return errs; }
  if (!Array.isArray(map.collision) || map.collision.length !== map.height) err(`行数=height でない (${map.collision?.length}/${map.height})`);
  (map.collision || []).forEach((/** @type {string} */ row, /** @type {number} */ y) => {
    if (typeof row !== 'string' || [...row].length !== map.width) err(`行の長さ=width でない (row ${y})`);
  });
  if (map.heights !== undefined) { // マスの高さ（任意）。行数=height・行の長さ=width・0〜9の数字
    if (!Array.isArray(map.heights) || map.heights.length !== map.height) err(`heights の行数=height でない`);
    else map.heights.forEach((/** @type {string} */ row, /** @type {number} */ y) => { if (typeof row !== 'string' || [...row].length !== map.width || !/^[0-9]+$/.test(row)) err(`heights の行 ${y} が不正（width 個の数字）`); });
  }
  const legend = map.legend || {};
  const unknown = [...new Set((map.collision || []).join(''))].filter((c) => !(c in legend));
  if (unknown.length) err(`凡例に無い文字 ${unknown.join('')}`);
  for (const [ch, kind] of Object.entries(legend)) if (!(kind in ctx.collision.kinds)) err(`凡例 ${ch} の種類 ${kind} が衝突表に無い`);
  if (errs.length) return errs; // 形が壊れていると以下の判定が意味を持たない

  const q = mapQuery(map, ctx.collision);
  for (const [name, s] of Object.entries(map.spawns || {})) {
    if (!q.passable(s.x, s.y) || q.exitAt(s.x, s.y)) err(`spawn ${name} が通れない/出入口の上`);
    if (!DIRS.includes(s.dir)) err(`spawn ${name} の向きが不正`);
  }
  if (!map.spawns || !map.spawns.default) err('spawns.default が無い');
  const exitIds = new Set();
  for (const e of map.exits || []) {
    if (exitIds.has(e.id)) err(`exit ${e.id} が重複`);
    exitIds.add(e.id);
    if (e.span !== undefined && !(Number.isInteger(e.span) && e.span >= 1 && e.span <= 9)) err(`exit ${e.id} の span は1〜9`);
    for (const t of exitTiles(e)) if (q.kindAt(t.x, t.y) !== 'door') err(`exit ${e.id} が扉(door)の上に無い`);
    if (!e.to || typeof e.to.map !== 'string' || typeof e.to.exit !== 'string' || !e.to.arrive) err(`exit ${e.id} の to (map/exit/arrive) が欠けている`);
    else if (!DIRS.includes(e.to.arrive.dir)) err(`exit ${e.id} の到着の向きが不正`);
  }
  // 扉(door)のマスには必ず出入口がある（踏んでも何も起きない扉を作らない）
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    if (q.kindAt(x, y) === 'door' && !q.exitAt(x, y)) err(`扉(${x},${y})に exit が無い`);
  }
  for (const ev of map.events || []) {
    if (q.kindAt(ev.x, ev.y) === null) err(`event ${ev.id} がマップ外`);
    if (!Array.isArray(ev.pages) || !ev.pages.length || ev.pages.at(-1).when) err(`event ${ev.id} の最後のページが無条件でない`);
  }
  const ledgerIds = new Set((ctx.ledger?.assets || []).map((/** @type {any} */ a) => a.id));
  const tsOk = (/** @type {string} */ id) => id.startsWith('placeholder:') || ledgerIds.has(id);
  const g = map.ground || {};
  if (!g.tileset || !tsOk(g.tileset)) err(`ground.tileset ${g.tileset} が台帳に無い`);
  const regionsOf = (/** @type {string} */ id) => ctx.regions?.[id];
  for (const key of ['fill', 'wall']) {
    if (g[key] != null && regionsOf(g.tileset) && !(g[key] in regionsOf(g.tileset))) err(`ground.${key} ${g[key]} が素材の領域に無い`);
  }
  for (const layer of map.stage?.layers || []) {
    if (!BANDS.includes(layer.band)) err(`stage の帯 ${layer.band} が不正`);
    for (const it of layer.items || []) {
      if (!tsOk(it.asset)) err(`stage ${it.asset} が台帳に無い`);
      if (it.region && regionsOf(it.asset) && !(it.region in regionsOf(it.asset))) err(`stage ${it.asset}#${it.region} の領域が無い`);
      if (!(it.x >= 0 && it.y >= 0 && it.w > 0 && it.h > 0 && it.x + it.w <= map.width && it.y + it.h <= map.height)) err(`stage ${it.asset}@${it.x},${it.y} がマップ外`);
      const maxH = layer.band === 'backdrop' ? 40 : 12; // 奥の背景の板は高くてよい（2026-11-22 作者「背景をもっと高く」）
      if (it.standH !== undefined && !(typeof it.standH === 'number' && it.standH > 0 && it.standH <= maxH)) err(`stage ${it.asset} の standH（立てた板の高さ）は0より大きく${maxH}以下`);
      if (it.zOffset !== undefined && !(typeof it.zOffset === 'number' && it.zOffset >= 0 && it.zOffset <= 0.3)) err(`stage ${it.asset} の zOffset は0〜0.3`);
    }
  }
  // 隠し通路の範囲（この中にいるあいだだけ、手前の板の「のぞき穴」を小さくする。2026-11-22 作者）
  const hp = map.stage?.hiddenPaths;
  if (hp !== undefined) {
    if (!Array.isArray(hp)) err('stage.hiddenPaths は配列');
    else for (const p of hp) if (!(p && p.x >= 0 && p.y >= 0 && p.w > 0 && p.h > 0 && p.x + p.w <= map.width && p.y + p.h <= map.height)) err(`stage.hiddenPaths ${JSON.stringify(p)} がマップ外`);
  }
  // 仮の床（2026-11-22 作者「床を仮に作ってほしい。石畳や森の土」）
  if (map.stage?.floor !== undefined && !['cobble', 'soil'].includes(map.stage.floor)) err(`stage.floor ${map.stage.floor} は cobble か soil`);
  const pv = map.stage?.paved;
  if (pv !== undefined) { if (!Array.isArray(pv)) err('stage.paved は配列'); else for (const p of pv) if (!(p && p.x >= 0 && p.y >= 0 && p.w > 0 && p.h > 0 && p.x + p.w <= map.width && p.y + p.h <= map.height)) err(`stage.paved ${JSON.stringify(p)} がマップ外`); }
  // 見えている敵（2026-11-22 作者「森に敵が見えていて、ぶつかると戦闘」）：id は重ならず、通れるマスの上、battle（バトル試作の敵の組）がある
  const encs = map.encounters;
  if (encs !== undefined) {
    if (!Array.isArray(encs)) err('encounters は配列');
    else { const ids = new Set(); for (const e of encs) {
      if (!e || typeof e.id !== 'string' || ids.has(e.id)) err(`encounters の id ${e && e.id} が無いか重なっている`); else ids.add(e.id);
      if (!e || typeof e.battle !== 'string' || !e.battle) err(`encounters ${e && e.id} の battle が無い`);
      if (e && e.symbol !== undefined && !(Array.isArray(e.symbol) && e.symbol.every((/** @type {any} */ u) => typeof u === 'string' && u))) err(`encounters ${e.id} の symbol は絵のパスの配列`);
      const row = e && map.collision?.[e.y]; const ch = row ? [...row][e.x] : undefined;
      if (!e || ch === undefined || map.legend?.[ch] !== 'floor') err(`encounters ${e && e.id} は通れる床のマスに置く`);
    } }
  }
  // 街道とランダムの戦闘（2026-11-22 作者「街道の上はシンボルエンカウントのみ、街道以外ではランダム」）
  const roads = map.roads;
  if (roads !== undefined) { if (!Array.isArray(roads)) err('roads は配列'); else for (const r of roads) if (!(r && r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= map.width && r.y + r.h <= map.height)) err(`roads ${JSON.stringify(r)} がマップ外`); }
  const re = map.randomEncounters;
  if (re !== undefined && !(re && Array.isArray(re.battles) && re.battles.length && re.battles.every((/** @type {any} */ x) => typeof x === 'string' && x) && (re.rate === undefined || (re.rate >= 0 && re.rate <= 1)) && (re.minSteps === undefined || re.minSteps >= 0)))
    err('randomEncounters は battles（敵の組の名前1つ以上）・rate 0〜1・minSteps 0以上');
  // 光の玉（場所ごと。2026-11-22 作者「オーブは場所によって変えるようにしたい」）：数0〜40、明るさ0〜1、色は0〜1の3つ、大きさ0より大きく3以下
  const ob = map.stage?.orbs;
  if (ob !== undefined) {
    const num = (/** @type {any} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => v === undefined || (typeof v === 'number' && v >= lo && v <= hi);
    if (!ob || typeof ob !== 'object' || !num(ob.count, 0, 40) || !num(ob.alpha, 0, 1) || !num(ob.size, 0.01, 3)
      || (ob.color !== undefined && !(Array.isArray(ob.color) && ob.color.length === 3 && ob.color.every((/** @type {any} */ c) => num(c, 0, 1)))))
      err('stage.orbs の値が不正（count 0〜40・alpha 0〜1・size 3以下・color は0〜1の3つ）');
  }
  return errs;
}

/**
 * 複数マップのつながり（行き先・到着位置・双方向）を検証する。
 * @param {Record<string, any>} maps
 * @param {any} collision
 */
/**
 * 出入口が占めるマス。span（2026-11-22 作者「エリア移動の入り口をもう少し広く」）があれば、向きと直角に、x,y から span マスならぶ
 * （左右へ出る出入口は縦に、上下へ出る出入口は横に）
 * @param {any} e
 * @returns {{x:number,y:number}[]}
 */
export function exitTiles(e) {
  const n = e.span || 1, vertical = e.dir === 'left' || e.dir === 'right';
  return Array.from({ length: n }, (_, i) => (vertical ? { x: e.x, y: e.y + i } : { x: e.x + i, y: e.y }));
}

export function validateLinks(maps, collision) {
  const errs = [];
  for (const map of Object.values(maps)) {
    for (const e of map.exits || []) {
      const dest = maps[e.to?.map];
      if (!dest) { errs.push(`${map.id}: exit ${e.id} の行き先 ${e.to?.map} が無い`); continue; }
      const dq = mapQuery(dest, collision);
      const a = e.to.arrive;
      if (!dq.passable(a.x, a.y)) errs.push(`${map.id}: exit ${e.id} の到着位置(${a.x},${a.y})が通れない`);
      if (dq.exitAt(a.x, a.y)) errs.push(`${map.id}: exit ${e.id} の到着位置が出入口の上（往復ループになる）`);
      const back = (dest.exits || []).find((/** @type {any} */ b) => b.id === e.to.exit);
      if (!back || back.to?.map !== map.id || back.to?.exit !== e.id) errs.push(`${map.id}: exit ${e.id} が双方向でない`);
    }
  }
  return errs;
}

/**
 * 通行・出入口の問い合わせ。
 * @param {any} map
 * @param {any} collision
 */
export function mapQuery(map, collision) {
  /** @param {number} x @param {number} y */
  const kindAt = (x, y) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
    return map.legend[[...map.collision[y]][x]] ?? null;
  };
  return {
    kindAt,
    /** @param {number} x @param {number} y */
    passable: (x, y) => !!collision.kinds[kindAt(x, y) ?? '']?.passable,
    /** @param {number} x @param {number} y */
    exitAt: (x, y) => (map.exits || []).find((/** @type {any} */ e) => exitTiles(e).some((t) => t.x === x && t.y === y)) || null,
    /** マスの高さ（map.heights の数字。無ければ 0）。2026-11-22 吹き抜けの2階の通路と階段のため @param {number} x @param {number} y */
    heightAt: (x, y) => { const row = map.heights?.[y]; const c = row ? [...row][x] : undefined; return c === undefined ? 0 : Number(c) || 0; },
  };
}

/**
 * 台帳の検証（キャラの絵は左右反転禁止＝noFlip:true が必須）。
 * @param {any} ledger
 */
export function validateLedger(ledger) {
  const errs = [];
  if (!ledger || ledger.format !== 'sternenring-next-assets') return ['台帳の format が違う'];
  const ids = new Set();
  for (const a of ledger.assets || []) {
    if (ids.has(a.id)) errs.push(`台帳: ${a.id} が重複`);
    ids.add(a.id);
    if (typeof a.id !== 'string' || a.id.startsWith('placeholder:')) errs.push(`台帳: ${a.id} の id が不正`);
    if ((a.kind === 'sheet' || a.kind === 'standee') && a.noFlip !== true) errs.push(`台帳: ${a.id} に noFlip:true が無い（左右反転禁止）`);
    if (a.path != null && (typeof a.path !== 'string' || !/^assets\/[A-Za-z0-9_./-]+$/.test(a.path) || a.path.includes('..'))) errs.push(`台帳: ${a.id} の path が不正`);
    if (a.kind === 'sheet' && (a.directions?.join(',') !== DIRS.join(','))) errs.push(`台帳: ${a.id} の向きの並びが違う`);
  }
  for (const p of ledger.party || []) {
    if (!ids.has(p.walk) || !ids.has(p.idle)) errs.push(`台帳: 仲間 ${p.id} の絵が台帳に無い`);
  }
  return errs;
}
