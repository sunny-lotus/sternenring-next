// テスト用：ディスクからデータを読む（ブラウザの fetch の代わり）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { InputState } from '../src/core/input.js';
import { createField } from '../src/core/field.js';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// crowd：歩いている人・座っている人と話せる・ぶつかる（2026-11-26）を入れるか。決まった道を歩くテストでは、時計で動く人にぶつからないよう外す（話せない＝ぶつからない飾りに戻す）
export function loadAll({ crowd = false } = {}) {
  const world = readJson('data/world.json');
  const collision = readJson('data/collision.json');
  const ledger = readJson('data/assets.json');
  const maps = Object.fromEntries(world.maps.map((id) => [id, readJson(`data/maps/${id}.json`)]));
  if (!crowd) for (const m of Object.values(maps)) { for (const w of m.walkers || []) delete w.pages; for (const n of m.stage?.npcs || []) delete n.pages; }
  const regions = {};
  for (const a of ledger.assets) if (a.regionsPath) regions[a.id] = readJson(a.regionsPath).layout;
  return { world, collision, ledger, maps, regions };
}

export const clone = (o) => structuredClone(o);

/** フィールドと入力を作る。start を上書きできる */
export function makeField(start) {
  const d = loadAll();
  const world = start ? { ...d.world, start } : d.world;
  const field = createField({ maps: d.maps, collision: d.collision, world, party: d.ledger.party });
  const input = new InputState({ buffer: world.inputBuffer });
  return { d, field, input };
}

/** 指定ミリ秒だけ 1/60 秒刻みで進める */
export function run(field, input, ms, dt = 1000 / 60) {
  for (let t = 0; t < ms; t += dt) field.update(dt, input);
}

/** 1歩ずつ：押して離し、歩き終えるまで進める */
export function tap(field, input, dir, n = 1) {
  for (let i = 0; i < n; i++) {
    input.press(dir); input.release(dir);
    run(field, input, field.stepMs + 20);
    if (field.state.leaving) run(field, input, field.state.leaving.left + 20); // 出入口の演出の「離れる」あいだ（2026-11-22）
    if (field.state.transitionLeft > 0) run(field, input, field.state.transitionLeft + 20);
  }
}

export const pos = (field, i = 0) => ({ x: field.state.actors[i].x, y: field.state.actors[i].y, dir: field.state.actors[i].dir });

/** src 以下の .js を列挙 */
export function srcFiles(dir = join(root, 'src')) {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? srcFiles(p) : p.endsWith('.js') ? [p] : []; });
}
