// @ts-check
// データと素材の読込。読む前にすべて検証し、1つでも問題があれば起動しない（壊れたマップで歩かせない）。
import { validateMap, validateLinks, validateLedger } from './core/map.js';
import { readStyle } from './render/paper-math.js';

/** @param {string} path */
async function getJson(path) {
  const pre = /** @type {any} */ (globalThis).SR_PRE?.take(path); // index.html が先に読みはじめていれば、それを使う
  if (pre) return pre;
  // no-cache：毎回あたらしいかを確かめるが、変わっていなければ届いている物を使う（no-store だと毎回ぜんぶ取り直していた。2026-11-22 作者「まだ時間かかるなあ」）
  const r = await fetch(path, { cache: 'no-cache' });
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

/** @type {HTMLImageElement[]} */ const prefetched = [];
/**
 * マップの大きな絵（町の絵・奥の背景・内装の手ざわり）を、描画の準備より先に読みはじめる（待たない）。
 * 描画の側が同じアドレスで読むと、ブラウザに届いている物がすぐ使われる
 * @param {any} m
 */
function prefetchMapArt(m, day = false) {
  if (!m || typeof Image === 'undefined') return;
  const urls = new Set();
  const t = m.stage?.townArt; if (t) for (const f of [...Object.values(t.ground || {}), ...Object.values(t.boards || {}).flat()]) urls.add((t.base || '') + f);
  const tx = m.stage?.textures; if (tx) for (const [k, f] of Object.entries(tx)) if (k !== 'base' && typeof f === 'string' && /.(png|webp|jpg)$/.test(f)) urls.add((tx.base || '') + f);
  for (const l of m.stage?.layers || []) for (const it of l.items || []) for (const u of [day && it.imageDay ? it.imageDay : it.image]) if (u) urls.add(u);
  for (const u of urls) { const im = new Image(); im.src = /** @type {string} */ (u); prefetched.push(im); }
}

/** @param {{day?: boolean}} [opt] day：昼の設定なら昼の背景を先に読む */
export { getJson };
export async function loadGameData(opt = {}) {
  const [world, collision, ledger, styleRaw] = await Promise.all(['data/world.json', 'data/collision.json', 'data/assets.json', 'data/stage-style.json'].map(getJson));
  const { style, errors: styleErrors } = readStyle(styleRaw);
  const maps = Object.fromEntries(await Promise.all(world.maps.map(async (/** @type {string} */ id) => [id, await getJson(`data/maps/${id}.json`)])));
  /** @type {Record<string, Record<string, number[]>>} */
  const regions = {};
  await Promise.all(ledger.assets.filter((/** @type {any} */ a) => a.regionsPath).map(async (/** @type {any} */ a) => { regions[a.id] = (await getJson(a.regionsPath)).layout; })); // 1つずつ待たずに並べて読む
  prefetchMapArt(maps[world.start?.map], !!opt.day); // 始まりのマップの絵は、ここで先に読みはじめる（キャラの絵と並べて）
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
  // ?chara=art：キャラを元の絵（水彩の歩きの元絵を、ドット絵と同じ並びにしたもの。tools/make-art-walk.py）で歩かせる試し（2026-11-25 サニー「元の絵だったらどうなるか試したい」）。
  // 絵は大きさが artScale 倍なので、コマの大きさと足の位置も同じ倍にする（画面での背の高さは変わらない）
  if (opt.charaArt || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('chara') === 'art')) {
    await Promise.all(ledger.assets.filter((/** @type {any} */ a) => a.style === 'chibi' && /\/chibi-(walk|idle|sit)\.png$/.test(a.path || '')).map(async (/** @type {any} */ a) => {
      const im = await loadImage(a.path.replace('/chibi-', '/art-')).catch(() => null); if (!im) return;
      const k = im.height / (a.frame[1] * 4); images[a.id] = im; a.artScale = k; a.frame = a.frame.map((/** @type {number} */ v) => v * k); a.anchor = a.anchor.map((/** @type {number} */ v) => v * k); if (a.seat) a.seat = a.seat.map((/** @type {number} */ v) => v * k); // 座り姿の座面も同じ倍（2026-11-25 座りも元の絵）
    }));
  }
  return { errors, world, collision, ledger, maps, regions, images, style };
}
