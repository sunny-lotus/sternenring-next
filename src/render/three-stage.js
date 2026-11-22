// 紙の舞台（three.js 版）。2026-11-22 作者の決定「NEXTの見た目は、試作に合わせる」（reports/作者との決定事項.md 14:35）。
// 見た目の基準：STERNENRING_Codex/試作_飛び出す絵本（町・フィールド）、試作_ブックヌック（建物の中）。
// - 外（kind が interior 以外）：床は本の見開き（羊皮紙のページ・革の表紙・ページの束）。建物・家具は、ページから起き上がる紙の板
// - 中（kind: interior）：ブックヌック。手前が開いた箱の内側（床板・壁・天井）に、家具の板と灯り。手前に木の額縁
// - 灯りと影（板の影がページに落ちる）、ゆっくりただよう六角形の光の玉（オーブ）
// - 開始演出 fx.intro（book-intro.js）：本がひらく → 板が時間差で起き上がる（少し行きすぎて戻る） → 主人公へ寄る
// 描画の共通の口は paper-stage.js と同じ（load / draw / resize / dispose / debug）。core の view を読むだけで状態を書きかえない。
// 板の絵はコードで描いた仮のもの（placeholder）。正式な絵（美術・演出室の元絵 → ドット絵）が届いたら差しかえる。
// キャラは左右反転しない（負の拡大・UV の反転を使わない）。「本の世界」は見た目だけで、物語・設定には関係させない。
import * as THREE from '../vendor/three/three.module.js';
import { DEFAULT_STYLE, placeBoard } from './paper-math.js';
import { riseDelayFn, riseK, orbPositions } from './book-intro.js';
import { sheetFrame } from './sprites.js';
import { mapQuery } from '../core/map.js';

/** キャラの見た目（仮）：戦闘試作のドット絵（服がなびく8コマ、横一列）。デフォルメの歩きのドット絵が届くまで */
const FLUTTER = { nacht: 'assets/characters/nacht/flutter.png', volt: 'assets/characters/volt/flutter.png' };
const FLUTTER_FRAMES = 8, FLUTTER_FPS = 7, ACTOR_SIZE = 2.5; // キャラの板の大きさ（マス）
const CHIBI_H = 2.4; // デフォルメの歩きのドット絵の高さ（マス）
const DOT = CHIBI_H / 98; // キャラの1ドットの大きさ（マス）。位置をこの刻みにそろえる
const snapDot = (v) => Math.round(v / DOT) * DOT;

function rnd(seed) { let x = seed >>> 0 || 1; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296; }
function noise(g, w, h, R, a) { const im = g.getImageData(0, 0, w, h), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (R() - 0.5) * a; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(im, 0, 0); }
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); draw(c.getContext('2d'), c.width, c.height); return c; }
function texOf(c, nearest = false) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (nearest) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; } else t.anisotropy = 8; return t; }
const PX = 48; // 板の絵の細かさ（1マスあたりのピクセル）
// 内装をドット絵の手ざわりにする（2026-11-22 作者「試しに、銀鹿亭の内装を全部ドットにしてからテクスチャを張れる？」）。?pixelroom=1 のときだけ（見比べ用）
// キャラ（96ドットで2.4マス）と同じ細かさ＝1マスに約40ドットへ縮め、色の段を減らしてから、補間なしで張る
const PIX_DOT = 40, PIX_LEVELS = 9;
// マスの高さ（map.heights）。1段＝HU マス。吹き抜けの2階の通路と階段（2026-11-22）
const HU = 0.7;
const heightOf = (map, x, y) => { const row = map?.heights?.[y]; const c = row ? [...row][x] : undefined; return c === undefined ? 0 : Number(c) || 0; };
/** 歩いている途中の高さ（となりのマスとの間をなめらかに） */
function heightLerp(map, x, y) { if (!map?.heights) return 0; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const h = (a, b) => heightOf(map, a, b); return (h(x0, y0) * (1 - fx) + h(x0 + 1, y0) * fx) * (1 - fy) + (h(x0, y0 + 1) * (1 - fx) + h(x0 + 1, y0 + 1) * fx) * fy; }
let PIXROOM = false;
function pixCanvas(c, tilesW, tilesH, shade = false) {
  const w = Math.max(4, Math.round(tilesW * PIX_DOT)), h = Math.max(4, Math.round(tilesH * PIX_DOT));
  return canvas(w, h, (g) => { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data, q = 255 / (PIX_LEVELS - 1);
    if (shade) { // コントラストと影（2026-11-22 作者「ドットはもっとコントラストや影をつけて」）：明るさだけを変えて色味は残す
      const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; let sum = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = (x + dx + w) % w, yy = (y + dy + h) % h; sum += L[yy * w + xx]; n++; }
        const l = L[i], avg = sum / n;
        let nl = 255 * Math.pow(l / 255, 1.35);            // 中間の明るさを下げる（影を深く）
        nl = (nl - 118) * 1.3 + 118;                         // コントラスト
        if (avg - l > 10) nl -= (avg - l) * 1.2;             // まわりより暗い所（すき間・目地・木目の線）をもう一段暗く
        const k = l > 1 ? Math.max(0, nl) / l : 0;
        for (let c2 = 0; c2 < 3; c2++) d[i * 4 + c2] = Math.max(0, Math.min(255, d[i * 4 + c2] * k));
      }
    }
    for (let i = 0; i < d.length; i += 4) { for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / q) * q; d[i + 3] = d[i + 3] < 128 ? 0 : 255; }
    g.putImageData(im, 0, 0); });
}
/** ドット絵の手ざわり（近くはドットがくっきり、遠くはなめらかに縮める） */
function pixTex(c, tilesW, tilesH = tilesW) { const t = texOf(pixCanvas(c, tilesW, tilesH)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; return t; }

// ---- 板の絵（仮）。試作と同じ描き方：単色の形＋紙のざらつき ----
function houseArt(w, h, wall, roof, seed, opts = {}) {
  return canvas(w * PX, h * PX, (g, W, H) => {
    const R = rnd(seed), roofH = H * 0.36;
    g.fillStyle = roof; g.beginPath(); g.moveTo(W * 0.03, roofH); g.lineTo(W / 2, H * 0.04); g.lineTo(W * 0.97, roofH); g.fill();
    g.fillStyle = wall; g.fillRect(W * 0.08, roofH - 4, W * 0.84, H - roofH + 4);
    const cols = Math.max(2, Math.round(w / 1.6)), rows = Math.max(1, Math.round((h - 2) / 1.4));
    const ww = W * 0.84 / cols * 0.42, wh = (H - roofH) / (rows + 1) * 0.5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = W * 0.08 + (c + 0.5) * W * 0.84 / cols - ww / 2, y = roofH + (r + 0.4) * (H - roofH) / (rows + 1);
      if (opts.door && r === rows - 1 && c === Math.floor(cols / 2)) continue;
      g.fillStyle = '#ffd77a'; g.fillRect(x, y, ww, wh); g.fillStyle = '#3a2412'; g.fillRect(x + ww / 2 - 2, y, 4, wh); g.fillRect(x, y + wh / 2 - 2, ww, 4);
    }
    g.fillStyle = '#3a2412'; const dw = Math.min(W * 0.18, 70); g.fillRect(W / 2 - dw / 2, H - H * 0.24, dw, H * 0.24);
    if (opts.sign) { // 吊り看板（模様だけ。文字は入れない）
      g.fillStyle = '#2a1a10'; g.fillRect(W * 0.62, roofH + 8, W * 0.2, 5);
      g.fillStyle = '#1f4a46'; g.fillRect(W * 0.66, roofH + 14, W * 0.14, H * 0.1); g.strokeStyle = '#d9b25e'; g.lineWidth = 3; g.strokeRect(W * 0.66 + 4, roofH + 18, W * 0.14 - 8, H * 0.1 - 8);
    }
    noise(g, W, H, R, 20);
    g.strokeStyle = 'rgba(40,24,10,.6)'; g.lineWidth = 3; g.strokeRect(W * 0.08, roofH - 4, W * 0.84, H - roofH + 4);
  });
}
/** 町家（景観案）：石の一階・漆喰と木組みの上の階・鎧戸の窓・出窓の花鉢・三角屋根。floors＝階の数。inn＝宿（一階の食堂の大きな窓と入口の段） */
function townHouseArt(w, h, wall, roof, seed, floors, inn = false) {
  return canvas(w * PX, h * PX, (g, W, H) => {
    const R = rnd(seed), roofH = H * (0.26 + R() * 0.06), peak = H * (0.02 + R() * 0.05), fH = (H - roofH) / floors;
    g.fillStyle = roof; g.beginPath(); g.moveTo(0, roofH); g.lineTo(W / 2, peak); g.lineTo(W, roofH); g.fill();
    g.fillStyle = 'rgba(255,220,180,.18)'; for (let k = 0; k < 4; k++) g.fillRect(W * (0.2 + R() * 0.5), roofH * (0.4 + R() * 0.5), W * 0.08, 6); // 直した瓦（色が新しい）
    g.fillStyle = '#3a2a22'; g.fillRect(W * (0.68 + R() * 0.12), peak + roofH * 0.15, W * 0.07, roofH * 0.5); // 煙突
    for (let f = 0; f < floors; f++) { // 上の階：漆喰と木組み、一階：石
      const y0 = roofH + f * fH, ground = f === floors - 1;
      g.fillStyle = ground ? '#8e8a82' : wall; g.fillRect(W * 0.04, y0, W * 0.92, fH);
      if (ground) { g.strokeStyle = 'rgba(40,36,30,.35)'; g.lineWidth = 2; for (let y = y0; y < y0 + fH; y += 14) { g.beginPath(); g.moveTo(W * 0.04, y); g.lineTo(W * 0.96, y); g.stroke(); } g.fillStyle = 'rgba(60,44,30,.28)'; g.fillRect(W * 0.04, H - fH * 0.25, W * 0.92, fH * 0.25); }
      else { g.fillStyle = '#4a2e1e'; g.fillRect(W * 0.04, y0, W * 0.92, 6); for (let x = 0; x <= 4; x++) g.fillRect(W * 0.04 + x * W * 0.92 / 4 - 3, y0, 6, fH); g.lineWidth = 5; g.strokeStyle = '#4a2e1e'; g.beginPath(); g.moveTo(W * 0.04, y0 + fH); g.lineTo(W * 0.27, y0); g.moveTo(W * 0.96, y0 + fH); g.lineTo(W * 0.73, y0); g.stroke(); }
      const n = Math.max(2, Math.round(w / 2)), ww = W * 0.92 / n * 0.36, wh = fH * 0.5;
      for (let c = 0; c < n; c++) {
        const x = W * 0.04 + (c + 0.5) * W * 0.92 / n - ww / 2, y = y0 + fH * 0.22;
        if (ground && c === Math.floor(n / 2)) continue; // 入口
        if (ground && inn) { g.fillStyle = '#ffc870'; g.fillRect(x - ww * 0.3, y, ww * 1.6, wh * 1.1); g.fillStyle = '#3a2412'; g.fillRect(x + ww * 0.5 - 2, y, 4, wh * 1.1); continue; } // 食堂の大きな窓
        g.fillStyle = '#ffd77a'; g.fillRect(x, y, ww, wh); g.fillStyle = '#3a2412'; g.fillRect(x + ww / 2 - 2, y, 4, wh); g.fillRect(x, y + wh / 2 - 2, ww, 4);
        g.fillStyle = '#5a3a22'; g.fillRect(x - ww * 0.42, y, ww * 0.38, wh); g.fillRect(x + ww * 1.04, y, ww * 0.38, wh); // 鎧戸
        if (!ground && R() < 0.5) { g.fillStyle = '#7a5636'; g.fillRect(x - 4, y + wh, ww + 8, 8); g.fillStyle = R() < 0.5 ? '#d27a8a' : '#e8c860'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + ww * (0.1 + k * 0.27), y + wh - 2, 5, 0, 7); g.fill(); } } // 花鉢
      }
      if (ground) { const dw = Math.min(W * 0.2, 80); g.fillStyle = '#3a2412'; g.fillRect(W / 2 - dw / 2, H - fH * 0.78, dw, fH * 0.78); g.fillStyle = '#6a4a2a'; g.fillRect(W / 2 - dw / 2 + 5, H - fH * 0.74, dw - 10, fH * 0.74);
        if (inn) { g.fillStyle = '#9a948a'; g.fillRect(W / 2 - dw * 0.75, H - 10, dw * 1.5, 10); } } // 入口の段
    }
    noise(g, W, H, R, 18);
    g.strokeStyle = 'rgba(40,24,10,.6)'; g.lineWidth = 3; g.strokeRect(W * 0.04, roofH, W * 0.92, H - roofH);
  });
}
/** 店の布の庇：上に張り出す布（ふちは波形）と細い支柱。下は透明（下をくぐって歩ける） */
function awningArt(w, h, c1, c2) {
  return canvas(w * PX, h * PX, (g, W, H) => {
    g.fillStyle = '#4a3020'; g.fillRect(W * 0.04, H * 0.2, 6, H * 0.8); g.fillRect(W * 0.96 - 6, H * 0.2, 6, H * 0.8);
    const n = Math.max(4, Math.round(w * 2)), sw = W / n;
    for (let k = 0; k < n; k++) { g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.moveTo(k * sw, 0); g.lineTo((k + 1) * sw, 0); g.lineTo((k + 1) * sw, H * 0.24); g.quadraticCurveTo((k + 0.5) * sw, H * 0.34, k * sw, H * 0.24); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, W, 6); noise(g, W, H, rnd(w * 7 + c1.length), 14);
  });
}
/** 吊り看板：壁から張り出す鉄の腕木に吊るした木の板。文字は入れず、絵（鹿・パン・靴・杯）だけ。板の上のほうにだけ描き、下は透明 */
function signArt(w, h, kind, big = false) {
  return canvas(w * PX, h * PX, (g, W, H) => {
    const bw = W * (big ? 0.9 : 0.78), bh = Math.min(H * 0.24, bw * 0.75), x0 = (W - bw) / 2, y0 = H * 0.06 + 12;
    g.fillStyle = '#1c1c22'; g.fillRect(0, H * 0.04, W, 7); g.fillRect(x0 + bw * 0.2, H * 0.04, 3, y0 - H * 0.04); g.fillRect(x0 + bw * 0.8 - 3, H * 0.04, 3, y0 - H * 0.04);
    g.fillStyle = big ? '#2a3a4a' : '#7a5636'; g.fillRect(x0, y0, bw, bh); g.strokeStyle = big ? '#c8ccd4' : '#3a2412'; g.lineWidth = 4; g.strokeRect(x0 + 3, y0 + 3, bw - 6, bh - 6);
    const cx = W / 2, cy = y0 + bh / 2, s = bh * 0.36;
    g.fillStyle = big ? '#dfe4ec' : '#f0e2c0'; g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(3, s * 0.12); g.lineCap = 'round';
    if (kind === 'deer') { // 銀色の鹿（横向きのかげ絵）
      g.beginPath(); g.ellipse(cx, cy + s * 0.25, s * 0.7, s * 0.32, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(cx + s * 0.45, cy + s * 0.05); g.lineTo(cx + s * 0.72, cy - s * 0.55); g.lineTo(cx + s * 0.92, cy - s * 0.5); g.lineTo(cx + s * 0.7, cy + s * 0.1); g.fill();
      for (const lx of [-0.5, -0.25, 0.3, 0.5]) g.fillRect(cx + s * lx, cy + s * 0.4, s * 0.1, s * 0.55);
      g.beginPath(); g.moveTo(cx + s * 0.75, cy - s * 0.55); g.lineTo(cx + s * 0.6, cy - s * 1.0); g.moveTo(cx + s * 0.66, cy - s * 0.8); g.lineTo(cx + s * 0.45, cy - s * 0.95); g.moveTo(cx + s * 0.8, cy - s * 0.58); g.lineTo(cx + s * 1.0, cy - s * 1.0); g.stroke();
    } else if (kind === 'bread') { g.beginPath(); g.ellipse(cx, cy, s * 0.9, s * 0.5, 0, 0, 7); g.fill(); g.strokeStyle = '#7a5636'; for (const k of [-0.4, 0, 0.4]) { g.beginPath(); g.moveTo(cx + s * (k - 0.15), cy - s * 0.25); g.lineTo(cx + s * (k + 0.15), cy + s * 0.2); g.stroke(); } }
    else if (kind === 'shoe') { g.beginPath(); g.moveTo(cx - s * 0.5, cy - s * 0.7); g.lineTo(cx - s * 0.1, cy - s * 0.7); g.lineTo(cx, cy); g.lineTo(cx + s * 0.8, cy + s * 0.2); g.lineTo(cx + s * 0.8, cy + s * 0.5); g.lineTo(cx - s * 0.6, cy + s * 0.5); g.fill(); }
    else if (kind === 'cup') { g.beginPath(); g.moveTo(cx - s * 0.6, cy - s * 0.7); g.lineTo(cx + s * 0.6, cy - s * 0.7); g.lineTo(cx + s * 0.15, cy); g.lineTo(cx - s * 0.15, cy); g.fill(); g.fillRect(cx - s * 0.08, cy, s * 0.16, s * 0.5); g.fillRect(cx - s * 0.4, cy + s * 0.5, s * 0.8, s * 0.14); }
    noise(g, W, H, rnd(41), 12);
  });
}
/**
 * いろいろな町家（2026-11-22 作者「家の種類を増やしたい。同じものが並びすぎている」）。板の位置から決まる seed で、
 * 壁・屋根・鎧戸の色、屋根の形（正面が三角／横向きの屋根に屋根裏窓／段のある破風）、木組みの模様（筋かい・X・縦）、
 * 一階（店の間口／扉と窓／アーチの門）、上の階の張り出し、煙突、花鉢を変える。階の数は板の高さから。景観案の色の範囲の中で選ぶ
 */
function variedHouseArt(w, h, seed) {
  return canvas(w * PX, h * PX, (g, W, H) => {
    const R = rnd(Math.imul(seed + 7, 2654435761) >>> 0), pick = (a) => a[Math.floor(R() * a.length)];
    const wall = pick(['#e6dcc4', '#cfcabe', '#d9c08a', '#e8d8b8', '#c9c2b0', '#dcc9a0', '#e2d2b0']);
    const roof = pick(['#8a3e2a', '#6a2e22', '#4e3426', '#7a4a2e', '#5a3a30', '#93482e']);
    const shut = pick(['#5a3a22', '#3e5a3a', '#4a5a6a', '#6a2e22', '#6a5030']);
    const wood = pick(['#4a2e1e', '#3a2418', '#5a3a26']);
    const floors = Math.max(1, Math.min(3, Math.round((h - 1.4) / 1.7)));
    const roofKind = pick(['gable', 'gable', 'eaves', 'stepped']), timber = pick(['diag', 'x', 'vert']), ground = pick(['shop', 'door', 'door', 'arch']);
    const jetty = floors > 1 && R() < 0.5 ? W * 0.025 : 0;
    const roofH = H * (roofKind === 'eaves' ? 0.2 + R() * 0.05 : 0.24 + R() * 0.08), fH = (H - roofH) / floors;
    // 屋根
    g.fillStyle = roof;
    if (roofKind === 'gable') { g.beginPath(); g.moveTo(0, roofH); g.lineTo(W / 2, H * (0.01 + R() * 0.04)); g.lineTo(W, roofH); g.fill(); }
    else if (roofKind === 'stepped') { const n = 3, sw = W / (2 * n); g.beginPath(); g.moveTo(0, roofH); for (let k = 0; k < n; k++) { const y = roofH - (k + 1) * roofH / (n + 0.4); g.lineTo(k * sw, y); g.lineTo((k + 1) * sw, y); } for (let k = n - 1; k >= 0; k--) { const y = roofH - (k + 1) * roofH / (n + 0.4); g.lineTo(W - (k + 1) * sw, y); g.lineTo(W - k * sw, y); } g.lineTo(W, roofH); g.fill(); }
    else { g.beginPath(); g.moveTo(0, roofH); g.lineTo(W * 0.08, roofH * 0.15); g.lineTo(W * 0.92, roofH * 0.15); g.lineTo(W, roofH); g.fill(); // 横向きの屋根＋屋根裏窓
      const dx = W * (0.3 + R() * 0.4); g.fillStyle = wall; g.fillRect(dx - W * 0.08, roofH * 0.35, W * 0.16, roofH * 0.55); g.fillStyle = roof; g.beginPath(); g.moveTo(dx - W * 0.11, roofH * 0.4); g.lineTo(dx, roofH * 0.12); g.lineTo(dx + W * 0.11, roofH * 0.4); g.fill(); g.fillStyle = '#ffd77a'; g.fillRect(dx - W * 0.04, roofH * 0.5, W * 0.08, roofH * 0.32); }
    g.fillStyle = 'rgba(255,220,180,.16)'; for (let k = 0; k < 3; k++) g.fillRect(W * (0.15 + R() * 0.6), roofH * (0.45 + R() * 0.45), W * 0.07, 5); // 直した瓦
    if (R() < 0.8) { g.fillStyle = '#3a2a22'; const cx = W * (R() < 0.5 ? 0.18 + R() * 0.12 : 0.68 + R() * 0.12); g.fillRect(cx, roofH * 0.1, W * 0.06, roofH * 0.55); } // 煙突
    // 階
    for (let f = 0; f < floors; f++) {
      const ground1 = f === floors - 1, inset = ground1 ? W * 0.04 + jetty : W * 0.04, y0 = roofH + f * fH, ww0 = W - inset * 2;
      g.fillStyle = ground1 ? pick(['#8e8a82', '#9a9284', '#868078']) : wall; g.fillRect(inset, y0, ww0, fH);
      if (ground1) { g.strokeStyle = 'rgba(40,36,30,.33)'; g.lineWidth = 2; for (let y = y0 + 12; y < y0 + fH; y += 13) { g.beginPath(); g.moveTo(inset, y); g.lineTo(W - inset, y); g.stroke(); } g.fillStyle = 'rgba(60,44,30,.28)'; g.fillRect(inset, H - fH * 0.22, ww0, fH * 0.22); }
      else { g.fillStyle = wood; g.fillRect(inset, y0, ww0, 6); g.fillRect(inset, y0 + fH - 6, ww0, 6); const cols = Math.max(3, Math.round(w)); for (let x = 0; x <= cols; x++) g.fillRect(inset + x * ww0 / cols - 3, y0, 6, fH);
        g.strokeStyle = wood; g.lineWidth = 5; g.beginPath();
        for (let x = 0; x < cols; x += 2) { const x0 = inset + x * ww0 / cols, x1 = inset + (x + 1) * ww0 / cols; if (timber === 'diag') { g.moveTo(x0, y0 + fH); g.lineTo(x1, y0); } else if (timber === 'x') { g.moveTo(x0, y0); g.lineTo(x1, y0 + fH); g.moveTo(x0, y0 + fH); g.lineTo(x1, y0); } }
        g.stroke(); }
      // 窓
      const n = Math.max(1, Math.round(w / (1.6 + R() * 0.8))), ww = ww0 / n * 0.36, wh = fH * (0.42 + R() * 0.12);
      for (let c = 0; c < n; c++) {
        const x = inset + (c + 0.5) * ww0 / n - ww / 2, y = y0 + fH * 0.2;
        if (ground1 && (ground !== 'shop' ? c === Math.floor(n / 2) : true)) continue;
        g.fillStyle = '#ffd77a'; g.fillRect(x, y, ww, wh); g.fillStyle = '#3a2412'; g.fillRect(x + ww / 2 - 2, y, 4, wh); g.fillRect(x, y + wh / 2 - 2, ww, 4);
        if (R() < 0.75) { g.fillStyle = shut; g.fillRect(x - ww * 0.42, y, ww * 0.38, wh); g.fillRect(x + ww * 1.04, y, ww * 0.38, wh); }
        if (!ground1 && R() < 0.4) { g.fillStyle = '#7a5636'; g.fillRect(x - 4, y + wh, ww + 8, 8); g.fillStyle = pick(['#d27a8a', '#e8c860', '#c86a5a', '#e0e0f0']); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + ww * (0.1 + k * 0.27), y + wh - 2, 5, 0, 7); g.fill(); } }
      }
      if (ground1) { // 一階の顔
        if (ground === 'shop') { const sx = inset + ww0 * 0.1, sw = ww0 * 0.8, sy = y0 + fH * 0.25; g.fillStyle = '#3a2412'; g.fillRect(sx, sy, sw, fH * 0.75); g.fillStyle = '#ffc870'; g.fillRect(sx + 6, sy + 6, sw - 12, fH * 0.38); g.fillStyle = '#7a5636'; g.fillRect(sx, sy + fH * 0.5, sw, 8); for (let k = 0; k < 5; k++) { g.fillStyle = pick(['#c9a25e', '#a8443a', '#6a8a4a', '#d8c090']); g.beginPath(); g.arc(sx + sw * (0.12 + k * 0.19), sy + fH * 0.48, fH * 0.06, 0, 7); g.fill(); } }
        else if (ground === 'arch') { const aw = Math.min(ww0 * 0.32, 110), ax = W / 2 - aw / 2, ay = y0 + fH * 0.2; g.fillStyle = '#2e1e14'; g.beginPath(); g.moveTo(ax, H); g.lineTo(ax, ay + aw / 2); g.arc(W / 2, ay + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, H); g.fill(); g.strokeStyle = '#6a6458'; g.lineWidth = 6; g.beginPath(); g.arc(W / 2, ay + aw / 2, aw / 2 + 3, Math.PI, 0); g.stroke(); }
        else { const dw = Math.min(ww0 * 0.2, 80); g.fillStyle = '#3a2412'; g.fillRect(W / 2 - dw / 2, H - fH * 0.78, dw, fH * 0.78); g.fillStyle = pick(['#6a4a2a', '#4a5a3a', '#5a3a2a', '#3e4a5a']); g.fillRect(W / 2 - dw / 2 + 5, H - fH * 0.74, dw - 10, fH * 0.74); }
      }
      if (jetty && f === floors - 2) { g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(W * 0.04, y0 + fH, W * 0.92, 7); } // 張り出した上の階の下の影
    }
    noise(g, W, H, R, 18);
    g.strokeStyle = 'rgba(40,24,10,.55)'; g.lineWidth = 3; g.strokeRect(W * 0.04, roofH, W * 0.92, H - roofH);
  });
}
const ART = {
  'inn-front': (w, h) => houseArt(w, h, '#9a5a3a', '#4a2a2a', 1, { sign: true, door: true }),
  // 町の家は、どれも板ごとにちがう形・色になる（2026-11-22 作者「同じものが並びすぎている」）。種類の名前は、元の大きさの目安として残す
  'house-front': (w, h, s) => variedHouseArt(w, h, s),
  'house-small': (w, h, s) => variedHouseArt(w, h, s),
  stall: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 露店：しまの日よけ・台・小さな灯り
    g.fillStyle = '#5a3a22'; g.fillRect(W * 0.08, H * 0.25, 8, H * 0.75); g.fillRect(W * 0.92 - 8, H * 0.25, 8, H * 0.75);
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#e8dcc0' : '#8a2a22'; g.beginPath(); const x0 = W * 0.04 + k * W * 0.115; g.moveTo(x0, H * 0.06); g.lineTo(x0 + W * 0.115, H * 0.06); g.lineTo(x0 + W * 0.115, H * 0.3); g.quadraticCurveTo(x0 + W * 0.0575, H * 0.38, x0, H * 0.3); g.fill(); }
    g.fillStyle = '#7a5636'; g.fillRect(W * 0.06, H * 0.62, W * 0.88, H * 0.38); g.fillStyle = '#c9a25e'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(W * (0.18 + k * 0.16), H * 0.58, H * 0.06, 0, 7); g.fill(); }
    g.fillStyle = '#ffd77a'; g.fillRect(W * 0.46, H * 0.32, W * 0.08, H * 0.12); noise(g, W, H, rnd(4), 18);
  }),
  planter: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 植えこみ：木の箱としげみ・花
    for (const [x, y, r, c] of [[0.3, 0.45, 0.3, '#2f5a3a'], [0.55, 0.35, 0.34, '#3a6a44'], [0.78, 0.5, 0.26, '#2a4f34']]) { g.fillStyle = c; g.beginPath(); g.arc(W * x, H * y, Math.min(W, H) * r, 0, 7); g.fill(); }
    const R = rnd(6); for (let k = 0; k < 14; k++) { g.fillStyle = k % 3 ? '#e0a0b8' : '#f2e08a'; g.beginPath(); g.arc(W * (0.12 + R() * 0.76), H * (0.15 + R() * 0.45), 5, 0, 7); g.fill(); }
    g.fillStyle = '#6a4a2a'; g.fillRect(W * 0.04, H * 0.66, W * 0.92, H * 0.34); g.strokeStyle = '#3a2412'; g.lineWidth = 3; g.strokeRect(W * 0.04, H * 0.66, W * 0.92, H * 0.34); noise(g, W, H, R, 16);
  }),
  'foreground-branch': (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 手前の枝（暗いしげみ）
    g.fillStyle = '#2a1c14'; g.fillRect(0, H * 0.55, W * 0.7, 10);
    for (const [x, y, r] of [[0.15, 0.4, 0.3], [0.4, 0.35, 0.28], [0.62, 0.5, 0.22], [0.25, 0.7, 0.26]]) { g.fillStyle = '#1e3a28'; g.beginPath(); g.arc(W * x, H * y, Math.min(W, H) * r, 0, 7); g.fill(); }
    noise(g, W, H, rnd(9), 14);
  }),
  'night-sky-ring': (w, h) => canvas(w * PX / 2, h * PX / 2, (g, W, H) => { // 奥の夜空と遠い屋根（仮）
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b0d22'); gr.addColorStop(1, '#1d2244'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const R = rnd(11); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(255,248,220,${0.3 + R() * 0.6})`; g.fillRect(R() * W, R() * H * 0.7, 2, 2); }
    g.strokeStyle = 'rgba(220,210,255,.28)'; g.lineWidth = 3; g.beginPath(); g.ellipse(W * 0.5, H * 0.2, W * 0.32, H * 0.08, -0.12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#141628'; g.beginPath(); g.moveTo(0, H); let x = 0; while (x < W) { const bw = 20 + R() * 50, bh = H * (0.12 + R() * 0.2); g.lineTo(x, H - bh); g.lineTo(x + bw / 2, H - bh - 14); g.lineTo(x + bw, H - bh); x += bw; } g.lineTo(W, H); g.fill();
  }),
  'inn-back-wall': (w, h) => canvas(w * PX / 2, h * PX / 2, (g, W, H) => { // 宿の奥の壁：しっくいと梁・棚・窓
    g.fillStyle = '#c9b48e'; g.fillRect(0, 0, W, H); g.fillStyle = '#5a3a22'; for (let x = 0; x < W; x += W / 8) g.fillRect(x, 0, 8, H); g.fillRect(0, H * 0.15, W, 8);
    g.fillStyle = '#2a3048'; g.fillRect(W * 0.45, H * 0.3, W * 0.1, H * 0.35); g.fillStyle = '#ffd77a'; g.fillRect(W * 0.47, H * 0.33, W * 0.06, H * 0.29);
    g.fillStyle = '#6a4a2a'; g.fillRect(W * 0.1, H * 0.45, W * 0.2, 6); g.fillRect(W * 0.7, H * 0.45, W * 0.2, 6); noise(g, W, H, rnd(13), 18);
  }),
  // 銀鹿亭前の通り（2026-11-22 作者が貼った景観案「銀鹿亭の入口と屋台がある通りを一つの見開きに」）の仮の板。
  // 石の一階＋漆喰と木組みの上の階、赤茶・焦げ茶の屋根。GPT の手ざわりが届いたら入れかえる
  'house-tall': (w, h, s) => variedHouseArt(w, h, s),
  'house-mid': (w, h, s) => variedHouseArt(w, h, s),
  'house-ochre': (w, h, s) => variedHouseArt(w, h, s),
  'inn-tall': (w, h) => townHouseArt(w, h, '#efe4ca', '#6a2e22', 24, 3, true),
  'awning-green': (w, h) => awningArt(w, h, '#3e5a3a', '#e8dcc0'),
  'awning-red': (w, h) => awningArt(w, h, '#8a3a30', '#e8dcc0'),
  'awning-wheat': (w, h) => awningArt(w, h, '#c9a860', '#f2ead4'),
  'sign-deer': (w, h) => signArt(w, h, 'deer', true),
  'sign-bread': (w, h) => signArt(w, h, 'bread'),
  'sign-shoe': (w, h) => signArt(w, h, 'shoe'),
  'sign-cup': (w, h) => signArt(w, h, 'cup'),
  lamp: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 導機灯：黒い鉄の支柱と透明な覆い、中の淡い光
    g.fillStyle = '#1c1c22'; g.fillRect(W * 0.44, H * 0.2, W * 0.12, H * 0.8); g.fillRect(W * 0.3, H - 10, W * 0.4, 10); g.fillRect(W * 0.3, H * 0.2, W * 0.4, 6);
    g.fillStyle = 'rgba(210,230,255,.35)'; g.fillRect(W * 0.32, H * 0.06, W * 0.36, H * 0.14); g.fillStyle = '#eef6ff'; g.beginPath(); g.arc(W / 2, H * 0.13, W * 0.1, 0, 7); g.fill();
    g.strokeStyle = '#1c1c22'; g.lineWidth = 4; g.strokeRect(W * 0.32, H * 0.06, W * 0.36, H * 0.14); g.fillStyle = '#1c1c22'; g.beginPath(); g.moveTo(W * 0.28, H * 0.06); g.lineTo(W / 2, H * 0.01); g.lineTo(W * 0.72, H * 0.06); g.fill();
  }),
  crates: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 荷箱と麻袋（旅人の荷物・店の積み荷）
    const box = (x, y, bw, bh, c) => { g.fillStyle = c; g.fillRect(x, y, bw, bh); g.strokeStyle = '#3a2412'; g.lineWidth = 3; g.strokeRect(x, y, bw, bh); g.beginPath(); g.moveTo(x, y); g.lineTo(x + bw, y + bh); g.stroke(); };
    box(W * 0.05, H * 0.45, W * 0.4, H * 0.55, '#9a6a3a'); box(W * 0.12, H * 0.05, W * 0.3, H * 0.4, '#a87a46');
    g.fillStyle = '#c9b48a'; g.beginPath(); g.ellipse(W * 0.7, H * 0.68, W * 0.22, H * 0.32, 0, 0, 7); g.fill(); g.fillStyle = '#8a7650'; g.fillRect(W * 0.64, H * 0.34, W * 0.12, 6); noise(g, W, H, rnd(31), 16);
  }),
  cart: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 荷車：木の車輪と幌のかかった積み荷（馬は描かない）
    g.fillStyle = '#d8ccb0'; g.beginPath(); g.moveTo(W * 0.1, H * 0.62); g.quadraticCurveTo(W * 0.45, H * 0.02, W * 0.82, H * 0.62); g.fill(); g.strokeStyle = '#8a7a5a'; g.lineWidth = 3; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(W * (0.1 + k * 0.18), H * 0.62); g.lineTo(W * (0.12 + k * 0.17), H * 0.22); g.stroke(); }
    g.fillStyle = '#6a4a2a'; g.fillRect(W * 0.06, H * 0.6, W * 0.8, H * 0.12); g.fillRect(W * 0.84, H * 0.64, W * 0.15, 6);
    for (const x of [0.24, 0.66]) { g.fillStyle = '#4a3020'; g.beginPath(); g.arc(W * x, H * 0.8, H * 0.18, 0, 7); g.fill(); g.fillStyle = '#7a5636'; g.beginPath(); g.arc(W * x, H * 0.8, H * 0.06, 0, 7); g.fill(); }
    noise(g, W, H, rnd(32), 16);
  }),
  tree: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 通りの木（石の囲いつき）
    g.fillStyle = '#5a3a22'; g.fillRect(W * 0.45, H * 0.45, W * 0.1, H * 0.45);
    for (const [x, y, r, c] of [[0.35, 0.32, 0.26, '#2f5a3a'], [0.6, 0.26, 0.28, '#3a6a44'], [0.5, 0.14, 0.22, '#467a4e'], [0.7, 0.42, 0.2, '#2a4f34'], [0.28, 0.48, 0.18, '#2a4f34']]) { g.fillStyle = c; g.beginPath(); g.arc(W * x, H * y, W * r, 0, 7); g.fill(); }
    g.fillStyle = '#8a8478'; g.fillRect(W * 0.25, H * 0.88, W * 0.5, H * 0.12); noise(g, W, H, rnd(33), 16);
  }),
  // 見えている敵（仮）：森のかげにひそむ獣のかげ絵と光る目、まわりのもや（2026-11-22 作者「森に敵が見えていて、ぶつかると戦闘」）。敵の正式な絵は4室へ
  monster: (w, h) => canvas(w * PX, h * PX, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H * 0.72, 4, W / 2, H * 0.72, W * 0.6); gr.addColorStop(0, 'rgba(160,100,220,.7)'); gr.addColorStop(1, 'rgba(160,100,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); // もや（見つけやすいよう強め）
    g.fillStyle = '#1a1420'; g.beginPath(); // 低くかまえた獣
    g.moveTo(W * 0.12, H * 0.98); g.quadraticCurveTo(W * 0.1, H * 0.7, W * 0.3, H * 0.62); g.quadraticCurveTo(W * 0.5, H * 0.52, W * 0.66, H * 0.58);
    g.lineTo(W * 0.74, H * 0.5); g.lineTo(W * 0.78, H * 0.56); g.lineTo(W * 0.84, H * 0.49); g.lineTo(W * 0.86, H * 0.6); // 耳
    g.quadraticCurveTo(W * 0.96, H * 0.68, W * 0.92, H * 0.78); g.lineTo(W * 0.8, H * 0.8); g.lineTo(W * 0.78, H * 0.98); g.lineTo(W * 0.66, H * 0.98); g.lineTo(W * 0.64, H * 0.82);
    g.lineTo(W * 0.36, H * 0.84); g.lineTo(W * 0.34, H * 0.98); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(206,170,255,.75)'; g.lineWidth = 4; g.stroke(); // 暗い土の上でも見えるよう、うす紫のふち
    g.strokeStyle = '#1a1420'; g.lineWidth = 6; g.beginPath(); g.moveTo(W * 0.14, H * 0.7); g.quadraticCurveTo(W * 0.02, H * 0.6, W * 0.06, H * 0.48); g.stroke(); // しっぽ
    for (const [x, y] of [[0.8, 0.64], [0.87, 0.65]]) { g.fillStyle = 'rgba(255,214,90,.35)'; g.beginPath(); g.arc(W * x, H * y, 7, 0, 7); g.fill(); g.fillStyle = '#ffd65a'; g.beginPath(); g.arc(W * x, H * y, 3, 0, 7); g.fill(); } // 光る目
    noise(g, W, H, rnd(51), 12);
  }),
  // 試験区画（森・ダンジョン）の仮の板。試作の描き方と同じ
  pine: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { g.fillStyle = '#4a3020'; g.fillRect(W / 2 - W * 0.05, H * 0.78, W * 0.1, H * 0.22); g.fillStyle = '#244a34';
    for (let k = 0; k < 4; k++) { const y = H * (0.12 + k * 0.17), r = W * (0.2 + k * 0.09); g.beginPath(); g.moveTo(W / 2, y - H * 0.09); g.lineTo(W / 2 + r, y + H * 0.15); g.lineTo(W / 2 - r, y + H * 0.15); g.fill(); } noise(g, W, H, rnd(12), 16); }),
  rock: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { g.fillStyle = '#6a6c70'; g.beginPath(); g.moveTo(W * 0.05, H); g.quadraticCurveTo(W * 0.1, H * 0.2, W * 0.45, H * 0.14); g.quadraticCurveTo(W * 0.92, H * 0.14, W * 0.96, H); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(W * 0.4, H * 0.36, W * 0.2, H * 0.1, -0.3, 0, 7); g.fill(); noise(g, W, H, rnd(7), 24); }),
  bush: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { for (const [x, y, r, c] of [[0.27, 0.64, 0.36, '#2f5a3a'], [0.55, 0.54, 0.43, '#3a6a44'], [0.77, 0.68, 0.32, '#2a4f34']]) { g.fillStyle = c; g.beginPath(); g.arc(W * x, H * y, H * r, 0, 7); g.fill(); } noise(g, W, H, rnd(8), 16); }),
  'dungeon-gate': (w, h) => canvas(w * PX, h * PX, (g, W, H) => { // 岩肌に開いた石のアーチ・奥の暗がり・小さな灯り（試作の入口と同じ形）
    g.fillStyle = '#4a4a50'; g.beginPath(); g.moveTo(0, H); g.lineTo(W * 0.04, H * 0.3); g.quadraticCurveTo(W * 0.5, -H * 0.05, W * 0.96, H * 0.3); g.lineTo(W, H); g.fill();
    g.fillStyle = '#5a5a60'; g.beginPath(); g.moveTo(W * 0.18, H); g.lineTo(W * 0.18, H * 0.48); g.quadraticCurveTo(W / 2, H * 0.1, W * 0.82, H * 0.48); g.lineTo(W * 0.82, H); g.fill();
    g.fillStyle = '#0a0810'; g.beginPath(); g.moveTo(W * 0.3, H); g.lineTo(W * 0.3, H * 0.56); g.quadraticCurveTo(W / 2, H * 0.28, W * 0.7, H * 0.56); g.lineTo(W * 0.7, H); g.fill();
    g.fillStyle = '#ffcf6a'; g.beginPath(); g.arc(W / 2, H * 0.66, W * 0.025, 0, 7); g.fill(); noise(g, W, H, rnd(31), 22); }),
  'stone-pillar': (w, h) => canvas(w * PX, h * PX, (g, W, H) => { g.fillStyle = '#5c5a60'; g.fillRect(W * 0.18, 0, W * 0.64, H); g.fillStyle = '#4a484e'; for (let y = 0; y < H; y += H / 7) g.fillRect(W * 0.18, y, W * 0.64, 4);
    g.fillStyle = '#6c6a70'; g.fillRect(W * 0.1, 0, W * 0.8, H * 0.06); g.fillRect(W * 0.1, H * 0.94, W * 0.8, H * 0.06); noise(g, W, H, rnd(15), 22); }),
  'dungeon-back-wall': (w, h) => canvas(w * PX / 2, h * PX / 2, (g, W, H) => { g.fillStyle = '#3e3c44'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.35)';
    for (let y = 0; y < H; y += 18) for (let x = (y / 18) % 2 ? 0 : 20; x < W; x += 40) g.fillRect(x, y, 2, 18); for (let y = 0; y < H; y += 18) g.fillRect(0, y, W, 2);
    g.fillStyle = '#0a0810'; g.beginPath(); g.moveTo(W * 0.42, H); g.lineTo(W * 0.42, H * 0.5); g.quadraticCurveTo(W / 2, H * 0.32, W * 0.58, H * 0.5); g.lineTo(W * 0.58, H); g.fill(); noise(g, W, H, rnd(16), 20); }),
  pillar: (w, h) => canvas(w * PX, h * PX, (g, W, H) => { g.fillStyle = '#5a3a22'; g.fillRect(W * 0.2, 0, W * 0.6, H); g.fillStyle = '#7a5636'; g.fillRect(W * 0.3, 0, W * 0.15, H); noise(g, W, H, rnd(14), 16); }),
};
const genericArt = (w, h, seed) => houseArt(w, h, '#7a6a5a', '#3a2a22', seed);

// ---- 本・部屋の手ざわり ----
// ---- 仮の床（2026-11-22 作者「床を仮に作ってほしい。石畳や森の土」）。マップの stage.floor：cobble＝石畳、soil＝森の土。無ければ羊皮紙のまま ----
// GPT の手ざわり（依頼_ノルンの町テクスチャ_プロンプト.md の石畳）が届いたら入れかえる
const isWallAt = (map, x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.legend[[...map.collision[y]][x]] === 'wall';
function roundRectPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
function cobbleFloor(g, map, T, W, H) { // 石畳：角の丸い四角い石が、少しずつずれながら横の列に並ぶ。目地は暗く、ところどころ草・こけ、欠けた石・直した石
  const R = rnd(71);
  const pat = townPattern(g, 'paved', T, 4); // 町の絵があれば、絵の石畳（1枚＝4マス）
  if (pat) { g.fillStyle = pat; g.fillRect(0, 0, W, H); return; } // 町の絵の石畳（家の下も暗くしない：枠に見えるので）
  g.fillStyle = '#6e665a'; g.fillRect(0, 0, W, H); // 目地
  const rowH = T * 0.42;
  for (let y = 0, row = 0; y < H; y += rowH, row++) {
    let x = -R() * T * 0.5;
    while (x < W) {
      const w = T * (0.42 + R() * 0.32), tone = R();
      const base = tone < 0.35 ? [176, 168, 154] : tone < 0.7 ? [190, 180, 160] : tone < 0.9 ? [164, 160, 152] : [200, 186, 158];
      const v = (R() - 0.5) * 18, c = base.map((k) => Math.max(0, Math.min(255, Math.round(k + v))));
      roundRectPath(g, x + 1.5, y + 1.5, w - 3, rowH - 3, 4); g.fillStyle = `rgb(${c})`; g.fill();
      g.fillStyle = 'rgba(255,250,235,.18)'; g.fillRect(x + 4, y + 2.5, w - 9, 2); // 上のふちの明るさ（すり減り）
      g.fillStyle = 'rgba(40,32,24,.18)'; g.fillRect(x + 3, y + rowH - 5, w - 7, 2); // 下のふちの影
      if (R() < 0.06) { g.fillStyle = 'rgba(60,50,40,.35)'; g.beginPath(); g.arc(x + w * (0.3 + R() * 0.4), y + rowH * 0.5, 2 + R() * 2, 0, 7); g.fill(); } // 欠け
      if (R() < 0.05) { g.fillStyle = 'rgba(220,210,190,.35)'; roundRectPath(g, x + w * 0.2, y + 3, w * 0.5, rowH - 6, 3); g.fill(); } // 直した石
      x += w;
    }
  }
  for (let k = 0; k < (W * H) / 900; k++) { g.fillStyle = R() < 0.5 ? 'rgba(90,120,60,.45)' : 'rgba(110,140,70,.35)'; g.fillRect(R() * W, R() * H, 2 + R() * 3, 1.5); } // 目地の草・こけ
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    if (isWallAt(map, x, y)) { g.fillStyle = 'rgba(50,40,30,.28)'; g.fillRect(x * T, y * T, T, T); continue; } // 家の下（見えない所）は少し暗く
    if (isWallAt(map, x, y - 1) || isWallAt(map, x, y + 1) || isWallAt(map, x - 1, y) || isWallAt(map, x + 1, y)) { // 壁ぎわは泥はねで少し濃く
      const gx = x * T, gy = y * T; g.fillStyle = 'rgba(90,70,50,.10)'; g.fillRect(gx, gy, T, T);
    }
  }
  noise(g, W, H, R, 14);
}
/** 町の石畳でない所：家ぎわ（となりに壁があるマス＝路地・裏道）は踏み固めた土、開けた所は芝生 */
function townYardFloor(g, map, T, W, H, paved) {
  const R = rnd(97);
  // 町の絵の芝生があれば、石畳でない所は芝生を基本にする（2026-11-22 作者「芝生のテクスチャ張っている？」・緑の町）。
  // 物のすぐそば（上下左右のとなりに家・植えこみ・荷箱など）だけ、踏まれて土がのぞく。境目はぼかす
  const gp = townPattern(g, 'grass', T, 4);
  if (gp) {
    g.fillStyle = gp; g.fillRect(0, 0, W, H);
    // 土のしみは別のキャンバスに描いてから、ぼかしは1回だけかける（1つずつぼかすと、町を開くのに1秒かかっていた。2026-11-22 作者「町が出るまで時間がかかる」）
    const dirt = canvas(W, H, (d) => {
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
        if (isWallAt(map, x, y)) continue;
        const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => isWallAt(map, x + dx, y + dy)).length;
        if (!near) continue;
        d.fillStyle = `rgba(122,96,64,${0.35 + near * 0.12})`; d.beginPath(); d.ellipse(x * T + T / 2, y * T + T / 2, T * 0.62, T * 0.5, R() * 3, 0, 7); d.fill();
      }
    });
    g.save(); g.filter = 'blur(6px)'; g.drawImage(dirt, 0, 0); g.restore();
    for (let k = 0; k < (W * H) / 1400; k++) { g.fillStyle = 'rgba(140,130,118,.7)'; g.beginPath(); g.ellipse(R() * W, R() * H, 1.5 + R() * 1.5, 1 + R(), R() * 3, 0, 7); g.fill(); } // 小石
    return;
  }
  g.fillStyle = '#8a6e4c'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < (W * H) / 300; k++) { const r = 4 + R() * 12; g.fillStyle = R() < 0.5 ? 'rgba(70,52,34,.16)' : 'rgba(170,140,100,.14)'; g.beginPath(); g.ellipse(R() * W, R() * H, r, r * 0.6, R() * 3, 0, 7); g.fill(); }
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    if (isWallAt(map, x, y)) continue;
    const nearWall = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dy]) => isWallAt(map, x + dx, y + dy));
    if (nearWall) continue; // 家ぎわは土のまま
    const gx = x * T, gy = y * T; // 芝生：丸いしげみを重ねて、マスの形が見えないように（町の絵があれば絵の芝生で）
    const gp = townPattern(g, 'grass', T, 4);
    for (let k = 0; k < 3; k++) { g.fillStyle = gp || (R() < 0.5 ? 'rgba(86,122,62,.55)' : 'rgba(104,140,72,.5)'); g.beginPath(); g.ellipse(gx + T * (0.2 + R() * 0.6), gy + T * (0.2 + R() * 0.6), T * (0.5 + R() * 0.3), T * (0.42 + R() * 0.3), R() * 3, 0, 7); g.fill(); }
    for (let k = 0; k < 5; k++) { g.strokeStyle = 'rgba(130,170,90,.8)'; g.lineWidth = 1.5; const px = gx + R() * T, py = gy + R() * T; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 3, py - 3 - R() * 3); g.stroke(); }
  }
  for (let k = 0; k < (W * H) / 900; k++) { g.fillStyle = 'rgba(140,130,118,.75)'; g.beginPath(); g.ellipse(R() * W, R() * H, 1.5 + R() * 1.5, 1 + R(), R() * 3, 0, 7); g.fill(); } // 小石
}
function soilFloor(g, map, T, W, H) { // 森の土：茶色の土に濃淡のしみ、小石、落ち葉。歩ける所は踏み固めた明るい土、歩けない所（木・岩の下）は草とこけ
  const R = rnd(83);
  g.fillStyle = '#7a5e40'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < (W * H) / 260; k++) { const r = 4 + R() * 14; g.fillStyle = R() < 0.5 ? 'rgba(60,42,26,.16)' : 'rgba(150,118,80,.14)'; g.beginPath(); g.ellipse(R() * W, R() * H, r, r * (0.5 + R() * 0.5), R() * 3, 0, 7); g.fill(); } // 濃淡のしみ
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const gx = x * T, gy = y * T;
    if (isWallAt(map, x, y)) { // 草とこけ
      for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(52,82,44,.42)'; g.beginPath(); g.ellipse(gx + T * (0.2 + R() * 0.6), gy + T * (0.2 + R() * 0.6), T * (0.55 + R() * 0.3), T * (0.45 + R() * 0.3), R() * 3, 0, 7); g.fill(); } // 四角に見えないよう、丸いしげみを重ねる
      for (let k = 0; k < 7; k++) { g.strokeStyle = R() < 0.5 ? 'rgba(96,140,70,.8)' : 'rgba(70,110,56,.8)'; g.lineWidth = 1.5; const px = gx + R() * T, py = gy + R() * T; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 4, py - 4 - R() * 4); g.stroke(); }
    } else { // 踏み固めた道：まん中ほど明るい
      const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => isWallAt(map, x + dx, y + dy)).length;
      g.fillStyle = `rgba(176,140,96,${0.28 - near * 0.06})`; g.fillRect(gx, gy, T, T);
      if (near) for (let k = 0; k < 3; k++) { g.strokeStyle = 'rgba(80,120,60,.7)'; g.lineWidth = 1.5; const px = gx + R() * T, py = gy + R() * T; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 3, py - 3 - R() * 3); g.stroke(); } // 道のはしの草
    }
  }
  // 街道（マップの roads。2026-11-22 作者「森は街道を作って」）：踏み固めた明るい土に、細かい砂利と2本のわだち。ふちは草が少しかぶる
  for (const r of map.roads || []) {
    const x0 = r.x * T, y0 = r.y * T, w = r.w * T, h = r.h * T, along = r.w >= r.h;
    g.fillStyle = '#b39a72'; g.fillRect(x0, y0, w, h);
    for (let k = 0; k < (w * h) / 60; k++) { g.fillStyle = R() < 0.5 ? 'rgba(120,104,84,.55)' : 'rgba(210,196,170,.5)'; g.fillRect(x0 + R() * w, y0 + R() * h, 1.5 + R() * 2, 1.5 + R() * 1.5); } // 砂利
    g.strokeStyle = 'rgba(96,76,52,.35)'; g.lineWidth = T * 0.18; // わだち
    for (const f of [0.33, 0.67]) { g.beginPath(); if (along) { g.moveTo(x0, y0 + h * f); for (let x = x0; x <= x0 + w; x += T) g.lineTo(x, y0 + h * f + (R() - 0.5) * 3); } else { g.moveTo(x0 + w * f, y0); for (let y = y0; y <= y0 + h; y += T) g.lineTo(x0 + w * f + (R() - 0.5) * 3, y); } g.stroke(); }
    for (let k = 0; k < (along ? w : h) / 6; k++) { g.strokeStyle = 'rgba(86,128,62,.75)'; g.lineWidth = 1.5; const e = R() < 0.5, px = along ? x0 + R() * w : (e ? x0 : x0 + w) + (R() - 0.5) * 6, py = along ? (e ? y0 : y0 + h) + (R() - 0.5) * 6 : y0 + R() * h; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 3, py - 3 - R() * 3); g.stroke(); } // ふちの草
  }
  for (let k = 0; k < (W * H) / 700; k++) { g.fillStyle = R() < 0.6 ? 'rgba(150,140,128,.8)' : 'rgba(110,100,90,.8)'; g.beginPath(); g.ellipse(R() * W, R() * H, 1.5 + R() * 2, 1 + R() * 1.5, R() * 3, 0, 7); g.fill(); } // 小石
  for (let k = 0; k < (W * H) / 1100; k++) { g.fillStyle = ['rgba(170,110,50,.7)', 'rgba(140,80,40,.7)', 'rgba(190,150,70,.7)'][Math.floor(R() * 3)]; g.beginPath(); g.ellipse(R() * W, R() * H, 3 + R() * 2, 1.5 + R(), R() * 3, 0, 7); g.fill(); } // 落ち葉
  noise(g, W, H, R, 16);
}
// ---- 町の絵（stage.townArt）：板の絵と地面の模様（2026-11-22） ----
/** @type {any} */ let TOWN_CFG = null;
/** @type {Record<string, HTMLImageElement>|null} */ let TOWN_IMG = null;
// 夜の窓の明かり（2026-11-22 作者「家、夜の時明かりがついてほしい」）：町の家の絵ごとの窓の位置（絵の画素、[左, 上, 右, 下]）。
// 夜は、この中の明るい所（カーテン・ガラス）ほど暖かく光らせる（窓枠の濃い木はあまり光らない）。窓の一部は消えたまま
const TOWN_WINDOWS = {
  'house_a_narrow.webp': [[112, 140, 162, 190], [112, 270, 160, 318], [172, 404, 196, 448]],
  'house_b_sideroof.webp': [[243, 95, 273, 125], [110, 180, 150, 228], [240, 180, 278, 228], [370, 180, 410, 228], [296, 310, 414, 388]],
  'house_c_stepgable.webp': [[120, 120, 145, 148], [215, 120, 240, 148], [62, 243, 88, 278], [167, 243, 193, 278], [270, 243, 296, 278], [62, 390, 88, 422], [272, 390, 298, 422]],
  'house_d_workshop.webp': [[145, 170, 225, 218], [285, 170, 365, 218]],
  'house_e_archway.webp': [[105, 148, 150, 200], [205, 135, 325, 195], [377, 148, 418, 200], [98, 305, 162, 370], [238, 320, 266, 345]],
  'house_f_corner.webp': [[92, 202, 146, 252], [248, 202, 302, 252], [372, 203, 424, 262], [248, 350, 336, 405]],
  'house_home_2f.webp': [[100, 182, 162, 240], [285, 182, 345, 240], [250, 358, 330, 420]],
  'house_merchant_3f.webp': [[170, 98, 210, 140], [150, 222, 232, 270], [66, 218, 104, 280], [280, 218, 318, 280], [130, 380, 250, 480]],
};
/** 窓の明かりの絵（emissiveMap）。窓の外は黒 @param {HTMLCanvasElement} c 家の絵を描いた板のキャンバス @param {string} file @param {number} seed */
function windowGlow(c, file, seed) {
  const rects = TOWN_WINDOWS[file]; if (!rects) return null;
  const im = TOWN_IMG?.[file]; if (!im) return null;
  const sx = c.width / im.naturalWidth, sy = c.height / im.naturalHeight;
  const src = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  return canvas(c.width, c.height, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const out = g.getImageData(0, 0, W, H), d = out.data;
    // 作者「まどわくだけあかるいだけで変」（2026-11-22）：明るさで選ぶと、窓まわりの白い壁や枠が光っていた。
    // 窓の内側だけ（四方を少し内へ）を、色の薄い所（ガラス・カーテン）は同じ暖かい色でむらなく灯し、色の濃い木（枠・桟・鎧戸）は暗いままにする。ふちはやわらかく
    rects.forEach((r, i) => {
      if (((seed * 7 + i * 13) % 5) === 0) return; // 5つに1つくらいは消えている
      const iw = (r[2] - r[0]) * 0.1, ih = (r[3] - r[1]) * 0.1;
      const x0 = Math.floor((r[0] + iw) * sx), y0 = Math.floor((r[1] + ih) * sy), x1 = Math.ceil((r[2] - iw) * sx), y1 = Math.ceil((r[3] - ih) * sy);
      const fx = Math.max(1, (x1 - x0) * 0.18), fy = Math.max(1, (y1 - y0) * 0.18);
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const k = (y * W + x) * 4; if (src[k + 3] < 90) continue;
        const R = src[k], G = src[k + 1], B = src[k + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const sat = mx ? (mx - mn) / mx : 0, lum = (R + G + B) / 765;
        const glass = Math.min(1, Math.max(0, (0.42 - sat) / 0.22)) * Math.min(1, Math.max(0, (lum - 0.12) / 0.15)); // 色が薄い（濃い木でない）・真っ黒でない
        const edge = Math.min(1, (x - x0 + 1) / fx, (x1 - x) / fx, (y - y0 + 1) / fy, (y1 - y) / fy);
        const v = glass * (0.55 + 0.45 * edge);
        d[k] = 255 * v; d[k + 1] = 150 * v; d[k + 2] = 55 * v; // 白いカーテンに重ねても白く飛ばないよう、濃いめの橙
      }
    });
    g.putImageData(out, 0, 0);
  });
}
/**
 * 板の名前に合う町の絵があれば、板の大きさのキャンバスに描いて返す。
 * 家（house-*・inn-*）は横いっぱいにして、高さは絵の形から（家ごとに屋根の高さが変わる）。
 * 吊るすもの（sign-*・awning-*・herbs）は板の上のほうに、それ以外は地面に立てて、形を変えずに入れる
 */
function townBoardCanvas(name, b, it) {
  const cfg = TOWN_CFG, imgs = TOWN_IMG; if (!cfg || !imgs) return null;
  let file = it.art || cfg.boards?.[name]; // it.art：地図で家の絵を決めているとき
  if (!file && /^house-/.test(name)) file = cfg.boards?.['house-*'];
  if (Array.isArray(file)) file = file[Math.abs((it.x * 131 + it.y * 37 + 7) | 0) % file.length]; // 家は位置で選ぶ（開き直しても同じ）
  const im = file && imgs[file]; if (!im) return null;
  const ar = im.naturalHeight / im.naturalWidth;
  if (/^(house-|inn-)/.test(name)) {
    // ドアの高さをキャラにそろえる（2026-11-23 作者「家のドアとキャラの大きさを同じくらいに」）：townArt.doors[絵].h＝ドアの高さ（絵の高さに対する割合）、doorH＝そろえる高さ（マス）。
    // 絵の幅は足もとの幅と少し違ってよい（足もとの真ん中にそろえる）
    const df = cfg.doors?.[file]?.h, doorH = cfg.doorH;
    const h = df && doorH ? doorH / df : b.w * ar, w = h / ar; return { w, h, file, c: canvas(w * PX, h * PX, (g, W, H) => g.drawImage(im, 0, 0, W, H)) };
  }
  const hang = /^(sign-|awning-|herbs)/.test(name);
  return { h: b.h, c: canvas(b.w * PX, b.h * PX, (g, W, H) => {
    let w = W, h = W * ar; if (h > H) { h = H; w = H / ar; }
    if (hang && /^awning-/.test(name)) { w = W; h = Math.min(H * 0.45, W * ar); } // 庇は横いっぱい
    g.drawImage(im, (W - w) / 2, hang ? 0 : H - h, w, h);
  }) };
}
/** 地面の模様（町の絵）。size＝絵1枚が覆うマス数 @returns {CanvasPattern|null} */
function townPattern(g, key, T, size) {
  const file = TOWN_CFG?.ground?.[key], im = file && TOWN_IMG?.[file]; if (!im) return null;
  const p = g.createPattern(im, 'repeat'); if (!p) return null;
  p.setTransform(new DOMMatrix().scale((size * T) / im.naturalWidth, (size * T) / im.naturalHeight)); return p;
}
function pageCanvas(map) { // 羊皮紙のページ。うすいインクで石畳と入口のしるしを描く（ページに描かれた町の地図のように）
  const T = 32, W = map.width * T, H = map.height * T;
  return canvas(W, H, (g) => {
    const R = rnd(3); g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, W, H);
    const floor = map.stage?.floor, paved = map.stage?.paved;
    if (floor === 'cobble' && Array.isArray(paved)) { // 町：道と広場（stage.paved）だけ石畳、ほかは土か芝生（2026-11-22 作者「道や広場は石畳、ほかは土か芝生」）
      townYardFloor(g, map, T, W, H, paved);
      g.save(); g.beginPath(); for (const p of paved) g.rect(p.x * T, p.y * T, p.w * T, p.h * T); g.clip(); cobbleFloor(g, map, T, W, H); g.restore();
      // 石畳と土の境目は線を引かず、ぼかしてなじませる（2026-11-22 作者「地面の変な枠もどうにかしたい」）
      g.save(); g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(120,100,72,.55)'; g.lineWidth = 7; g.beginPath(); for (const p of paved) g.rect(p.x * T, p.y * T, p.w * T, p.h * T); g.stroke(); g.restore(); /* 1回の線で（ぼかしも1回） */
    }
    else if (floor === 'cobble') cobbleFloor(g, map, T, W, H);
    else if (floor === 'soil') soilFloor(g, map, T, W, H);
    else for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const kind = map.legend[[...map.collision[y]][x]];
      if (kind === 'wall') { g.fillStyle = 'rgba(120,90,50,.07)'; g.fillRect(x * T, y * T, T, T); continue; }
      g.strokeStyle = 'rgba(120,90,50,.14)'; g.lineWidth = 1.5; const o = (y % 2) * T / 2;
      g.strokeRect(x * T + 3 + (o ? 0 : 0), y * T + 3, T / 2 - 4, T - 6); g.strokeRect(x * T + T / 2 + 1, y * T + 3, T / 2 - 4, T - 6);
      // 扉のマスの床に描いていた入口の印（アーチ形）は、2026-11-22 作者「前にあった入り口の目印はもう消していいよ」で消した（入口は buildExitMarks の明るい丸と影で示す）
    }
    for (const side of [0, 1]) { // ページごとの、ふちの焼けと飾り線
      const x0 = side * W / 2, gr = g.createRadialGradient(x0 + W / 4, H / 2, 40, x0 + W / 4, H / 2, W * 0.4); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,60,20,.26)');
      g.fillStyle = gr; g.fillRect(x0, 0, W / 2, H); if (!map.stage?.townArt) { g.strokeStyle = 'rgba(120,90,50,.25)'; g.lineWidth = 2; g.strokeRect(x0 + 14, 14, W / 2 - 28, H - 28); } // 町の絵のマップでは飾り線を引かない（地面に枠が見えるので）
    }
    const gut = g.createLinearGradient(W / 2 - 40, 0, W / 2 + 40, 0); gut.addColorStop(0, 'rgba(60,40,20,0)'); gut.addColorStop(0.5, 'rgba(60,40,20,.3)'); gut.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gut; g.fillRect(W / 2 - 40, 0, 80, H); noise(g, W, H, R, 16);
  });
}
const leatherCanvas = () => canvas(256, 256, (g, w, h) => { g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, h); noise(g, w, h, rnd(9), 30); g.strokeStyle = '#c9a050'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28); });
const planksCanvas = () => canvas(256, 256, (g, w, h) => { const R = rnd(21); for (let y = 0; y < h; y += 32) { g.fillStyle = `hsl(28,${35 + R() * 10}%,${24 + R() * 8}%)`; g.fillRect(0, y, w, 31); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 31, w, 1); g.fillRect(Math.floor(R() * w), y, 2, 31); } noise(g, w, h, R, 18); });
const stoneFloorCanvas = () => canvas(256, 256, (g, w, h) => { const R = rnd(23); g.fillStyle = '#3a3836'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < w; x += 48) { g.fillStyle = `hsl(30,6%,${26 + R() * 10}%)`; g.fillRect(x + 2, y + 2, 44, 28); } noise(g, w, h, R, 22); });
const stoneWallCanvas = () => canvas(256, 256, (g, w, h) => { const R = rnd(24); g.fillStyle = '#2c2a30'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 28) for (let x = (y / 28) % 2 ? -30 : 0; x < w; x += 60) { g.fillStyle = `hsl(250,6%,${24 + R() * 10}%)`; g.fillRect(x + 2, y + 2, 56, 24); } noise(g, w, h, R, 24); });
// ブックヌックの手ざわり（試作_ブックヌックと同じ描き方）
const brickCanvas = (seed, base) => canvas(512, 512, (g, w, h) => { // 石積み：大きさのそろわない石と、暗い目地
  const R = rnd(seed); g.fillStyle = '#1c1d1a'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 30) { let x = -R() * 40; while (x < w) { const bw = 38 + R() * 34, l = 52 + R() * 34;
    g.fillStyle = `rgb(${base[0] * l / 70 | 0},${base[1] * l / 70 | 0},${base[2] * l / 70 | 0})`; g.beginPath(); g.roundRect(x + 2, y + 2, bw - 4, 26, 5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 4, y + 3, bw - 10, 4); x += bw; } }
  noise(g, w, h, R, 26); });
const cobbleCanvas = () => canvas(512, 512, (g, w, h) => { // 石畳：丸い石をすき間なく
  const R = rnd(7); g.fillStyle = '#151613'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 26) for (let x = (y / 26 % 2) * 13; x < w; x += 26) {
    const rx = 10 + R() * 3, ry = 9 + R() * 3, cx = x + R() * 4, cy = y + R() * 4, l = 70 + R() * 40;
    const gr = g.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, rx); gr.addColorStop(0, `rgb(${l + 30},${l + 30},${l + 22})`); gr.addColorStop(1, `rgb(${l * 0.6},${l * 0.62},${l * 0.55})`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rx, ry, R(), 0, Math.PI * 2); g.fill(); }
  noise(g, w, h, R, 18); });
const beamsCanvas = () => canvas(256, 256, (g, w, h) => { const R = rnd(3); g.fillStyle = '#0c0a08'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = '#16110c'; g.fillRect(x, 0, 26, h); } noise(g, w, h, R, 14); });
const woodCanvas = () => canvas(256, 256, (g, w, h) => { const R = rnd(11); g.fillStyle = '#3a2414'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${20 + R() * 30},${10 + R() * 14},4,.35)`; g.lineWidth = 1 + R() * 2; const y = R() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + R() * 8 - 4, w * 0.7, y + R() * 8 - 4, w, y); g.stroke(); } noise(g, w, h, R, 12); });
const windowCanvas = (cols, rows, frame) => canvas(128, 192, (g, w, h) => { // 光る窓：あたたかい灯りと窓わく
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.6, '#ffc861'); gr.addColorStop(1, '#ff9a3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = frame; const t = 7; g.fillRect(0, 0, w, t); g.fillRect(0, h - t, w, t); g.fillRect(0, 0, t, h); g.fillRect(w - t, 0, t, h);
  for (let i = 1; i < cols; i++) g.fillRect(w * i / cols - 2, 0, 4, h); for (let j = 1; j < rows; j++) g.fillRect(0, h * j / rows - 2, w, 4); });
const alcoveCanvas = () => canvas(128, 192, (g, w, h) => { // 壁の暗いくぼみ（石のアーチ）
  g.fillStyle = '#5a5a60'; g.beginPath(); g.moveTo(4, h); g.lineTo(4, 60); g.quadraticCurveTo(w / 2, -10, w - 4, 60); g.lineTo(w - 4, h); g.fill();
  g.fillStyle = '#08070c'; g.beginPath(); g.moveTo(22, h); g.lineTo(22, 70); g.quadraticCurveTo(w / 2, 18, w - 22, 70); g.lineTo(w - 22, h); g.fill(); noise(g, w, h, rnd(19), 20); });
const glowCanvas = () => canvas(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,220,140,1)'); gr.addColorStop(0.35, 'rgba(255,170,70,.45)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
// 暖炉の炎（2026-11-22 作者「暖炉に火の演出を」）：しずく形の炎を重ねた6コマ。外側は赤、内側は橙、芯は白っぽい黄
const FIRE_FRAMES = 6;
const flameCanvas = () => canvas(96 * FIRE_FRAMES, 128, (g, W, H) => {
  const R = rnd(91);
  for (let f = 0; f < FIRE_FRAMES; f++) {
    const ox = f * 96;
    for (const [col, sc] of [['rgba(200,50,20,.85)', 1], ['rgba(255,140,40,.9)', 0.72], ['rgba(255,220,120,.95)', 0.42]]) {
      for (let k = 0; k < 5; k++) {
        const cx = ox + 20 + k * 14 + (R() - 0.5) * 8, hgt = (50 + R() * 60) * sc, wid = (14 + R() * 8) * sc, base = H - 8;
        g.fillStyle = col; g.beginPath(); g.moveTo(cx - wid, base); g.quadraticCurveTo(cx - wid, base - hgt * 0.55, cx + (R() - 0.5) * 10, base - hgt);
        g.quadraticCurveTo(cx + wid, base - hgt * 0.55, cx + wid, base); g.closePath(); g.fill();
      }
    }
    g.fillStyle = 'rgba(60,30,20,1)'; g.fillRect(ox + 14, H - 10, 68, 6); g.fillRect(ox + 22, H - 14, 52, 5); // 薪
  }
});
const plasterCanvas = () => canvas(256, 256, (g, w, h) => { g.fillStyle = '#b8a27c'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a2e1a'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 12, h); noise(g, w, h, rnd(22), 26); });
// 光の玉：2026-11-22 作者の選択で六角形（ふちの線つき）から、線のない、ふちのぼやけた丸い光の粒にした
// （明るい石畳の上では、六角形の輪郭だけが浮いて「何かの印」に見えた）
const hexCanvas = () => canvas(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62); gr.addColorStop(0, 'rgba(240,244,255,.6)'); gr.addColorStop(0.35, 'rgba(215,222,255,.3)'); gr.addColorStop(1, 'rgba(200,210,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });

/** 切り抜きの板（両面に同じ絵）。影も絵の形で落ちる */
/** レフ板（2026-11-22 作者「カメラからキャラにスポットライトかレフ板を置いて明るく」）：キャラの絵を少しだけ自分で光らせる */
const CHAR_FILL = 0.22;
function fillMaterial(m, tex) { m.emissive = new THREE.Color(0xfff4e6); m.emissiveMap = tex; m.emissiveIntensity = CHAR_FILL; return m; }
/** のぞき穴（2026-11-22 作者「スポットライトが当たるところだけすけるとかできる？」）：主人公より手前の板は、画面で主人公のまわりの丸だけを透かす。
 * uHole＝画面の位置（描画バッファのピクセル）と半径。板ごとの uHoleOn が 1 のときだけ穴をあける */
// 2026-11-22 作者「スポットライトのところだけ見えるのいいけど、これは隠し通路の時だけにしたい。ほかは普通に見えるようにスポットを広くする」：
//   ふだんは広くやわらかい丸（WIDE）、マップの stage.hiddenPaths の中にいるときだけ小さな丸（SMALL）。uHole.w＝丸のうち、まったく薄い内側の割合
const HOLE = { uHole: { value: new THREE.Vector4(0, 0, 0, 0.7) } };
const HOLE_ALPHA = 0.22;
const NEAR_FAR = 5, NEAR_NEAR = 2, NEAR_MIN = 0.12; // カメラに近すぎる板を透かす距離（マス）と、いちばん薄いときの濃さ
const HOLE_SMALL = { r: 0.85, inner: 0.7 }, HOLE_WIDE = { r: 2.6, inner: 0.45 }; // 半径は主人公の背の高さ（画面）の何倍か
function holeMaterial(m) {
  const on = { value: 0 }; m.userData.holeOn = on;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = HOLE.uHole; sh.uniforms.uHoleOn = on;
    sh.fragmentShader = 'uniform vec4 uHole;\nuniform float uHoleOn;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>',
      `#include <alphatest_fragment>\n  if (uHoleOn > 0.5) diffuseColor.a *= mix(${HOLE_ALPHA.toFixed(2)}, 1.0, smoothstep(uHole.z * uHole.w, uHole.z, distance(gl_FragCoord.xy, uHole.xy)));`);
  };
  m.customProgramCacheKey = () => 'hole';
  return m;
}
function boardMesh(tex, w, h) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.y = h / 2; m.castShadow = true; m.receiveShadow = true;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.35 });
  return m;
}

/**
 * @param {HTMLCanvasElement} canvasEl
 * @param {{ ledger:any, images: Record<string, HTMLImageElement>, regions: Record<string, Record<string, number[]>>, style?: any }} assets
 */
export function createThreeStage(canvasEl, assets) {
  const style = assets.style ?? DEFAULT_STYLE;
  PIXROOM = new URLSearchParams(location.search).get('pixelroom') === '1';
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.autoClear = false;
  canvasEl.style.imageRendering = 'auto';
  const scene = new THREE.Scene(); const NIGHT = 0x0b0d22; scene.background = new THREE.Color(NIGHT);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  // 暗転（マップを移るとき）：画面全体に重ねる板
  const fadeScene = new THREE.Scene(), fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a10, transparent: true, opacity: 0, depthTest: false }); fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));

  // 灯り（試作と同じ組み合わせ）
  const hemi = new THREE.HemisphereLight(0x8090c8, 0x2a1a10, 0.9); scene.add(hemi);
  // 昼と夜（2026-11-22 作者「昼背景を作ってみたら、いいのでそれも入れてみて」）：外のマップだけ。昼は空・もやを明るく、日の光を強く、灯りはほのかに。奥の背景は昼の絵（stage の背景の板の imageDay）
  let DAY = false; const DAY_SKY = 0xa9c8e6;
  // カメラから主人公へのスポットライト（やわらかいふち。主人公とまわりの床を少し明るく）
  const charSpot = new THREE.SpotLight(0xfff1dc, 2.2, 0, 0.2, 0.75, 0); scene.add(charSpot, charSpot.target);
  const key = new THREE.DirectionalLight(0xfff0d8, 1.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; scene.add(key, key.target);

  // オーブ
  const hexTex = texOf(hexCanvas()); const orbGroup = new THREE.Group(); scene.add(orbGroup);
  // 光の玉は場所ごとに変える（2026-11-22 作者「オーブは場所によって変えるようにしたい」）：マップの stage.orbs（数・明るさ・色・大きさ）が
  // stage-style.json の orbs を上書きする。玉は ORB_MAX 個まで先に作っておき、マップを読むたびに数と色を合わせる
  const ORB_MAX = 40;
  const orbSprites = [];
  for (let i = 0; i < ORB_MAX; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hexTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: i * 1.7 })); s.visible = false; orbGroup.add(s); orbSprites.push(s); }
  let orbCfg = { count: 0, alpha: 0.7, size: 1 };
  const applyOrbs = (m) => {
    const o = { ...(style.orbs || {}), ...(m.stage?.orbs || {}) };
    orbCfg = { count: Math.max(0, Math.min(ORB_MAX, o.count ?? 0)), alpha: o.alpha ?? 0.7, size: o.size ?? 1 };
    const c = new THREE.Color(...(o.color || [1, 1, 1]));
    orbSprites.forEach((s, i) => { s.material.color.copy(c); if (i >= orbCfg.count) s.visible = false; });
  };

  // キャラ（なびくドット絵）。読み終わるまで load が待つ
  const loader = new THREE.TextureLoader();
  const flutter = {};
  const flutterReady = Promise.all(Object.entries(FLUTTER).map(([id, path]) => loader.loadAsync(path).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; flutter[id] = t; }, () => {})));

  // マップの手ざわり（stage.textures）：美術・演出室の元絵をそのまま張る（2026-11-22 作者「試しにドット化しないでそのまま張ったらどうなる？」）。?innart=0 で前のコードの絵
  const artCache = {}; let ART2 = null;
  // 元絵1枚が覆うマス数（横, 縦）。ドット絵にするときの細かさを決める
  const ART_TILES = { floor: [4, 4], wall: [4, 4], ceiling: [4, 4], brick: [1.5, 1.9], window: [1.3, 1.8], tabletop: [3, 1.8], counter: [7, 1.1], blanket: [2, 1.2], door: [1, 2.1] };
  // 町の絵（2026-11-22 作者「テクスチャができました、ノルンの」）：マップの stage.townArt の絵を読んでおく（地面の模様と板の絵に使う）
  /** @type {Record<string, HTMLImageElement>|null} */ let TOWN = null;
  const townCache = {};
  // 見えている敵の姿（2026-11-22 作者「ゆるい猫ではなく戦う敵のシンボルにしてほしい」）：マップの encounters の symbol（戦闘の敵のドット絵）を読む
  /** @type {Record<string, HTMLImageElement|null>} */ const symCache = {};
  /** @type {Record<string, HTMLImageElement[]>} */ let SYM = {};
  async function loadSymbols(m) {
    SYM = {};
    await Promise.all((m.encounters || []).map(async (/** @type {any} */ e) => {
      const ims = await Promise.all((e.symbol || []).map((/** @type {string} */ url) => url in symCache ? symCache[url] : new Promise((ok) => { const im = new Image(); im.onload = () => ok(symCache[url] = im); im.onerror = () => ok(symCache[url] = null); im.src = url; })));
      const ok = /** @type {HTMLImageElement[]} */ (ims.filter(Boolean)); if (ok.length) SYM[e.id] = ok;
    }));
  }
  /** 敵の群れの絵：板に、敵のドット絵を足もとをそろえて少しずつ重ねて並べる（真ん中がいちばん手前） @param {HTMLImageElement[]} ims */
  const symbolCanvas = (ims, w, h) => canvas(w * PX * 2, h * PX * 2, (g, W, H) => {
    g.imageSmoothingEnabled = false;
    const n = ims.length, slot = W / (n * 0.72 + 0.28), order = ims.map((_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
    for (const i of order) { const im = ims[i], s = Math.min(slot / im.naturalWidth, H / im.naturalHeight) * (i === Math.floor((n - 1) / 2) ? 1 : 0.9); const dw = im.naturalWidth * s, dh = im.naturalHeight * s; g.drawImage(im, Math.round(i * slot * 0.72 + (slot - dw) / 2), Math.round(H - dh), Math.round(dw), Math.round(dh)); }
  });
  async function loadTown(m) {
    TOWN = null; const t = m.stage?.townArt; if (!t) return;
    const files = new Set([...Object.values(t.ground || {}), ...Object.values(t.boards || {}).flat()]);
    const out = {};
    await Promise.all([...files].map(async (f) => {
      const url = (t.base || '') + f;
      if (!(url in townCache)) townCache[url] = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = url; });
      if (townCache[url]) out[f] = townCache[url];
    }));
    TOWN = out; TOWN_CFG = t; TOWN_IMG = out;
  }
  async function loadArt(m) {
    TOWN_CFG = null; TOWN_IMG = null; ART2 = null; const t = m.stage?.textures; if (!t || new URLSearchParams(location.search).get('innart') === '0') return;
    const out = {};
    for (const k of ['floor', 'wall', 'ceiling', 'brick', 'window', 'tabletop', 'counter', 'blanket', 'door']) {
      if (!t[k]) continue; const url = (t.base || '') + t[k];
      if (!(url in artCache)) artCache[url] = await loader.loadAsync(url).then((x) => { x.colorSpace = THREE.SRGBColorSpace; return x; }, () => null);
      if (!artCache[url]) continue;
      // ?pixelroom=1：元絵をドット絵にしてから張る（2026-11-22 作者「ドットでも試す」）。絵1枚が覆うマス数に合わせて、1マス約40ドットに
      if (PIXROOM) { const key = url + '#dot2'; if (!(key in artCache)) { const [tw, th] = ART_TILES[k] || [2, 2]; const t = texOf(pixCanvas(artCache[url].image, tw, th, true)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; artCache[key] = t; } out[k] = artCache[key]; }
      else out[k] = artCache[url];
    }
    ART2 = out;
  }
  /** 元絵の手ざわり（写しを作って繰り返し数を決める。写しはマップを替えるときに片づく）。無ければ null */
  const artT = (k, rx = 1, ry = 1) => { const b = ART2?.[k]; if (!b) return null; const t = b.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
  let map = null, root = null, pages = null, actors = {}, boards = [], lights = [], fires = [], delayOf = riseDelayFn([]);
  const glowTex = texOf(glowCanvas());
  /** @type {{HT:number, F:number}|null} ブックヌックの箱の大きさ（中のマップのとき） */ let nook = null;
  let interior = false, cssW = 1, cssH = 1, lastEye = [0, 0, 0], lastIntro = null, orbsShown = 0, lastEffect = '';

  // めくれるページ（ページめくりの演出）。背を軸に、右ページから左ページへ。先のほうが遅れてしなる（試作と同じ形）
  // 2026-11-22 作者「めくっているページのテクスチャが紙」「右はじに行ったら右からめくる、左へ行ったら左からめくる」：
  //   めくれる紙の表（はじめ上を向いている面）は前のマップのページ、裏（めくり終わって上を向く面）は新しいマップのページにする。
  //   右へ出たら右ページが左へめくれ、左へ出たら左ページが右へめくれる。位置は2つの面で共有し、絵の切り出し（uv）だけ面ごとに変える
  const TN = 24, turnPos = new THREE.BufferAttribute(new Float32Array((TN + 1) * 2 * 3), 3), turnIdx = [];
  for (let i = 0; i < TN; i++) { const a = i * 2; turnIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const mkTurnGeo = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', turnPos); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((TN + 1) * 4), 2)); g.setIndex(turnIdx); return g; };
  const turnGeoA = mkTurnGeo(), turnGeoB = mkTurnGeo(); // A＝表（前のページ）、B＝裏（新しいページ）
  const turnTex = texOf(canvas(512, 384, (g, w, h) => { g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,60,20,.28)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,90,50,.25)'; g.lineWidth = 2; g.strokeRect(18, 18, w - 36, h - 36); noise(g, w, h, rnd(3), 16); }));
  const turnMat = () => new THREE.MeshStandardMaterial({ map: turnTex, roughness: 1, emissive: 0xffffff, emissiveMap: turnTex, emissiveIntensity: 0.25 }); // めくれる紙が暗くなりすぎないよう、少し自分で光らせる
  const turnA = new THREE.Mesh(turnGeoA, turnMat()), turnB = new THREE.Mesh(turnGeoB, turnMat());
  turnA.castShadow = true;
  const turnMesh = new THREE.Group(); turnMesh.add(turnA, turnB); turnMesh.visible = false; scene.add(turnMesh);
  /** 外のマップのページの絵（めくる紙に使う）。いまのと、ひとつ前の */
  let curPageTex = null, prevPageTex = null, turnSign = 0;
  const setTurnTex = (/** @type {any} */ m, /** @type {any} */ t) => { m.material.map = t || turnTex; m.material.emissiveMap = t || turnTex; m.material.needsUpdate = true; };
  /**
   * @param {number} p 0＝めくる前のページに寝ている／1＝反対のページに寝ている @param {number} PW 片ページの横 @param {number} PH 縦
   * @param {number} sign +1＝右ページから左へ（右へ出たとき）／-1＝左ページから右へ（左へ出たとき）
   */
  function bendPage(p, PW, PH, sign) {
    if (sign !== turnSign) { // 向きが変わったら、面ごとの絵の切り出しと、どちらの面を見せるかを決め直す
      turnSign = sign;
      const ua = turnGeoA.attributes.uv.array, ub = turnGeoB.attributes.uv.array;
      for (let i = 0; i <= TN; i++) { const fa = 0.5 + sign * 0.5 * i / TN, fb = 0.5 - sign * 0.5 * i / TN; ua.set([fa, 1, fa, 0], i * 4); ub.set([fb, 1, fb, 0], i * 4); }
      turnGeoA.attributes.uv.needsUpdate = true; turnGeoB.attributes.uv.needsUpdate = true;
      // 三角形の向きは sign で裏返る：+1 では作った面の「表」が下を向く
      turnA.material.side = sign > 0 ? THREE.BackSide : THREE.FrontSide; turnB.material.side = sign > 0 ? THREE.FrontSide : THREE.BackSide;
      turnA.material.needsUpdate = true; turnB.material.needsUpdate = true;
    }
    const pos = turnPos.array, dx = PW / TN; let x = 0, y = 0;
    for (let i = 0; i <= TN; i++) {
      pos.set([sign * x, y, -PH / 2, sign * x, y, PH / 2], i * 6);
      const th = p * Math.PI - 0.9 * Math.sin(p * Math.PI) * Math.pow(i / TN, 1.3);
      x += Math.cos(th) * dx; y += Math.sin(th) * dx;
    }
    turnPos.needsUpdate = true; turnGeoA.computeVertexNormals(); turnGeoB.computeVertexNormals(); turnGeoA.computeBoundingSphere(); turnGeoB.computeBoundingSphere();
  }
  const cam = { x: 0, z: 0, init: false };

  function disposeTree(o) { o.traverse((m) => { if (m.geometry) m.geometry.dispose(); const ms = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []; for (const mt of ms) { if (mt.map && !Object.values(flutter).includes(mt.map) && mt.map !== hexTex) mt.map.dispose(); mt.dispose(); } if (m.customDepthMaterial) m.customDepthMaterial.dispose(); }); }

  /** 画像のある板（タイル画像の領域を切り出す。にじませない） */
  function regionCanvas(it) {
    const r = assets.regions[it.asset]?.[it.region], img = assets.images[it.asset]; if (!r || !img) return null;
    const T = map.tileSize || 32, w = it.repeat === 'x' ? it.w * T : r[2];
    return canvas(w, r[3], (g) => { g.imageSmoothingEnabled = false; for (let x = 0; x < w; x += r[2]) g.drawImage(img, r[0], r[1], Math.min(r[2], w - x), r[3], x, 0, Math.min(r[2], w - x), r[3]); });
  }

  function buildExterior() {
    const W = map.width, H = map.height, bk = style.book || DEFAULT_STYLE.book, M = Math.max(0.6, bk.margin ?? 0.6);
    const pageCv = pageCanvas(map), leather = texOf(leatherCanvas());
    const make = (side) => { // side -1 左ページ / +1 右ページ。背（x=W/2）を軸に回る
      const pivot = new THREE.Group(); pivot.position.set(W / 2, 0, H / 2); root.add(pivot);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(W / 2 + M, 0.3, H + 2 * M), new THREE.MeshStandardMaterial({ map: leather, roughness: 0.85 }));
      cover.position.set(side * (W / 4 + M / 2), -0.36, 0); cover.receiveShadow = true; pivot.add(cover);
      const stack = new THREE.Mesh(new THREE.BoxGeometry(W / 2, 0.2, H), new THREE.MeshStandardMaterial({ color: 0xd8c8a2, roughness: 1 })); stack.position.set(side * W / 4, -0.11, 0); pivot.add(stack);
      const t = texOf(pageCv); t.repeat.set(0.5, 1); t.offset.set(side < 0 ? 0 : 0.5, 0);
      const page = new THREE.Mesh(new THREE.PlaneGeometry(W / 2, H), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); page.rotation.x = -Math.PI / 2; page.position.set(side * W / 4, 0, 0); page.receiveShadow = true; pivot.add(page);
      return pivot;
    };
    pages = { left: make(-1), right: make(1) };
    // めくる紙のための、このマップのページの絵（root の外に持つので、マップを読みかえても次のめくりまで残る）
    if (prevPageTex && prevPageTex !== curPageTex) prevPageTex.dispose();
    prevPageTex = curPageTex; curPageTex = texOf(pageCv);
    const sky = DAY ? DAY_SKY : NIGHT; scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 34, 80);
  }

  function buildInterior() { // ブックヌック：本棚にはまった、手前が開いた箱の内側（試作_ブックヌックと同じ作り）
    const W = map.width, H = map.height, dungeon = map.stage?.look === 'dungeon';
    // 天井の高さ：ダンジョンは背の高い箱。建物の中は低い天井で、こぢんまりした部屋に（2026-11-22 作者「天井低くしたら？」）。マップの stage.ceiling で上書きできる
    const HT = map.stage?.ceiling ?? (dungeon ? Math.max(8, Math.min(12, W * 1.25)) : 5.5), F = 0.7, S = HT / 4.6; // 箱の高さ（横より高い）・額縁の太さ・試作からの縮尺
    nook = { HT, F };
    const R = rnd(dungeon ? 77 : 78);
    // tiles：絵1枚が覆うマス数（ドット絵にするときの細かさを決める）
    const rep = (c, rx, ry, tiles = 2) => { const t = PIXROOM ? pixTex(c, tiles) : texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
    const mat = (map, rough = 0.95) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });
    const plane = (w, h, m, pos, rot) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.rotation.set(...rot); p.receiveShadow = true; root.add(p); return p; };
    // 箱の内側：床・左右の壁・奥の壁・天井
    plane(W, H, mat(artT('floor', W / 4, H / 4) ?? rep(dungeon ? cobbleCanvas() : planksCanvas(), W / 4, H / 4, 4)), [W / 2, 0, H / 2], [-Math.PI / 2, 0, 0]);
    const wallC = dungeon ? brickCanvas(21, [128, 132, 118]) : plasterCanvas();
    plane(H, HT, mat(artT('wall', H / 4, HT / 4) ?? rep(wallC, H / 6, HT / 6, 6)), [0, HT / 2, H / 2], [0, Math.PI / 2, 0]);
    plane(H, HT, mat(artT('wall', H / 4, HT / 4) ?? rep(dungeon ? brickCanvas(33, [120, 124, 116]) : wallC, H / 6, HT / 6, 6)), [W, HT / 2, H / 2], [0, -Math.PI / 2, 0]);
    plane(W, HT, mat(artT('wall', W / 4, HT / 4) ?? rep(dungeon ? brickCanvas(45, [110, 112, 120]) : wallC, W / 6, HT / 6, 6)), [W / 2, HT / 2, 0], [0, 0, 0]);
    plane(W, H, mat(artT('ceiling', W / 4, H / 4) ?? rep(beamsCanvas(), W / 4, H / 4, 4)), [W / 2, HT, H / 2], [Math.PI / 2, 0, 0]);
    // 壁の飾りと灯り：手前から奥へ、左右の壁に交互。建物の中は灯りのともる窓、ダンジョンは壁の灯り（たいまつ）と暗いくぼみ
    const winM = new THREE.MeshBasicMaterial({ map: artT('window') ?? (PIXROOM ? pixTex(windowCanvas(3, 4, dungeon ? '#16221a' : '#4a2416'), 1.1 * S, 1.5 * S) : texOf(windowCanvas(3, 4, dungeon ? '#16221a' : '#4a2416'))) });
    const alcoveM = new THREE.MeshStandardMaterial({ map: PIXROOM ? pixTex(alcoveCanvas(), 1.1 * S, 1.6 * S) : texOf(alcoveCanvas()), transparent: true, alphaTest: 0.3, roughness: 1 });
    let side = 1;
    for (let z = H - 2.5; z > 1.5; z -= 4.5, side = -side) {
      const x = side < 0 ? 0.03 : W - 0.03, ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      // 壁の飾りも立体：くぼみ・窓のまわりに、張り出した石や木の枠（横から見ても厚みがある）
      const out = (dx) => (side < 0 ? dx : W - dx); // 壁から部屋の内側へ dx マス
      const solid = (bw, bh, bd, y, dz, m) => { const bx = new THREE.Mesh(new THREE.BoxGeometry(bd, bh, bw), m); bx.position.set(out(bd / 2), y, z + dz); bx.castShadow = true; bx.receiveShadow = true; root.add(bx); };
      if (dungeon) {
        const aw = 2.2 * S / 2, ah = 3.2 * S / 2;
        plane(aw, ah, alcoveM, [x, ah / 2, z], [0, ry, 0]);
        const stoneM = new THREE.MeshStandardMaterial({ map: rep(brickCanvas(52, [104, 106, 112]), 0.6, 1.2, 1), roughness: 0.95 });
        for (const dz of [-aw / 2 - 0.2, aw / 2 + 0.2]) solid(0.4, ah + 0.3, 0.45, (ah + 0.3) / 2, dz, stoneM); // 左右の柱
        solid(aw + 0.8, 0.4, 0.55, ah + 0.35, 0, stoneM);                                                   // 上の張り出し
      } else if (!(side < 0 && heightOf(map, 1, Math.floor(z)) > 0)) { // 左の壁に2階の回廊があるところには窓を付けない（2026-11-22 作者「左壁面の窓いらないかな」）
        const ww = 1.1 * S, wh = 1.5 * S, wy = HT * 0.5;
        plane(ww, wh, winM, [out(0.18), wy, z], [0, ry, 0]);
        const frM = new THREE.MeshStandardMaterial({ map: rep(woodCanvas(), 1, 1, 1), roughness: 0.85 });
        for (const dz of [-ww / 2 - 0.1, ww / 2 + 0.1]) solid(0.2, wh + 0.4, 0.35, wy, dz, frM);
        for (const dy of [-wh / 2 - 0.1, wh / 2 + 0.1]) solid(ww + 0.4, 0.2, 0.35, wy + dy, 0, frM);
        solid(ww + 0.7, 0.16, 0.6, wy - wh / 2 - 0.25, 0, frM); // 窓の下の台
      }
      const lx = side < 0 ? 0.7 : W - 0.7, ly = dungeon ? HT * 0.4 : Math.min(HT - 0.6, HT * 0.5 + 0.75 * S + 0.6); // 建物の中は窓の上
      { // 灯りの金具（壁から突き出た腕と、灯りの皿）
        const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.5 });
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.1), iron); arm.position.set(out(0.37), ly - 0.35, z); root.add(arm);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.22, 8), iron); cup.position.set(lx, ly - 0.25, z); root.add(cup);
      }
      const L = new THREE.PointLight(0xffb45a, dungeon ? 26 : 30, 9 * S / 2, 1.6); L.position.set(lx, ly, z); root.add(L);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
      g.scale.set(1.5 * S / 1.6, 1.5 * S / 1.6, 1); g.position.set(lx, ly, z); root.add(g);
      lights.push({ L, base: L.intensity, ph: z * 3 + side, z, glow: g });
    }
    const hasBackdrop = (map.stage.layers || []).some((l) => l.band === 'backdrop' && l.items.length);
    if (!dungeon && !hasBackdrop && map.stage.backWindows !== false) { plane(1.0 * S, 1.4 * S, winM, [W * 0.35, HT * 0.45, 0.04], [0, 0, 0]); plane(1.0 * S, 1.4 * S, winM, [W * 0.68, HT * 0.6, 0.04], [0, 0, 0]); }
    // 天井の吊りランプ（2026-11-22 作者「天井のランプが一個もない」）：建物の中は、部屋全体に等間隔で鎖とランタンを下げる。ダンジョンは奥へ並ぶ鎖の灯り（間をあけて）
    {
      const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.5 });
      const lampGlass = new THREE.MeshBasicMaterial({ color: 0xffd27a });
      const stepX = dungeon ? W : 6, stepZ = dungeon ? 9 : 5;
      const nx = Math.max(1, Math.round(W / stepX)), nz = Math.max(1, Math.round((H - 1) / stepZ));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = W * (i + 0.5) / nx, z = (H - 1) * (j + 0.5) / nz + 0.5, chain = dungeon ? 1.6 : Math.min(1.4, HT * 0.25), y = HT - chain - 0.35;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, chain, 5), iron); c.position.set(x, HT - chain / 2, z); root.add(c);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 6), iron); cap.position.set(x, y + 0.3, z); root.add(cap);
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.4, 6), lampGlass); lantern.position.set(x, y, z); root.add(lantern);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.1, 6), iron); base.position.set(x, y - 0.24, z); root.add(base);
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })); gl.scale.set(1.6, 1.6, 1); gl.position.set(x, y, z); root.add(gl);
        // 光源の数が多いとスマホで重くなるので、実際に部屋を照らす光は建物の中の1つおきだけ（ほかは、にじみの光だけ）
        const L = !dungeon && (i + j) % 2 === 0 ? new THREE.PointLight(0xffc070, 26, 9, 1.6) : null;
        if (L) { L.position.set(x, y - 0.1, z); root.add(L); lights.push({ L, base: L.intensity, ph: x * 1.3 + z, z, glow: gl }); }
        else lights.push({ L: { intensity: 0 }, base: 0, ph: x * 1.3 + z, z, glow: gl });
      }
    }
    const back = new THREE.PointLight(0xffb45a, 24, 10 * S / 2, 1.6); back.position.set(W / 2, HT * 0.45, 1.2); root.add(back); lights.push({ L: back, base: 24, ph: 1, z: 1.2 });
    // 手前の木の額縁（本棚の箱のふち）
    const woodT = PIXROOM ? pixTex(woodCanvas(), 1) : texOf(woodCanvas()), frameM = mat(woodT, 0.8);
    for (const [w, h, x, y] of [[W + F * 2, F, W / 2, HT + F / 2], [W + F * 2, F, W / 2, -F / 2], [F, HT, -F / 2, HT / 2], [F, HT, W + F / 2, HT / 2]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5 * S), frameM); b.position.set(x, y, H + 0.1 * S); root.add(b);
    }
    // 本棚：額縁のまわりの奥の板（穴あき）と、左右に背表紙の本、上下の棚板
    const sh = new THREE.Shape(); sh.moveTo(-60, -40); sh.lineTo(60, -40); sh.lineTo(60, 40); sh.lineTo(-60, 40);
    const hole = new THREE.Path(); hole.moveTo(-W / 2 - F, -F - HT / 2); hole.lineTo(W / 2 + F, -F - HT / 2); hole.lineTo(W / 2 + F, HT / 2 + F); hole.lineTo(-W / 2 - F, HT / 2 + F); sh.holes.push(hole);
    const backShelf = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1 }));
    backShelf.position.set(W / 2, HT / 2, H - 0.9 * S); root.add(backShelf);
    const cols = [0x5a2a22, 0x2a3a5a, 0x3a4a2a, 0x6a4a1a, 0x4a2a4a, 0x2a2a2a, 0x7a5a3a];
    const bandM = new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.5, metalness: 0.4 });
    for (const sd of [-1, 1]) {
      let x = sd < 0 ? -F - 0.05 : W + F + 0.05; const end = sd < 0 ? -9 * S : W + 9 * S;
      while (sd < 0 ? x > end : x < end) {
        const bw = (0.18 + R() * 0.22) * S, bh = HT * (0.56 + R() * 0.3), bd = 1.1 * S;
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshStandardMaterial({ color: cols[(R() * cols.length) | 0], roughness: 0.8 }));
        b.position.set(x + sd * bw / 2, bh / 2 + 0.02, H - 0.25 * S); b.rotation.z = (R() - 0.5) * 0.03; root.add(b);
        const band = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.01, 0.06 * S, bd + 0.02), bandM); band.position.set(b.position.x, bh * (0.78 + R() * 0.1), H - 0.25 * S); root.add(band);
        x += sd * (bw + 0.02);
      }
    }
    for (const y of [-F - 0.08 * S, HT + F]) { const s = new THREE.Mesh(new THREE.BoxGeometry(W + 22 * S, 0.16 * S, 1.6 * S), frameM); s.position.set(W / 2, y, H - 0.2 * S); root.add(s); }
    // 本棚の前を照らす部屋のやわらかい灯り（入る・出るとき、遠くから本棚が見える）と、箱の中のうすい月明かり
    const room = new THREE.SpotLight(0xffd9a8, 60 * S * S, 40 * S, 0.55, 0.7, 1.6); room.position.set(W / 2 - 2 * S, 9 * S, H + 10 * S); room.target.position.set(W / 2, HT / 2, H); root.add(room, room.target);
    root.add(new THREE.AmbientLight(0x4a5478, 0.5));
    { const shelfL = new THREE.PointLight(0xffc890, 30 * S, 14 * S, 1.4); shelfL.position.set(W / 2, HT * 0.55, H + 3 * S); root.add(shelfL); } // 額縁と本棚を前から照らす（2026-11-22 作者「客室もブックヌックぽく」：本棚が暗くて見えなかった）
    if (map.heights) buildLevels(W, H);
    pages = null; scene.background = new THREE.Color(0x07060c); scene.fog = new THREE.FogExp2(0x0b0912, 0.028 / S);
  }

  /**
   * ブックヌックの中の立体（箱）。足もとの広さは、マップの板の範囲（x..x+w × y..y+h マス）と同じ＝通れないマスと一致する。
   * 面の順は +x, -x, +y（上）, -y, +z（手前）, -z（奥）。石の柱は全面に石積み＋上下の飾りの石、タイル画像の家具は手前に絵・ほかは木、木の柱は全面に木。
   */
  function solidMesh(name, art, rc, b, it) {
    const w = b.w, d = Math.max(0.6, it.h), h = rc ? b.h : (it.standH ?? b.h);
    const tile = (c, rx, ry) => { const t = PIXROOM ? pixTex(c, 2) : texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(0.3, rx), Math.max(0.3, ry)); return t; };
    const M = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, ...extra });
    const g = new THREE.Group();
    const box = (mats, bw, bh, bd, y, z = -d / 2) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mats); m.position.set(0, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    if (name === 'stone-pillar') {
      const side = (s) => M(tile(brickCanvas(60 + s, [118, 120, 126]), s === 0 ? d / 2.2 : w / 2.2, h / 2.2)), cap = M(tile(brickCanvas(70, [96, 98, 104]), 1, 1));
      box([side(0), side(0), cap, cap, side(1), side(1)], w * 0.82, h, d * 0.82, h / 2);
      for (const y of [0.18, h - 0.18]) box(cap, w, 0.36, d, y); // 柱の下と上の、張り出した飾りの石
      return g;
    }
    const woodM = M(tile(woodCanvas(), w / 2, h / 2)), woodD = M(tile(woodCanvas(), d / 2, h / 2)), woodTop = M(tile(woodCanvas(), w / 2, d / 2));
    if (name === 'pillar') { box([woodD, woodD, woodTop, woodTop, woodM, woodM], w * 0.7, h, d * 0.7, h / 2); return g; }
    // 家具は形で作る（2026-11-22 作者：「テーブルやばい」＝絵を貼った箱では木箱に見えた）。高さはキャラ（2.5マス）に合わせる
    const leg = (x, z, lh, s = 0.16) => box(woodD, s, lh, s, lh / 2, z).position.setX(x);
    if (it.region === 'table') { // 天板＋4本の脚＋まわりの丸椅子
      const th = 1.05, inset = 0.22;
      const topArt = artT('tabletop'); box([woodD, woodD, topArt ? M(topArt) : woodTop, woodTop, woodM, woodM], w, 0.14, d * 0.9, th);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(sx * (w / 2 - inset), -d / 2 + sz * (d * 0.45 - inset), th - 0.07);
      for (const [sx, sz] of [[-0.62, 1], [0, 1], [0.62, 1], [-0.62, -1], [0.62, -1]].slice(0, Math.max(2, Math.round(w)) + 1)) { // 丸椅子
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), woodTop); st.position.set(sx * w / 2, 0.62, -d / 2 + sz * (d * 0.45 + 0.35)); st.castShadow = true; g.add(st);
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), woodD); sl.position.set(st.position.x, 0.3, st.position.z); g.add(sl);
      }
      return g;
    }
    if (name === 'stairs-up') { // 上り階段：手前から奥へ段が上がり、奥の壁の上へ消える
      const N = 7, sw = w * 1.15;
      for (let i = 0; i < N; i++) box([woodD, woodD, woodTop, woodTop, woodM, woodM], sw, (i + 1) * h / N, d / N, (i + 1) * h / N / 2, -d * (i + 0.5) / N);
      for (const sx of [-1, 1]) { const r = box(woodD, 0.08, 0.08, Math.hypot(d, h), h / 2 + 0.9, -d / 2); r.position.x = sx * sw / 2; r.rotation.x = Math.atan2(h, d); } // 手すり
      return g;
    }
    if (name === 'stairs-down') { // 下り階段：床に開いた暗い口と、まわりの手すり
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, d), new THREE.MeshBasicMaterial({ color: 0x0a0806 })); hole.rotation.x = -Math.PI / 2; hole.position.set(0, 0.012, -d / 2); g.add(hole);
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.05, d / 4), woodTop); s.position.set(0, -0.15 - i * 0.25, -d * (0.2 + i * 0.25)); g.add(s); } // 口の中に見える段
      for (const sx of [-1, 1]) box(woodD, 0.1, 0.9, d, 0.45).position.setX(sx * w * 0.58);
      return g;
    }
    if (name === 'bed') { // 寝台：木の枠・敷き布団・掛け布・枕・頭の板
      const cloth = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
      box([woodD, woodD, woodTop, woodTop, woodM, woodM], w, 0.45, d, 0.225);
      box(cloth(0xe8dcc0), w - 0.12, 0.2, d - 0.12, 0.55);
      const blanketArt = artT('blanket'); box(blanketArt ? M(blanketArt) : cloth(0x5a3a6a), w - 0.06, 0.22, d * 0.62, 0.58, -d * 0.31 - 0.02);
      box(cloth(0xf2ead6), w * 0.6, 0.16, 0.45, 0.72, -d + 0.4);
      box([woodD, woodD, woodTop, woodTop, woodM, woodM], w, 1.1, 0.12, 0.55, -d + 0.06);
      return g;
    }
    if (it.region === 'counter') { // 受付の台：腰の高さの台と、少し張り出した天板
      const ch = 1.25;
      const frontArt = artT('counter'); box([woodD, woodD, woodTop, woodTop, frontArt ? M(frontArt) : woodM, woodM], w, ch - 0.12, d * 0.8, (ch - 0.12) / 2);
      box([woodD, woodD, woodTop, woodTop, woodM, woodM], w + 0.2, 0.12, d * 0.8 + 0.25, ch - 0.06);
      return g;
    }
    if (it.region === 'hearth') { // 暖炉：石の囲いと、暗い口の中の火
      const sm = M(artT('brick', w / 1.5, 1.4) ?? tile(brickCanvas(80, [140, 120, 104]), w / 2, 1)), hh = 2.6;
      box([sm, sm, sm, sm, sm, sm], w, hh, d * 0.7, hh / 2);
      box([sm, sm, sm, sm, sm, sm], w + 0.3, 0.2, d * 0.7 + 0.25, hh * 0.62);                 // 炉棚
      { const top = nook ? nook.HT : 5.5, y0 = hh * 0.62 + 0.1; if (top > y0 + 0.2) box([sm, sm, sm, sm, sm, sm], w * 0.62, top - y0, d * 0.55, y0 + (top - y0) / 2, -d * 0.35); } // 煙突：炉棚から天井まで（2026-11-22 作者「暖炉は天井まで伸ばして」）
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, hh * 0.42), new THREE.MeshBasicMaterial({ color: 0x0a0604 })); mouth.position.set(0, hh * 0.21, 0.01); g.add(mouth);
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 })); fire.scale.set(1.4, 1.1, 1); fire.position.set(0, 0.35, 0.15); g.add(fire);
      // 揺れる炎（6コマを順に）と、舞い上がる火の粉
      const ft = texOf(flameCanvas()); ft.repeat.set(1 / FIRE_FRAMES, 1);
      const flame = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, hh * 0.36), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(0, hh * 0.18, 0.03); g.add(flame);
      const embers = []; for (let k = 0; k < 10; k++) { const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); e.scale.set(0.09, 0.09, 1); g.add(e); embers.push({ s: e, ph: k / 10, dx: (k % 5 - 2) * 0.12 }); }
      fires.push({ tex: ft, embers, y0: hh * 0.12, y1: hh * 0.62, w: w * 0.4 });
      const L = new THREE.PointLight(0xff8a3a, 20, 7, 1.6); L.position.set(0, 0.6, 0.6); g.add(L); lights.push({ L, base: 20, ph: 5, z: it.y + it.h, glow: fire, fire: true });
      return g;
    }
    if (rc) { // タイル画像の家具：手前の面に絵（にじませない）、上・横・奥は木。絵の透明な部分は木で埋める
      const front = M(art, { transparent: true, alphaTest: 0.35 });
      box([woodD, woodD, woodTop, woodTop, front, woodM], w, h, d, h / 2);
      return g;
    }
    // そのほか（仮の板の絵）：手前と奥に絵、横と上は紙のふちの色
    const edge = new THREE.MeshStandardMaterial({ color: 0xd8c8a2, roughness: 1 }), face = M(art, { transparent: true, alphaTest: 0.35 });
    box([edge, edge, edge, edge, face, face], w, h, Math.min(d, 0.6), h / 2, -Math.min(d, 0.6) / 2);
    return g;
  }

  /**
   * 高さのある床（2026-11-22 作者「階段をしっかり階段に。上は吹き抜けにして、2階の壁にドアがあって部屋に入れるように」）
   * - いちばん高いマス：2階の通路（床板の厚い板）。下の段とのさかいに手すり、ところどころに1階の床までの柱
   * - それより低いマス：階段。1マスを前後2段に分け、奥が高い。低い側に手すり
   * - 奥の壁（y=0）の出入口：通路の高さに扉
   */
  function buildLevels(W, H) {
    let top = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) top = Math.max(top, heightOf(map, x, y));
    const woodTop = texOf(planksCanvas()); woodTop.wrapS = woodTop.wrapT = THREE.RepeatWrapping;
    const woodSide = texOf(woodCanvas()); woodSide.wrapS = woodSide.wrapT = THREE.RepeatWrapping;
    const plank = new THREE.MeshStandardMaterial({ map: woodTop, roughness: 0.9 }), side = new THREE.MeshStandardMaterial({ map: woodSide, roughness: 0.85 });
    const mats = [side, side, plank, side, side, side];
    const box = (w, h, d, x, y, z, m = mats) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; root.add(b); return b; };
    const q = mapQuery(map, { kinds: { floor: { passable: true }, door: { passable: true }, wall: {}, counter: {}, water: {}, bridge: { passable: true } } });
    const walk = (x, y) => q.passable(x, y);
    const rail = (x0, z0, x1, z1, y) => { // 手すり：柱2本と上の横木
      for (const [x, z] of [[x0, z0], [x1, z1]]) box(0.1, 0.95, 0.1, x, y + 0.475, z, side);
      const len = Math.hypot(x1 - x0, z1 - z0), r = box(len + 0.1, 0.08, 0.08, (x0 + x1) / 2, y + 0.95, (z0 + z1) / 2, side); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    };
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      const h = heightOf(map, x, y); if (h <= 0 || !walk(x, y)) continue;
      const Y = h * HU, cx = x + 0.5, cz = y + 0.5;
      if (h === top) { // 2階の通路
        box(1, 0.28, 1, cx, Y - 0.14, cz);
        if (y === 1) box(1, 0.28, 1, cx, Y - 0.14, cz - 1); // 奥の壁まで床をのばす（扉の下にすき間を作らない。作者「扉が地面から少し離れている」）
        // 部屋側（低い床がある側）に手すりと、ところどころ1階までの柱。回廊が曲がっても四方を見る（2026-11-22 左の壁ぞいにものばした）
        const open = (dx, dy) => { const nx = x + dx, ny = y + dy; return heightOf(map, nx, ny) < h - 1 && q.kindAt(nx, ny) !== 'wall' && q.kindAt(nx, ny) !== null; };
        if (open(0, 1)) { rail(x, y + 1, x + 1, y + 1, Y); if (x % 3 === 1) box(0.22, Y, 0.22, cx, Y / 2, y + 0.9, side); }
        if (open(1, 0)) { rail(x + 1, y, x + 1, y + 1, Y); if (y % 3 === 0) box(0.22, Y, 0.22, x + 0.9, Y / 2, cz, side); }
        if (open(-1, 0)) { rail(x, y, x, y + 1, Y); if (y % 3 === 0) box(0.22, Y, 0.22, x + 0.1, Y / 2, cz, side); }
        if (x === 1) box(1, 0.28, 1, cx - 1, Y - 0.14, cz); // 左の壁まで床をのばす
      } else { // 階段：奥（yが小さい側）が高い。1マスを2段に
        box(1, Y, 0.5, cx, Y / 2, y + 0.25); box(1, Math.max(0.05, Y - HU / 2), 0.5, cx, Math.max(0.05, Y - HU / 2) / 2, y + 0.75);
        if (heightOf(map, x - 1, y) < h - 1 || !walk(x - 1, y)) rail(x, y + 1, x, y, Y - HU / 2); // 低い側（左）の手すり
      }
    }
    // 奥の壁の出入口に扉（通路の高さ）
    const doorArt = artT('door'), doorM = doorArt ? new THREE.MeshStandardMaterial({ map: doorArt, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.8 }), frameM2 = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.8 }), knob = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 0.4, metalness: 0.6 });
    for (const e of map.exits || []) {
      if (e.y === 0) { // 奥の壁の扉
        const Y = heightOf(map, e.x, 0) * HU, cx = e.x + 0.5;
        box(1.0, 2.1, 0.12, cx, Y + 1.05, 0.08, doorM);
        box(1.2, 0.14, 0.18, cx, Y + 2.15, 0.1, frameM2); for (const dx of [-0.55, 0.55]) box(0.12, 2.2, 0.18, cx + dx, Y + 1.1, 0.1, frameM2);
        box(0.09, 0.09, 0.08, cx + 0.32, Y + 1.0, 0.18, knob);
      } else if (e.x === 0 && heightOf(map, 0, e.y) > 0) { // 左の壁の扉（回廊の高さ。2026-11-22 作者「左壁沿いにも部屋を」）
        const Y = heightOf(map, 0, e.y) * HU, cz = e.y + 0.5;
        box(0.12, 2.1, 1.0, 0.08, Y + 1.05, cz, doorM);
        box(0.18, 0.14, 1.2, 0.1, Y + 2.15, cz, frameM2); for (const dz of [-0.55, 0.55]) box(0.18, 2.2, 0.12, 0.1, Y + 1.1, cz + dz, frameM2);
        box(0.08, 0.09, 0.09, 0.18, Y + 1.0, cz - 0.32, knob);
        box(1, 0.28, 1, 0.5, Y - 0.14, cz); // 扉の下の床
      }
    }
  }

  function buildBoards() {
    boards = [];
    for (const layer of map.stage.layers) for (const it of layer.items) {
      const rc = it.region ? regionCanvas(it) : null;
      const T = map.tileSize || 32, b = placeBoard(it, layer.band, T, rc ? [rc.width, rc.height] : null);
      const name = it.asset.replace('placeholder:', '');
      const artC = rc ? null : (ART[name] || ((w, h) => genericArt(w, h, boards.length + 5)))(b.w, b.h, it.x * 131 + it.y * 37 + 1); // 3つめ＝板ごとの seed（位置から決まるので、開き直しても同じ家）
      let art = rc ? texOf(rc, true) : PIXROOM && interior ? pixTex(artC, b.w, b.h) : texOf(artC);
      const townC = rc ? null : townBoardCanvas(name, b, it);
      if (townC) { if (townC.w && townC.w !== b.w) { b.x += (b.w - townC.w) / 2; b.w = townC.w; } b.h = townC.h; art =PIXROOM ? pixTex(townC.c, b.w, b.h) : texOf(townC.c); }
      if (it.encounter && SYM[it.encounter]) art = texOf(symbolCanvas(SYM[it.encounter], b.w, b.h), true); // 見えている敵は、戦う敵の姿 // 内装（絵柄）を「ドット」にすると町の絵もドットに
      const img = DAY && !interior && it.imageDay ? it.imageDay : it.image; // 昼は昼の背景
      if (img) { // 絵のファイルを張る（奥の背景。下をそろえ、板の形に合わせて上を切る＝引き伸ばさない）
        const bw = b.w, bh = b.h; art = loader.load(img, (t) => { const iw = t.image.width, ih = t.image.height, f = Math.min(1, (iw / ih) / (bw / bh)); t.repeat.set(1, f); t.offset.set(0, 0); t.needsUpdate = true; });
        art.colorSpace = THREE.SRGBColorSpace; art.anisotropy = 8;
      }
      // ブックヌック（中）の物は立体：板ではなく厚みのある箱にし、側面と上にも手ざわりを張る（2026-11-22 作者：「ブックヌックは、シャドーボックスと違って立体もある。横も描けるテクスチャで」）
      // 奥の壁の絵（backdrop）だけは、壁に貼った平らな絵のまま
      if (interior && layer.band !== 'backdrop') {
        const solid = solidMesh(name, art, rc, b, it);
        const hinge = new THREE.Group(); hinge.position.set(b.x + b.w / 2, 0, it.y + it.h); hinge.add(solid); root.add(hinge);
        boards.push({ hinge, mesh: solid, z: b.z, fade: it.fadeNearPlayer ? it : null, name: it.region ? `${it.asset}#${it.region}` : it.asset, solid: true });
        continue;
      }
      const mesh = boardMesh(art, b.w, b.h);
      if (townC?.file && !DAY && !interior) { const gl = windowGlow(townC.c, townC.file, Math.abs(it.x * 31 + it.y * 17) | 0); if (gl) { mesh.material.emissiveMap = PIXROOM ? pixTex(gl, b.w, b.h) : texOf(gl); mesh.material.emissive = new THREE.Color(0xffffff); mesh.material.emissiveIntensity = 1.5; } } // 夜は家の窓に明かり
      if (layer.band === 'backdrop') { mesh.castShadow = false; mesh.material.fog = false; if (it.sink) mesh.position.y -= it.sink; } // sink：背景の下を本のページより下に沈める（絵の下のはしで切れた家の壁を見せない。2026-11-22 作者「屋根はあるけど家のドアや窓の部分がなくて変」）
      else if (!interior) holeMaterial(mesh.material);
      const cx = b.x + b.w / 2, hinge = new THREE.Group();
      // 外：板はページの上に立ち、本がひらくときはページといっしょに動く（左右どちらのページか）
      const parent = pages ? (cx < map.width / 2 ? pages.left : pages.right) : root;
      // ブックヌックの奥の壁の絵は、箱の奥の壁と同じ位置だと重なってちらつく（2026-11-22 作者「この部分ちかちかする」）ので、少し手前に出す
      const zb = interior && layer.band === 'backdrop' ? Math.max(b.z, 0) + 0.12 : b.z;
      if (pages) hinge.position.set(cx - map.width / 2, 0.01, zb - map.height / 2); else hinge.position.set(cx, 0.01, zb);
      hinge.add(mesh); parent.add(hinge);
      boards.push({ hinge, mesh, z: b.z, x0: b.x, x1: b.x + b.w, h: b.h, band: layer.band, fade: it.fadeNearPlayer ? it : null, name: it.region ? `${it.asset}#${it.region}` : it.asset, enc: it.encounter ? `${map.id}:${it.encounter}` : null });
      if (name === 'lamp') { const L = new THREE.PointLight(0xdde8ff, 10, 6, 1.6); L.position.set(0, b.h * 0.85, 0.4); hinge.add(L); lights.push({ L, base: 10, ph: cx, z: b.z }); } // 導機灯の淡い白
      if (name === 'stall' || name === 'inn-front' || name === 'inn-tall') { const L = new THREE.PointLight(0xffb45a, 18, 9, 1.6); L.position.set(0, b.h * 0.45, 0.8); hinge.add(L); lights.push({ L, base: 18, ph: cx, z: b.z }); }
    }
    delayOf = riseDelayFn(boards.map((b) => b.z));
  }

  function actorMesh(id) {
    // デフォルメの歩きのドット絵（台帳の style: chibi）があれば、4方向×4コマのシートで歩かせる（2026-11-22 ナハトから）
    const pe = [...(assets.ledger.party || []), ...(assets.ledger.cast || [])].find((p) => p.id === id), byId = (x) => assets.ledger.assets.find((a) => a.id === x);
    const we = pe && byId(pe.walk), ie = pe && byId(pe.idle);
    if (we?.style === 'chibi' && assets.images[we.id] && assets.images[ie?.id]) {
      const mk = (img) => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
      const walkT = mk(assets.images[we.id]), idleT = mk(assets.images[ie.id]);
      const [fw, fh] = we.frame, h = fh * DOT, w = h * fw / fh; // ドットの大きさはみんな同じ（DOT）。絵の高さで背の高さが決まる（フレアは小柄）
      const mesh = boardMesh(walkT, w, h); fillMaterial(mesh.material, walkT); mesh.position.y = h / 2 - (fh - we.anchor[1]) / fh * h; // 足の裏（anchor）を地面に
      const hinge = new THREE.Group(); hinge.add(mesh); root.add(hinge);
      // 顔の層（2026-11-22 作者の案「顔の部分だけ別のレイヤに。表情も変えられる」）：体の上に、顔のマスを重ねて描く。背中では出さない
      const fe = pe.faces && byId(pe.faces);
      let face = null;
      if (fe && assets.images[fe.id]) {
        const ft = mk(assets.images[fe.id]), [cw, ch] = fe.cell;
        const fm = new THREE.Mesh(new THREE.PlaneGeometry(w * cw / fw, h * ch / fh), fillMaterial(new THREE.MeshStandardMaterial({ map: ft, transparent: true, alphaTest: 0.35, roughness: 1, side: THREE.DoubleSide }), ft));
        hinge.add(fm); face = { e: fe, t: ft, mesh: fm, w, h, fw, fh };
      }
      return { hinge, mesh, face, sheet: { walk: { e: we, t: walkT }, idle: { e: ie, t: idleT } } };
    }
    const base = flutter[id]; if (!base) return null;
    const t = base.clone(); t.needsUpdate = true; t.repeat.set(1 / FLUTTER_FRAMES, 1);
    const mesh = boardMesh(t, ACTOR_SIZE, ACTOR_SIZE); fillMaterial(mesh.material, t); const hinge = new THREE.Group(); hinge.add(mesh); root.add(hinge);
    return { hinge, mesh, tex: t, off: Object.keys(actors).length * 3 };
  }

  /** 出入口のしるし（2026-11-22 作者「入口の前の地面を少し明るくするとわかる／入るところも壁に沿って影が少しだけあるとわかるかな」）：
   * 入口の手前のマスの地面にやわらかい明るい丸、入口のマスには壁ぎわから手前へ薄れる影の帯 */
  function buildExitMarks() {
    const V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const glowT = texOf(canvas(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,214,140,.5)'); gr.addColorStop(0.55, 'rgba(255,200,120,.24)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); /* 石畳が淡いので、白ではなく暖かい色で（白は見えなかった） */ g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
    const edgeT = texOf(canvas(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,224,150,.9)'); gr.addColorStop(0.35, 'rgba(255,206,120,.4)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const sx = g.createLinearGradient(0, 0, w, 0); sx.addColorStop(0, 'rgba(0,0,0,1)'); sx.addColorStop(0.15, 'rgba(0,0,0,0)'); sx.addColorStop(0.85, 'rgba(0,0,0,0)'); sx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = sx; g.fillRect(0, 0, w, h); })); // はしに沿う光：上（はしの側）が明るく、両はしは薄れる
    const shadeT = texOf(canvas(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(10,6,4,.6)'); gr.addColorStop(1, 'rgba(10,6,4,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
    // 明るい丸は「足す」まぜ方（ふつうのまぜ方だと、白っぽい石畳の上では暖かい色がかえって暗く見えた）
    const decal = (tex, w, d, x, z, rotY, add = false) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = rotY; m.renderOrder = 1;
      const y = heightOf(map, Math.floor(x), Math.floor(z)) * HU + 0.12;
      if (pages) { const parent = x < map.width / 2 ? pages.left : pages.right; m.position.set(x - map.width / 2, y + 0.01, z - map.height / 2); parent.add(m); }
      else { m.position.set(x, y, z); root.add(m); }
    };
    for (const e of map.exits || []) {
      const v = V[e.dir]; if (!v) continue;
      // 広い出入口（span）：明るい丸は入口の幅いっぱいにのばす（2026-11-22 作者「ひろくしたら光もひろく」）
      const n = e.span || 1, vert = e.dir === 'left' || e.dir === 'right', mid = (n - 1) / 2;
      const ex = e.x + (vert ? 0 : mid), ey = e.y + (vert ? mid : 0); // 入口の真ん中
      const fx = ex - v[0], fy = ey - v[1]; // 入口の手前の列の真ん中
      const along = n + 1.2, rot = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[e.dir];
      decal(glowT, vert ? 2.2 : along, vert ? along : 2.2, fx + 0.5 - v[0] * 0.1, fy + 0.5 - v[1] * 0.1, 0, true);
      const onEdge = e.x === 0 || e.y === 0 || e.x === map.width - 1 || e.y === map.height - 1;
      if (onEdge && !interior) { // ページのはしの出入口：はしに沿って光る帯（はしがいちばん明るく、内へ薄れる。作者「はしのほうに沿って光があるように」）
        decal(edgeT, n + 0.6, 2.2, ex + 0.5 - v[0] * 0.6, ey + 0.5 - v[1] * 0.6, rot, true);
        continue;
      }
      if (interior && e.dir === 'down') continue; // ブックヌックの手前（開いた側）には壁が無い
      // 影の帯：入口のマスの、壁のある側（進む向きの先）から手前へ。幅は入口の左右1マスずつまで
      decal(shadeT, n + 2, 0.6, ex + 0.5 + v[0] * 0.2, ey + 0.5 + v[1] * 0.2, rot);
    }
  }

  return {
    name: 'paper',
    async load(mapData) {
      await flutterReady;
      if (root) { scene.remove(root); disposeTree(root); }
      map = mapData; root = new THREE.Group(); scene.add(root); actors = {}; lights = []; fires = []; cam.init = false;
      interior = map.kind === 'interior'; nook = null;
      // ?perf=1：マップを開くときの各段の時間をコンソールに出す（2026-11-22 作者「町が出るまで時間がかかる理由」を調べるため）
      const PF = /[?&]perf=1/.test(location.search), pt = [performance.now()], mark = () => pt.push(performance.now());
      await loadArt(map); mark(); await loadTown(map); mark(); await loadSymbols(map); mark();
      if (interior) buildInterior(); else buildExterior(); mark();
      buildBoards(); mark();
      buildExitMarks();
      applyOrbs(map); mark();
      if (PF) console.info('[perf] load', map.id, ['art', 'town', 'symbols', 'ground', 'boards', 'marks'].map((k, i) => k + ' ' + Math.round(pt[i + 1] - pt[i]) + 'ms').join(' / '));
      const W = map.width, H = map.height, ext = Math.max(W, H) * 0.75;
      Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 120 }); key.shadow.camera.updateProjectionMatrix();
      key.position.set(W / 2 - 14, 26, H / 2 + 16); key.target.position.set(W / 2, 0, H / 2);
      key.intensity = interior ? 0.5 : DAY ? 2.6 : 1.6;
      key.color.set(DAY && !interior ? 0xfff8ec : 0xfff0d8);
      hemi.intensity = DAY && !interior ? 1.7 : 0.9; hemi.color.set(DAY && !interior ? 0xcfe2ff : 0x8090c8); hemi.groundColor.set(DAY && !interior ? 0x6a5a40 : 0x2a1a10);
    },
    resize(w, h, dpr) { cssW = Math.max(1, w); cssH = Math.max(1, h); renderer.setPixelRatio(Math.min(2, dpr || 1)); renderer.setSize(cssW, cssH, false); camera.aspect = cssW / cssH; camera.updateProjectionMatrix(); },
    /**
     * @param {any} view
     * @param {{ intro?: { t:number, open:number, coverRad:number, zoom:number } | null, seconds?: number }} [fx]
     */
    draw(view, fx = {}) {
      if (!map) return;
      const intro = fx.intro ?? null, sec = fx.seconds ?? 0, now = performance.now() / 1000;
      lastIntro = intro;
      const W = map.width, H = map.height;
      // 出入口の演出（2026-11-22 作者の決定）。view.effect：kind（page / nook-in / nook-out）・phase（leave / arrive）・p（0→1）
      const ef = view.effect || null, efk = ef ? `${ef.kind}:${ef.phase}` : '', ep = ef ? ef.p : 0;
      const cl = (/** @type {number} */ x) => Math.max(0, Math.min(1, x)), ez = (/** @type {number} */ x) => 1 - Math.pow(1 - cl(x), 3);
      lastEffect = efk;
      // 板の起き上がり：開始演出と同じ時間割（riseK）を借りる。riseT が null なら立ったまま
      let riseT = intro ? intro.t : null, fold = 1;
      if (efk === 'page:leave') fold = 1 - ez(ep / 0.9);                              // いまのエリアの板とキャラが倒れる
      if (efk === 'page:arrive') riseT = ep < 0.52 ? 0 : 0.9 + (ep - 0.52) / 0.48 * 1.25; // ページがめくれ終わってから、次のエリアの板が起き上がる
      if (efk === 'nook-out:arrive' && pages) riseT = 0.9 + ep * 1.3;                  // 外に出ると、板が起き上がって迎える
      const kOf = (/** @type {number} */ z, /** @type {boolean} */ isActor) => (riseT === null ? 1 : riseK(riseT, delayOf(z, isActor))) * fold;
      // 本がひらく
      // 閉じた本は、表紙を上にして置いてある（右半分が左半分の上に重なっている）。ひらくと、右半分が背を軸に表紙ごと右へめくれて開く
      // （2026-11-22 作者：「クリックする前は、表紙が上に置かれているのでは」）
      if (pages) { const open = intro ? intro.open : 1; pages.left.rotation.z = 0; pages.right.rotation.z = Math.PI * 0.995 * (1 - open); }
      // めくれるページ（右から左へ。先のほうが遅れて、紙がしなる）
      const turning = efk === 'page:arrive' && !!pages && ep > 0.01 && ep < 0.56;
      turnMesh.visible = turning;
      if (turning) {
        if (turnA.material.map !== (prevPageTex || turnTex)) setTurnTex(turnA, prevPageTex); // 表＝前のページ
        if (turnB.material.map !== (curPageTex || turnTex)) setTurnTex(turnB, curPageTex); // 裏＝新しいページ
        turnMesh.position.set(W / 2, 0.05, H / 2); bendPage(ez(ep / 0.54), W / 2, H, ef && ef.dir === 'left' ? -1 : 1); // 左へ出たら左からめくる
      }
      // 板：起き上がる（少し行きすぎて戻る）。手前の板は、主人公が近いと薄くなる
      const lead = view.actors[0];
      for (const b of boards) {
        const k = kOf(b.z, false);
        b.hinge.visible = k > 0.01; b.hinge.rotation.x = -Math.PI / 2 * (1 - k);
        if (b.enc && (view.defeated || []).includes(b.enc)) { b.hinge.visible = false; continue; } // 倒した見えている敵は消す
        let alpha = 1;
        // 外では、主人公より手前にあって主人公と重なる板（家・露店など）を透かす（2026-11-22 ノルンを広げたら、手前の家が主人公を隠した）
        // 主人公より手前の板は、主人公のまわりの丸（のぞき穴）だけ透かす。板のほかの所はそのまま
        // （前は「基本手前にあるやつは近づかなくても透けるように」で板ぜんぶを 0.35 にしていた。2026-11-22 作者「スポットライトが当たるところだけすけるとか」）
        const hole = b.mesh.material && b.mesh.material.userData && b.mesh.material.userData.holeOn;
        if (hole) hole.value = !b.fade && b.z > lead.y + 0.7 ? 1 : 0;
        if (b.fade) { const it = b.fade; if (lead.x >= it.x - 1 && lead.x <= it.x + it.w && lead.y >= it.y - 2 && lead.y <= it.y + it.h) alpha = 0.4; }
        // カメラに近すぎる板は透かす（2026-11-22 作者「カメラに近すぎる家とかは透明にしてほしい」）。カメラ（前の絵の位置）から板のいちばん近い所までの
        // 横の距離が NEAR_FAR マスより近いと薄くなりはじめ、NEAR_NEAR マスでいちばん薄く（NEAR_MIN）
        if (!interior && b.x1 !== undefined && b.band !== 'backdrop') {
          const dx = Math.max(b.x0 - lastEye[0], 0, lastEye[0] - b.x1), dz = lastEye[2] - b.z;
          if (dz > -0.5) { const dd = Math.hypot(dx, Math.max(0, dz)); if (dd < NEAR_FAR) alpha = Math.min(alpha, Math.round((NEAR_MIN + (1 - NEAR_MIN) * cl((dd - NEAR_NEAR) / (NEAR_FAR - NEAR_NEAR))) * 20) / 20); }
        }
        if (b.solid) { // 立体（ブックヌックの箱）：箱ぜんぶを薄くする
          if ((b.alpha ?? 1) !== alpha) { b.alpha = alpha; b.mesh.traverse((o) => { if (o.material) for (const mt of [].concat(o.material)) { mt.transparent = true; mt.opacity = alpha; mt.depthWrite = alpha >= 1; } o.castShadow = alpha >= 1; }); }
          continue;
        }
        const m = b.mesh.material; if (m.opacity !== alpha) { const was = m.opacity >= 1; m.opacity = alpha; if (was !== (alpha >= 1)) { m.depthWrite = alpha >= 1; m.alphaTest = alpha >= 1 ? 0.35 : 0.05; m.needsUpdate = true; b.mesh.castShadow = alpha >= 1; } } // 作り直しは「不透明⇔薄い」が変わるときだけ
      }
      // キャラ（左右反転しない。いまは1方向の絵のまま）
      const seen = new Set();
      for (const a of view.actors) {
        seen.add(a.id);
        if (!actors[a.id]) { const am = actorMesh(a.id); if (!am) continue; actors[a.id] = am; }
        const am = actors[a.id], k = kOf(a.y + 0.5, true);
        am.hinge.visible = k > 0.01; am.hinge.rotation.x = -Math.PI / 2 * (1 - k);
        // 入るとき：キャラは入口の奥へ歩いて、入口の板の向こうに消える（カメラがキャラの絵に寄りすぎない）
        const inward = efk === 'nook-in:leave' ? ez(ep / 0.45) * 1.8 : 0, sideDoor = ef?.at && ef.at.x === 0 && ef.at.y > 0; // 左の壁の扉では左へ歩いて消える
        am.hinge.position.set(snapDot(a.x + 0.5) - (sideDoor ? inward : 0), 0.02 + heightLerp(map, a.x, a.y) * HU, snapDot(a.y + 0.62) - (sideDoor ? 0 : inward)); // ドット1つ分の刻みにそろえる。高さのあるマス（階段・2階の通路）では持ち上げる
        if (am.sheet) { // 4方向のシート：向きの行・歩きのコマを選ぶ（左右は別の行。反転しない）
          const s = a.motion === 'walk' ? am.sheet.walk : am.sheet.idle, f = sheetFrame(s.e, a.dir, a.animMs), img = s.t.image;
          const m = am.mesh.material; if (m.map !== s.t) { m.map = s.t; m.emissiveMap = s.t; am.mesh.customDepthMaterial.map = s.t; m.needsUpdate = true; }
          s.t.repeat.set(f.sw / img.width, f.sh / img.height); s.t.offset.set(f.sx / img.width, 1 - (f.sy + f.sh) / img.height);
          if (am.face) { // 顔の層：このコマの顔の位置（コマごとに頭が少し動く）に、向き・表情のマスを置く
            const F = am.face, e = F.e, list = e.anchors[a.motion === 'walk' ? 'walk' : 'idle'][a.dir], an = list && list[Math.round(f.sx / f.sw)], row = e.dirs.indexOf(a.dir);
            const expr = a.expression ?? window.SR_FACE?.[a.id] ?? 'normal', col = Math.max(0, e.expressions.indexOf(expr));
            F.mesh.visible = !!an && row >= 0;
            if (F.mesh.visible) {
              const [cw, ch] = e.cell, fi = F.t.image;
              F.mesh.position.set(((an[0] + cw / 2) / F.fw - 0.5) * F.w, am.mesh.position.y + (0.5 - (an[1] + ch / 2) / F.fh) * F.h, 0.004);
              F.t.repeat.set(cw / fi.width, ch / fi.height); F.t.offset.set(col * cw / fi.width, 1 - (row + 1) * ch / fi.height);
            }
          }
        } else am.tex.offset.x = (Math.floor(now * FLUTTER_FPS + am.off) % FLUTTER_FRAMES) / FLUTTER_FRAMES;
      }
      for (const id of Object.keys(actors)) if (!seen.has(id)) actors[id].hinge.visible = false;
      // 灯り：ブックヌックに入るときは、手前から奥へ順にともる（ちらつきながら）
      for (const l of lights) {
        let on = 1;
        if (efk === 'nook-in:arrive') { const t0 = 0.1 + 0.5 * (1 - cl((l.z ?? 0) / H)); on = cl((ep - t0) / 0.14); if (on > 0 && on < 1) on *= 0.6 + 0.4 * Math.abs(Math.sin(now * 40 + l.ph)); }
        const flick = l.fire ? 0.82 + 0.18 * Math.sin(now * 11.3 + l.ph) * Math.sin(now * 6.7) + 0.08 * Math.sin(now * 23) : 1 + Math.sin(now * 7 + l.ph) * 0.04; // 火はよくゆらめく
        l.L.intensity = l.base * on * flick * (DAY && !interior ? 0.12 : 1); // 昼は灯りをほのかに
        if (l.glow) l.glow.material.opacity = 0.9 * on * (1 + Math.sin(now * 7 + l.ph) * 0.05);
      }
      for (const f of fires) {
        f.tex.offset.x = (Math.floor(now * 9) % FIRE_FRAMES) / FIRE_FRAMES;
        for (const e of f.embers) { const t = (now * 0.45 + e.ph) % 1; e.s.position.set(e.dx + Math.sin(now * 3 + e.ph * 9) * 0.08, f.y0 + (f.y1 - f.y0) * t, 0.08); e.s.material.opacity = (1 - t) * 0.9; }
      }
      // カメラ：主人公を追う（作者の決定：見下ろし10度・画角60度。?cam=1 の値があればそちらを使う）
      const cfg = map.stage.camera || {}, ov = window.SR_CAM || {};
      const pitch = (ov.pitchDeg ?? cfg.pitchDeg ?? 10) * Math.PI / 180, fov = ov.fovDeg ?? cfg.fovDeg ?? 60, dist = (ov.distance ?? cfg.distance ?? 9) * (camera.aspect < 1 ? 1.35 : 1); // スマホ縦は少し引く（試作も縦では画角を広げている）
      const tx = Math.max(Math.min(W / 2, 4), Math.min(W - Math.min(W / 2, 4), lead.x + 0.5)), tz = lead.y + 0.5;
      // カメラは主人公にぴったりついていく（遅れて追うと、歩くあいだキャラが画面の上で少しずつずれ、ドットがにじんで見えた。2026-11-22 作者「横に動くときブラーがかかるみたい」）
      // 位置はドット1つ分の刻みにそろえる（キャラとカメラのずれが、いつもドットのちょうど何個分かになる）
      cam.x = snapDot(tx); cam.z = snapDot(tz); cam.init = true;
      const elev = heightLerp(map, lead.x, lead.y) * HU; // 階段・2階の通路では、カメラも上がる
      const look = new THREE.Vector3(cam.x, 1.3 + elev, cam.z);
      let eye = new THREE.Vector3(cam.x, 1.3 + elev + Math.sin(pitch) * dist, cam.z + Math.cos(pitch) * dist);
      // ブックヌック（中）も、外と同じく「地面からの見下ろす角度・画角・距離」で主人公を追う（2026-11-22 作者「地面からまた画角と見下ろしを調整できるように」）。
      // 角度を上げてカメラが天井より上に出ると、天井は裏側になって見えない（上から見下ろす断面の見え方になる）。?cam=1 のパネルで試せる
      camera.fov = fov;
      // 「本全体を見る」度合い（1＝ふだん、0＝本全体）。開始演出・ページめくり・外に出たとき
      let zoom = intro ? intro.zoom : 1, wideD = 0;
      if (efk === 'page:leave') zoom = 1 - ez(ep);
      if (efk === 'page:arrive') zoom = ep < 0.55 ? 0 : ez((ep - 0.55) / 0.45);
      if (efk === 'nook-out:arrive' && pages) zoom = ez((ep - 0.1) / 0.85);
      if (zoom < 1 && pages) { // 本全体を見るカメラから、ふだんのカメラへ寄る
        const p0 = 38 * Math.PI / 180, th = Math.tan(fov * Math.PI / 360), M = camera.aspect < 1 ? 5 : 2.5; // スマホ縦は、手前の角が切れないよう余白を広く
        const half = W / 2 - (intro && pages ? (W / 4) * (1 - intro.open) : 0); // 閉じているあいだは、閉じた本（左半分）の大きさに合わせて寄る
        const D = Math.max((half + M) / (th * camera.aspect), (H / 2 + M) / th) * 1.08;
        wideD = D; // 本全体を見せているあいだは、もやを遠ざける（スマホ縦で本がもやに隠れた。2026-11-22）
        const cxB = W / 2 - (intro ? (W / 4) * (1 - intro.open) : 0); // 閉じているあいだは、閉じた本（左半分の位置）を真ん中に
        const wl = new THREE.Vector3(cxB, 0, H / 2), we = new THREE.Vector3(cxB, Math.sin(p0) * D, H / 2 + Math.cos(p0) * D);
        eye = we.lerp(eye, zoom); look.copy(wl.lerp(look, zoom));
      }
      // ブックヌックに入る：外では入口の暗がりへ寄って暗くなり、中では遠く（本棚の前）から額縁の中へ寄る
      let fade = view.transition || 0;
      if (efk === 'nook-in:leave' && ef.at) {
        const q = ez(ep / 0.8), at = ef.at;
        const dy = heightOf(map, at.x, at.y) * HU; // 2階の通路の扉なら、その高さの扉へ寄る（2026-11-22 作者「ブックヌックの演出は扉に向かって」）
        if (at.x === 0 && at.y > 0) { eye.lerp(new THREE.Vector3(at.x + 2.6, 1.3 + dy, at.y + 0.5), q); look.lerp(new THREE.Vector3(at.x - 0.6, 1.0 + dy, at.y + 0.5), q); } // 左の壁の扉：横から寄る
        else { eye.lerp(new THREE.Vector3(at.x + 0.5, 1.3 + dy, at.y + 2.2), q); look.lerp(new THREE.Vector3(at.x + 0.5, 1.0 + dy, at.y - 0.6), q); }
        fade = cl((ep - 0.45) / 0.55);
      }
      if (efk === 'nook-in:arrive') { const z = ez((ep - 0.3) / 0.7), HT = nook ? nook.HT : 7; eye.lerp(new THREE.Vector3(W / 2, eye.y + HT * 0.2, eye.z + HT * 1.6), 1 - z); look.lerp(new THREE.Vector3(W / 2, HT * 0.45, H), 1 - z); fade = 1 - cl(ep / 0.18); } // 暗い本棚を遠くから見る → 灯りがともる → 額縁の中へ寄る
      if (efk === 'nook-out:leave') { const q = ez(ep), HT = nook ? nook.HT : 7; eye.add(new THREE.Vector3(0, HT * 0.2 * q, HT * 1.6 * q)); fade = cl((ep - 0.4) / 0.6); } // 本棚まで引いて暗くなる
      if (efk === 'nook-out:arrive') fade = 1 - cl(ep / 0.15);
      // 建物の中の階段（上下の階）：階段のほうへ少し寄りながら暗くなり、着いた階では明るくなりながら上から下りてくる
      if (efk === 'floor:leave' && ef.at) { const q = ez(ep); look.lerp(new THREE.Vector3(ef.at.x + 0.5, 2.5, ef.at.y), q * 0.5); eye.y += 1.5 * q; fade = cl((ep - 0.25) / 0.75); }
      if (efk === 'floor:arrive') { eye.y += 1.5 * (1 - ez(ep)); fade = 1 - cl(ep / 0.55); }
      if (pages && scene.fog && scene.fog.isFog) { const k = zoom < 1 ? 1 - zoom : 0, far = Math.max(80, wideD * 2.2) * k + 80 * (1 - k); scene.fog.near = 34 + (far - 80) * 0.6; scene.fog.far = far; camera.far = Math.max(400, far * 1.5); }
      camera.position.copy(eye); camera.lookAt(look); camera.updateProjectionMatrix();
      charSpot.position.copy(eye).add(new THREE.Vector3(0, 0.6, 0)); charSpot.target.position.set(lead.x + 0.5, 1.1 + heightLerp(map, lead.x, lead.y) * HU, lead.y + 0.6);
      charSpot.intensity = (zoom < 1 ? 2.2 * zoom : 2.2) * (DAY && !interior ? 0.4 : 1); // 本全体を見せるあいだは弱める。昼は日の光があるので弱く
      { // のぞき穴：主人公の足もと〜頭の上を画面に写し、その真ん中を中心、背の高さの0.85倍を半径にする（本全体を見せるあいだは閉じる）
        const gy = heightLerp(map, lead.x, lead.y) * HU, buf = renderer.getDrawingBufferSize(new THREE.Vector2());
        const toPx = (v) => { v.project(camera); return new THREE.Vector2((v.x + 1) / 2 * buf.x, (v.y + 1) / 2 * buf.y); };
        const feet = toPx(new THREE.Vector3(lead.x + 0.5, gy, lead.y + 0.5)), head = toPx(new THREE.Vector3(lead.x + 0.5, gy + CHIBI_H, lead.y + 0.5));
        const hid = (map.stage?.hiddenPaths || []).some((p) => lead.x + 0.5 >= p.x && lead.x + 0.5 < p.x + p.w && lead.y + 0.5 >= p.y && lead.y + 0.5 < p.y + p.h);
        const hs = hid ? HOLE_SMALL : HOLE_WIDE;
        const r = feet.distanceTo(head) * hs.r * (zoom < 1 ? zoom : 1);
        HOLE.uHole.value.set((feet.x + head.x) / 2, (feet.y + head.y) / 2, r, hs.inner);
      }
      lastEye = eye.toArray().map((v) => Math.round(v * 1000) / 1000);
      // オーブ（ブックヌックに入るときは、灯りがともったあとに浮かびはじめる）
      orbsShown = 0;
      const orbMul = efk === 'nook-in:arrive' ? cl((ep - 0.7) / 0.3) : 1;
      const ps = orbPositions(orbCfg.count, sec, { w: W, h: H });
      orbSprites.forEach((s, i) => { const p = ps[i]; if (!p) { s.visible = false; return; } s.visible = p.alpha * orbMul > 0.01; if (!s.visible) return; s.position.set(p.x, p.y * 1.4, p.z); const sz = p.size * 1.6 * orbCfg.size; s.scale.set(sz, sz, 1); s.material.opacity = p.alpha * orbMul * orbCfg.alpha * 0.6; orbsShown++; });
      renderer.clear(); renderer.render(scene, camera);
      if (fade > 0) { fadeMat.opacity = fade; renderer.render(fadeScene, fadeCam); }
    },
    /** 内装をドット絵にするか（右上の「内装」ボタン。2026-11-22 作者「元絵もドットもどっちもあり」）。変えたら、いまのマップを読み直す */
    setPixelRoom(on) { PIXROOM = !!on; },
    /** 昼・夜（変えたら、いまのマップを読み直す） @param {'day'|'night'} t */
    setTime(t) { DAY = t === 'day'; },
    time: () => (DAY ? 'day' : 'night'),
    pixelRoom: () => PIXROOM,
    dispose() { if (root) { scene.remove(root); disposeTree(root); } renderer.dispose(); map = null; },
    debug: () => ({ name: 'paper', engine: 'three', drawCalls: renderer.info.render.calls, boards: boards.length, inner: [Math.round(cssW * renderer.getPixelRatio()), Math.round(cssH * renderer.getPixelRatio())], eye: [...lastEye], intro: lastIntro ? { ...lastIntro } : null, orbs: orbsShown, interior, actors: Object.keys(actors), effect: lastEffect, map: map?.id ?? null }),
  };
}
