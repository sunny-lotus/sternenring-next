// @ts-check
// Canvas 2D の平面表示（P1・予備の描画）。core の見え方（view）を読むだけで、状態を書きかえない。
// 描画の共通の口：load / draw / resize / dispose（設計書 §3.4）。P2 の paper-stage も同じ口を持つ。
import { sheetFrame, integerScale } from './sprites.js';
import { followCamera } from './camera.js';

const T = 32; // 1マスのドット数（仮。マップの tileSize に合わせる）
const PAPER = '#e8dfca', PAPER_EDGE = '#9c8f74', SHADOW = 'rgba(52,48,84,0.28)', INK = '#4a4436';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ ledger:any, images: Record<string, HTMLImageElement>, regions: Record<string, Record<string, number[]>> }} assets
 */
export function createFlat2d(canvas, assets) {
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const byId = Object.fromEntries(assets.ledger.assets.map((/** @type {any} */ a) => [a.id, a]));
  const party = Object.fromEntries(assets.ledger.party.map((/** @type {any} */ p) => [p.id, p]));
  /** @type {any} */ let map = null;
  /** @type {any} */ let collision = null;
  let W = 1, H = 1, s = 1;
  const cam = { x: 0, y: 0 };

  function covered(/** @type {number} */ x, /** @type {number} */ y) {
    return map.stage.layers.some((/** @type {any} */ l) => l.items.some((/** @type {any} */ it) => x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h));
  }

  function drawRegion(/** @type {string} */ asset, /** @type {string} */ region, /** @type {number} */ dx, /** @type {number} */ dy, /** @type {number} */ dw, /** @type {number} */ dh) {
    const r = assets.regions[asset]?.[region];
    const img = assets.images[asset];
    if (!r || !img) return false;
    g.drawImage(img, r[0], r[1], r[2], r[3], dx, dy, dw, dh);
    return true;
  }

  function drawGround() {
    const gr = map.ground;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const kind = map.legend[[...map.collision[y]][x]];
      if (kind === 'wall' && !covered(x, y) && gr.wall) { drawRegion(gr.tileset, gr.wall, x * T, y * T, T, T); continue; }
      if (!gr.fill || !drawRegion(gr.tileset, gr.fill, x * T, y * T, T, T)) { g.fillStyle = '#6d6a60'; g.fillRect(x * T, y * T, T, T); }
    }
  }

  /** 扉の印（建物の板より手前に描き、入口が隠れないようにする） */
  function drawDoors() {
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (map.legend[[...map.collision[y]][x]] !== 'door') continue;
      g.fillStyle = SHADOW; g.fillRect(x * T + 6, y * T + 4, T - 8, T - 4);
      g.fillStyle = '#5a3d26'; g.fillRect(x * T + 4, y * T + 2, T - 8, T - 2);
      g.fillStyle = '#7a5636'; g.fillRect(x * T + 6, y * T + 4, T - 12, T - 6);
      g.fillStyle = '#c9a25e'; g.fillRect(x * T + T - 10, y * T + 16, 2, 2);
    }
  }

  /** 仮の板：紙の四角＋右下の影＋名前。素材が届くまでの置き場所を示すだけ */
  function drawBoard(/** @type {any} */ it, /** @type {number} */ alpha) {
    const x = it.x * T, y = it.y * T, w = it.w * T, h = it.h * T;
    g.save();
    g.globalAlpha = alpha;
    if (it.region && assets.images[it.asset]) {
      const r = assets.regions[it.asset][it.region];
      g.fillStyle = SHADOW;
      if (it.repeat === 'x') {
        for (let cx = 0; cx < w; cx += r[2]) drawRegion(it.asset, it.region, x + cx, y + h - r[3], Math.min(r[2], w - cx), r[3]);
      } else {
        drawRegion(it.asset, it.region, x + Math.round((w - r[2]) / 2), y + h - r[3], r[2], r[3]);
      }
    } else {
      g.fillStyle = SHADOW; g.fillRect(x + 3, y + 3, w, h);
      g.fillStyle = PAPER; g.fillRect(x, y, w, h);
      g.fillStyle = PAPER_EDGE; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
      g.fillStyle = INK; g.font = '8px sans-serif'; g.textBaseline = 'top';
      g.fillText(`${it.asset.replace('placeholder:', '')}（仮）`, x + 3, y + 3, w - 6);
    }
    g.restore();
  }

  function drawActor(/** @type {any} */ a) {
    const p = party[a.id];
    const entry = byId[a.motion === 'walk' ? p.walk : p.idle];
    const f = sheetFrame(entry, a.dir, a.animMs);
    const footX = Math.round(a.x * T + T / 2), footY = Math.round(a.y * T + T - 2);
    // 左右反転しない：f.scaleX は常に 1。拡大は setTransform の正の整数倍だけ。
    g.drawImage(assets.images[entry.id], f.sx, f.sy, f.sw, f.sh, footX - f.ax, footY - f.ay, f.sw, f.sh);
  }

  return {
    name: 'flat2d',
    /** @param {any} mapData @param {any} collisionTable */
    async load(mapData, collisionTable) { map = mapData; collision = collisionTable; },
    /** @param {number} cssW @param {number} cssH @param {number} dpr */
    resize(cssW, cssH, dpr) {
      W = Math.max(1, Math.round(cssW * dpr)); H = Math.max(1, Math.round(cssH * dpr));
      canvas.width = W; canvas.height = H;
      s = integerScale(W, H, T);
    },
    /** @param {ReturnType<import('../core/field.js').createField>['view'] extends () => infer V ? V : never} view */
    draw(view) {
      if (!map) return;
      const lead = view.actors[0];
      const viewTiles = { w: W / (T * s), h: H / (T * s) };
      const dz = map.stage?.camera?.follow === 'player' ? (map.stage.camera.deadzone || [0, 0]) : [0, 0];
      followCamera(cam, { x: lead.x + 0.5, y: lead.y + 0.5 }, map, viewTiles, dz);
      // カメラをドットの格子に丸める（スクロールでドットが揺れない）
      const ox = Math.round(W / (2 * s) - cam.x * T) * s, oy = Math.round(H / (2 * s) - cam.y * T) * s;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#1b1a22'; g.fillRect(0, 0, W, H);
      g.setTransform(s, 0, 0, s, ox, oy);
      drawGround();
      const layer = (/** @type {string} */ band) => map.stage.layers.filter((/** @type {any} */ l) => l.band === band).flatMap((/** @type {any} */ l) => l.items);
      for (const it of [...layer('backdrop'), ...layer('back')]) drawBoard(it, 1);
      drawDoors();
      const mids = [
        ...layer('mid').map((/** @type {any} */ it) => ({ z: it.y + it.h - 0.01 + (it.zOffset || 0) * 0.001, draw: () => drawBoard(it, 1) })),
        ...view.actors.map((a, i) => ({ z: a.y + 1 - i * 0.0001, draw: () => drawActor(a) })),
      ].sort((p, q) => p.z - q.z);
      for (const m of mids) m.draw();
      for (const it of layer('front')) {
        const near = it.fadeNearPlayer && lead.x >= it.x - 1 && lead.x <= it.x + it.w && lead.y >= it.y - 2 && lead.y <= it.y + it.h;
        drawBoard(it, near ? 0.4 : 1);
      }
      if (view.transition > 0) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = `rgba(10,10,16,${view.transition.toFixed(3)})`; g.fillRect(0, 0, W, H);
      }
    },
    dispose() { map = null; collision = null; },
    debug: () => ({ scale: s, W, H, cam: { ...cam } }),
  };
}
