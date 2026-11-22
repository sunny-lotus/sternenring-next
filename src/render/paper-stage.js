// @ts-check
// 紙の舞台（P2）：ドット絵のシャドーボックス。素の WebGL1 だけで描く（外部ライブラリなし）。
// - 床は寝かせた1枚（マップのタイルを1枚の絵にまとめる）
// - 建物・家具・人物は、同じ向き（カメラの正面）を向いた透過の板。奥行きの帯に並べ、前後は足もとの z で決まる
// - 板ごとに「後ろに落ちる影」と「紙の厚み（ふち）」の板を付ける
// - 内部解像度を整数分の1にして描き、画面へは補間なしで拡大（ドットをにじませない）
// 描画の共通の口：load / draw / resize / dispose（設計書 §3.4）。core の view を読むだけで状態を書きかえない。
// DEV-BOOK-001：開始演出「飛び出す絵本」。draw の2つめの引数 fx.intro（book-intro.js の見え方）があるあいだ、
//   床を背で折れる2枚のページとして描き（本がひらく）、板を足もとの線を軸に起こし（少し行きすぎて戻る）、カメラを本全体から主人公へ寄せる。
//   fx.intro が null になれば、これまでと同じカメラ（マップの pitch/fov・追従）と立った板に戻る。六角形のオーブは演出のあとも残す。
import { sheetFrame, integerScale } from './sprites.js';
import { followCamera } from './camera.js';
import { DEFAULT_STYLE, placeBoard, placeActor, boardAxes, boardNormal, frameUV, cameraEye, viewTiles, snap, perspective, lookAt, mul, bookWideEye, bookHalf, risingAy } from './paper-math.js';
import { riseDelayFn, riseK, orbPositions } from './book-intro.js';

const VS = `
attribute vec2 aQ;
uniform mat4 uVP;
uniform vec3 uO, uAx, uAy;
uniform vec2 uSize;
uniform vec4 uUV;
varying vec2 vT;
void main() {
  vec3 p = uO + uAx * (aQ.x * uSize.x) + uAy * (aQ.y * uSize.y);
  vT = vec2(mix(uUV.x, uUV.z, aQ.x), mix(uUV.w, uUV.y, aQ.y));
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uMode;   // 0=絵 1=影絵（形だけ色で塗る） 2=塗りつぶし 3=やわらかい光（切り抜かず、絵の透明度×uAlpha。オーブ用）
uniform vec4 uColor;
uniform float uAlpha, uAir;
uniform vec3 uAirColor;
varying vec2 vT;
void main() {
  if (uMode > 2.5) { vec4 g = texture2D(uTex, vT); gl_FragColor = vec4(g.rgb * uColor.rgb, g.a * uAlpha); return; }
  if (uMode > 1.5) { gl_FragColor = uColor; return; }
  vec4 c = texture2D(uTex, vT);
  if (c.a < 0.5) discard;
  vec3 rgb = uMode > 0.5 ? uColor.rgb : c.rgb;
  float a = uMode > 0.5 ? uColor.a : uAlpha;
  gl_FragColor = vec4(mix(rgb, uAirColor, uAir), a);
}`;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ ledger:any, images: Record<string, HTMLImageElement>, regions: Record<string, Record<string, number[]>>, style?: typeof DEFAULT_STYLE }} assets
 */
export function createPaperStage(canvas, assets) {
  const gl = /** @type {WebGLRenderingContext|null} */ (canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' }));
  if (!gl) throw Error('WebGL が使えません');
  const style = assets.style ?? DEFAULT_STYLE;
  const byId = Object.fromEntries(assets.ledger.assets.map((/** @type {any} */ a) => [a.id, a]));
  const party = Object.fromEntries(assets.ledger.party.map((/** @type {any} */ p) => [p.id, p]));

  // ---- シェーダーと四角形 ----
  const sh = (/** @type {number} */ type, /** @type {string} */ src) => {
    const s = /** @type {WebGLShader} */ (gl.createShader(type)); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(String(gl.getShaderInfoLog(s)));
    return s;
  };
  const prog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw Error(String(gl.getProgramInfoLog(prog)));
  gl.useProgram(prog);
  const U = Object.fromEntries(['uVP', 'uO', 'uAx', 'uAy', 'uSize', 'uUV', 'uTex', 'uMode', 'uColor', 'uAlpha', 'uAir', 'uAirColor'].map((n) => [n, gl.getUniformLocation(prog, n)]));
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aQ = gl.getAttribLocation(prog, 'aQ'); gl.enableVertexAttribArray(aQ); gl.vertexAttribPointer(aQ, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(U.uTex, 0);
  gl.uniform3fv(U.uAirColor, style.air.color);

  /** @param {TexImageSource} src */
  function texture(src) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    // ドットをにじませない：最近傍・ミップマップなし
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const canvas2d = (/** @type {number} */ w, /** @type {number} */ h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // キャラのシートは最初に一度だけ
  /** @type {Record<string, { tex: WebGLTexture|null, w:number, h:number }>} */
  const sheets = {};
  for (const a of assets.ledger.assets.filter((/** @type {any} */ x) => x.kind === 'sheet')) {
    const im = assets.images[a.id]; if (im) sheets[a.id] = { tex: texture(im), w: im.naturalWidth || im.width, h: im.naturalHeight || im.height };
  }
  // 足もとの丸い影（地面に寝かせる）
  const footTex = (() => {
    const c = canvas2d(16, 8); const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(8, 4, 7, 3, 0, 0, Math.PI * 2); g.fill();
    return texture(c);
  })();

  // 六角形の光の玉（オーブ）。小さなドットの六角形を、にじませずに拡大する
  const orbTex = (() => {
    const c = canvas2d(12, 12); const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.translate(6, 6); g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(Math.cos(a) * 5.6, Math.sin(a) * 5.6); }
    g.closePath();
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 6); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.75, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,.6)');
    g.fillStyle = gr; g.fill();
    return texture(c);
  })();
  /** 板の起き上がりの時間差（マップを読むたびに作る） */ let delayOf = riseDelayFn([]);
  let lastIntro = /** @type {any} */ (null), lastEye = /** @type {number[]} */ ([]), lastOrbs = 0;

  /** @type {any} */ let map = null;
  /** @type {{ tex: WebGLTexture|null, board: ReturnType<typeof placeBoard>, band:string, asset:string, fade:any }[]} */ let boards = [];
  /** @type {WebGLTexture|null} */ let groundTex = null;
  let W = 1, H = 1, s = 1, iw = 1, ih = 1;
  const cam = { x: 0, y: 0 };
  let drawCalls = 0, lastOrder = /** @type {string[]} */ ([]), lastFaded = /** @type {string[]} */ ([]);
  const T = () => map?.tileSize ?? 32;

  /** 床：マップのタイルと扉の印を1枚の絵にまとめる */
  function buildGround() {
    const t = T(), c = canvas2d(map.width * t, map.height * t), g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.imageSmoothingEnabled = false;
    const gr = map.ground, img = assets.images[gr.tileset], reg = assets.regions[gr.tileset] || {};
    const put = (/** @type {string} */ name, /** @type {number} */ x, /** @type {number} */ y) => { const r = reg[name]; if (!r || !img) return false; g.drawImage(img, r[0], r[1], r[2], r[3], x * t, y * t, t, t); return true; };
    const covered = (/** @type {number} */ x, /** @type {number} */ y) => map.stage.layers.some((/** @type {any} */ l) => l.band !== 'backdrop' && l.items.some((/** @type {any} */ it) => x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h));
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const kind = map.legend[[...map.collision[y]][x]];
      if (kind === 'wall' && !covered(x, y) && gr.wall && put(gr.wall, x, y)) continue;
      if (!gr.fill || !put(gr.fill, x, y)) { g.fillStyle = '#6d6a60'; g.fillRect(x * t, y * t, t, t); }
      if (kind === 'door') { // 扉の印（仮）：床に敷いた入口のしるし
        g.fillStyle = '#5a3d26'; g.fillRect(x * t + 4, y * t + 2, t - 8, t - 2);
        g.fillStyle = '#7a5636'; g.fillRect(x * t + 6, y * t + 4, t - 12, t - 6);
      }
    }
    return texture(c);
  }

  /** 仮の板：紙の四角＋点線のふち＋名前（仮）。完成美術ではないことが見てわかる絵 */
  function placeholderTex(/** @type {any} */ it, /** @type {{w:number,h:number}} */ b) {
    const t = T(), c = canvas2d(b.w * t, b.h * t), g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.fillStyle = '#e8dfca'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#9c8f74'; g.setLineDash([3, 3]); g.lineWidth = 2; g.strokeRect(1, 1, c.width - 2, c.height - 2);
    g.fillStyle = '#4a4436'; g.font = '10px sans-serif'; g.textBaseline = 'top';
    g.fillText(`${it.asset.replace('placeholder:', '')}（仮）`, 4, 4, c.width - 8);
    return texture(c);
  }

  /** 画像のある板（領域を切り出す。repeat:'x' は横に並べる） */
  function regionTex(/** @type {any} */ it) {
    const r = assets.regions[it.asset]?.[it.region], img = assets.images[it.asset];
    if (!r || !img) return null;
    const t = T(), w = it.repeat === 'x' ? it.w * t : r[2], c = canvas2d(w, r[3]), g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.imageSmoothingEnabled = false;
    for (let x = 0; x < w; x += r[2]) g.drawImage(img, r[0], r[1], Math.min(r[2], w - x), r[3], x, 0, Math.min(r[2], w - x), r[3]);
    return { tex: texture(c), px: /** @type {[number, number]} */ ([w, r[3]]) };
  }

  function freeMapTextures() {
    for (const b of boards) gl.deleteTexture(b.tex);
    if (groundTex) gl.deleteTexture(groundTex);
    boards = []; groundTex = null;
  }

  // ---- 1枚の四角を描く ----
  /** @param {WebGLTexture|null} tex @param {number[]} o @param {number[]} ax @param {number[]} ay @param {number} w @param {number} h @param {number[]} uv @param {number} mode @param {number[]} color @param {number} alpha @param {number} air */
  function quad(tex, o, ax, ay, w, h, uv, mode, color, alpha, air) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform3fv(U.uO, o); gl.uniform3fv(U.uAx, ax); gl.uniform3fv(U.uAy, ay); gl.uniform2f(U.uSize, w, h);
    gl.uniform4fv(U.uUV, uv); gl.uniform1f(U.uMode, mode); gl.uniform4fv(U.uColor, color); gl.uniform1f(U.uAlpha, alpha); gl.uniform1f(U.uAir, air);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); drawCalls++;
  }

  return {
    name: 'paper',
    /** @param {any} mapData */
    async load(mapData) {
      freeMapTextures();
      map = mapData;
      groundTex = buildGround();
      for (const layer of map.stage.layers) for (const it of layer.items) {
        const rt = it.region ? regionTex(it) : null;
        const board = placeBoard(it, layer.band, T(), rt ? rt.px : null);
        boards.push({ tex: rt ? rt.tex : placeholderTex(it, board), board, band: layer.band, asset: it.region ? `${it.asset}#${it.region}` : it.asset, fade: it.fadeNearPlayer ? it : null });
      }
      delayOf = riseDelayFn(boards.map((b) => b.board.z));
    },
    /** @param {number} cssW @param {number} cssH @param {number} dpr */
    resize(cssW, cssH, dpr) {
      W = Math.max(1, Math.round(cssW * dpr)); H = Math.max(1, Math.round(cssH * dpr));
      s = integerScale(W, H, 32);
      iw = Math.max(1, Math.round(W / s)); ih = Math.max(1, Math.round(H / s));
      canvas.width = iw; canvas.height = ih; // 画面へは CSS の image-rendering: pixelated で拡大
    },
    /**
     * @param {any} view
     * @param {{ intro?: { t:number, open:number, coverRad:number, zoom:number } | null, seconds?: number }} [fx]
     *   intro：開始演出の見え方（無ければふだんの描画） seconds：オーブを動かす経過秒（動きを抑えるときは 0 のまま）
     */
    draw(view, fx = {}) {
      if (!map) return;
      const intro = fx.intro ?? null;
      drawCalls = 0;
      // window.SR_CAM（?cam=1 の調整パネル src/ui/cam-panel.js）に値があれば、マップの値より優先（作者とカメラ角度を選ぶため）
      const t = T(), cfg = map.stage.camera || {}, ov = /** @type {any} */ (window).SR_CAM || {};
      const pitch = ov.pitchDeg ?? cfg.pitchDeg ?? 50, fov = ov.fovDeg ?? cfg.fovDeg ?? 24;
      const lead = view.actors[0];
      const dz = cfg.follow === 'player' ? (cfg.deadzone || [0, 0]) : [0, 0];
      followCamera(cam, { x: lead.x + 0.5, y: lead.y + 0.5 }, map, viewTiles(iw, ih, t, pitch), dz);
      const look = { x: snap(cam.x, t), y: snap(cam.y, t) };
      const game = cameraEye(look, pitch, fov, ih, t);
      let eye = game.eye, target = game.target, D = game.D;
      const bk = style.book;
      if (intro) { // 本全体を見るカメラから、ふだんのカメラへ寄る（zoom=1 でふだんと同じ）
        const wide = bookWideEye(map, bk.margin, fov, iw / ih);
        const z = intro.zoom, lerp = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.map((v, i) => v + (b[i] - v) * z);
        eye = lerp(wide.eye, game.eye); target = lerp(wide.target, game.target); D = Math.max(D, wide.D);
      }
      lastIntro = intro; lastEye = eye.map((v) => Math.round(v * 1000) / 1000);
      const V = lookAt(eye, target, [0, 1, 0]);
      const vp = mul(perspective(fov * Math.PI / 180, iw / ih, Math.max(0.5, game.D * 0.2), D * 4 + map.height * 2), V);
      const axes = boardAxes(style.boardFacing === 'upright' ? 'upright' : 'camera', pitch), ax = axes.ax;
      // 板の縦軸：ふだんは同じ向き。演出中は板ごとに起き上がり具合 k で回す
      const ayOf = (/** @type {number} */ k) => (k === 1 ? axes.ay : risingAy(axes.lean, k));
      const along = (/** @type {number[]} */ o, /** @type {number[]} */ ay, /** @type {number} */ k) => [o[0] + ay[0] * k, o[1] + ay[1] * k, o[2] + ay[2] * k];
      // 板の真後ろ（板の面に垂直な、カメラから遠ざかる向き）へ k マス下げる。ふちと影は必ず板より奥になる
      const behind = (/** @type {number[]} */ o, /** @type {number[]} */ ay, /** @type {number} */ k) => { const nrm = boardNormal(ay); return [o[0] - nrm[0] * k, o[1] - nrm[1] * k, o[2] - nrm[2] * k]; };
      const riseOf = (/** @type {number} */ z, /** @type {boolean} */ isActor) => (intro ? riseK(intro.t, delayOf(z, isActor)) : 1);

      gl.viewport(0, 0, iw, ih);
      gl.clearColor(style.clear[0], style.clear[1], style.clear[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uVP, false, vp);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND); gl.depthMask(true);

      // 床（寝かせた1枚）。手前の行が絵の下になるよう、原点を手前の端に置く
      // 演出中は背（中央）で折れた2枚のページとして描き、まわりに表紙とページの束のふちを敷く（本がひらく）
      const coverRad = intro ? intro.coverRad : 0;
      const sides = /** @type {(-1|1)[]} */ ([-1, 1]);
      if (intro || bk.keepCover) {
        for (const side of sides) {
          for (const [extra, depth, col, zx] of /** @type {[number, number, number[], number][]} */ ([[bk.margin, bk.depth, bk.cover, bk.margin], [bk.edge, bk.depth / 2, bk.pageEdge, bk.edge]])) {
            const h = bookHalf(side, map.width, coverRad, extra);
            const o = [h.o[0] - h.n[0] * depth, h.o[1] - h.n[1] * depth, map.height + zx];
            quad(null, o, h.ax, [0, 0, -1], h.len, map.height + 2 * zx, [0, 0, 1, 1], 2, [...col, 1], 1, 0);
          }
        }
      }
      if (coverRad > 0) {
        for (const side of sides) {
          const h = bookHalf(side, map.width, coverRad);
          quad(groundTex, [h.o[0], h.o[1], map.height], h.ax, [0, 0, -1], h.len, map.height, side < 0 ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1], 0, [0, 0, 0, 0], 1, 0);
        }
      } else {
        quad(groundTex, [0, 0, map.height], [1, 0, 0], [0, 0, -1], map.width, map.height, [0, 0, 1, 1], 0, [0, 0, 0, 0], 1, 0);
      }

      // 板の一覧（舞台の板＋キャラ）
      /** @type {{ tex:any, x:number, z:number, w:number, h:number, below:number, uv:number[], air:number, alpha:number, name:string, shadow:boolean, k:number, ay:number[] }[]} */
      const list = [];
      lastFaded = [];
      for (const b of boards) {
        let alpha = 1;
        if (b.fade) {
          const it = b.fade;
          if (lead.x >= it.x - 1 && lead.x <= it.x + it.w && lead.y >= it.y - 2 && lead.y <= it.y + it.h) { alpha = 0.4; lastFaded.push(b.asset); }
        }
        const k = riseOf(b.board.z, false);
        if (k <= 0.01) continue; // まだページに寝ている
        // @ts-ignore
        list.push({ tex: b.tex, ...b.board, below: 0, uv: [0, 0, 1, 1], air: style.air[b.band] ?? 0, alpha, name: b.asset, shadow: b.band !== 'backdrop', k, ay: ayOf(k) });
      }
      for (const a of view.actors) {
        const p = party[a.id], entry = byId[a.motion === 'walk' ? p.walk : p.idle], sht = sheets[entry.id];
        if (!sht) continue;
        const f = sheetFrame(entry, a.dir, a.animMs); // 左右は別の行。反転しない
        const pa = placeActor(a, entry, t);
        const k = riseOf(pa.z, true);
        if (k <= 0.01) continue;
        list.push({ tex: sht.tex, x: pa.x, z: pa.z, w: pa.w, h: pa.h, below: pa.below, uv: frameUV(f, sht.w, sht.h), air: 0, alpha: 1, name: `actor:${a.id}`, shadow: true, k, ay: ayOf(k) });
        // 足もとの丸い影（地面）
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        quad(footTex, [a.x + 0.5 - 0.42, 0.002, a.y + 0.5 + 0.2], [1, 0, 0], [0, 0, -1], 0.84, 0.4, [0, 0, 1, 1], 1, [0, 0, 0, style.footShadow * Math.min(1, k)], 1, 0);
        gl.disable(gl.BLEND); gl.depthMask(true);
      }
      list.sort((p, q) => p.z - q.z);
      lastOrder = list.map((b) => `${b.name}@${b.z.toFixed(2)}`);

      const e = style.edge, sd = style.shadow;
      // 1) 不透明の板と紙のふち（形で切り抜き、奥行きを書く）
      for (const b of list) {
        if (b.alpha < 1) continue;
        const ay = b.ay, o = along([b.x, b.k < 1 ? 0.003 : 0, b.z], ay, -b.below);
        quad(b.tex, behind([o[0] + e.dx / t, o[1], o[2]], ay, e.dz), ax, ay, b.w, b.h, b.uv, 1, [...e.color, 1], 1, b.air); // ふち（右と下へずらした暗い紙を、板の真後ろに）
        quad(b.tex, behind(along(o, ay, -e.dy / t), ay, e.dz), ax, ay, b.w, b.h, b.uv, 1, [...e.color, 1], 1, b.air);
        quad(b.tex, o, ax, ay, b.w, b.h, b.uv, 0, [0, 0, 0, 0], 1, b.air);
      }
      // 2) 板の後ろに落ちる影（半透明。奥行きは書かない）
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      const gs = style.ground;
      for (const b of list) { // 地面に寝かせた影（板の形を奥・右へ倒す）。立っている紙だと分かる手がかり
        if (!b.shadow || b.alpha < 1 || gs.alpha <= 0) continue;
        quad(b.tex, [b.x, 0.004, b.z], [1, 0, 0], [gs.skew, 0, -gs.length], b.w, b.h, b.uv, 1, [...sd.color, gs.alpha * Math.min(1, b.k)], 1, 0);
      }
      for (const b of list) {
        if (!b.shadow || b.alpha < 1) continue;
        const o = behind(along([b.x + sd.dx / t, 0, b.z], b.ay, -b.below - sd.dy / t), b.ay, sd.dz);
        quad(b.tex, o, ax, b.ay, b.w, b.h, b.uv, 1, [...sd.color, sd.alpha * Math.min(1, b.k)], 1, 0);
      }
      // 3) 薄くした手前の板（奥から順に重ねる）
      for (const b of list) {
        if (b.alpha >= 1) continue;
        quad(b.tex, along([b.x, 0, b.z], b.ay, -b.below), ax, b.ay, b.w, b.h, b.uv, 0, [0, 0, 0, 0], b.alpha, b.air);
      }
      // 4) 六角形の光の玉（オーブ）。カメラの正面を向く小さな板を、加算で重ねる（建物の後ろでは隠れる）
      const ob = style.orbs;
      lastOrbs = 0;
      if (ob.count > 0) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        const right = [V[0], V[4], V[8]], up = [V[1], V[5], V[9]];
        for (const p of orbPositions(ob.count, fx.seconds ?? 0, { w: map.width, h: map.height })) {
          if (p.alpha <= 0.01) continue;
          const hs = p.size / 2, o = [p.x - right[0] * hs - up[0] * hs, p.y - right[1] * hs - up[1] * hs, p.z - right[2] * hs - up[2] * hs];
          quad(orbTex, o, right, up, p.size, p.size, [0, 0, 1, 1], 3, [...ob.color, 1], p.alpha * ob.alpha, 0);
          lastOrbs++;
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      // 暗転（画面全体）
      if (view.transition > 0) {
        gl.disable(gl.DEPTH_TEST);
        gl.uniformMatrix4fv(U.uVP, false, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        quad(null, [-1, -1, 0], [1, 0, 0], [0, 1, 0], 2, 2, [0, 0, 1, 1], 2, [10 / 255, 10 / 255, 16 / 255, view.transition], 1, 0);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    },
    dispose() {
      freeMapTextures(); map = null;
      for (const k of Object.keys(sheets)) gl.deleteTexture(sheets[k].tex);
      gl.deleteTexture(footTex); gl.deleteTexture(orbTex);
    },
    debug: () => ({ name: 'paper', scale: s, W, H, inner: [iw, ih], cam: { ...cam }, drawCalls, boards: boards.length, order: [...lastOrder], faded: [...lastFaded], intro: lastIntro ? { ...lastIntro } : null, eye: [...lastEye], orbs: lastOrbs }),
  };
}
