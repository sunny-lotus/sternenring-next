// @ts-check
// データと素材の読込。読む前にすべて検証し、1つでも問題があれば起動しない（壊れたマップで歩かせない）。
import { validateMap, validateLinks, validateLedger } from './core/map.js';
import { readStyle } from './render/paper-math.js';

/** @param {string} path */
async function getJson(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw Error(`${path} を読めません (${r.status})`);
  return r.json();
}

/** @param {string} path */
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(Error(`${path} を読めません`));
    im.src = path;
  });
}

export async function loadGameData() {
  const [world, collision, ledger, styleRaw] = await Promise.all(['data/world.json', 'data/collision.json', 'data/assets.json', 'data/stage-style.json'].map(getJson));
  const { style, errors: styleErrors } = readStyle(styleRaw);
  const maps = Object.fromEntries(await Promise.all(world.maps.map(async (/** @type {string} */ id) => [id, await getJson(`data/maps/${id}.json`)])));
  /** @type {Record<string, Record<string, number[]>>} */
  const regions = {};
  for (const a of ledger.assets) if (a.regionsPath) regions[a.id] = (await getJson(a.regionsPath)).layout;
  const errors = [
    ...validateLedger(ledger),
    ...Object.values(maps).flatMap((m) => validateMap(m, { collision, ledger, regions })),
    ...validateLinks(maps, collision),
    ...styleErrors,
  ];
  if (!maps[world.start.map]) errors.push(`開始マップ ${world.start.map} が無い`);
  if (errors.length) return { errors };
  /** @type {Record<string, HTMLImageElement>} */
  const images = {};
  await Promise.all(ledger.assets.filter((/** @type {any} */ a) => a.path && /\.png$/.test(a.path)).map(async (/** @type {any} */ a) => { images[a.id] = await loadImage(a.path); }));
  return { errors, world, collision, ledger, maps, regions, images, style };
}
