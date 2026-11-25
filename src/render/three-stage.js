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
import { riseDelayFn, riseK, orbPositions, INTRO_TIMING } from './book-intro.js';
/** 書斎の奥の本物らしい背景の絵（assets/book/study_backdrop.webp）。美術・演出室から届いたら true にする（無いうちは読みに行かない） */
const STUDY_BACKDROP = true;
/** 奥の背景の絵をぼかすか（2026-11-24 作者「ぼかしなしで一回作ってみて」→ いまは false） */
const STUDY_BLUR = false; // 2026-11-24 作者「ぼかさないほうがいい」でくっきりに戻した（その前：作者「空気との境界線がくっきりしすぎている」→奥がくっきりだとランプが切り抜きに見えるので、少しだけぼかす（前の1/6より弱い1/3）
const RS = INTRO_TIMING.riseStart; // 板が起き上がりはじめる時刻（開始演出の時間割を、ページめくりなどでも借りる）
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
/**
 * 角の丸い箱（2026-11-23 作者「立体を描くときかくかくしすぎる」「いつも角は丸く表現するようなことできるの？」→「角を丸くする」）。
 * BoxGeometry と同じ面の順（+x,-x,+y,-y,+z,-z）と絵の張り方のまま、角と辺だけを半径 r で丸める。
 * 各軸の点を「はしの r の帯に K 本・まんなかに1本」に並べ、内側の箱（半分の大きさ − r）からはみ出した分を、その向きに長さ r の丸みへ置きなおす。
 * r は一番短い辺の 0.45 倍まで（うすい板でも形がこわれない）。同じ大きさの箱は形を使い回す
 */
const ROUND_R = 0.06, ROUND_K = 2, WOBBLE = 0.018; // WOBBLE：手描きのうねりの大きさ（マス）
/** 建物の中の木にかける色（掛け算）。赤みをおさえ、くすんだ自然な茶色に（2026-11-23 作者の内装の方針「赤みと艶を抑えた自然な茶色」） */
const WOOD_TINT = 0xcdbfb0, WOOD_ROUGH = 0.95;
const roundCache = new Map();
function roundBox(w, h, d, r = ROUND_R) {
  r = Math.min(r, Math.min(w, h, d) * 0.45);
  const key = [w, h, d, r].map((v) => v.toFixed(4)).join(',');
  const hit = roundCache.get(key); if (hit) return hit;
  if (r < 1e-3) { const b = new THREE.BoxGeometry(w, h, d); roundCache.set(key, b); return b; }
  const K = ROUND_K, half = [w / 2, h / 2, d / 2];
  // まんなかの分け方は長さに合わせる（手描きのうねりを長い辺にも出すため。0.4マスに1本、最大24）
  const Mid = half.map((hh) => Math.max(1, Math.min(24, Math.round((hh * 2 - 2 * r) / 0.4)))), Sn = Mid.map((m) => 2 * K + m);
  const g = new THREE.BoxGeometry(2, 2, 2, Sn[0], Sn[1], Sn[2]);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const remap = (c, a) => { // c は -1〜1（Sn[a] 等分の格子）→ はしの帯に寄せた座標
    const hh = half[a], S = Sn[a], j = Math.round((c + 1) / 2 * S);
    if (j <= K) return -hh + r * (j / K);
    if (j >= S - K) return hh - r + r * ((j - (S - K)) / K);
    return -hh + r + (hh * 2 - 2 * r) * ((j - K) / (S - 2 * K));
  };
  // 手描きのうねり（2026-11-23 作者「丸みと直線だけでなく、ほんの少しだけ、手書きのようにうねうね」）：面の向きに、ゆっくり変わる小さなずれ。
  // 同じ点はどの面から見ても同じずれ（位置だけで決める）なので、角で割れない。大きさは短い辺に合わせて小さく
  // 長い箱（額縁・棚板・壁ぎわの板など、ほかの面とぴったり接する物）はうねらせない：うねりで床や壁とくいちがい、くり返す黒い形が出た（2026-11-23 作者「これはなんだ」）
  const amp = Math.max(w, h, d) > 3 ? 0 : Math.min(WOBBLE, Math.min(w, h, d) * 0.06), ph = (w * 3.1 + h * 1.7 + d * 2.3) % 6.283;
  const wob = (x, y, z) => amp * (Math.sin(x * 2.1 + z * 1.3 + ph) * 0.6 + Math.sin(y * 2.7 - x * 1.1 + ph * 2) * 0.4);
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), dv = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const old = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    { // 絵の張り方：点を寄せたぶん、面の上の位置の割合で uv を置きなおす（そのままだと面のまんなかの絵が引き伸ばされる）
      const f0 = old.map((c) => (c + 1) / 2), f1 = old.map((c, a2) => (remap(c, a2) + half[a2]) / (2 * half[a2]));
      const ax = Math.abs(nor.getX(i)) > 0.5 ? [2, 1] : Math.abs(nor.getY(i)) > 0.5 ? [0, 2] : [0, 1]; // 面の上の2つの軸
      const u0 = uv.getX(i), v0 = uv.getY(i), fit = (val, a2) => (Math.abs(val - f0[a2]) < 1e-4 ? f1[a2] : 1 - f1[a2]);
      uv.setXY(i, fit(u0, ax[0]), fit(v0, ax[1]));
    }
    v.set(remap(old[0], 0), remap(old[1], 1), remap(old[2], 2));
    // 下の面（床に接する所）は丸めない：脚や台の足もとが丸いと、床から浮いて見えた（2026-11-23 作者「机やいすの床に接する部分も丸くなってしまっている」）
    inner.set(Math.max(-half[0] + r, Math.min(half[0] - r, v.x)), Math.max(-half[1], Math.min(half[1] - r, v.y)), Math.max(-half[2] + r, Math.min(half[2] - r, v.z)));
    dv.subVectors(v, inner);
    if (dv.lengthSq() > 1e-12) { dv.normalize(); const k = r + wob(v.x, v.y, v.z); v.copy(inner).addScaledVector(dv, k); nor.setXYZ(i, dv.x, dv.y, dv.z); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true; nor.needsUpdate = true; uv.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
  roundCache.set(key, g); return g;
}
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
/**
 * 奥へ・手前へ移る演出の見せ方（2026-11-23 作者「ほかにないかな」→「1・3・4どれか」：見くらべるため、開発者の窓で切りかえる）
 * riffle＝ページを何枚も続けてめくる（奥へは右から左へ、戻りは左から右へ。2026-11-23 作者「奥の場合は何枚かめくるのは？」「もっとめくる」）／curtain＝書き割りの幕が上がる・下りる／map＝見開きの地図を上から見て、光の点が奥（手前）のページへ渡る／layers＝紙の層がすべって入れかわる／light＝白い光（はじめの試し）
 */
let DEEP = 'riffle';
/** 建物に入るときの見せ方（2026-11-23 作者「銀鹿亭に入るときの演出を、いまは絵につっこんでいるかんじがするだけ」→ 4つの案を「全部試したい」。開発者の窓で切りかえる）
 *  zoom＝いまの（扉へ寄って暗く）／doll＝人形の家のように正面が開いて光の中へ／fold＝飛び出す絵本の家がたたまれ、戸口の光へ／light＝扉の向こうの光が広がる／shelf＝本から書斎の本棚へ寄る */
let NOOKIN = 'blur';
/** ぼかして入るとき、主人公たちが戸口の奥へ歩くマス数（中に着いたときの立ち位置が、入口から1マス奥＝外では戸口から2マス奥にそろう） */
const WALK_IN = 3;
/** ぼかして出るとき：中では手前へ歩くマス数、外では戸口の奥から出てくるマス数（2026-11-23 作者「出るところも演出を」） */
const WALK_OUT = 2, EMERGE = 1.6;
/** ぼかして入るとき、仲間が横へよける幅（マス） */
const ASIDE = 0.8;
/** 入る瞬間に広げる画角（度） */
const FOV_BURST = 120;
/** 切りかわりの前後に重ねる、中の色の濃さ（0〜1） */
const VEIL = 0.7; // blur＝キャラはそのまま、まわりがぼけて中へ（2026-11-23 作者の案）。 // walk＝入口をくぐる（2026-11-23 作者「家をくぐったら、中、キャラはそのまま」）
export const RIFFLE = Object.freeze({ n: 6, gap: 0.07, dur: 0.3 }); // 6枚。12枚・何枚もめくる録音の音も試したが、2026-11-23 作者が「もっとめくる」のときの形（6枚・1枚ごとにページをめくる音）に戻した // めくる枚数、1枚ごとの始まりのずれと、1枚がめくれる長さ（着く演出の割合）
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
/**
 * 仮の客（モブ）の絵（2026-11-23 作者「酒場でこれからモブを入れるのに、どうやって座らせるのか」→「まずは2と3」）。
 * 本当の見た目は美術・演出室に頼むまでの仮。うすい影のような人の形（頭・肩・外套）。back＝後ろ姿（顔を描かない）。tone＝外套の色
 */
function mobCanvas(tone, back) {
  return canvas(96, 192, (g, W, H) => {
    g.fillStyle = tone; g.beginPath(); g.moveTo(W * 0.22, H * 0.98); g.quadraticCurveTo(W * 0.18, H * 0.5, W * 0.3, H * 0.36); g.lineTo(W * 0.7, H * 0.36); g.quadraticCurveTo(W * 0.82, H * 0.5, W * 0.78, H * 0.98); g.closePath(); g.fill(); // 外套
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(W * 0.48, H * 0.4, W * 0.04, H * 0.55); // 合わせ目
    g.fillStyle = back ? '#4a3a2e' : '#d8b896'; g.beginPath(); g.ellipse(W * 0.5, H * 0.25, W * 0.17, H * 0.1, 0, 0, 7); g.fill(); // 頭（後ろ姿は髪）
    g.fillStyle = '#4a3a2e'; g.beginPath(); g.ellipse(W * 0.5, H * 0.19, W * 0.18, H * 0.065, 0, Math.PI, 0); g.fill(); // 髪の上
    g.strokeStyle = 'rgba(40,30,24,.55)'; g.lineWidth = 2; g.stroke();
  });
}
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
  const sp = townPattern(g, 'soil', T, 4); // 森の元絵 v01（2026-11-23）：土の絵を全体に、地図の stage.paths（道の折れ線）にそって小道の絵を、ふちをぼかして重ねる
  if (sp) {
    g.fillStyle = sp; g.fillRect(0, 0, W, H);
    const pp = townPattern(g, 'path', T, 4);
    if (pp && map.stage?.paths?.length) {
      const road = canvas(W, H, (d) => { d.fillStyle = pp; d.fillRect(0, 0, W, H); });
      const mask = canvas(W, H, (d) => { d.strokeStyle = '#fff'; d.lineCap = d.lineJoin = 'round'; for (const pl of map.stage.paths) { d.lineWidth = (pl.w ?? 2.6) * T; d.beginPath(); pl.pts.forEach(([x, y], i) => (i ? d.lineTo(x * T, y * T) : d.moveTo(x * T, y * T))); d.stroke(); } });
      const soft = canvas(W, H, (d) => { d.filter = `blur(${Math.round(T * 0.35)}px)`; d.drawImage(mask, 0, 0); });
      const rg = road.getContext('2d'); rg.globalCompositeOperation = 'destination-in'; rg.drawImage(soft, 0, 0);
      g.drawImage(road, 0, 0);
    }
    return;
  }
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
const SHOW_H = { tree: 6, 'tree-small': 2.8, stall: 3.2, 'flower-stall': 3.2, pine: 6, 'dungeon-gate': 5.2 }; // pine・dungeon-gate：森の元絵 v01（2026-11-23。木は約6マス、門の口がキャラより高い）
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
  // 見せる高さ（マス）が決まっている物は、絵の形のまま、足もとより大きく描く（木の枝や屋台の屋根は、足もと＝ぶつかる所より広がる）。
  // キャラの背は約2.5マス（2026-11-23 作者「植木などのサイズを確認してほしい」：街路樹が2.6マス＝キャラとほぼ同じ、小さな木は0.9マスだった）
  const showH = it.showH ?? SHOW_H[name];
  if (showH) { const h = showH, w = h / ar; return { w, h, c: canvas(w * PX, h * PX, (g, W, H) => g.drawImage(im, 0, 0, W, H)) }; }
  const hang = /^(sign-|awning-|herbs|laundry)/.test(name); // laundry：路地に渡した洗濯ひも（2026-11-25）
  const artH = hang ? b.h : Math.min(b.h, b.w * ar); // 絵が見えている高さ（マス）。板が高くても、絵は下に低く描かれることがある（花壇など）
  return { h: b.h, artH, c: canvas(b.w * PX, b.h * PX, (g, W, H) => {
    let w = W, h = W * ar; if (h > H) { h = H; w = H / ar; }
    if (hang && /^awning-/.test(name)) { w = W; h = Math.min(H * 0.45, W * ar); } // 庇は横いっぱい
    g.drawImage(im, (W - w) / 2, hang ? 0 : H - h, w, h);
  }) };
}
/**
 * 入れる家の扉を切り抜く（2026-11-23 作者「ドアを切り取って開くようにできるかい？」）。
 * 家の絵の扉の所を暗い入口（奥にほのかな灯り）に塗りかえ、扉だけの絵（まわりは透明）を返す。cut は townArt.doors[絵].cut（割合）
 * @returns {{c: HTMLCanvasElement, x0:number, x1:number, y0:number, y1:number, hinge:string}|null}
 */
function cutDoor(townC, im, cut) {
  if (!townC || !im || !cut) return null;
  const W = townC.c.width, H = townC.c.height;
  const x0 = cut.x0 * W, x1 = cut.x1 * W, y0 = cut.y0 * H, y1 = cut.y1 * H, ar = cut.arch * H, dw = x1 - x0, dh = y1 - y0;
  const shape = (/** @type {CanvasRenderingContext2D} */ g, ox, oy) => { g.beginPath(); g.moveTo(x0 - ox, y1 - oy); g.lineTo(x0 - ox, y0 + ar - oy); g.ellipse((x0 + x1) / 2 - ox, y0 + ar - oy, dw / 2, ar, 0, Math.PI, 0); g.lineTo(x1 - ox, y1 - oy); g.closePath(); };
  // 扉の絵（元の絵から、扉の形で切り出す）
  const door = canvas(Math.ceil(dw), Math.ceil(dh), (g) => { shape(g, x0, y0); g.clip(); g.drawImage(townC.c, -x0, -y0); });
  if (cut.hole) { // 入口（と窓のガラス）をくりぬく。くりぬいた所を白で描いた mask（家の絵と同じ大きさ）も返す
    const g2 = townC.c.getContext('2d'), mask = canvas(W, H, (mg) => { mg.fillStyle = '#fff'; shape(mg, 0, 0); mg.fill(); });
    g2.save(); g2.globalCompositeOperation = 'destination-out'; shape(g2, 0, 0); g2.fill(); g2.restore();
    const mg = mask.getContext('2d');
    for (const wd of cut.windows || []) { // 窓：ガラスの所をくりぬき、木の格子を描きなおす（2026-11-23 作者「この窓の部分もくりぬいて」。元の格子を残すと、切れぎれの黒い点になった）
      const wx0 = wd.x0 * W, wx1 = wd.x1 * W, wy0 = wd.y0 * H, wy1 = wd.y1 * H, war = (wd.arch || 0) * H, ww = wx1 - wx0, wh = wy1 - wy0;
      const wshape = (/** @type {CanvasRenderingContext2D} */ c) => { c.beginPath(); c.moveTo(wx0, wy1); c.lineTo(wx0, wy0 + war); c.ellipse((wx0 + wx1) / 2, wy0 + war, ww / 2, Math.max(1, war), 0, Math.PI, 0); c.lineTo(wx1, wy1); c.closePath(); };
      g2.save(); g2.globalCompositeOperation = 'destination-out'; wshape(g2); g2.fill(); g2.restore();
      mg.save(); mg.fillStyle = '#fff'; wshape(mg); mg.fill(); mg.restore();
      g2.save(); wshape(g2); g2.clip(); g2.fillStyle = wd.bar || '#4e321e'; const bw = Math.max(2, ww * 0.035); // 格子：縦3本・横2本と、まわりの枠
      for (const f of [0.25, 0.5, 0.75]) g2.fillRect(wx0 + ww * f - bw / 2, wy0, bw, wh);
      for (const f of [0.36, 0.68]) g2.fillRect(wx0, wy0 + wh * f - bw / 2, ww, bw);
      g2.lineWidth = bw * 1.4; g2.strokeStyle = wd.bar || '#4e321e'; wshape(g2); g2.stroke(); g2.restore();
    }
    return { c: door, x0: cut.x0, x1: cut.x1, y0: cut.y0, y1: cut.y1, hinge: 'none', hole: true, mask };
  }
  // 家の絵の扉の所：暗い入口。奥の床にほのかな暖かい灯り
  const g = townC.c.getContext('2d'); g.save(); shape(g, 0, 0); g.clip();
  const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#120a06'); gr.addColorStop(0.7, '#2a1a0e'); gr.addColorStop(1, '#5a3a1c');
  g.fillStyle = gr; g.fillRect(x0, y0, dw, dh);
  const gl = g.createRadialGradient((x0 + x1) / 2, y1, 1, (x0 + x1) / 2, y1, dw * 0.9); gl.addColorStop(0, 'rgba(255,190,110,.45)'); gl.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gl; g.fillRect(x0, y0, dw, dh);
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = Math.max(1, dw * 0.05); shape(g, 0, 0); g.stroke(); // 戸口のふちの影
  g.restore();
  return { c: door, x0: cut.x0, x1: cut.x1, y0: cut.y0, y1: cut.y1, hinge: cut.double ? 'both' : cut.hinge || 'right' }; // both＝両開き（2026-11-24 作者「家はいる時でる時扉を開くように」）
}
/** 地面の模様（町の絵）。size＝絵1枚が覆うマス数 @returns {CanvasPattern|null} */
function townPattern(g, key, T, size) {
  const file = TOWN_CFG?.ground?.[key], im = file && TOWN_IMG?.[file]; if (!im) return null;
  const p = g.createPattern(im, 'repeat'); if (!p) return null;
  p.setTransform(new DOMMatrix().scale((size * T) / im.naturalWidth, (size * T) / im.naturalHeight)); return p;
}
/**
 * 本の見開きの大きさ（マス）。どのエリアでも縦横の比率を同じにする（2026-11-23 作者「エリアごとに広さが違うから、本の形が一瞬で変わるのもなんとかしたい、広さは別だけれど、縦横の比率を同じに」）。
 * 地図は見開きの真ん中に置き、まわりはページの余白（何も描いていない紙）
 */
const BOOK_ASPECT = 1.6;
function bookSize(map) { const W = map.width, H = map.height; return { BW: Math.max(W, H * BOOK_ASPECT), BH: Math.max(H, W / BOOK_ASPECT) }; }
// 描いた絵の取りおき（2026-11-25：宿から通りへ出るたびに、同じページ・同じ家の絵を描きなおして0.3秒ほど止まっていた）。中身はマップと届いた絵だけで決まるので使い回せる
const PAGE_CACHE = new Map(), BOARD_CACHE = new Map(), blurMemo = new WeakMap();
function pageCanvas(map) {
  const key = `${map.id}|${!!BOOK_IMG.paper_page}|${!!TOWN_IMG}`;
  let c = PAGE_CACHE.get(key); if (!c) { c = pageCanvasNew(map); PAGE_CACHE.set(key, c); } return c;
}
function pageCanvasNew(map) { // 羊皮紙のページ（見開きの大きさ）。真ん中に地図（うすいインクで石畳と入口のしるし。ページに描かれた町の地図のように）
  const T = 32, { BW, BH } = bookSize(map), PW = Math.round(BW * T), PH = Math.round(BH * T);
  const mc = mapCanvas(map, T), ox = Math.round((PW - mc.width) / 2), oy = Math.round((PH - mc.height) / 2);
  return canvas(PW, PH, (g) => {
    const R = rnd(3); g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, PW, PH); if (BOOK_IMG.paper_page) fillTiled(g, BOOK_IMG.paper_page, PW, PH, 0.75); // 届いた紙の絵（2026-11-24 美術・演出室）
    g.drawImage(mc, ox, oy);
    const W = PW, H = PH;
    for (const side of [0, 1]) { // ページごとの、ふちの焼けと飾り線
      const x0 = side * W / 2, gr = g.createRadialGradient(x0 + W / 4, H / 2, 40, x0 + W / 4, H / 2, W * 0.4); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,60,20,.26)');
      g.fillStyle = gr; g.fillRect(x0, 0, W / 2, H); if (!map.stage?.townArt) { g.strokeStyle = 'rgba(120,90,50,.25)'; g.lineWidth = 2; g.strokeRect(x0 + 14, 14, W / 2 - 28, H - 28); } // 町の絵のマップでは飾り線を引かない（地面に枠が見えるので）
    }
    const gut = g.createLinearGradient(W / 2 - 40, 0, W / 2 + 40, 0); gut.addColorStop(0, 'rgba(60,40,20,0)'); gut.addColorStop(0.5, 'rgba(60,40,20,.3)'); gut.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gut; g.fillRect(W / 2 - 40, 0, 80, H); noise(g, W, H, R, 16);
  });
}
/** 地図の部分（地図の広さ）。ふちは紙になじむよう、外側の1マスで薄くする */
function mapCanvas(map, T) {
  const W = map.width * T, H = map.height * T;
  return canvas(W, H, (g) => {
    g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, W, H);
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
    const e = T; g.globalCompositeOperation = 'destination-out';
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, e, 0, 0, 0, e, H], [W, 0, W - e, 0, W - e, 0, e, H], [0, 0, 0, e, 0, 0, W, e], [0, H, 0, H - e, 0, H - e, W, e]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    }
    g.globalCompositeOperation = 'source-over';
  });
}
/** 書斎の奥の本棚（仮の絵。2026-11-23 作者「周り本棚にするか」→「書斎の机の上」。元絵 study_backdrop.png を美術・演出室に依頼中） */
const studyShelfCanvas = () => memo('shelf', () => canvas(1024, 512, (g, w, h) => {
  const R = rnd(31); g.fillStyle = '#1a110b'; g.fillRect(0, 0, w, h);
  const cols = ['#5a2a22', '#2a3a5a', '#3a4a2a', '#6a4a1a', '#4a2a4a', '#3a2a22', '#7a5a3a', '#55402a', '#2f4440'];
  const rows = 5, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y1 = (r + 1) * rh - 10; let x = 6;
    while (x < w - 6) {
      const bw = 7 + R() * 14, bh = rh * (0.55 + R() * 0.32);
      if (R() < 0.06) { x += 10 + R() * 30; continue; } // ところどころすき間
      g.fillStyle = cols[(R() * cols.length) | 0]; g.fillRect(x, y1 - bh, bw, bh);
      g.fillStyle = 'rgba(201,160,80,.55)'; g.fillRect(x, y1 - bh * (0.8 + R() * 0.1), bw, 2); g.fillRect(x, y1 - bh * 0.2, bw, 1.5); // 背表紙の金の帯
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + bw - 1.5, y1 - bh, 1.5, bh);
      x += bw + 1;
    }
    g.fillStyle = '#3a2414'; g.fillRect(0, y1, w, 10); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y1 + 10, w, 3); // 棚板
  }
  for (const x of [0, w / 2 - 6, w - 12]) { g.fillStyle = '#2e1d10'; g.fillRect(x, 0, 12, h); } // 縦の仕切り
  const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,.65)'); v.addColorStop(0.5, 'rgba(0,0,0,.1)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  noise(g, w, h, R, 14);
}));
// 本の革（仮の絵。2026-11-23 作者「最初の本開くところチープな感じ」「本はテクスチャで質感を出す」。元絵 leather_cover.png を美術・演出室に依頼中）
/** 革の手ざわり：細かいしぼ（粒）と、しわの線、むら */
function leatherGrain(g, w, h, R) {
  if (BOOK_IMG.leather_cover) { fillTiled(g, BOOK_IMG.leather_cover, w, h, w / 1024 * 0.75); return; } // 届いた革の絵（2026-11-24 美術・演出室）
  g.fillStyle = '#3b2214'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r); const c = R() < 0.5 ? '70,40,22' : '30,16,9'; gr.addColorStop(0, `rgba(${c},.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } // むら
  { const im = g.getImageData(0, 0, w, h), d = im.data; for (let i = 0; i < d.length; i += 4) { const l = R(); const v = l < 0.04 ? -38 - l * 600 : l < 0.065 ? 18 : 0; if (v) { d[i] += v; d[i + 1] += v * 0.8; d[i + 2] += v * 0.6; } } g.putImageData(im, 0, 0); } // しぼ（点を1つずつ描くと表紙で5万回になり、起動が遅くなった。2026-11-23 作者「はじめの読み込みが遅い」で、画素を直接さわるようにした）
  g.lineWidth = 0.8; for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(15,8,4,.35)'; let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); } // しわ
}
/** 届いた質感の元絵（革・紙・小口・机の木目）の画像。無ければコードで描いた仮の絵のまま @type {Record<string, any>} */
const BOOK_IMG = {};
/** 画像をくり返して塗る（scale：画像1枚をキャンバスの何ピクセルに描くかの比） */
function fillTiled(g, img, w, h, scale) { const tw = Math.max(8, Math.round(img.width * scale)), th = Math.max(8, Math.round(img.height * scale)); for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) g.drawImage(img, x, y, tw, th); }
/** 作った絵を覚えておく（マップを読みなおすたびに作りなおさない。起動を速く） @type {Map<string, HTMLCanvasElement>} */
const canvasMemo = new Map();
const memo = (/** @type {string} */ k, /** @type {() => HTMLCanvasElement} */ f) => { let c = canvasMemo.get(k); if (!c) { c = f(); canvasMemo.set(k, c); } return c; };
const leatherCanvas = () => memo('leather', () => canvas(512, 512, (g, w, h) => leatherGrain(g, w, h, rnd(9))));
/** 表紙（表紙の大きさの絵）：革に、型押しの二重の枠と四隅の飾り、ふちのすれ（明るい）と、うすれた金の線 */
const coverCanvas = (aspect) => memo('cover:' + aspect.toFixed(2), () => canvas(768, Math.round(768 * aspect), (g, w, h) => {
  const R = rnd(19); leatherGrain(g, w, h, R);
  const tool = (x, y, ww, hh, lw) => { g.lineWidth = lw; g.strokeStyle = 'rgba(12,6,3,.75)'; g.strokeRect(x, y, ww, hh); g.strokeStyle = 'rgba(140,96,60,.35)'; g.strokeRect(x + lw * 0.8, y + lw * 0.8, ww, hh); }; // 押し込んだ溝（影と、ふちの明るさ）
  const m = w * 0.07; tool(m, m, w - 2 * m, h - 2 * m, 5); tool(m + 16, m + 16, w - 2 * m - 32, h - 2 * m - 32, 2.5);
  g.strokeStyle = 'rgba(201,160,80,.35)'; g.lineWidth = 1.5; g.strokeRect(m + 8, m + 8, w - 2 * m - 16, h - 2 * m - 16); // うすれた金の線
  for (const [cx, cy, sx, sy] of [[m + 16, m + 16, 1, 1], [w - m - 16, m + 16, -1, 1], [m + 16, h - m - 16, 1, -1], [w - m - 16, h - m - 16, -1, -1]]) { // 四隅の葉の飾り（型押し）
    g.save(); g.translate(cx, cy); g.scale(sx, sy); g.fillStyle = 'rgba(12,6,3,.6)';
    for (const a of [0.25, 0.75, 1.25]) { g.save(); g.rotate(a); g.beginPath(); g.ellipse(26, 0, 22, 7, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.restore();
  }
  g.save(); g.translate(w, h); g.rotate(Math.PI); coverTitle(g, w, h); g.restore(); // 表紙の面（本の下の面）に張ると上下左右が返るので、180度回して描く
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(160,110,70,.28)'); g.fillStyle = v; g.fillRect(0, 0, w, h); // ふちのすれ
}));
/**
 * 表紙の題名（2026-11-23 作者「本のタイトル STERNEN RING をおしゃれに」）：革に押しこんだ金の箔押し。
 * 題名を2行（STERNEN／RING）で字間を広く、上下に細い金の罫と小さな星。真ん中に星の輪の飾り（題名にちなんだ仮の飾り。紋章ではない）
 * 文字は、どの端末にもある明朝・セリフの書体から選ぶ（ネットの書体は読まない）
 */
function coverTitle(g, w, h) {
  const FR = rnd(57); // 箔の粒・はげの並び（毎回同じ）
  const FONT = '"Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Palatino, "Noto Serif", Georgia, "Times New Roman", serif';
  const gold = (y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#f6e3a6'); gr.addColorStop(0.45, '#c9a050'); gr.addColorStop(0.55, '#a87a30'); gr.addColorStop(1, '#e8cc82'); return gr; };
  /** 箔押し：押しこんだ影（左上の暗さ・右下の明るさ）の上に金 */
  const foil = (draw, y0, y1) => {
    g.save(); g.translate(-1.5, -1.5); g.fillStyle = 'rgba(8,4,2,.75)'; g.strokeStyle = 'rgba(8,4,2,.75)'; draw(); g.restore();
    g.save(); g.translate(1.5, 1.5); g.fillStyle = 'rgba(160,110,70,.35)'; g.strokeStyle = 'rgba(160,110,70,.35)'; draw(); g.restore();
    // 金箔の質感（2026-11-24 作者「文字もテクスチャにしようかな」）：別の紙に金を描いて、細かい粒・よこの細いすじをのせ、ところどころ箔がはげて革がのぞくようにしてから重ねる
    const main = g, fc = canvas(w, h, (f) => {
      g = f; f.fillStyle = gold(y0, y1); f.strokeStyle = gold(y0, y1); draw();
      f.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 5200; i++) { const x = FR() * w, y = y0 + FR() * (y1 - y0 + 40) - 20, l = FR(); f.fillStyle = l < 0.5 ? `rgba(255,244,200,${0.25 + FR() * 0.35})` : `rgba(90,58,18,${0.2 + FR() * 0.3})`; f.fillRect(x, y, 1 + FR() * 1.4, 1 + FR() * 1.4); } // 箔の細かい粒
      for (let i = 0; i < 160; i++) { const y = y0 - 20 + FR() * (y1 - y0 + 40); f.fillStyle = FR() < 0.5 ? 'rgba(255,240,190,0.12)' : 'rgba(80,50,15,0.12)'; f.fillRect(0, y, w, 0.8); } // よこの細いすじ
      f.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 520; i++) { const x = FR() * w, y = y0 - 20 + FR() * (y1 - y0 + 40), r = 0.5 + FR() * (FR() < 0.12 ? 3.2 : 1.3); f.fillStyle = `rgba(0,0,0,${0.45 + FR() * 0.5})`; f.beginPath(); f.ellipse(x, y, r * (1 + FR()), r, FR() * 3, 0, Math.PI * 2); f.fill(); } // 箔のはげ（革がのぞく）
      f.globalCompositeOperation = 'source-over';
    });
    g = main; g.save(); g.shadowColor = 'rgba(255,220,140,.22)'; g.shadowBlur = 3; g.drawImage(fc, 0, 0); g.restore();
  };
  const spaced = (text, y, size, track) => { // 字間を広げて真ん中にそろえる
    g.font = `600 ${size}px ${FONT}`; g.textBaseline = 'alphabetic';
    const ws = [...text].map((c) => g.measureText(c).width), total = ws.reduce((a, b) => a + b, 0) + track * (text.length - 1);
    let x = (w - total) / 2; [...text].forEach((c, i) => { g.fillText(c, x, y); x += ws[i] + track; });
  };
  const star = (cx, cy, r, n = 4) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * 0.32 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  const rule = (y) => { const L = w * 0.26; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2 - L, y); g.lineTo(w / 2 - 18, y); g.moveTo(w / 2 + 18, y); g.lineTo(w / 2 + L, y); g.stroke(); star(w / 2, y, 10); for (const sx of [-1, 1]) { g.beginPath(); g.arc(w / 2 + sx * (L + 6), y, 3, 0, Math.PI * 2); g.fill(); } };
  const top = h * 0.2, big = Math.round(w * 0.118), small = Math.round(w * 0.118);
  foil(() => rule(top), top - 12, top + 12);
  foil(() => spaced('STERNEN', top + big * 1.35, big, big * 0.22), top + 20, top + big * 1.4);
  foil(() => spaced('RING', top + big * 1.35 + small * 1.25, small, small * 0.42), top + big * 1.4, top + big * 1.4 + small * 1.3);
  const ry = top + big * 1.35 + small * 1.25 + 34; foil(() => rule(ry), ry - 12, ry + 12);
  // 星の輪：細い二重の輪に、小さな星を12（題名にちなむ）
  const cy = h * 0.62, R = w * 0.17;
  foil(() => {
    g.lineWidth = 2.2; g.beginPath(); g.arc(w / 2, cy, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.2; g.beginPath(); g.arc(w / 2, cy, R * 0.86, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + i * Math.PI / 6; star(w / 2 + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93, i % 3 ? 7 : 12); }
    star(w / 2, cy, R * 0.38, 4); star(w / 2, cy, R * 0.2, 4);
  }, cy - R, cy + R);
}
/** 書斎の奥の本棚（v02 book_spines の背表紙を3段に並べ、段の間に棚板） @param {HTMLImageElement} img */
const spineShelfCanvas = (img) => memo('spines', () => canvas(1024, 512, (g, w, h) => {
  const rowH = 150, plank = 20; g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 3; r++) {
    const y = 6 + r * (rowH + plank);
    g.drawImage(img, (r * 341) % 1024, 0, 1024 - (r * 341) % 1024, 512, 0, y, w - (r * 341) % 1024, rowH); // 段ごとに少しずらして同じ並びに見せない
    if ((r * 341) % 1024) g.drawImage(img, 0, 0, (r * 341) % 1024, 512, w - (r * 341) % 1024, y, (r * 341) % 1024, rowH);
    const gr = g.createLinearGradient(0, y + rowH, 0, y + rowH + plank); gr.addColorStop(0, '#6a4428'); gr.addColorStop(1, '#3a2414'); g.fillStyle = gr; g.fillRect(0, y + rowH, w, plank); // 棚板
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, w, 10); // 上の棚板の影
  }
}));
/** 暖炉の口の中：上がアーチの形。すすけた暗いレンガの奥の壁に、下の火から暖かい光が当たる（まわりは透明＝暖炉の石が見える） */
const fireboxCanvas = () => memo('firebox', () => canvas(256, 214, (g, w, h) => {
  const ar = h * 0.3; g.beginPath(); g.moveTo(0, h); g.lineTo(0, ar); g.ellipse(w / 2, ar, w / 2, ar, 0, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.clip();
  g.fillStyle = '#1c110b'; g.fillRect(0, 0, w, h);
  const R = rnd(83); g.strokeStyle = 'rgba(70,40,26,.55)'; g.lineWidth = 2; // 奥の壁のレンガの目地（うすく）
  for (let y = 18, row = 0; y < h; y += 22, row++) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (row % 2) * 26 + R() * 6; x < w; x += 52) { g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y); g.stroke(); } }
  const glow = g.createRadialGradient(w / 2, h * 1.02, 4, w / 2, h * 0.95, h * 0.95); glow.addColorStop(0, 'rgba(255,170,80,.85)'); glow.addColorStop(0.35, 'rgba(220,110,40,.45)'); glow.addColorStop(1, 'rgba(120,50,20,0)'); g.fillStyle = glow; g.fillRect(0, 0, w, h); // 火の照り返し
  const soot = g.createLinearGradient(0, 0, 0, h * 0.6); soot.addColorStop(0, 'rgba(8,4,2,.85)'); soot.addColorStop(1, 'rgba(8,4,2,0)'); g.fillStyle = soot; g.fillRect(0, 0, w, h); // 上はすすで暗く
  const side = g.createLinearGradient(0, 0, w, 0); side.addColorStop(0, 'rgba(0,0,0,.55)'); side.addColorStop(0.18, 'rgba(0,0,0,0)'); side.addColorStop(0.82, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = side; g.fillRect(0, 0, w, h); // 左右の奥行き
}));
/** 人形の家の中（入る演出 doll）：2階建ての部屋の断面。漆喰の壁と梁、木の床、まんなかに暖かい灯り（コードの仮の絵） */
const roomCardCanvas = () => memo('roomcard', () => canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#ecd8b2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6a4428'; for (const y of [0, h * 0.46, h * 0.5]) g.fillRect(0, y, w, y ? h * 0.04 : h * 0.05); for (const x of [0, w * 0.32, w * 0.66, w - 16]) g.fillRect(x, 0, 16, h); // 梁と柱
  g.fillStyle = '#8a5a34'; g.fillRect(0, h * 0.9, w, h * 0.1); g.fillRect(0, h * 0.46, w, h * 0.04); // 床
  for (const [x, y] of [[w * 0.18, h * 0.3], [w * 0.5, h * 0.25], [w * 0.82, h * 0.3], [w * 0.3, h * 0.72], [w * 0.7, h * 0.72]]) { const gr = g.createRadialGradient(x, y, 2, x, y, w * 0.28); gr.addColorStop(0, 'rgba(255,210,130,.9)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); } // 灯り
  const v = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,30,10,.55)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
}));
/** 宿の床の敷物（深い赤に、縁どりと菱形の模様。使いこまれて少し色あせ） */
const rugCanvas = () => canvas(512, 448, (g, w, h) => {
  const R = rnd(57); g.fillStyle = '#6a2a22'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9a060'; g.lineWidth = 10; g.strokeRect(22, 22, w - 44, h - 44); g.strokeStyle = '#2a3a4a'; g.lineWidth = 14; g.strokeRect(44, 44, w - 88, h - 88);
  const dia = (k, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(w / 2, 90 + k); g.lineTo(w - 110 - k, h / 2); g.lineTo(w / 2, h - 90 - k); g.lineTo(110 + k, h / 2); g.closePath(); g.fill(); };
  dia(0, '#2a3a4a'); dia(50, '#c9a060'); dia(85, '#6a2a22');
  for (let i = 0; i < 40; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(230,200,160,.12)'); gr.addColorStop(1, 'rgba(230,200,160,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } // 色あせ
  noise(g, w, h, R, 22);
  g.fillStyle = '#d8c8a0'; for (let x = 6; x < w; x += 8) { g.fillRect(x, 0, 3, 10); g.fillRect(x, h - 10, 3, 10); } // 房
});
/** ページの断面（小口）：うすい紙が重なった横じま */
const pageEdgeCanvas = () => canvas(256, 64, (g, w, h) => { const R = rnd(23); g.fillStyle = '#d9c9a2'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 1.5) { g.fillStyle = `rgba(120,95,60,${0.08 + R() * 0.22})`; g.fillRect(0, y, w, 0.7); } const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,.25)'); g.fillStyle = v; g.fillRect(0, 0, w, h); });
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
/** 古い真鍮の質感（仮の絵。2026-11-24 作者「テクスチャ張るとかできないか」）：ろくろの向き（横）に細い筋、くすみ（緑がかった茶）のむら、小さな傷。[色, つや] */
const brassCanvases = () => memo('brass', () => {
  const R = rnd(31), W = 512, H = 512, blots = Array.from({ length: 46 }, () => [R() * W, R() * H, 10 + R() * 60, R()]);
  const col = canvas(W, H, (g, w, h) => {
    g.fillStyle = '#c8a058'; g.fillRect(0, 0, w, h);
    for (const [x, y, r, k] of blots) { for (const dx of [-w, 0, w]) { const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r); gr.addColorStop(0, k < 0.6 ? 'rgba(70,52,24,0.38)' : 'rgba(90,96,60,0.28)'); gr.addColorStop(1, 'rgba(70,52,24,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y - r, r * 2, r * 2); } } // くすみ・緑青のむら
    for (let i = 0; i < 900; i++) { const y = R() * h, a = 0.04 + R() * 0.1; g.fillStyle = R() < 0.5 ? `rgba(255,236,190,${a})` : `rgba(60,40,15,${a})`; g.fillRect(0, y, w, 0.6 + R() * 1.2); } // ろくろの細い筋
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(40,28,12,${0.15 + R() * 0.25})`; g.lineWidth = 0.6; const x = R() * w, y = R() * h, l = 4 + R() * 18, an = R() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke(); } // 小さな傷
  });
  const rough = canvas(W, H, (g, w, h) => {
    g.fillStyle = 'rgb(120,120,120)'; g.fillRect(0, 0, w, h);
    for (const [x, y, r] of blots) { for (const dx of [-w, 0, w]) { const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r); gr.addColorStop(0, 'rgba(210,210,210,0.55)'); gr.addColorStop(1, 'rgba(210,210,210,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y - r, r * 2, r * 2); } } // くすんだ所はつやが鈍い
    for (let i = 0; i < 600; i++) { const v = 90 + R() * 70; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(0, R() * h, w, 0.6 + R()); }
  });
  return [col, rough];
});
/** 笠の色ガラスの質感（仮の絵。2026-11-24 作者「おねがい」＝笠にも質感を）：だいだいの濃淡が流れるむら（古い色ガラス）、たての細いすじ、小さな気泡。左右はつながる（ろくろで一周する） */
const glassCanvas = () => memo('lampGlass', () => canvas(512, 256, (g, w, h) => {
  const R = rnd(47); g.fillStyle = '#e8a060'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { // 濃淡が流れるむら（たてに少し長い）
    const x = R() * w, y = R() * h, rx = 14 + R() * 50, ry = rx * (1.2 + R() * 1.6), dark = R() < 0.55;
    for (const dx of [-w, 0, w]) { g.save(); g.translate(x + dx, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, dark ? 'rgba(150,60,18,0.35)' : 'rgba(255,214,150,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); }
  }
  for (let i = 0; i < 260; i++) { const x = R() * w, a = 0.03 + R() * 0.07; g.fillStyle = R() < 0.5 ? `rgba(255,230,180,${a})` : `rgba(120,50,15,${a})`; g.fillRect(x, 0, 0.6 + R() * 1.6, h); } // たての細いすじ
  for (let i = 0; i < 90; i++) { const x = R() * w, y = R() * h, r = 0.6 + R() * 1.8; g.fillStyle = 'rgba(255,240,210,0.55)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(110,45,12,0.35)'; g.lineWidth = 0.5; g.stroke(); } // 小さな気泡
}));
const woodCanvas = () => memo('wood', () => canvas(256, 256, (g, w, h) => { const R = rnd(11); g.fillStyle = '#3a2414'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${20 + R() * 30},${10 + R() * 14},4,.35)`; g.lineWidth = 1 + R() * 2; const y = R() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + R() * 8 - 4, w * 0.7, y + R() * 8 - 4, w, y); g.stroke(); } noise(g, w, h, R, 12); }));
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
// 2026-11-24 作者「やっぱり前の六角形の方が良かったかな〜」で、試作_飛び出す絵本と同じ六角形（ふちの線つき）にもどした
const hexCanvas = () => canvas(128, 128, (g) => {
  g.translate(64, 64); g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); } g.closePath();
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(220,225,255,.34)'); gr.addColorStop(0.8, 'rgba(190,200,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,.4)');
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(235,240,255,.35)'; g.lineWidth = 3; g.stroke(); });

/** 切り抜きの板（両面に同じ絵）。影も絵の形で落ちる */
/** レフ板（2026-11-22 作者「カメラからキャラにスポットライトかレフ板を置いて明るく」）：キャラの絵を少しだけ自分で光らせる */
const CHAR_FILL = 0.22;
/**
 * キャラの色の調子（フィールドの絵だけ。元のドット絵のファイルは変えない）。2026-11-23 作者「ナハトの色が紫すぎるなあもっと黒っぽく特に髪を」：
 * 紫の色（青が緑より強い色）だけを、彩度を落として暗くする。肌・金具など暖かい色はそのまま。髪（1コマの上から hair の割合まで）はもっと暗く
 */
const CHAR_TONE = { nacht: { sat: 0.6, dark: 0.8, hair: 0.4, hairSat: 0.2, hairDark: 0.5 } }; // 服は紫を少し残す（2026-11-23 作者「服はもう少し紫でもいい」）
function toneSheet(id, img, fh) {
  const t = CHAR_TONE[id]; if (!t || !img || typeof document === 'undefined') return img;
  const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const g = c.getContext('2d'); if (!g) return img; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let y = 0; y < c.height; y++) {
    // 髪と服のさかいめは、なだらかに（くっきり分けると、フードの上だけ黒い帯になった。2026-11-23 作者の画像）
    const f = (y % fh) / fh, k = Math.max(0, Math.min(1, (t.hair + 0.05 - f) / 0.1)), sat = t.sat + (t.hairSat - t.sat) * k, dark = t.dark + (t.hairDark - t.dark) * k;
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4; if (px[i + 3] === 0) continue;
      const R = px[i], G = px[i + 1], B = px[i + 2]; if (!(B > G + 4)) continue; // 紫・青みの色だけ
      const L = 0.3 * R + 0.59 * G + 0.11 * B;
      px[i] = (L + (R - L) * sat) * dark; px[i + 1] = (L + (G - L) * sat) * dark; px[i + 2] = (L + (B - L) * sat) * dark;
    }
  }
  g.putImageData(d, 0, 0); return c;
}
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
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, stencil: true, powerPreference: 'low-power' }); // stencil：くりぬいた戸口の奥を、穴からだけ見せる
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.autoClear = false;
  canvasEl.style.imageRendering = 'auto';
  const scene = new THREE.Scene(); const NIGHT = 0x0b0d22; scene.background = new THREE.Color(NIGHT);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  // 暗転（マップを移るとき）：画面全体に重ねる板
  const fadeScene = new THREE.Scene(), fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // キャラ以外をぼかす（2026-11-23 作者「はいると、キャラはそのまま動かさないで、ほかはぼかされて、ぼかし最大になったら中にきりかわり、ぼかしから始まり、ぼかしをとっていく」）
  // キャラは layer 1 だけ、ほかは layer 0。灯りは両方。ふだんのカメラは両方を写す。ぼかすときは、layer 0 を絵にしてぼかし、その上に layer 1（キャラ）をくっきり描く
  camera.layers.enable(1);
  const blurRT = [0, 1].map(() => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true }));
  const blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv) * 0.227027; c += texture2D(tDiffuse, vUv + dir * 1.3846153846) * 0.3162162162; c += texture2D(tDiffuse, vUv - dir * 1.3846153846) * 0.3162162162; c += texture2D(tDiffuse, vUv + dir * 3.2307692308) * 0.0702702703; c += texture2D(tDiffuse, vUv - dir * 3.2307692308) * 0.0702702703; gl_FragColor = c; }' });
  const blurScene = new THREE.Scene(); blurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat));
  const blurOutMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }); const blurOutScene = new THREE.Scene(); blurOutScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurOutMat));
  let blurAmt = 0; // 0〜1
  // 切りかわりの前後に、中の部屋のだいたいの色を背景にうっすら重ねる（2026-11-23 作者「切り替わる前後をもっと自然な感じに。ぼかしと同時に、色味をなんとなく重ねて」）。キャラには重ねない
  const veilMat = new THREE.MeshBasicMaterial({ color: 0xd9a066, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }); const veilScene = new THREE.Scene(); veilScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veilMat));
  let veilAmt = 0;
  // 中を組み立てているあいだ（0.2秒ほど）も画面を止めないように、切りかわる直前の画面を絵として取っておき、そのあいだ毎コマ描く（少しずつ寄る）
  /** @type {any} */ let holdTex = null; /** @type {any} */ let holdBg = null; let holdOk = false, holdT0 = 0;
  /* 取っておいた画面は、色の変換をせずそのまま描く（画面と同じ色の形式で取るため。sRGB の形式で取ろうとすると写しが失敗して真っ黒になった。2026-11-23 作者「一瞬黒くなる」） */
  const holdMat = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, op: { value: 1 } }, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float op; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, op); }' }); const holdMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), holdMat); const holdScene = new THREE.Scene(); holdScene.add(holdMesh);
  const grabHold = () => { // いま描いた画面を取っておく
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!holdTex || holdTex.image.width !== sz.x || holdTex.image.height !== sz.y) { holdTex?.dispose(); holdTex = new THREE.FramebufferTexture(sz.x, sz.y); }
    renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), holdTex); holdOk = true;
  };
  // 背景だけ（キャラを描く前）の写し。着いた直後に重ねるのはこちら：キャラまで重ねると、前後でキャラの位置が少しずれて残像になった（2026-11-23 作者「何かキャラの残像があるときがある」）
  const grabBg = () => {
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!holdBg || holdBg.image.width !== sz.x || holdBg.image.height !== sz.y) { holdBg?.dispose(); holdBg = new THREE.FramebufferTexture(sz.x, sz.y); }
    renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), holdBg);
  };
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a10, transparent: true, opacity: 0, depthTest: false }); fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));

  // 灯り（試作と同じ組み合わせ）
  const hemi = new THREE.HemisphereLight(0x8090c8, 0x2a1a10, 0.9); scene.add(hemi);
  // 昼と夜（2026-11-22 作者「昼背景を作ってみたら、いいのでそれも入れてみて」）：外のマップだけ。昼は空・もやを明るく、日の光を強く、灯りはほのかに。奥の背景は昼の絵（stage の背景の板の imageDay）
  let DAY = false;
  const ROOM_NIGHT = 0x150e09, ROOM_DAY = 0x6e5c48; // 書斎の部屋の色（本のまわり。夜は暗く、昼は窓の光が入ったような明るい茶）
  // カメラから主人公へのスポットライト（やわらかいふち。主人公とまわりの床を少し明るく）
  const charSpot = new THREE.SpotLight(0xfff1dc, 2.2, 0, 0.2, 0.75, 0); scene.add(charSpot, charSpot.target);
  const key = new THREE.DirectionalLight(0xfff0d8, 1.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; scene.add(key, key.target);

  // オーブ
  const hexTex = texOf(hexCanvas()); const orbGroup = new THREE.Group(); scene.add(orbGroup);
  // 光の玉は場所ごとに変える（2026-11-22 作者「オーブは場所によって変えるようにしたい」）：マップの stage.orbs（数・明るさ・色・大きさ）が
  // stage-style.json の orbs を上書きする。玉は ORB_MAX 個まで先に作っておき、マップを読むたびに数と色を合わせる
  const ORB_MAX = 80, ORB_MORE = 1.0, NEAR_ORBS = 5; // 2026-11-23 作者「オーブの量を増やして」「カメラ付近にも出るように」のあと「オーブ多すぎるかな」：マップの数の1.3倍、カメラの前に8個。2026-11-24 作者「オーブが多いかも」：マップの数のまま、カメラの前に5個
  const orbSprites = [];
  for (let i = 0; i < ORB_MAX; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hexTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: i * 1.7, toneMapped: false, fog: false }) /* 明るい部屋でも消えないように、明るさをおさえる処理（トーンマッピング）ともやを受けない */); s.visible = false; orbGroup.add(s); orbSprites.push(s); }
  let orbCfg = { count: 0, alpha: 0.7, size: 1 };
  const nearOrbs = []; for (let i = 0; i < NEAR_ORBS; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hexTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: i * 2.3, toneMapped: false, fog: false })); s.visible = false; orbGroup.add(s); nearOrbs.push(s); }
  const applyOrbs = (m) => {
    const o = { ...(style.orbs || {}), ...(m.stage?.orbs || {}) };
    orbCfg = { count: Math.max(0, Math.min(ORB_MAX, Math.round((o.count ?? 0) * ORB_MORE))), alpha: o.alpha ?? 0.7, size: o.size ?? 1 };
    const c = new THREE.Color(...(o.color || [1, 1, 1]));
    orbSprites.forEach((s, i) => { s.material.color.copy(c); if (i >= orbCfg.count) s.visible = false; });
    nearOrbs.forEach((s) => { s.material.color.copy(c); s.visible = false; });
  };

  // キャラ（なびくドット絵）。読み終わるまで load が待つ
  const loader = new THREE.TextureLoader();
  const flutter = {};
  // 書斎の元絵（美術・演出室 v02：本と書斎 desk_lamp・book_spines・desk_edge）。読めなければコードの仮の絵
  /** @type {Record<string, any>} */ const bookArt = {};
  const bookReady = Promise.all([...['desk_lamp', 'book_spines', 'desk_edge', 'leather_cover', 'paper_page', 'page_edge', 'desk_wood', 'lamp_brass', 'lamp_glass', ...(STUDY_BACKDROP ? ['study_backdrop'] : [])].map((n) => ['assets/book/' + n + '.webp', n]), ...['wall', 'wainscot', 'wood_side'].map((n) => ['assets/interiors/silver-deer/' + n + '.webp', 'st_' + n]), ['assets/backdrops/norn_day_v02.jpg', 'st_paint']]
    .map(([url, n]) => loader.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; bookArt[n] = t; BOOK_IMG[n] = t.image; }, () => {}))); // leather_cover・paper_page・page_edge・desk_wood：美術・演出室 2026-11-24 の本と机の質感。st_＊：書斎の壁・腰板・窓・木（2026-11-23 作者「簡単な書斎」）
  const flutterReady = Promise.all(Object.entries(FLUTTER).map(([id, path]) => loader.loadAsync(path).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; flutter[id] = t; }, () => {})));

  // マップの手ざわり（stage.textures）：美術・演出室の元絵をそのまま張る（2026-11-22 作者「試しにドット化しないでそのまま張ったらどうなる？」）。?innart=0 で前のコードの絵
  const artCache = {}; let ART2 = null;
  // 内装の手ざわりと切り抜き（v01：床〜扉、v02：木・腰板・麻布・敷物と、切り抜きの灯り・瓶・ジョッキ・樽。2026-11-23 作者「銀鹿亭のテクスチャできたよ」）
  const INN_KEYS = ['bedHome', 'tableHome', 'cupboard', 'herbs', 'pot', 'chest', 'washTub', 'pillar', 'windowArch', 'flowerBox', 'pottery', 'bread', 'guestBook', 'keyRack', 'logBasket', 'floor', 'wall', 'ceiling', 'brick', 'window', 'tabletop', 'counter', 'blanket', 'door', 'wood', 'wainscot', 'linen', 'rug', 'barrels', 'bottles', 'mugs', 'candle', 'lampHanging', 'lampWall', 'flame', 'logs'];
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
    TOWN_CFG = null; TOWN_IMG = null; ART2 = null; CUT_OVR = m.stage?.textures?.cuts || {}; const t = m.stage?.textures; if (!t || new URLSearchParams(location.search).get('innart') === '0') return;
    const out = {};
    for (const k of INN_KEYS) {
      if (!t[k]) continue; const url = (t.base || '') + t[k];
      if (!(url in artCache)) artCache[url] = await loader.loadAsync(url).then((x) => { x.colorSpace = THREE.SRGBColorSpace; return x; }, () => null);
      if (!artCache[url]) continue;
      // ?pixelroom=1：元絵をドット絵にしてから張る（2026-11-22 作者「ドットでも試す」）。絵1枚が覆うマス数に合わせて、1マス約40ドットに
      if (PIXROOM) { const key = url + '#dot2'; if (!(key in artCache)) { const [tw, th] = ART_TILES[k] || [2, 2]; const t = texOf(pixCanvas(artCache[url].image, tw, th, true)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; artCache[key] = t; } out[k] = artCache[key]; }
      else out[k] = artCache[url];
    }
    ART2 = out;
  }
  /**
   * 次のマップの絵を先に読んでおく（2026-11-23 作者「ロードをする間を稼ぐために演出があると違和感なくなったりするのかな？」→「そうする」）。
   * 出入口の「去る」演出のあいだに、町の絵・内装の手ざわり・敵の姿を読み、ほどき（decode）、手ざわりは GPU にも送っておく。
   * load と同じ置き場（townCache・artCache・symCache）に入れるので、着いたときの load はそれを使う。いまの舞台には触らない
   * @param {any} m
   */
  async function prefetchMap(m) {
    if (!m) return;
    const img = (/** @type {string} */ url) => new Promise((ok) => { const im = new Image(); im.onload = () => im.decode().catch(() => {}).then(() => ok(im)); im.onerror = () => ok(null); im.src = url; });
    const jobs = [];
    const t = m.stage?.townArt;
    if (t) for (const f of new Set([...Object.values(t.ground || {}), ...Object.values(t.boards || {}).flat()])) { const url = (t.base || '') + f; if (!(url in townCache)) jobs.push(img(url).then((im) => { if (!(url in townCache)) townCache[url] = im; })); }
    for (const e of m.encounters || []) for (const url of e.symbol || []) if (!(url in symCache)) jobs.push(img(url).then((im) => { if (!(url in symCache)) symCache[url] = im; }));
    const tx = m.stage?.textures;
    if (tx && new URLSearchParams(location.search).get('innart') !== '0') for (const k of INN_KEYS) {
      if (!tx[k]) continue; const url = (tx.base || '') + tx[k]; if (url in artCache) continue;
      jobs.push(loader.loadAsync(url).then(async (x) => { try { await x.image?.decode?.(); } catch { /* ほどけなくても張るときにほどく */ } x.colorSpace = THREE.SRGBColorSpace; if (!(url in artCache)) { artCache[url] = x; upQ.push(x); pumpUploads(); } }, () => {}));
    }
    await Promise.all(jobs);
  }
  // GPU へ送るのは1コマに少しずつ（2026-11-24 作者の録画「銀鹿亭の中の部屋に入るとき」：扉に入った瞬間に約1秒止まっていた。先読みした部屋の絵を、届いたそばから一度に送っていた）
  /** @type {any[]} */ const upQ = []; let pumping = false;
  async function pumpUploads() {
    if (pumping) return; pumping = true;
    try { let tb = performance.now(); while (upQ.length) { renderer.initTexture(upQ.shift()); if (performance.now() - tb > 6) { await new Promise((res) => requestAnimationFrame(() => res(undefined))); tb = performance.now(); } } }
    finally { pumping = false; }
  }
  /** 元絵の手ざわり（写しを作って繰り返し数を決める。写しはマップを替えるときに片づく）。無ければ null */
  /** 切り抜きの元絵の、絵のある範囲（px。美術・演出室の 追加元絵_生成一覧_v01.json の content_bounds_alpha128）と絵の大きさ */
  const CUT = { rug: [[42, 32, 980, 863], 1024, 896], barrels: [[83, 28, 686, 739], 768, 768], bottles: [[37, 40, 987, 370], 1024, 384], candle: [[38, 19, 218, 493], 256, 512], lampHanging: [[150, 27, 360, 740], 512, 768], lampWall: [[19, 75, 492, 492], 512, 512],
    // 美術・演出室 v03（2026-11-23 作者「アーチ窓小物組める？」）：絵のある範囲 px と、元の絵の大きさ
    windowArch: [[27, 52, 741, 988], 768, 1024], flowerBox: [[98, 11, 926, 309], 1024, 320], bread: [[18, 88, 494, 371], 512, 384], guestBook: [[18, 121, 494, 371], 512, 384],
    keyRack: [[18, 18, 494, 443], 512, 512], logBasket: [[60, 18, 452, 494], 512, 512] };
  /** @type {Record<string, any>} マップの stage.textures.cuts（切り抜きの範囲の上書き） */ let CUT_OVR = {};
  const POT_CUPS = [[31, 106, 224, 246], [543, 106, 735, 246]]; // v03 pottery の生成りの杯2つ（皿2枚は正面から見た丸い絵なので、卓には寝かせられず使わない）
  const MUGS = [[37, 113, 158, 243], [242, 114, 361, 243], [446, 113, 568, 243]]; // mugs.png の木のジョッキ2つ・錫のジョッキ1つ（あとの2つは木の皿）
  /** 元絵の一部（b＝[x0,y0,x1,y1] px）だけを使う手ざわり。flip：左右を返す（壁の右側の灯りなど、物の向きだけ。キャラには使わない） */
  const cutT = (k, b, W, H, flip = false) => { const base = ART2?.[k]; if (!base) return null; const t = base.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; const rx = (b[2] - b[0] + 1) / W, ry = (b[3] - b[1] + 1) / H; t.repeat.set(flip ? -rx : rx, ry); t.offset.set(flip ? (b[0] / W + rx) : b[0] / W, 1 - (b[3] + 1) / H); t.anisotropy = 8; return t; };
  /** 切り抜きの紙の板（高さ h、幅は絵の縦横比）。まんなかが原点。無ければ null（前のコードの形にもどす） */
  const cutPlane = (k, h, { b = (CUT_OVR[k] ?? CUT[k])?.[0], W = (CUT_OVR[k] ?? CUT[k])?.[1], H = (CUT_OVR[k] ?? CUT[k])?.[2], flip = false, emissive = 0 } = {}) => {
    if (!b) return null; const t = cutT(k, b, W, H, flip); if (!t) return null;
    const w = h * (b[2] - b[0] + 1) / (b[3] - b[1] + 1);
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, roughness: 0.8, side: THREE.DoubleSide, ...(emissive ? { emissive: 0xffffff, emissiveMap: t, emissiveIntensity: emissive } : {}) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.castShadow = true;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.35 }); m.userData.w = w; return m;
  };
  const artT = (k, rx = 1, ry = 1) => { const b = ART2?.[k]; if (!b) return null; const t = b.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
  /** @type {any[]} 中の扉（ちょうつがいで回る） */ let innerDoors = [];
  /** @type {any[]} 仮の客の絵（カメラのほうを向ける） */ let npcHinges = [];
  /** @type {any} 書斎の奥の本棚（入る演出 shelf で寄る） */ let studyShelf = null;
  /** @type {any} くりぬいた戸口の奥（カメラが家の正面より奥へ入ったら、穴の外にも描く） */ let holeRecess = null;
  /** @type {any} ぼかして入るとき、外の最後のカメラ（主人公からのずれ）。中はここから始めて、キャラが画面の同じ所・同じ大きさに映るように（2026-11-23 作者「キャラが瞬間移動してしまう」） */ let carry = null;
  let peekEntry = false; /** @type {any} 行き先のマップ（去る演出のあいだに main が知らせる） */ let nextMap = null;
  /** @type {{p:number[], q:number[], fov:number}|null} 撮影の道具だけが使う、決めたカメラ */ let capturePose = null; // 中の眺めの写しへ寄って入った（着くときに暗くしない）
  let map = null, root = null, pages = null, actors = {}, boards = [], lights = [], fires = [], delayOf = riseDelayFn([]);
  const glowTex = texOf(glowCanvas());
  // 入る演出の戸口の光（人形の家・たたむ・光）
  const doorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc878, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0 }));
  doorGlow.visible = false; doorGlow.renderOrder = 5; scene.add(doorGlow);
  /** @type {{HT:number, F:number}|null} ブックヌックの箱の大きさ（中のマップのとき） */ let nook = null;
  /** 仲間の見え方（2026-11-24 作者「２，４」）：広い所ではかたまって歩き、止まると主人公のまわりに集まる。core の並び（一列の足あと）は変えず、絵の位置だけずらす */
  const grp = { /** @type {Record<string,any>} 仲間ごとの「横へずれる量 lat・よける量 dx・集まる度合い g」 */ vis: {}, idleT: 0, lastT: 0, /** @type {string|null} */ mapId: null };
  let interior = false, cssW = 1, cssH = 1, lastEye = [0, 0, 0], lastIntro = null, orbsShown = 0, lastEffect = '';

  // めくれるページ（ページめくりの演出）。背を軸に、右ページから左ページへ。先のほうが遅れてしなる（試作と同じ形）
  // 2026-11-22 作者「めくっているページのテクスチャが紙」「右はじに行ったら右からめくる、左へ行ったら左からめくる」：
  //   めくれる紙の表（はじめ上を向いている面）は前のマップのページ、裏（めくり終わって上を向く面）は新しいマップのページにする。
  //   右へ出たら右ページが左へめくれ、左へ出たら左ページが右へめくれる。位置は2つの面で共有し、絵の切り出し（uv）だけ面ごとに変える
  // 2026-11-23 作者「本をめくる感じももっと紙の質感に近づけてほしい」：紙は手前の角から持ち上がり（角が先に、奥は遅れて）、先のほうが遅れてしなり、少し波打つ。
  //   紙の表面に繊維の細かい凹凸（bumpMap）を付け、うすく光を通すように裏の面を少し明るくする
  const TN = 24, TM = 8; // 横（背から先へ）・縦（奥から手前へ）の分け方
  const fiberTex = texOf(canvas(256, 256, (g, w, h) => { const R = rnd(41); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = 100 + R() * 70 | 0; g.strokeStyle = `rgba(${v},${v},${v},.35)`; g.lineWidth = 0.6 + R(); const x = R() * w, y = R() * h, l = 4 + R() * 14, an = R() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke(); } noise(g, w, h, R, 30); }));
  fiberTex.wrapS = fiberTex.wrapT = THREE.RepeatWrapping; fiberTex.repeat.set(6, 6);
  const turnTex = texOf(canvas(512, 384, (g, w, h) => { g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,60,20,.28)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); noise(g, w, h, rnd(3), 16); }));
  const turnMat = (glow = 0.25) => new THREE.MeshStandardMaterial({ map: turnTex, roughness: 0.95, bumpMap: fiberTex, bumpScale: 0.6, emissive: 0xffffff, emissiveMap: turnTex, emissiveIntensity: glow }); // めくれる紙が暗くなりすぎないよう、少し自分で光らせる
  /** めくれる紙1枚（表 A・裏 B の2つの面。位置は共有し、絵の切り出し uv だけ面ごと） */
  function makeSheet() {
    const nv = (TN + 1) * (TM + 1), pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3), idx = [];
    for (let i = 0; i < TN; i++) for (let j = 0; j < TM; j++) { const v = i * (TM + 1) + j, r = v + TM + 1; idx.push(v, r, v + 1, v + 1, r, r + 1); }
    const geo = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', pos); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); g.setIndex(idx); return g; };
    const gA = geo(), gB = geo(), A = new THREE.Mesh(gA, turnMat()), B = new THREE.Mesh(gB, turnMat(0.35)); // 裏は光が透けて少し明るい
    A.castShadow = true; const group = new THREE.Group(); group.add(A, B); group.visible = false; scene.add(group);
    return { pos, gA, gB, A, B, group, sign: 0 };
  }
  const sheet = makeSheet(), turnMesh = sheet.group, turnA = sheet.A, turnB = sheet.B;
  const flyleaves = [makeSheet(), makeSheet()];
  const riffleSheets = Array.from({ length: RIFFLE.n }, () => makeSheet()); // 奥へ何枚もめくる紙 // 本がひらくとき、表紙を追って白い見返しの紙が2枚めくれる（2026-11-23 作者「最初の本開くところチープな感じ」）
  /** 外のマップのページの絵（めくる紙に使う）。いまのと、ひとつ前の */
  let curPageTex = null, prevPageTex = null;
  // めくる紙の表と裏：板とキャラが倒れて平らになったページを、真上から撮った絵（2026-11-23 作者「突然消えたり出てきたりする感をなくしたい」）。
  // 前のページ（去る最後）と新しいページ（着いた最初）。撮れていないときは、地面だけのページの絵
  const snapRT = [0, 1].map(() => { const t = new THREE.WebGLRenderTarget(16, 16); t.texture.colorSpace = THREE.SRGBColorSpace; return t; });
  let snapPrevOk = false, snapCurOk = false;
  // めくるあいだ、紙が寝る側（右からめくれば左）には、前のページの写しを残しておく（紙がかぶさるまで。2026-11-23 作者「右のページは前にいたところを残すことができないかな」）
  const oldHalf = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: snapRT[0].texture, toneMapped: false })); oldHalf.rotation.x = -Math.PI / 2; oldHalf.visible = false; scene.add(oldHalf);
  let oldHalfSide = 0;
  const setOldHalf = (/** @type {number} */ side, /** @type {number} */ BW, /** @type {number} */ BH) => { // side -1＝左半分 / +1＝右半分
    if (oldHalfSide !== side) { oldHalfSide = side; const uv = oldHalf.geometry.attributes.uv; const u0 = side < 0 ? 0 : 0.5; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + (i % 2) * 0.5); uv.needsUpdate = true; }
    oldHalf.scale.set(BW / 2, BH, 1);
  };
  const snapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  const snapPage = (/** @type {any} */ rt) => {
    const { BW, BH } = bookSize(map), w = 2048, h = Math.round(2048 * BH / BW);
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    Object.assign(snapCam, { left: -BW / 2, right: BW / 2, top: BH / 2, bottom: -BH / 2 }); snapCam.updateProjectionMatrix();
    snapCam.position.set(map.width / 2, 120, map.height / 2); snapCam.up.set(0, 0, -1); snapCam.lookAt(map.width / 2, 0, map.height / 2);
    snapCam.layers.enable(1);
    const hid = [turnMesh, ...riffleSheets.map((f) => f.group), ...flyleaves.map((f) => f.group), ...orbSprites, ...trailDots, doorGlow, oldHalf].filter((o) => o.visible); // 前のページの写し（oldHalf）を写しこまない
    hid.forEach((o) => { o.visible = false; });
    const fog = scene.fog; scene.fog = null;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, snapCam); renderer.setRenderTarget(null);
    scene.fog = fog; hid.forEach((o) => { o.visible = true; });
  };
  const setTurnTex = (/** @type {any} */ m, /** @type {any} */ t) => { m.material.map = t || turnTex; m.material.emissiveMap = t || turnTex; m.material.needsUpdate = true; };
  /**
   * @param {any} sh 紙 @param {number} p 0＝めくる前のページに寝ている／1＝反対のページに寝ている @param {number} PW 片ページの横 @param {number} PH 縦
   * @param {number} sign +1＝右ページから左へ（右へ出たとき）／-1＝左ページから右へ（左へ出たとき）
   */
  function bendSheet(sh, p, PW, PH, sign) {
    if (sign !== sh.sign) { // 向きが変わったら、面ごとの絵の切り出しと、どちらの面を見せるかを決め直す
      sh.sign = sign;
      const ua = sh.gA.attributes.uv.array, ub = sh.gB.attributes.uv.array;
      for (let i = 0; i <= TN; i++) for (let j = 0; j <= TM; j++) { const k = (i * (TM + 1) + j) * 2, fa = 0.5 + sign * 0.5 * i / TN, fb = 0.5 - sign * 0.5 * i / TN, v = 1 - j / TM; ua[k] = fa; ua[k + 1] = v; ub[k] = fb; ub[k + 1] = v; }
      sh.gA.attributes.uv.needsUpdate = true; sh.gB.attributes.uv.needsUpdate = true;
      // 三角形の向きは sign で裏返る
      sh.A.material.side = sign > 0 ? THREE.BackSide : THREE.FrontSide; sh.B.material.side = sign > 0 ? THREE.FrontSide : THREE.BackSide;
      sh.A.material.needsUpdate = true; sh.B.material.needsUpdate = true;
    }
    const pos = sh.pos.array, dx = PW / TN, LAG = 0.22;
    for (let j = 0; j <= TM; j++) {
      const zf = j / TM, z = -PH / 2 + PH * zf; // zf＝1 が手前（めくる指のある角）
      const pj = Math.max(0, Math.min(1, (p - (1 - zf) * LAG) / (1 - LAG))); // 手前の角が先、奥は遅れる
      let x = 0, y = 0;
      for (let i = 0; i <= TN; i++) {
        const k = (i * (TM + 1) + j) * 3; pos[k] = sign * x; pos[k + 1] = y; pos[k + 2] = z;
        const u = i / TN, lift = Math.sin(pj * Math.PI);
        const th = pj * Math.PI - 0.95 * lift * Math.pow(u, 1.25) + 0.06 * lift * Math.sin(u * 7 - pj * 9) * u; // 先が遅れてしなる＋うすい波
        x += Math.cos(th) * dx; y += Math.sin(th) * dx;
      }
    }
    sh.pos.needsUpdate = true; sh.gA.computeVertexNormals(); sh.gB.computeVertexNormals(); sh.gA.computeBoundingSphere(); sh.gB.computeBoundingSphere();
  }
  const cam = { x: 0, z: 0, init: false };
  /** 地図の演出の光の点（先頭）と足あと */
  const trailDots = Array.from({ length: 7 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd890, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; scene.add(s); return s; });

  function disposeTree(o) { o.traverse((m) => { if (m.geometry) m.geometry.dispose(); const ms = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []; for (const mt of ms) { if (mt.map && !Object.values(flutter).includes(mt.map) && mt.map !== hexTex) mt.map.dispose(); mt.dispose(); } if (m.customDepthMaterial) m.customDepthMaterial.dispose(); }); }

  /** 画像のある板（タイル画像の領域を切り出す。にじませない） */
  function regionCanvas(it) {
    const r = assets.regions[it.asset]?.[it.region], img = assets.images[it.asset]; if (!r || !img) return null;
    const T = map.tileSize || 32, w = it.repeat === 'x' ? it.w * T : r[2];
    return canvas(w, r[3], (g) => { g.imageSmoothingEnabled = false; for (let x = 0; x < w; x += r[2]) g.drawImage(img, r[0], r[1], Math.min(r[2], w - x), r[3], x, 0, Math.min(r[2], w - x), r[3]); });
  }

  function buildExterior() {
    const W = map.width, H = map.height, bk = style.book || DEFAULT_STYLE.book, M = Math.max(0.6, bk.margin ?? 0.6);
    const { BW, BH } = bookSize(map); // 見開きの大きさ（縦横の比率はどのエリアも同じ。地図は真ん中）
    const pageCv = pageCanvas(map), leather = texOf(leatherCanvas()), coverT = texOf(coverCanvas((BH + 2 * M) / (BW / 2 + M)));
    leather.wrapS = leather.wrapT = THREE.RepeatWrapping; leather.repeat.set(2, 2);
    const edgeT = bookArt.page_edge ? bookArt.page_edge.clone() : texOf(pageEdgeCanvas()); edgeT.needsUpdate = true; edgeT.wrapS = edgeT.wrapT = THREE.RepeatWrapping; edgeT.repeat.set(bookArt.page_edge ? 2 : 6, 1); // 届いた小口の絵（2026-11-24）
    const leatherM = new THREE.MeshPhysicalMaterial({ map: leather, roughness: 0.62, bumpMap: leather, bumpScale: 1.2, clearcoat: 0.35, clearcoatRoughness: 0.45, envMap: getStudyEnv(), envMapIntensity: 0.55 }); // 革：うすいつやと書斎の映りこみ（2026-11-23 作者「本と机とランプはリアルに」）
    const coverM = new THREE.MeshPhysicalMaterial({ map: coverT, roughness: 0.6, bumpMap: coverT, bumpScale: 1.5, clearcoat: 0.4, clearcoatRoughness: 0.4, envMap: getStudyEnv(), envMapIntensity: 0.6 });
    const edgeM = new THREE.MeshStandardMaterial({ map: edgeT, roughness: 1 }), stackTopM = new THREE.MeshStandardMaterial({ map: bookArt.paper_page || null, color: bookArt.paper_page ? 0xffffff : 0xd8c8a2, roughness: 1 });
    const make = (side) => { // side -1 左ページ / +1 右ページ。背（x=W/2）を軸に回る
      const pivot = new THREE.Group(); pivot.position.set(W / 2, 0, H / 2); root.add(pivot);
      // 面の順 +x,-x,+y,-y,+z,-z。閉じた本では左半分の下の面（-y）が上を向く＝表紙の絵（横書きの本：背が左、表紙は右から左へひらく。2026-11-23 作者「最初の本の開き方逆かな、だって横書きだから」）
      const cover = new THREE.Mesh(roundBox(BW / 2 + M, 0.3, BH + 2 * M), [leatherM, leatherM, leatherM, side < 0 ? coverM : leatherM, leatherM, leatherM]);
      cover.position.set(side * (BW / 4 + M / 2), -0.36, 0); cover.receiveShadow = true; pivot.add(cover);
      const stack = new THREE.Mesh(roundBox(BW / 2, 0.2, BH), [edgeM, edgeM, stackTopM, stackTopM, edgeM, edgeM]); /* まわりは紙の重なり（小口） */ stack.position.set(side * BW / 4, -0.11, 0); stack.castShadow = true; stack.receiveShadow = true; pivot.add(stack); // 2026-11-24：前は行末のコメントの中に入りこんで、本に置かれていなかった
      const t = texOf(pageCv); t.repeat.set(0.5, 1); t.offset.set(side < 0 ? 0 : 0.5, 0);
      const page = new THREE.Mesh(new THREE.PlaneGeometry(BW / 2, BH), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, bumpMap: fiberTex, bumpScale: 0.5 })); page.rotation.x = -Math.PI / 2; page.position.set(side * BW / 4, 0, 0); page.receiveShadow = true; pivot.add(page);
      return pivot;
    };
    pages = { left: make(-1), right: make(1) };
    { const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, BH + 2 * M, 20), leatherM); spine.rotation.x = Math.PI / 2; spine.position.set(0, -0.42, 0); pages.right.add(spine); } // 背の丸み：本の背にそって奥から手前へのびる筒。ページより下に収める（2026-11-23 作者「これなに」：前は向きをまちがえて横向きになり、ページの上に黒い棒が出ていた）
    // めくる紙のための、このマップのページの絵（root の外に持つので、マップを読みかえても次のめくりまで残る）
    if (prevPageTex && prevPageTex !== curPageTex) prevPageTex.dispose();
    prevPageTex = curPageTex; curPageTex = texOf(pageCv);
    buildStudy(W, H, BW, BH);
    const sky = DAY ? ROOM_DAY : ROOM_NIGHT; scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 34, 80);
  }
  /**
   * 本のまわり：書斎の机の上（2026-11-23 作者が「書斎の机の上」を選んだ）。木の机の天板に本を置き、奥に本棚、左に机のランプ。
   * 机・本棚の絵はコードで描いた仮（元絵は美術・演出室に依頼中：desk_wood.png・study_backdrop.png）
   */
  /**
   * 書斎だけの映りこみ（2026-11-23 作者「ランプと本と机だけはリアルにして、中身は絵本の世界みたいにしたい」）：
   * 暗い木の部屋・左上のランプの暖かい光・奥の本棚の色・右上のうすい窓の光を、小さな場面に置き、ぼかした映りこみの絵（PMREM）にする。
   * 机・本の革・ランプの真鍮とガラスにだけ張る（scene.environment にはしない＝本の中の板やキャラには映りこまない）
   */
  let studyEnv = null;
  const getStudyEnv = () => {
    if (studyEnv) return studyEnv;
    const es = new THREE.Scene(), bm = (/** @type {number[]} */ c) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), bm([0.06, 0.035, 0.02])); es.add(room); // 暗い木の部屋
    const panel = (/** @type {number[]} */ c, /** @type {number[]} */ pos, /** @type {number[]} */ size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2]), side: THREE.DoubleSide })); m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); es.add(m); };
    panel([3.2, 1.9, 0.8], [-9, 7, -3], [3, 3]);     // 左上のランプ（暖かい。強すぎると机のつやに大きな光の玉が出た）
    panel([0.35, 0.16, 0.09], [0, 3, -19], [36, 10]); // 奥の本棚（赤茶）
    panel([0.9, 1.0, 1.25], [14, 9, 6], [6, 8]);      // 右上の窓（うすく青白い）
    panel([0.25, 0.14, 0.07], [0, -9.5, 0], [40, 40]); // 机の面の照り返し
    const pm = new THREE.PMREMGenerator(renderer); studyEnv = pm.fromScene(es, 0.03).texture; pm.dispose();
    return studyEnv;
  };
  function buildStudy(W, H, BW, BH) {
    const cx = W / 2, cz = H / 2, DW = BW * 3, DD = BH + 22, back = cz - BH / 2 - 10;
    const deskT = bookArt.desk_wood ? bookArt.desk_wood.clone() : texOf(woodCanvas()); deskT.needsUpdate = true; deskT.wrapS = deskT.wrapT = THREE.RepeatWrapping; deskT.repeat.set(bookArt.desk_wood ? DW / 26 : DW / 6, bookArt.desk_wood ? DD / 26 : DD / 6); deskT.anisotropy = 8; // 届いた机の木目（2026-11-24 美術・演出室）
    const env = getStudyEnv();
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(DW, DD), new THREE.MeshPhysicalMaterial({ map: deskT, color: bookArt.desk_wood ? 0x9a8070 : 0xc89a70, roughness: 0.5, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35, envMap: env, envMapIntensity: 0.4 })); // ニスを塗った机（ランプの光がつやに映る）
    desk.rotation.x = -Math.PI / 2; desk.position.set(cx, -0.52, back + DD / 2); desk.receiveShadow = true; root.add(desk);
    const edgeSide = new THREE.MeshPhysicalMaterial({ map: deskT, color: 0x9a7050, roughness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.3, envMap: env, envMapIntensity: 0.6 });
    const edgeFront = bookArt.desk_edge ? (() => { const t = bookArt.desk_edge.clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(DW / 9.6, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }); })() : edgeSide; // v02 desk_edge（1024×128＝高さ1.2で幅9.6）
    const edge = new THREE.Mesh(roundBox(DW, 1.2, 0.6), [edgeSide, edgeSide, edgeSide, edgeSide, edgeFront, edgeSide]); edge.position.set(cx, -1.12, back + DD); root.add(edge); // 机の手前のふち
    // 書斎の奥（2026-11-23 作者「簡単な書斎、こんなに本だけが並んでるの変だから」）：壁（下は腰板・上はしっくい）・右に本棚を1つ・左に窓。
    // どれもピントの外なので、絵を少しぼかして張る（作者「後ろの本棚もピンとぼけ」「ぼかしはもう少し少なめに」）。くり返す絵は、まわりに並べてからぼかして真ん中を切り出す（つなぎ目が暗くならない）
    const blurOf = (/** @type {any} */ src, /** @type {boolean} */ tile) => { void tile; // ぼかしは、絵を小さく縮めてから引きのばす形に（キャンバスのぼかしは、開くまで数秒かかった）
      let c = blurMemo.get(src); if (c) return c; // 同じ絵は取りおき（2026-11-25）
      c = canvas(Math.max(2, Math.round(src.width / 9)), Math.max(2, Math.round(src.height / 9)), (g, w, h) => g.drawImage(src, 0, 0, w, h)); /* 2026-11-23 作者「もう少しぼかしを」：1/5→1/9 */
      blurMemo.set(src, c); return c;
    };
    const tex = (/** @type {any} */ c, rx = 1, ry = 1) => { const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
    // 本物らしい背景の絵（美術・演出室に依頼中：assets/book/study_backdrop.webp）があれば、立体の壁・本棚・額の代わりに、机の奥へぼかして置く（2026-11-23 作者「やっぱり向こう側はリアルな背景をぼかして入れよう」）
    if (bookArt.study_backdrop) {
      const im = bookArt.study_backdrop.image, bw = DW * 1.25, bh = bw * im.height / im.width;
      const small = canvas(Math.max(2, Math.round(im.width / 3)), Math.max(2, Math.round(im.height / 3)), (g, w, h) => g.drawImage(im, 0, 0, w, h)); // 縮めてから引きのばして、やわらかくぼかす
      const REP = 5, bt = STUDY_BLUR ? texOf(small) : bookArt.study_backdrop; bt.wrapS = THREE.RepeatWrapping; bt.repeat.set(REP, 1); bt.offset.set((1 - REP) / 2 % 1, 0); bt.needsUpdate = true; /* 2026-11-24 作者「同じ絵でいいから横につなげて」：左右にくり返す */
      const bdG = new THREE.PlaneGeometry(bw * REP, bh, REP * 24, 1), bp = bdG.attributes.position, bc = [];
      for (let i = 0; i < bp.count; i++) { // 明るさ：まん中の1枚はそのまま、右どなりからはぐっと暗く（2026-11-24 作者「右側もっと暗く」：くり返した絵の左はしの明るい柱が目立った）、左は少しずつ暗く
        const u = bp.getX(i) / bw, k = u > 0.36 ? Math.max(0.2, 1 - (u - 0.36) / 0.15 * 0.8) : u < -0.5 ? Math.max(0.4, 1 - (-0.5 - u) * 0.5) : 1;
        bc.push(k, k, k);
      }
      bdG.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      const bd = new THREE.Mesh(bdG, new THREE.MeshBasicMaterial({ vertexColors: true, map: bt, color: DAY ? 0xd8d0c4 : 0xb0a498, toneMapped: true, fog: false }));
      bd.position.set(cx, -6 - DW * 0.02 + bh * 0.22, back - 34); /* 2026-11-24 作者「もう少し背景上に高くして」 */ /* 2026-11-24 作者「壁が近すぎる、もっと遠くへ」：12→34 */ root.add(bd); /* 本棚と額が見える高さに下げる。 2026-11-23 作者「その背景は少し遠くてもいいかも」：5→12、幅も1.9→2.4倍 */ studyShelf = bd;
      { const fc = canvas(8, 128, (fg, w, h) => { const gr = fg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(12,7,4,0.85)"); gr.addColorStop(0.45, "rgba(12,7,4,0.35)"); gr.addColorStop(1, "rgba(12,7,4,0)"); fg.fillStyle = gr; fg.fillRect(0, 0, w, h); });
        const fd = new THREE.Mesh(new THREE.PlaneGeometry(DW, 9), new THREE.MeshBasicMaterial({ map: texOf(fc), transparent: true, depthWrite: false, toneMapped: false })); fd.rotation.x = -Math.PI / 2; fd.position.set(cx, -0.5, back + 4.5); root.add(fd); } // 机の奥のはしを暗くかすませる（背景とのさかいが一本の線に見えた）
      { const dk = new THREE.Mesh(new THREE.PlaneGeometry(bw * 4, bh * 4), new THREE.MeshBasicMaterial({ color: 0x140c07, fog: false })); dk.position.set(cx, bd.position.y, back - 34.5); root.add(dk); } // 横長の画面で絵のはしの外が見えても、暗い壁に見えるように
    } else {
    const BZ = back - 5, WW = DW * 1.7, /* 2026-11-23 作者「もっと壁に近くていい」：10→5 */ /* 2026-11-23 作者「部屋広すぎ、もう少し壁近くていいよ」：26→10 */ WH = 70, floorY = -6, tint = DAY ? 0xffffff : 0xa89888;
    const wallImg = bookArt.st_wall?.image, wainImg = bookArt.st_wainscot?.image, woodImg = bookArt.st_wood?.image;
    const panelImg = wainImg || wallImg; // 壁は全体を木の板張りに（しっくいの絵は柱の格子が障子のように見えた）
    const wallM = new THREE.MeshStandardMaterial({ map: panelImg ? tex(blurOf(panelImg, true), WW / 9, WH / 9) : null, color: panelImg ? (DAY ? 0x7a6048 : 0x52402e) : 0x3a2c22, roughness: 0.85 }); // 2026-11-23 作者「もう少し暗くてもいい」
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), wallM); wall.position.set(cx, floorY + WH / 2, BZ); root.add(wall);
    { // 床：机と壁のあいだ（無いと背景の色が帯になって見えた）
      const ft = texOf(woodCanvas()); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(WW / 8, 6); const fd = back + DD - BZ + 4;
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(WW, fd), new THREE.MeshStandardMaterial({ map: ft, color: 0x2e2018, roughness: 0.75 })); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, floorY, BZ + fd / 2); fl.receiveShadow = true; root.add(fl);
    }
    void tint;
    // 本棚（木の枠と棚板、中に背表紙の絵）を3つ：額の絵の左右と、右の奥（2026-11-23 作者「もう少し本棚あってもいい」）
    const woodM = new THREE.MeshStandardMaterial({ map: woodImg ? tex(blurOf(woodImg, true), 1, 2) : null, color: woodImg ? (DAY ? 0x8a7058 : 0x6a523e) : 0x3a2616, roughness: 0.7 });
    const spines = bookArt.book_spines ? spineShelfCanvas(bookArt.book_spines.image) : studyShelfCanvas(), spineT = tex(blurOf(spines, true), 1, 5 / 3);
    const spineM = new THREE.MeshStandardMaterial({ map: spineT, color: DAY ? 0x9a9088 : 0x7a7068, roughness: 0.9 });
    const bookcase = (/** @type {number} */ x, /** @type {number} */ bsW, /** @type {number} */ bsH) => {
      const bsD = 3.2, bs = new THREE.Group(); bs.position.set(x, floorY, BZ + bsD / 2 + 0.1); root.add(bs);
      const bbox = (w, h, d, bx, by, bz) => { const m = new THREE.Mesh(roundBox(w, h, d), woodM); m.position.set(bx, by, bz); m.castShadow = true; m.receiveShadow = true; bs.add(m); };
      bbox(0.7, bsH, bsD, -bsW / 2 + 0.35, bsH / 2, 0); bbox(0.7, bsH, bsD, bsW / 2 - 0.35, bsH / 2, 0); bbox(bsW, 0.8, bsD + 0.3, 0, bsH - 0.4, 0); bbox(bsW, 1.2, bsD, 0, 0.6, 0); // 両側・天板・台
      const shelves = 5, inH = bsH - 2; for (let k = 1; k < shelves; k++) bbox(bsW - 1.4, 0.4, bsD - 0.2, 0, 1.2 + inH * k / shelves, 0); // 棚板
      const t = spineT.clone(); t.needsUpdate = true; t.repeat.set((bsW - 1.4) / 13, shelves / 3); t.offset.set((x * 0.137) % 1, 0); // 本棚ごとに並びをずらす
      const bk = new THREE.Mesh(new THREE.PlaneGeometry(bsW - 1.4, inH), new THREE.MeshStandardMaterial({ map: t, color: spineM.color, roughness: 0.9 })); bk.position.set(0, 1.2 + inH / 2, -bsD / 2 + 0.6); bs.add(bk);
      return bs;
    };
    const paintW = 15, gap = 2.5, sideW = 12;
    studyShelf = bookcase(cx + paintW / 2 + gap + sideW / 2, sideW, 24);
    bookcase(cx - paintW / 2 - gap - sideW / 2, sideW, 24);
    bookcase(cx + paintW / 2 + gap + sideW + 1 + 9 / 2, 9, 20);
    // 額の絵（窓はやめた。作者「窓も奥にはなくていいかな」「壁と絵と、本棚」）：絵は新しく作らず、ノルンの背景の絵を額に入れる
    if (bookArt.st_paint) {
      const pi = bookArt.st_paint.image, ph = paintW * pi.height / pi.width * 0.62, py = floorY + 11 + ph / 2;
      const pt = texOf(blurOf(pi, false)); pt.repeat.set(1, 0.62); pt.offset.set(0, 0.04); // 町と、その上の空を切り出す（空ばかりだと窓に見えた）
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(paintW, ph), new THREE.MeshStandardMaterial({ map: pt, color: 0x9a9088, roughness: 0.8 })); pm.position.set(cx, py, BZ + 0.25); root.add(pm);
      const frameM = new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.5, metalness: 0.3 }), fw = 0.8, fd = 0.4;
      for (const [w, h, x, y] of [[paintW + fw * 2, fw, cx, py + ph / 2 + fw / 2], [paintW + fw * 2, fw, cx, py - ph / 2 - fw / 2], [fw, ph, cx - paintW / 2 - fw / 2, py], [fw, ph, cx + paintW / 2 + fw / 2, py]]) { const f = new THREE.Mesh(roundBox(w, h, fd), frameM); f.position.set(x, y, BZ + 0.2); f.castShadow = true; root.add(f); }
    }
    }
    // 机のランプ（左の奥）：真鍮の台と、だいだい色のガラスの笠。机と本の左側を暖かく照らす
    const lx = cx - BW / 2 - 9, lz = cz - BH * 0.42 - 5; /* 2026-11-24 作者「もう少し後ろでもいいな」：5だけ奥へ。 2026-11-24 一度本の左うしろへ動かしたが、作者「そしたらランプの位置戻していいよ」で本の左横に戻した */ // 2026-11-23 作者「ランプはもう少し左奥に」
    const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.35, metalness: 0.7 });
    let shadeY = 5.6; // 笠の高さ（光の玉と灯りをここに）
    { // 立体の机のランプ（2026-11-23 作者「置いてある机のランプはリアルにしたい、3Dで」）：元絵 v02 desk_lamp と同じ形を、ろくろで回した形（LatheGeometry）で作る。
      // 丸い台・細い柱と節・波打つふちのだいだい色のガラスの笠（真鍮の骨とふち）・鋲のついた笠の頭・てっぺんの飾り。高さは前の絵と同じ約14
      const g = new THREE.Group(); g.position.set(lx, -0.52, lz); root.add(g);
      const [bCol, bRough] = brassCanvases(), bMap = bookArt.lamp_brass ? bookArt.lamp_brass.clone() : texOf(bCol), bRM = texOf(bRough); bMap.needsUpdate = true; // 届いた真鍮の絵（2026-11-24 美術・演出室 lamp_brass） for (const t of [bMap, bRM]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); t.anisotropy = 8; } bRM.colorSpace = THREE.NoColorSpace;
      const brassM = new THREE.MeshStandardMaterial({ map: bMap, roughnessMap: bRM, color: bookArt.lamp_brass ? 0xffe6c0 : 0xc4a070, roughness: 0.9, metalness: 0.85, envMap: getStudyEnv(), envMapIntensity: 0.8, side: THREE.DoubleSide }); /* 質感の絵を貼る（2026-11-24 作者「テクスチャ張るとかできないか」） */ /* 2026-11-24 作者「ランプだけやっぱり浮いている」：つるつるの金色→少し古びた、落ち着いたつやに */ // 真鍮：書斎を映す（裏からも見えるように：柱のてっぺんが穴に見えた）
      const softEdge = (/** @type {any} */ m, /** @type {number} */ w) => { m.transparent = true; m.onBeforeCompile = (/** @type {any} */ sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float ef = abs(dot(normalize(normal), normalize(vViewPosition))); gl_FragColor.a *= smoothstep(0.0, ' + w.toFixed(2) + ', ef); }'); }; m.customProgramCacheKey = () => 'softEdge' + w; return m; };
      softEdge(brassM, 0.22); // 輪郭のところだけ少し透けて、まわりになじむ（2026-11-24 作者「輪郭柔らかく見えるような気がするんだよね、現実だったらもっと」）
      const lathe = (/** @type {number[][]} */ pts, /** @type {any} */ mat, seg = 40) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      // 台と柱（足もと→上へ）
      lathe([[0, 0], [2.15, 0], [2.18, 0.18], [2.0, 0.42], [1.55, 0.6], [1.25, 0.85], [0.75, 1.05], [0.42, 1.3], [0.3, 1.7], [0.3, 2.05], [0.48, 2.15], [0.5, 2.4], [0.3, 2.55], [0.21, 2.7], [0.21, 8.3], [0.36, 8.45], [0.4, 8.8], [0.3, 9.0], [0.24, 9.3], [0, 9.32]], brassM);
      // 笠：だいだい色のガラス（内側にも見える）。ふちは少し波打つ
      const shadeH = 2.65, shadePts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, y = 9.42 + shadeH * t, r = 1.05 + (3.12 - 1.05) * Math.cos(t * Math.PI / 2) ** 0.75; shadePts.push(new THREE.Vector2(r, y)); }
      const shadeG = new THREE.LatheGeometry(shadePts, 64), sp = shadeG.attributes.position;
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i), y = sp.getY(i), ang = Math.atan2(z, x), low = Math.max(0, 1 - (y - 9.42) / 0.5); sp.setY(i, y - low * 0.16 * (1 - Math.abs(Math.cos(ang * 6)))); } // 10か所でふちが少し下がる（波）
      shadeG.computeVertexNormals();
      const gT = bookArt.lamp_glass ? bookArt.lamp_glass.clone() : texOf(glassCanvas()); gT.needsUpdate = true; gT.wrapS = THREE.RepeatWrapping; gT.repeat.set(bookArt.lamp_glass ? 1 : 2, 1); // 届いた色ガラスの絵（2026-11-24 美術・演出室 lamp_glass） gT.anisotropy = 8; /* 笠に色ガラスの質感（作者「おねがい」） */
      const glassM = new THREE.MeshPhysicalMaterial({ map: gT, emissiveMap: gT, color: bookArt.lamp_glass ? 0xffc890 : 0xe08038, emissive: bookArt.lamp_glass ? 0xffb070 : 0xf08a38, emissiveIntensity: 0.5, roughness: 0.45, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, envMap: getStudyEnv(), envMapIntensity: 0.5, transparent: true, opacity: 0.95, side: THREE.DoubleSide }); // ガラスの表のつや // 光りすぎると白っぽくなるので、だいだい色を濃く、自分の光はひかえめに
      softEdge(glassM, 0.3); const shade = new THREE.Mesh(shadeG, glassM); shade.castShadow = true; g.add(shade);
      // 笠の骨（真鍮の細い線）とふち
      for (let k = 0; k < 12; k++) { const ang = k / 12 * Math.PI * 2, path = new THREE.CatmullRomCurve3(shadePts.map((v) => new THREE.Vector3(Math.cos(ang) * (v.x + 0.02), v.y, Math.sin(ang) * (v.x + 0.02)))); const rib = new THREE.Mesh(new THREE.TubeGeometry(path, 16, 0.05, 5, false), brassM); g.add(rib); }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.12, 0.07, 6, 64), brassM); rim.rotation.x = Math.PI / 2; rim.position.y = 9.36; g.add(rim);
      // 笠の頭（鋲つき）とてっぺんの飾り
      lathe([[1.08, 11.98], [1.16, 12.1], [1.16, 12.42], [0.95, 12.6], [0.55, 12.78], [0.3, 12.9], [0.3, 13.0], [0.16, 13.05], [0.27, 13.3], [0.3, 13.5], [0.18, 13.75], [0.06, 13.95], [0, 14.0]], brassM);
      for (let k = 0; k < 9; k++) { const ang = k / 9 * Math.PI * 2, r = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), brassM); r.position.set(Math.cos(ang) * 1.18, 12.27, Math.sin(ang) * 1.18); g.add(r); }
      // 笠の中の灯り（電球のかわりの、明るい玉）
      lathe([[0.3, 9.2], [0.34, 9.35], [0.3, 9.55], [0.3, 9.95], [0.26, 10.05], [0, 10.07]], brassM, 24); // 電球をはめる口金（柱のてっぺんから電球まで。2026-11-23 作者「電球浮いている」）
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a0 })); bulb.position.y = 10.38; g.add(bulb);
      shadeY = -0.52 + 10.6;
      { const sc = canvas(128, 128, (cg, w, h) => { const gr = cg.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.7)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, w, h); });
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), new THREE.MeshBasicMaterial({ map: texOf(sc), transparent: true, depthWrite: false, toneMapped: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh); } // 足もとの影：机に置いてあるように見せる（作者「ランプだけ浮いている」）
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); glow.scale.set(5.6, 1.6, 1); glow.position.set(lx, shadeY - 1.15, lz); glow.material.color.set(0xb07040); root.add(glow); /* 2026-11-24 作者「笠回りの光が丸すぎる」：笠をつつむ丸い光の玉をやめ、笠の下の口から少しこぼれる横長のうすい光に */
    const L = new THREE.PointLight(0xffb066, DAY ? 60 : 220, BW * 1.6, 1.4); L.position.set(lx, shadeY - 0.2, lz); root.add(L);
    lights.push({ L, base: L.intensity, ph: 0.5, z: lz, glow, lamp: true });
    { // 笠の下から机へ落ちる光の輪（2026-11-24 作者「いいね。あとは光だ」）：電球から真下へ向けたスポットライト。ふちはやわらかく、台・柱・本の影を机に落とす
      const sp = new THREE.SpotLight(0xffc27a, DAY ? 120 : 420, BW * 1.3, 1.0, 0.75, 1.4);
      sp.position.set(lx, shadeY - 0.25, lz); sp.target.position.set(lx + 1.2, -0.52, lz + 2.5); root.add(sp, sp.target);
      sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.camera.near = 0.3; sp.shadow.bias = -0.0008; sp.shadow.radius = 4;
      lights.push({ L: sp, base: sp.intensity, ph: 0.5, z: lz, lamp: true });
      L.intensity *= 0.7; lights[lights.length - 2].base = L.intensity; // 部屋全体へのまわりの光は少しひかえめに（光の輪が目立つように）
    }
  }

  function buildInterior() { // ブックヌック：本棚にはまった、手前が開いた箱の内側（試作_ブックヌックと同じ作り）
    const W = map.width, H = map.height, dungeon = map.stage?.look === 'dungeon', home = map.stage?.look === 'home'; // home：町の民家（2026-11-25 サニー「家の家具など、銀鹿亭とは変えたい雰囲気を」）。宿の吊りランプ・壁の灯り・腰板を使わず、窓の昼の光で明るく
    // 天井の高さ：ダンジョンは背の高い箱。建物の中は低い天井で、こぢんまりした部屋に（2026-11-22 作者「天井低くしたら？」）。マップの stage.ceiling で上書きできる
    const HT = map.stage?.ceiling ?? (dungeon ? Math.max(8, Math.min(12, W * 1.25)) : 5.5), F = 0.7, S = HT / 4.6; // 箱の高さ（横より高い）・額縁の太さ・試作からの縮尺
    nook = { HT, F };
    const R = rnd(dungeon ? 77 : 78);
    // tiles：絵1枚が覆うマス数（ドット絵にするときの細かさを決める）
    const rep = (c, rx, ry, tiles = 2) => { const t = PIXROOM ? pixTex(c, tiles) : texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };
    const mat = (map, rough = 0.95) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });
    const plane = (w, h, m, pos, rot) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.rotation.set(...rot); p.receiveShadow = true; root.add(p); return p; };
    // 箱の内側：床・左右の壁・奥の壁・天井
    { const fm = mat(artT('floor', W / 4, H / 4) ?? rep(dungeon ? cobbleCanvas() : planksCanvas(), W / 4, H / 4, 4)); if (!dungeon) fm.color.set(WOOD_TINT); plane(W, H, fm, [W / 2, 0, H / 2], [-Math.PI / 2, 0, 0]); }
    const wallC = dungeon ? brickCanvas(21, [128, 132, 118]) : plasterCanvas();
    plane(H, HT, mat(artT('wall', home ? H / HT : H / 4, home ? 1 : HT / 4) ?? rep(wallC, H / 6, HT / 6, 6)), [0, HT / 2, H / 2], [0, Math.PI / 2, 0]);
    plane(H, HT, mat(artT('wall', home ? H / HT : H / 4, home ? 1 : HT / 4) ?? rep(dungeon ? brickCanvas(33, [120, 124, 116]) : wallC, H / 6, HT / 6, 6)), [W, HT / 2, H / 2], [0, -Math.PI / 2, 0]);
    plane(W, HT, mat(artT('wall', home ? W / HT : W / 4, home ? 1 : HT / 4) ?? rep(dungeon ? brickCanvas(45, [110, 112, 120]) : wallC, W / 6, HT / 6, 6)), [W / 2, HT / 2, 0], [0, 0, 0]);
    { const cm = mat(artT('ceiling', W / 4, H / 4) ?? rep(beamsCanvas(), W / 4, H / 4, 4)); if (!dungeon) cm.color.set(WOOD_TINT); plane(W, H, cm, [W / 2, HT, H / 2], [Math.PI / 2, 0, 0]); }
    // 壁の飾りと灯り：手前から奥へ、左右の壁に交互。建物の中は灯りのともる窓、ダンジョンは壁の灯り（たいまつ）と暗いくぼみ
    const winM = new THREE.MeshBasicMaterial({ map: artT('window') ?? (PIXROOM ? pixTex(windowCanvas(3, 4, dungeon ? '#16221a' : '#4a2416'), 1.1 * S, 1.5 * S) : texOf(windowCanvas(3, 4, dungeon ? '#16221a' : '#4a2416'))) });
    const alcoveM = new THREE.MeshStandardMaterial({ map: PIXROOM ? pixTex(alcoveCanvas(), 1.1 * S, 1.6 * S) : texOf(alcoveCanvas()), transparent: true, alphaTest: 0.3, roughness: 1 });
    let side = 1;
    for (let z = H - 2.5; z > 1.5; z -= 4.5, side = -side) {
      const x = side < 0 ? 0.03 : W - 0.03, ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      // 壁の飾りも立体：くぼみ・窓のまわりに、張り出した石や木の枠（横から見ても厚みがある）
      const out = (dx) => (side < 0 ? dx : W - dx); // 壁から部屋の内側へ dx マス
      const solid = (bw, bh, bd, y, dz, m) => { const bx = new THREE.Mesh(roundBox(bd, bh, bw), m); bx.position.set(out(bd / 2), y, z + dz); bx.castShadow = true; bx.receiveShadow = true; root.add(bx); };
      if (dungeon) {
        const aw = 2.2 * S / 2, ah = 3.2 * S / 2;
        plane(aw, ah, alcoveM, [x, ah / 2, z], [0, ry, 0]);
        const stoneM = new THREE.MeshStandardMaterial({ map: rep(brickCanvas(52, [104, 106, 112]), 0.6, 1.2, 1), roughness: 0.95 });
        for (const dz of [-aw / 2 - 0.2, aw / 2 + 0.2]) solid(0.4, ah + 0.3, 0.45, (ah + 0.3) / 2, dz, stoneM); // 左右の柱
        solid(aw + 0.8, 0.4, 0.55, ah + 0.35, 0, stoneM);                                                   // 上の張り出し
      } else if (!(side < 0 && heightOf(map, 1, Math.floor(z)) > 0)) { // 左の壁に2階の回廊があるところには窓を付けない（2026-11-22 作者「左壁面の窓いらないかな」）
        const ww = 1.1 * S, wh = 1.5 * S, wy = HT * 0.5;
        const arch = cutPlane('windowArch', 1.9 * S, { emissive: 0.55 }); // v03 アーチの窓（石のアーチ・木枠・生成りのカーテン）。ガラスの昼の光は少し自分で光らせる
        if (arch) {
          arch.position.set(out(0.03), wy, z); arch.rotation.y = ry; arch.castShadow = false; root.add(arch);
          // 立体の石のアーチと窓台（2026-11-23 作者「アーチ窓感を出したい、出っ張りがないから」）：絵の窓のまわりに、壁と同じ石で厚みのあるアーチの枠を張り出し、
          // 窓（絵）はその奥に。下に張り出した石の窓台、その前に花箱
          const aw = arch.userData.w, ah = 1.9 * S, t = aw * 0.13, D = 0.28, top = ah / 2 - aw / 2;
          const ring = new THREE.Shape(); ring.moveTo(-aw / 2, -ah / 2); ring.lineTo(aw / 2, -ah / 2); ring.lineTo(aw / 2, top); ring.absarc(0, top, aw / 2, 0, Math.PI, false); ring.lineTo(-aw / 2, -ah / 2);
          const hole = new THREE.Path(); hole.moveTo(-aw / 2 + t, -ah / 2 + t * 0.4); hole.lineTo(-aw / 2 + t, top); hole.absarc(0, top, aw / 2 - t, Math.PI, 0, true); hole.lineTo(aw / 2 - t, -ah / 2 + t * 0.4); hole.lineTo(-aw / 2 + t, -ah / 2 + t * 0.4); ring.holes.push(hole);
          const stoneT = artT('wall', 0.25, 0.25) ?? rep(plasterCanvas(), 0.25, 0.25, 1);
          const rg = new THREE.ExtrudeGeometry(ring, { depth: D, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 24 });
          const rm = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: stoneT, roughness: 0.95 })); rm.castShadow = true; rm.receiveShadow = true;
          const holder = new THREE.Group(); holder.position.set(out(0), wy, z); holder.rotation.y = ry; holder.add(rm); root.add(holder);
          const sill = new THREE.Mesh(roundBox(aw + 0.35, 0.14, 0.42), new THREE.MeshStandardMaterial({ map: artT('wall', (aw + 0.35) / 4, 0.1) ?? null, roughness: 0.95 })); sill.position.set(0, -ah / 2 - 0.02, 0.21); sill.castShadow = true; sill.receiveShadow = true; holder.add(sill);
          const fb = cutPlane('flowerBox', 0.55); if (fb) { fb.position.set(0, -ah / 2 - 0.36, 0.38); holder.add(fb); } // 窓台の前に花箱
        } else {
        plane(ww, wh, winM, [out(0.18), wy, z], [0, ry, 0]);
        const frM = new THREE.MeshStandardMaterial({ map: artT('wood', 0.4, 0.4) ?? rep(woodCanvas(), 1, 1, 1), roughness: WOOD_ROUGH, color: WOOD_TINT });
        for (const dz of [-ww / 2 - 0.1, ww / 2 + 0.1]) solid(0.2, wh + 0.4, 0.35, wy, dz, frM);
        for (const dy of [-wh / 2 - 0.1, wh / 2 + 0.1]) solid(ww + 0.4, 0.2, 0.35, wy + dy, 0, frM);
        solid(ww + 0.7, 0.16, 0.6, wy - wh / 2 - 0.25, 0, frM); // 窓の下の台
        }
      }
      if (home) { const D = new THREE.PointLight(0xe8eeff, 16, 7, 1.4); D.position.set(out(0.8), HT * 0.5, z); root.add(D); continue; } // 民家：壁の灯りの代わりに、窓から入る昼の光
      const lx = side < 0 ? 0.7 : W - 0.7, ly = dungeon ? HT * 0.4 : Math.min(HT - 0.6, HT * 0.5 + 0.75 * S + 0.6); // 建物の中は窓の上
      let fx = lx, fy = ly; // 火の位置
      const wl = cutPlane('lampWall', 0.95, { flip: side > 0 }); // 壁の灯りの切り抜き（美術・演出室 v02 lamp_wall）：腕木は壁の側、油皿は部屋の側。右の壁は左右を返す
      if (wl) {
        const ww = wl.userData.w; wl.position.set(out(ww / 2), ly - 0.1 * 0.95, z); root.add(wl);
        fx = out(0.81 * ww); fy = ly; // 油皿の火（絵の横 0.81・上から 0.40）
      } else { // 灯りの金具（壁から突き出た腕と、灯りの皿）
        const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.5 });
        const arm = new THREE.Mesh(roundBox(0.75, 0.1, 0.1), iron); arm.position.set(out(0.37), ly - 0.35, z); root.add(arm);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.22, 8), iron); cup.position.set(lx, ly - 0.25, z); root.add(cup);
      }
      const L = new THREE.PointLight(dungeon ? 0xffb45a : 0xffc46e, dungeon ? 26 : 30, 9 * S / 2, 1.6); L.position.set(fx, fy + 0.1, z + 0.1); // 蜂蜜色（2026-11-23 作者の内装の方針） root.add(L);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
      g.scale.set(wl ? 0.7 : 1.5 * S / 1.6, wl ? 0.7 : 1.5 * S / 1.6, 1); g.position.set(fx, fy, z + 0.05); root.add(g);
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
      for (let i = 0; i < (home ? 0 : nx); i++) for (let j = 0; j < nz; j++) { // 民家には吊りランプを下げない
        const x = W * (i + 0.5) / nx, chain = dungeon ? 1.6 : Math.min(1.4, HT * 0.25), y = HT - chain - 0.35;
        let z = (H - 1) * (j + 0.5) / nz + 0.5;
        const nearUp = (/** @type {number} */ zz) => { for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) if (heightOf(map, tx, ty) > 0 && Math.hypot(Math.max(tx - x, 0, x - tx - 1), Math.max(ty - zz, 0, zz - ty - 1)) < 1.2) return true; return false; };
        while (!dungeon && nearUp(z) && z < H - 1.5) z += 0.5; // 2階の通路から離れる所まで手前へ（2026-11-23 作者「天井を低くして」）
        const lh = cutPlane('lampHanging', (HT - y) / 0.776); // 吊りランプの切り抜き（v02 lamp_hanging）：鎖の上のはしを天井に、ガラスの火（絵の上から 0.776）を y に
        if (lh) { lh.position.set(x, HT - lh.geometry.parameters.height / 2, z); root.add(lh); }
        else {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, chain, 5), iron); c.position.set(x, HT - chain / 2, z); root.add(c);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 6), iron); cap.position.set(x, y + 0.3, z); root.add(cap);
          const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.4, 6), lampGlass); lantern.position.set(x, y, z); root.add(lantern);
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.1, 6), iron); base.position.set(x, y - 0.24, z); root.add(base);
        }
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })); gl.scale.set(lh ? 1.1 : 1.6, lh ? 1.1 : 1.6, 1); gl.position.set(x, y, z + 0.05); root.add(gl);
        // 光源の数が多いとスマホで重くなるので、実際に部屋を照らす光は建物の中の1つおきだけ（ほかは、にじみの光だけ）
        const L = !dungeon && (i + j) % 2 === 0 ? new THREE.PointLight(0xffc878, 26, 9, 1.6) : null;
        if (L) { L.position.set(x, y - 0.1, z); root.add(L); lights.push({ L, base: L.intensity, ph: x * 1.3 + z, z, glow: gl }); }
        else lights.push({ L: { intensity: 0 }, base: 0, ph: x * 1.3 + z, z, glow: gl });
      }
    }
    const backI = dungeon ? 24 : 14; // 建物の中は奥の壁を照らしすぎない（梁の下や隅に影を残す。2026-11-23 作者の内装の方針）
    const back = new THREE.PointLight(0xffc06a, backI, 10 * S / 2, 1.6); back.position.set(W / 2, HT * 0.45, 1.2); root.add(back); lights.push({ L: back, base: backI, ph: 1, z: 1.2 });
    if (!dungeon && !home) { // 壁の下の板張り（腰板）と、上の見切りの横木（2026-11-23 作者「銀鹿亭なんだかまだチープ」：白い壁だけでは平らに見えた）
      const panel = (t, rx) => { t.repeat.set(rx, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, color: 0xb08868 }); };
      const ph = 1.3;
      const wsc = artT('wainscot', 1, 1); // 腰板の元絵（v02 wainscot）：上のはしに見切りの横木まで描いてあるので、横木の箱は足さない。左右だけくり返す
      const strip = (len, x, z, ry) => {
        if (wsc) { const t = wsc.clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(len / ph, 1); const p = new THREE.Mesh(roundBox(len, ph, 0.08), new THREE.MeshStandardMaterial({ map: t, roughness: WOOD_ROUGH, color: WOOD_TINT })); p.position.set(x, ph / 2, z); p.rotation.y = ry; p.receiveShadow = true; root.add(p); return; }
        const p = new THREE.Mesh(roundBox(len, ph, 0.08), panel(rep(planksCanvas(), 1, 1, 2), len / 3)); p.position.set(x, ph / 2, z); p.rotation.y = ry; p.receiveShadow = true; root.add(p);
        const r = new THREE.Mesh(roundBox(len, 0.1, 0.16), panel(rep(woodCanvas(), 1, 1, 1), len / 3)); r.position.set(x, ph + 0.05, z); r.rotation.y = ry; root.add(r);
      };
      strip(W, W / 2, 0.05, 0); strip(H, 0.05, H / 2, Math.PI / 2); strip(H, W - 0.05, H / 2, Math.PI / 2);
    }
    // 手前の木の額縁（本棚の箱のふち）
    const woodT = artT('wood', 1, 1) ?? (PIXROOM ? pixTex(woodCanvas(), 1) : texOf(woodCanvas())), frameM = mat(woodT, WOOD_ROUGH); frameM.color.set(WOOD_TINT);
    // 手前の木の額縁は外した（2026-11-23 作者「ブックヌックの手前の木の棚みたいなやつもなくしていいよ」）
    // 手前の本棚（額縁のまわりの奥の板・左右の本・上下の棚板）は外した（2026-11-23 作者「ブックヌックスタイルやつの手前の本棚消していいよ」：カメラを近づけたので、画面の左右に大きく出ていた）
    // 本棚の前を照らす部屋のやわらかい灯り（入る・出るとき、遠くから本棚が見える）と、箱の中のうすい月明かり
    const room = new THREE.SpotLight(0xffd9a8, 60 * S * S, 40 * S, 0.55, 0.7, 1.6); room.position.set(W / 2 - 2 * S, 9 * S, H + 10 * S); room.target.position.set(W / 2, HT / 2, H); root.add(room, room.target);
    root.add(dungeon ? new THREE.AmbientLight(0x4a5478, 0.5) : home ? new THREE.AmbientLight(0xfff2e2, 0.7) : new THREE.AmbientLight(0x5a4030, 0.3)); // 建物の中は暖かく暗めに
    { const shelfL = new THREE.PointLight(0xffc890, 30 * S, 14 * S, 1.4); shelfL.position.set(W / 2, HT * 0.55, H + 3 * S); root.add(shelfL); } // 額縁と本棚を前から照らす（2026-11-22 作者「客室もブックヌックぽく」：本棚が暗くて見えなかった）
    if (map.heights) buildLevels(W, H);
    // 仮の客（地図の stage.npcs）：sit＝卓の奥の椅子に座る（下半身は卓の天板にかくれるよう、座面の高さまで沈める）、stand＝立つ。
    // 絵はいつもカメラのほうを向く（キャラと同じ）。ぶつからない（仮）
    for (const n of map.stage?.npcs || []) {
      if (n.sprite) { // キャラの絵で置く（2026-11-23 作者「ナハトたちで置いてみる？」）：立ち姿の1コマ目（正面は顔の層も）。座る客は、腰が座面に来るまで沈め、座面より下は切る
        const am = actorMesh(n.sprite); if (!am || !am.sheet) continue;
        const dir = n.facing === 'back' ? 'up' : n.facing === 'left' || n.facing === 'right' ? n.facing : 'down', sh = am.sheet.idle, f = sheetFrame(sh.e, dir, 0), img = sh.t.image, m = am.mesh.material;
        m.map = sh.t; m.emissiveMap = sh.t; m.needsUpdate = true; sh.t.repeat.set(f.sw / img.width, f.sh / img.height); sh.t.offset.set(f.sx / img.width, 1 - (f.sy + f.sh) / img.height);
        if (am.face) {
          const F = am.face, e = F.e, list = e.anchors.idle[dir], an = list && list[Math.round(f.sx / f.sw)], row = e.dirs.indexOf(dir), col = Math.max(0, e.expressions.indexOf('normal'));
          F.mesh.visible = !!an && row >= 0;
          if (F.mesh.visible) { const [cw, ch] = e.cell, fi = F.t.image; F.mesh.position.set(((an[0] + cw / 2) / F.fw - 0.5) * F.w, am.mesh.position.y + (0.5 - (an[1] + ch / 2) / F.fh) * F.h, 0.004); F.t.repeat.set(cw / fi.width, ch / fi.height); F.t.offset.set(col * cw / fi.width, 1 - (row + 1) * ch / fi.height); }
        }
        am.hinge.position.set(n.x, 0, n.z);
        if (n.pose === 'sit' && am.sheet.sit) {
          // 座り姿の絵があれば、それを椅子の上に置く（2026-11-24 作者「先に座り姿を組み込む」）：立ち絵を切ったりちぢめたりせず、座面の高さ（台帳の seat＝足の裏から何ドット上か）を椅子の座面に合わせる
          const S = am.sheet.sit, e = S.e, sf = sheetFrame(e, dir, 0), simg = S.t.image, [sfw, sfh] = e.frame, fwd = dir === 'right' ? 1 : dir === 'left' ? -1 : 0, SEAT = 0.62;
          const ch = solidMesh('chair', null, null, { w: 0.6, h: 1.4 }, { h: 0.6, x: 0, y: 0 }); if (!n.noChair) root.add(ch); // noChair：民家の食卓の絵の椅子に座る（2026-11-25 椅子が二重に見えた）
          if (fwd) { ch.position.set(n.x, 0, n.z - 0.26); ch.rotation.y = -fwd * Math.PI / 2; } // 横向き：背板は進む向きの逆
          else if (dir === 'down') { ch.position.set(n.x, 0, n.z - 0.3); ch.rotation.y = Math.PI; } // 正面：絵は座面の前のふちに（脚が椅子の前にたれる）
          else ch.position.set(n.x, 0, n.z + 0.02); // 後ろ向き：背板が体の手前（背もたれごしに背中）
          am.mesh.visible = false; if (am.face) am.face.mesh.visible = false;
          const sh2 = sfh * DOT, sw2 = sh2 * sfw / sfh, seat = e.seat?.[e.directions.indexOf(dir)] ?? 12;
          const sm = boardMesh(S.t, sw2, sh2); fillMaterial(sm.material, S.t); sm.castShadow = true;
          S.t.repeat.set(sf.sw / simg.width, sf.sh / simg.height); S.t.offset.set(sf.sx / simg.width, 1 - (sf.sy + sf.sh) / simg.height);
          sm.position.set(0, SEAT - seat * DOT + sh2 / 2 - (sfh - e.anchor[1]) * DOT, 0); am.hinge.add(sm);
          npcHinges.push(am.hinge); continue;
        }
        if (n.pose === 'sit') {
          // 椅子に座る（2026-11-24 作者「座るの、椅子の上にしないとわからないよ、あと横向きいすをおいてやってみて」、のち「椅子に座るのをもう少し見やすく」で正面・後ろ向きも椅子に）：
          // 椅子を置き、腰（足もとから背の3割強）を座面に。腰から下は座面から床までちぢめる（横向きは前へずらして、ひざから下が椅子の前に下りて見える）
          // 椅子の前は -z（背板は +z）。横向き＝背は進む向きの逆、正面＝背は体のうしろ、後ろ向き＝背板が体の手前（カメラ側）に来る
          const fwd = dir === 'right' ? 1 : dir === 'left' ? -1 : 0, SEAT = 0.62, HIP = 0.33;
          const ch = solidMesh('chair', null, null, { w: 0.6, h: 1.4 }, { h: 0.6, x: 0, y: 0 }); root.add(ch);
          if (fwd) { ch.position.set(n.x, 0, n.z - 0.26); ch.rotation.y = -fwd * Math.PI / 2; } // 絵の板より少し奥に置く（背板が体の前に出ないように）
          else if (dir === 'down') { ch.position.set(n.x, 0, n.z); ch.rotation.y = Math.PI; } // 正面：体は座面の真ん中。脚は座面の前のふちから下へたらす（足が床に届かず、下に椅子の脚が見える）
          else { ch.position.set(n.x, 0, n.z + 0.02); } // 後ろ向き：背板が体の手前に来て、背もたれごしに背中が見える
          const bh = am.mesh.geometry.parameters.height, bw = am.mesh.geometry.parameters.width, footY = am.mesh.position.y - bh / 2; // 絵の下のはし（足の裏より少し下）
          am.hinge.position.y = SEAT - (bh * HIP + footY); // 腰を座面に
          const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEAT)];
          for (const mt of [m, am.face?.mesh.material]) if (mt) { mt.clippingPlanes = clip; mt.needsUpdate = true; }
          renderer.localClippingEnabled = true;
          // 脚の絵は腰より少し上（LAP）まで取って、座面より上にも重ねる（2026-11-24 作者「座った時に、椅子の部分が腰に見えないように」：上半身と脚のあいだに座面のふちが帯のように見えた）
          const LAP = 0.08, EXT = bh * LAP; // EXT：座面より上に重ねる高さ（絵の LAP 分）
          const lt = sh.t.clone(); lt.needsUpdate = true; lt.repeat.set(f.sw / img.width, f.sh * (HIP + LAP) / img.height); lt.offset.set(f.sx / img.width, 1 - (f.sy + f.sh) / img.height); // 絵の下の3割と少し（脚と腰）
          const front = dir === 'down', LH = front ? EXT + 0.36 : SEAT + EXT; // 正面は、ひざから下だけ（もも は手前に向くので見えない）が座面からたれる
          const legs = new THREE.Mesh(new THREE.PlaneGeometry(bw, LH), fillMaterial(new THREE.MeshStandardMaterial({ map: lt, transparent: true, alphaTest: 0.35, roughness: 1, side: THREE.DoubleSide }), lt));
          legs.position.set(fwd * 0.2, SEAT + EXT - LH / 2 - am.hinge.position.y, front ? 0.3 : 0.006); legs.castShadow = true; // 正面の脚は座面の前のふちより手前
          if (dir !== 'up') am.hinge.add(legs); else { legs.geometry.dispose(); lt.dispose(); } // 後ろ向きの脚は、座面の向こう（前）へ出るので見えない
        }
        npcHinges.push(am.hinge); continue;
      }
      // 座る客は、絵の上の半分（腰から上）だけを座面の高さ（0.6）に置く：卓の下は空いているので、足まで描くと卓の下から見えた
      const hgt = 2.4, sit = n.pose === 'sit', part = sit ? 0.56 : 1, t = texOf(mobCanvas(n.tone || '#6a5a4a', n.facing === 'back'));
      if (sit) { t.repeat.set(1, part); t.offset.set(0, 1 - part); }
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(hgt / 2, hgt * part), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 1 }));
      mesh.position.y = (sit ? 0.6 : 0) + hgt * part / 2; mesh.castShadow = true;
      const hinge = new THREE.Group(); hinge.position.set(n.x, 0, n.z); hinge.add(mesh); root.add(hinge); npcHinges.push(hinge);
    }
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
    const box = (mats, bw, bh, bd, y, z = -d / 2) => { const m = new THREE.Mesh(roundBox(bw, bh, bd), mats); m.position.set(0, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // 民家（look: home）の家具は、美術・演出室の内装_民家_v01 の切り抜きを立てる（2026-11-25）。絵が無ければ下のいつもの形
    if (map.stage?.look === 'home') {
      const HK = { bed: ['bedHome', 1.15], 'home-cupboard': ['cupboard', 2.4], 'home-herbs': ['herbs', 0.75], 'home-chest': ['chest', 0.6], 'home-washtub': ['washTub', 0.8] }[name] ?? (it.region === 'table' ? ['tableHome', 1.3] : null);
      const cp = HK && cutPlane(HK[0], HK[1]);
      if (cp) {
        if (name === 'home-herbs') cp.position.set(0, 2.55, -d + 0.08); // 奥の壁に、目の高さより上に吊るす
        else cp.position.set(0, HK[1] / 2, -d / 2);
        cp.receiveShadow = true; g.add(cp); return g;
      }
    }
    if (name === 'stone-wall') { // 迷宮の石の壁（2026-11-25 作者「ダンジョンも迷宮っぽく入り組んだ形に」）：ダンジョンの壁の絵（無ければ石積み）を四方と上に。上の面は少し暗く
      const wa = (/** @type {number} */ rx, /** @type {number} */ ry) => artT('wall', Math.max(0.3, rx), Math.max(0.3, ry)) ?? tile(brickCanvas(64, [110, 112, 118]), rx, ry);
      const sx = M(wa(w / 2, h / 2)), sz = M(wa(d / 2, h / 2)), top = M(wa(w / 2, d / 2), { color: 0x8a8a8a });
      box([sz, sz, top, top, sx, sx], w, h, d, h / 2);
      return g;
    }
    if (name === 'stone-gate') { // 仕掛けの石の扉（2026-11-25 サニー「大きなイベントを作ってみて」。仮・コードの絵）：石の板に鉄の帯と、まんなかの丸い紋。開くと消える（view.openGates）
      const sa = (/** @type {number} */ rx, /** @type {number} */ ry) => artT('wall', Math.max(0.3, rx), Math.max(0.3, ry)) ?? tile(brickCanvas(81, [96, 98, 108]), rx, ry);
      const face = M(sa(w / 2, h / 2), { color: 0x9a96a4 }), iron = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.5, metalness: 0.6 });
      box(face, w, h, d * 0.6, h / 2);
      for (const y of [0.35, h * 0.5, h - 0.35]) box(iron, w * 1.02, 0.14, d * 0.62, y);
      const seal = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, h) * 0.17, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, metalness: 0.7, roughness: 0.4, emissive: 0x2a1c08 }));
      seal.position.set(0, h * 0.62, -d / 2 + d * 0.31 + 0.02); g.add(seal); g.userData.seal = seal; // 紋：レバーを倒すごとに光る（view.gateProgress）
      return g;
    }
    if (name === 'lever') { // 壁ぎわの石の台と、古い木のレバー（仮・コードの絵）
      const st = M(tile(brickCanvas(83, [110, 112, 118]), 0.6, 0.6)), wood = M(tile(woodCanvas(), 0.3, 1), { color: WOOD_TINT });
      box(st, w * 0.6, 0.7, d * 0.5, 0.35);
      const handle = new THREE.Mesh(roundBox(0.1, 0.9, 0.1), wood); handle.position.set(0, 0.95, -d / 2); handle.rotation.z = -0.5; handle.castShadow = true; g.add(handle);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.6, roughness: 0.4 })); knob.position.set(0.22, 1.36, -d / 2); g.add(knob);
      return g;
    }
    if (name === 'stone-pillar') {
      const pa = artT('pillar'); // 森の元絵 v01 dungeon_pillar（上下の飾りの石まで描いた柱）。四方に絵を張る
      if (pa) { // 絵の、柱の胴・上の飾り石・下の台を切り出して、それぞれ立体に張る（2026-11-23 作者「柱が変」：絵をそのまま箱の四方に張ったので、絵のまわりの透明な所が黒く、横から黒い板に見えた）
        const crop = (/** @type {number} */ u0, /** @type {number} */ u1, /** @type {number} */ v0, /** @type {number} */ v1) => { const t = artT('pillar'); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(u1 - u0, v1 - v0); t.offset.set(u0, v0); return M(t); };
        const shaft = crop(0.24, 0.755, 0.116, 0.858), capM = crop(0.1, 0.893, 0.858, 0.986), baseM = crop(0.135, 0.86, 0.015, 0.116);
        const sw = Math.min(w, d) * 0.5, ch = h * 0.13, bh = h * 0.105;
        box(shaft, sw, h - ch - bh, sw, bh + (h - ch - bh) / 2);
        box(capM, sw * 1.53, ch, sw * 1.53, h - ch / 2);
        box(baseM, sw * 1.4, bh, sw * 1.4, bh / 2);
        return g;
      }
      const side = (s) => M(tile(brickCanvas(60 + s, [118, 120, 126]), s === 0 ? d / 2.2 : w / 2.2, h / 2.2)), cap = M(tile(brickCanvas(70, [96, 98, 104]), 1, 1));
      box([side(0), side(0), cap, cap, side(1), side(1)], w * 0.82, h, d * 0.82, h / 2);
      for (const y of [0.18, h - 0.18]) box(cap, w, 0.36, d, y); // 柱の下と上の、張り出した飾りの石
      return g;
    }
    const wt = (rx, ry) => artT('wood', Math.max(0.3, rx), Math.max(0.3, ry)) ?? tile(woodCanvas(), rx, ry); // 家具の木（v02 wood_side）。1枚で約2マス
    const WT = { color: WOOD_TINT, roughness: WOOD_ROUGH };
    const woodM = M(wt(w / 2, h / 2), WT), woodD = M(wt(d / 2, h / 2), WT), woodTop = M(wt(w / 2, d / 2), WT);
    if (name === 'rug') { // 敷物（床に敷くだけ。通れる）
      const rugArt = cutT('rug', ...CUT.rug); // v02 rug（房のまわりは透明）
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial(rugArt ? { map: rugArt, roughness: 1, transparent: true, alphaTest: 0.3 } : { map: PIXROOM ? pixTex(rugCanvas(), 2) : texOf(rugCanvas()), roughness: 1 })); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.02, -d / 2); r.receiveShadow = true; g.add(r); return g;
    }
    if (name === 'barrels') { // 樽：たが（鉄の輪）の付いた木の樽を並べ、2つ以上なら上にもう1つ
      const bp = cutPlane('barrels', w >= 2 ? 2.1 : 1.4); // v02 barrels（下に2つ・上に1つ）の切り抜き
      if (bp) { bp.position.set(0, bp.geometry.parameters.height / 2, -d / 2); bp.receiveShadow = true; g.add(bp); return g; }
      const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.6 }), bw = M(tile(woodCanvas(), 1, 1));
      const n = Math.max(1, Math.round(w)), r = Math.min(0.45, w / n / 2 - 0.02), bh = 1.05;
      const barrel = (x, y, z) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, bh, 14), bw); b.position.set(x, y + bh / 2, z); b.castShadow = true; b.receiveShadow = true; g.add(b);
        const mid = new THREE.Mesh(new THREE.CylinderGeometry(r, r, bh * 0.5, 14), bw); mid.position.copy(b.position); g.add(mid);
        for (const dy of [-0.38, 0.38]) { const h2 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.06, 14), iron); h2.position.set(x, y + bh / 2 + dy * bh, z); g.add(h2); }
      };
      for (let i = 0; i < n; i++) barrel(-w / 2 + (i + 0.5) * (w / n), 0, -d / 2);
      if (n >= 2) barrel(0, bh, -d / 2);
      return g;
    }
    if (name === 'pillar') { box([woodD, woodD, woodTop, woodTop, woodM, woodM], w * 0.7, h, d * 0.7, h / 2); return g; }
    // 家具は形で作る（2026-11-22 作者：「テーブルやばい」＝絵を貼った箱では木箱に見えた）。高さはキャラ（2.5マス）に合わせる
    const leg = (x, z, lh, s = 0.16) => box(woodD, s, lh, s, lh / 2, z).position.setX(x);
    /**
     * 曲線のある木の椅子（2026-11-23 作者「椅子は曲線を入れてほしい」）：角の丸い座面、少し外へ開いた丸い脚、上が弓なりの背板、
     * 背の柱の上に丸い玉、背板と下の横木のあいだに細い丸棒3本。sz：卓のどちら側か（背は卓から遠い側）
     */
    const chairParts = (/** @type {THREE.Group} */ ch, /** @type {number} */ sz) => {
      const add = (/** @type {THREE.BufferGeometry} */ geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; o.receiveShadow = true; ch.add(o); return o; };
      const seatS = new THREE.Shape(), sw = 0.25, sd = 0.23, cr = 0.09; // 座面：角の丸い四角
      seatS.moveTo(-sw + cr, -sd); seatS.lineTo(sw - cr, -sd); seatS.quadraticCurveTo(sw, -sd, sw, -sd + cr); seatS.lineTo(sw, sd - cr); seatS.quadraticCurveTo(sw, sd, sw - cr, sd);
      seatS.lineTo(-sw + cr, sd); seatS.quadraticCurveTo(-sw, sd, -sw, sd - cr); seatS.lineTo(-sw, -sd + cr); seatS.quadraticCurveTo(-sw, -sd, -sw + cr, -sd);
      const seat = new THREE.ExtrudeGeometry(seatS, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 8 });
      add(seat, woodTop, 0, 0.58, 0, -Math.PI / 2);
      for (const lx of [-0.19, 0.19]) for (const lz of [-0.17, 0.17]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.58, 8), woodD, lx, 0.29, lz); // 脚（まっすぐ。2026-11-23 作者「いすってむずかしいな」→形を減らす）
      const bz = sz * 0.19;
      for (const lx of [-0.2, 0.2]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), woodD, lx, 0.9, bz); // 背の柱（玉はやめた）
      const backS = new THREE.Shape(); backS.moveTo(-0.22, 0); backS.lineTo(0.22, 0); backS.lineTo(0.22, 0.34); backS.quadraticCurveTo(0, 0.46, -0.22, 0.34); backS.lineTo(-0.22, 0); // 上が弓なりの、1枚の大きな背板（丸棒と横木はやめた）
      const back = new THREE.ExtrudeGeometry(backS, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 10 });
      add(back, woodM, 0, 0.86, bz - 0.0175);
    };
    if (name === 'chair') { chairParts(g, 1); return g; } // 1つだけの椅子（横向きに座る客の椅子。2026-11-24 作者「横向きいすをおいてやってみて」）
    if (it.region === 'table') { // 天板＋4本の脚＋まわりの丸椅子
      const th = 1.05, inset = 0.22;
      const topArt = artT('tabletop'); box([woodD, woodD, topArt ? M(topArt) : woodTop, woodTop, woodM, woodM], w, 0.14, d * 0.9, th);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(sx * (w / 2 - inset), -d / 2 + sz * (d * 0.45 - inset), th - 0.07);
      for (const [sx, sz] of [[-0.62, 1], [0, 1], [0.62, 1], [-0.62, -1], [0.62, -1]].slice(0, Math.max(2, Math.round(w)) + 1)) { // 背もたれのある木の椅子（2026-11-23 作者の内装の方針「背もたれのある木の椅子と卓」）。背は卓の反対側
        const ch = new THREE.Group(); ch.position.set(sx * w / 2, 0, -d / 2 + sz * (d * 0.45 + 0.38)); g.add(ch);
        chairParts(ch, sz);
      }
      { // 卓の上：ろうそく（小さな灯り）と、ジョッキ・木の皿（2026-11-23 作者「銀鹿亭なんだかまだチープ」）
        const R = rnd(it.x * 7 + it.y * 13 + 1), y0 = th + 0.07;
        const cd = cutPlane('candle', 0.55); // v02 candle（真鍮の燭台とろうそく。火も描いてある）
        let fy = y0 + 0.38;
        if (cd) { cd.position.set(0, y0 + 0.275, -d / 2); g.add(cd); fy = y0 + 0.55 * 0.92; }
        else {
          const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xf0e4c8, emissive: 0x402a10, roughness: 0.8 })); wax.position.set(0, y0 + 0.15, -d / 2); g.add(wax);
          const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x8a7a50, metalness: 0.5, roughness: 0.4 })); dish.position.set(0, y0 + 0.02, -d / 2); g.add(dish);
        }
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })); flame.scale.set(cd ? 0.35 : 0.55, cd ? 0.45 : 0.7, 1); flame.position.set(0, fy, -d / 2 + 0.03); g.add(flame);
        { const bb = (it.x + it.y) % 2 === 0 ? cutPlane('bread', 0.34) : null; if (bb) { bb.position.set(-w / 2 + 0.5, y0 + 0.17, -d / 2 + 0.12); g.add(bb); } } // v03 パン籠（卓1つおき）
        const L = new THREE.PointLight(0xffbc66, 8, 3.4, 1.6); L.position.set(0, y0 + 0.5, -d / 2); g.add(L); lights.push({ L, base: 7, ph: it.x + it.y, z: it.y + it.h, glow: flame, fire: true });
        const mugM = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 }), plateM = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.85 });
        const n = Math.max(2, Math.round(w));
        for (let k = 0; k < n; k++) {
          const x = (k / Math.max(1, n - 1) - 0.5) * (w - 0.7), z = -d / 2 + (k % 2 ? 0.25 : -0.25) * d;
          if (R() < 0.6) { const pot = R() < 0.5, mc = pot ? cutPlane('pottery', 0.22, { b: POT_CUPS[(R() * 2) | 0], W: 1024, H: 256 }) : cutPlane('mugs', 0.3, { b: MUGS[(R() * MUGS.length) | 0], W: 1024, H: 256 }); /* ジョッキと、v03 の陶器の杯を交ぜる */ if (mc) { mc.position.set(x, y0 + (pot ? 0.11 : 0.15), z); g.add(mc); } else { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 8), mugM); mug.position.set(x, y0 + 0.11, z); mug.castShadow = true; g.add(mug); } }
          else { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.04, 12), plateM); pl.position.set(x, y0 + 0.02, z); g.add(pl); }
        }
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
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(roundBox(w * 1.05, 0.05, d / 4), woodTop); s.position.set(0, -0.15 - i * 0.25, -d * (0.2 + i * 0.25)); g.add(s); } // 口の中に見える段
      for (const sx of [-1, 1]) box(woodD, 0.1, 0.9, d, 0.45).position.setX(sx * w * 0.58);
      return g;
    }
    if (name === 'bed') { // 寝台：木の枠・敷き布団・掛け布・枕・頭の板
      const cloth = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
      box([woodD, woodD, woodTop, woodTop, woodM, woodM], w, 0.45, d, 0.225);
      const lin = (rx, ry) => { const t = artT('linen', rx, ry); return t ? M(t) : null; }; // v02 linen（生成りの麻布）
      box(lin((w - 0.12) / 2, (d - 0.12) / 2) ?? cloth(0xe8dcc0), w - 0.12, 0.2, d - 0.12, 0.55);
      const blanketArt = artT('blanket'); box(blanketArt ? M(blanketArt) : cloth(0x5a3a6a), w - 0.06, 0.22, d * 0.62, 0.58, -d * 0.31 - 0.02);
      box(lin(w * 0.3, 0.25) ?? cloth(0xf2ead6), w * 0.6, 0.16, 0.45, 0.72, -d + 0.4);
      box([woodD, woodD, woodTop, woodTop, woodM, woodM], w, 1.1, 0.12, 0.55, -d + 0.06);
      return g;
    }
    if (it.region === 'counter') { // 受付の台：腰の高さの台と、少し張り出した天板
      const ch = 1.25;
      const frontArt = artT('counter'); box([woodD, woodD, woodTop, woodTop, frontArt ? M(frontArt) : woodM, woodM], w, ch - 0.12, d * 0.8, (ch - 0.12) / 2);
      box([woodD, woodD, woodTop, woodTop, woodM, woodM], w + 0.2, 0.12, d * 0.8 + 0.25, ch - 0.06);
      { // 台の奥の酒の棚：棚板に色ちがいの瓶。台の上にジョッキ（2026-11-23 作者「銀鹿亭なんだかまだチープ」）
        const R = rnd(91), zb = -d - 0.05, sh = 2.4, bottleC = [0x2a5a3a, 0x5a2a1a, 0x3a3a6a, 0x7a6a2a, 0x1a3a2a];
        box([woodD, woodD, woodTop, woodTop, woodM, woodM], w, sh, 0.12, sh / 2, zb);
        for (const y of [1.45, 1.95]) {
          box(woodTop, w, 0.06, 0.4, y, zb + 0.22);
          const bpw = cutPlane('bottles', 0.42)?.userData.w; // v02 bottles（瓶7本と壺）の切り抜きを、棚の幅に並べる
          if (bpw) { for (let x = -w / 2 + 0.1 + bpw / 2, k = 0; x + bpw / 2 < w / 2 + 0.05; x += bpw + 0.08, k++) { const bp = /** @type {any} */ (cutPlane('bottles', 0.42, { flip: (k + (y > 1.6 ? 1 : 0)) % 2 === 1 })); bp.position.set(x, y + 0.03 + 0.21, zb + 0.22); g.add(bp); } continue; }
          for (let x = -w / 2 + 0.25; x < w / 2 - 0.2; x += 0.2 + R() * 0.25) {
            if (R() < 0.15) continue;
            const bm = new THREE.MeshStandardMaterial({ color: bottleC[(R() * bottleC.length) | 0], roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
            const bh = 0.28 + R() * 0.12, b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, bh, 8), bm); b.position.set(x, y + 0.03 + bh / 2, zb + 0.22); g.add(b);
            const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.12, 6), bm); nk.position.set(x, y + 0.03 + bh + 0.06, zb + 0.22); g.add(nk);
          }
        }
        { const gb = cutPlane('guestBook', 0.36); if (gb) { gb.position.set(w * 0.08, ch + 0.18, -d / 2 + 0.2); g.add(gb); } } // v03 宿帳（受付の台の上）
        { const kr = cutPlane('keyRack', 0.62); if (kr) { kr.position.set(w / 2 - 0.7, sh + 0.42, zb + 0.08); g.add(kr); } } // v03 鍵掛け（受付の奥の壁、酒の棚の上）
        const mugM = new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.6, metalness: 0.2 });
        [-w * 0.3, -w * 0.1, w * 0.25].forEach((x, k) => { const mc = cutPlane('mugs', 0.3, { b: MUGS[k], W: 1024, H: 256 }); if (mc) { mc.position.set(x, ch + 0.15, -d / 2 + 0.1); g.add(mc); return; } const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 8), mugM); mug.position.set(x, ch + 0.11, -d / 2 + 0.1); g.add(mug); });
      }
      return g;
    }
    if (it.region === 'hearth') { // 暖炉：石の囲いと、暗い口の中の火
      // 石の大きさは、どの面でも同じに（面ごとに、面の大きさに合わせてくり返す。2026-11-23 作者「レンガ引き延ばされてる縮んでるのもある？」：1つの絵を大きさのちがう面に同じくり返しで貼っていた）。石は壁と同じ 4マスで絵1枚
      const sf = (rx, ry) => M(artT('brick', rx / 1.5, ry / 1.9) ?? tile(brickCanvas(80, [140, 120, 104]), rx / 2, ry / 2)); /* レンガの絵1枚＝横1.5・縦1.9マス（2026-11-23 作者「暖炉の壁は赤でよかった」） */
      const sms = (bw, bh, bd) => [sf(bd, bh), sf(bd, bh), sf(bw, bd), sf(bw, bd), sf(bw, bh), sf(bw, bh)], hh = 2.6;
      box(sms(w, hh, d * 0.7), w, hh, d * 0.7, hh / 2);
      box(sms(w + 0.3, 0.2, d * 0.7 + 0.25), w + 0.3, 0.2, d * 0.7 + 0.25, hh * 0.62);                 // 炉棚
      { const top = nook ? nook.HT : 5.5, y0 = hh * 0.62 + 0.1; if (top > y0 + 0.2) box(sms(w * 0.62, top - y0, d * 0.55), w * 0.62, top - y0, d * 0.55, y0 + (top - y0) / 2, -d * 0.35); } // 煙突：炉棚から天井まで（2026-11-22 作者「暖炉は天井まで伸ばして」）
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, hh * 0.46), new THREE.MeshBasicMaterial({ map: texOf(fireboxCanvas()), transparent: true, alphaTest: 0.3 })); mouth.position.set(0, hh * 0.23, 0.01); g.add(mouth); // 炉の中（2026-11-23 作者「暖炉黒い部分はどうしようか違和感がある」：まっ黒の四角をやめ、上がアーチの、すすけたレンガの奥が火で照らされる絵に）
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 })); fire.scale.set(1.4, 1.1, 1); fire.position.set(0, 0.35, 0.15); g.add(fire);
      { const lb = cutPlane('logBasket', 0.85); if (lb) { lb.position.set(-w / 2 - 0.45, 0.425, -0.3); g.add(lb); } } // v03 薪籠（暖炉の左脇）
      if (map.stage?.look === 'home') { const pt = cutPlane('pot', 1.1); if (pt) { pt.position.set(0, 0.85, 0.06); g.add(pt); } } // 民家の暖炉には、鎖で吊った鍋（内装_民家_v01 hearth_pot）
      // 揺れる炎（6コマを順に）と、舞い上がる火の粉
      // 炎（2026-11-23 美術・演出室 v02 hearth_flame：水彩の8コマ。1コマ 256×320、根もと (128,312)）と薪と熾火（hearth_logs、足もと (256,184)）。無ければコードの6コマ
      const flameArt = ART2?.flame, logsArt = ART2?.logs, nF = flameArt ? 8 : FIRE_FRAMES;
      let ft, flame;
      if (flameArt) {
        ft = flameArt.clone(); ft.needsUpdate = true; ft.wrapS = ft.wrapT = THREE.ClampToEdgeWrapping; ft.repeat.set(1 / 8, 1);
        const fhH = hh * 0.42, fwW = fhH * 256 / 320, rootY = 0.17; // 根もと（絵の下から 8/320）を薪の上に
        flame = new THREE.Mesh(new THREE.PlaneGeometry(fwW, fhH), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        flame.position.set(0, rootY - fhH * 8 / 320 + fhH / 2, 0.03); g.add(flame);
      } else {
        ft = texOf(flameCanvas()); ft.repeat.set(1 / FIRE_FRAMES, 1);
        flame = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, hh * 0.36), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        flame.position.set(0, hh * 0.18, 0.03); g.add(flame);
      }
      if (logsArt) { // 薪と熾火：炎の手前に。足もとを炉の床に
        const lt = logsArt.clone(); lt.needsUpdate = true; const lw = w * 0.5, lh = lw * 192 / 512;
        const logs = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshStandardMaterial({ map: lt, transparent: true, alphaTest: 0.3, roughness: 0.9, emissive: 0xff7a30, emissiveMap: lt, emissiveIntensity: 0.5 }));
        logs.position.set(0, lh / 2 - lh * (192 - 184) / 192 + 0.01, 0.05); g.add(logs);
      }
      const embers = []; for (let k = 0; k < 10; k++) { const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); e.scale.set(0.09, 0.09, 1); g.add(e); embers.push({ s: e, ph: k / 10, dx: (k % 5 - 2) * 0.12 }); }
      fires.push({ tex: ft, frames: nF, embers, y0: hh * 0.12, y1: hh * 0.62, w: w * 0.4 });
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
    const woodSide = artT('wood', 1, 1) ?? texOf(woodCanvas()); woodSide.wrapS = woodSide.wrapT = THREE.RepeatWrapping;
    const plank = new THREE.MeshStandardMaterial({ map: woodTop, roughness: WOOD_ROUGH, color: WOOD_TINT }), side = new THREE.MeshStandardMaterial({ map: woodSide, roughness: WOOD_ROUGH, color: WOOD_TINT });
    const mats = [side, side, plank, side, side, side];
    // 2階の通路の床は、1階と同じ元絵の床（v01 floor。1枚で4マス）を、マスの位置に合わせて切り出して張る（2026-11-23 作者「2階のこの辺何とかしたい」：コードの暗い板だった）
    /** @type {Map<string, any>} */ const floorMats = new Map();
    const floorAt = (/** @type {number} */ x, /** @type {number} */ y) => {
      const k = ((x % 4) + 4) % 4 + ',' + (((y % 4) + 4) % 4); let m = floorMats.get(k);
      if (!m) { const t = artT('floor', 0.25, 0.25); if (!t) return mats; t.offset.set((((x % 4) + 4) % 4) / 4, 1 - ((((y % 4) + 4) % 4) + 1) / 4); m = [side, side, new THREE.MeshStandardMaterial({ map: t, roughness: WOOD_ROUGH, color: WOOD_TINT }), side, side, side]; floorMats.set(k, m); }
      return m;
    };
    // 2階の床・段は1マスずつの箱を並べてつなぐので、角を丸くしない（丸くするとつなぎ目にすき間が見えた。2026-11-23 作者「つなぐところは丸くしないように」）
    const box = (w, h, d, x, y, z, m = mats) => { const b = new THREE.Mesh(roundBox(w, h, d, 0), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; root.add(b); return b; };
    const q = mapQuery(map, { kinds: { floor: { passable: true }, door: { passable: true }, wall: {}, counter: {}, water: {}, bridge: { passable: true } } });
    const walk = (x, y) => q.passable(x, y);
    const rail = (x0, z0, x1, z1, y) => { // 手すり：柱2本と上の横木
      for (const [x, z] of [[x0, z0], [x1, z1]]) box(0.1, 0.95, 0.1, x, y + 0.475, z, side);
      const len = Math.hypot(x1 - x0, z1 - z0), r = box(len + 0.1, 0.08, 0.08, (x0 + x1) / 2, y + 0.95, (z0 + z1) / 2, side); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    };
    /** @type {Set<string>} */ const edgeFill = new Set();
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      const h = heightOf(map, x, y); if (h <= 0 || !walk(x, y)) continue;
      const Y = h * HU, cx = x + 0.5, cz = y + 0.5;
      if (h === top) { // 2階の通路
        box(1, 0.28, 1, cx, Y - 0.14, cz, floorAt(x, y));
        // 外まわりの壁のマス（奥・左・右のはし、角も）まで床をのばす（扉の下にすき間を作らない。作者「扉が地面から少し離れている」）。
        // 前は奥と左だけで、左奥の角と右の壁ぞいに穴があいていた（2026-11-23 作者「2階の隅っこ穴アイテル」）
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if ((dx || dy) && (nx === 0 || nx === W - 1 || ny === 0) && nx >= 0 && nx < W && ny >= 0 && !(ny >= 1 && heightOf(map, nx, ny) > 0 && walk(nx, ny)) && !edgeFill.has(k)) { edgeFill.add(k); box(1, 0.28, 1, nx + 0.5, Y - 0.14, ny + 0.5, floorAt(nx, ny)); }
        }
        // 部屋側（低い床がある側）に手すりと、ところどころ1階までの柱。回廊が曲がっても四方を見る（2026-11-22 左の壁ぞいにものばした）
        const open = (dx, dy) => { const nx = x + dx, ny = y + dy; return heightOf(map, nx, ny) < h - 1 && q.kindAt(nx, ny) !== 'wall' && q.kindAt(nx, ny) !== null; };
        if (open(0, 1)) { rail(x, y + 1, x + 1, y + 1, Y); if (x % 3 === 1) box(0.22, Y, 0.22, cx, Y / 2, y + 0.9, side); }
        if (open(1, 0)) { rail(x + 1, y, x + 1, y + 1, Y); if (y % 3 === 0) box(0.22, Y, 0.22, x + 0.9, Y / 2, cz, side); }
        if (open(-1, 0)) { rail(x, y, x, y + 1, Y); if (y % 3 === 0) box(0.22, Y, 0.22, x + 0.1, Y / 2, cz, side); }
      } else { // 階段：奥（yが小さい側）が高い。1マスを2段に
        box(1, Y, 0.5, cx, Y / 2, y + 0.25); box(1, Math.max(0.05, Y - HU / 2), 0.5, cx, Math.max(0.05, Y - HU / 2) / 2, y + 0.75);
        if (heightOf(map, x - 1, y) < h - 1 || !walk(x - 1, y)) rail(x, y + 1, x, y, Y - HU / 2); // 低い側（左）の手すり
      }
    }
    // 奥の壁の出入口に扉（通路の高さ）
    const doorArt = artT('door'), doorM = doorArt ? new THREE.MeshStandardMaterial({ map: doorArt, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.8 }), frameM2 = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.8 }), knob = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 0.4, metalness: 0.6 });
    const darkM = new THREE.MeshBasicMaterial({ color: 0x0c0705 });
    // 扉の裏（2026-11-23 作者「開いた向こうの扉は左右反対にしないとね」）：裏から見ると、ちょうつがいと取っ手は表と左右が逆になる。裏の面には左右を返した絵を張る
    const doorBackArt = doorArt ? (() => { const t = doorArt.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; t.needsUpdate = true; return t; })() : null;
    const doorBackM = doorBackArt ? new THREE.MeshStandardMaterial({ map: doorBackArt, roughness: 0.8 }) : doorM, edgeM = frameM2;
    const backWallDoor = [edgeM, edgeM, edgeM, edgeM, doorM, doorBackM], leftWallDoor = [doorM, doorBackM, edgeM, edgeM, edgeM, edgeM]; // 面の順：+x, -x, +y, -y, +z, -z
    for (const e of map.exits || []) {
      if (e.y === 0) { // 奥の壁の扉
        const Y = heightOf(map, e.x, 0) * HU, cx = e.x + 0.5;
        // 扉は左のちょうつがいで、部屋の側（手前）へ開く（2026-11-23 作者「銀鹿亭の中の扉も」）。戸口の奥は暗く
        box(1.0, 2.1, 0.02, cx, Y + 1.05, 0.015, darkM);
        const pv = new THREE.Group(); pv.position.set(cx - 0.5, Y, 0.08); root.add(pv);
        const dm = box(1.0, 2.1, 0.12, 0.5, 1.05, 0, backWallDoor); pv.add(dm); const kn = box(0.09, 0.09, 0.08, 0.82, 1.0, 0.1, knob); pv.add(kn);
        innerDoors.push({ pivot: pv, exit: e.id, x: e.x, y: e.y, sign: -1 });
        box(1.2, 0.14, 0.18, cx, Y + 2.15, 0.1, frameM2); for (const dx of [-0.55, 0.55]) box(0.12, 2.2, 0.18, cx + dx, Y + 1.1, 0.1, frameM2);
      } else if (e.x === 0 && heightOf(map, 0, e.y) > 0) { // 左の壁の扉（回廊の高さ。2026-11-22 作者「左壁沿いにも部屋を」）
        const Y = heightOf(map, 0, e.y) * HU, cz = e.y + 0.5;
        box(0.02, 2.1, 1.0, 0.015, Y + 1.05, cz, darkM);
        const pv = new THREE.Group(); pv.position.set(0.08, Y, cz + 0.5); root.add(pv); // ちょうつがいは手前の側
        const dm = box(0.12, 2.1, 1.0, 0, 1.05, -0.5, leftWallDoor); pv.add(dm); const kn = box(0.08, 0.09, 0.09, 0.1, 1.0, -0.82, knob); pv.add(kn);
        innerDoors.push({ pivot: pv, exit: e.id, x: e.x, y: e.y, sign: -1 });
        box(0.18, 0.14, 1.2, 0.1, Y + 2.15, cz, frameM2); for (const dz of [-0.55, 0.55]) box(0.18, 2.2, 0.12, 0.1, Y + 1.1, cz + dz, frameM2);
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
      // 町の絵の板は、扉を切り抜いたあとの絵・扉・窓の明かりまで取りおいて使い回す（BOARD_CACHE）
      const bk = `${map.id}|${it.x},${it.y},${it.w},${it.h}|${it.asset}|${it.art || ''}`, hit = rc ? null : BOARD_CACHE.get(bk);
      const townC = hit ? hit.townC : rc ? null : townBoardCanvas(name, b, it);
      const artC = rc || townC ? null : (ART[name] || ((w, h) => genericArt(w, h, boards.length + 5)))(b.w, b.h, it.x * 131 + it.y * 37 + 1); // 3つめ＝板ごとの seed（位置から決まるので、開き直しても同じ家）。町の絵があれば描かない
      let art = rc ? texOf(rc, true) : townC ? null : PIXROOM && interior ? pixTex(artC, b.w, b.h) : texOf(artC);
      const doorCut = hit ? hit.doorCut : townC && it.doorExit ? cutDoor(townC, TOWN_IMG?.[townC.file], TOWN_CFG?.doors?.[townC.file]?.cut) : it.doorExit && it.cut && artC && !townC ? cutDoor({ c: artC }, true, it.cut) : null; // 入れる家の扉は切り抜く（絵を張る前に）。町の絵でない板（ダンジョンの門など）は、地図の it.cut で（2026-11-23 作者「ダンジョンに入るときも同様にしたい」）
      const cache = townC ? (hit || (BOARD_CACHE.set(bk, { townC, doorCut, glow: undefined }), BOARD_CACHE.get(bk))) : null;
      if (doorCut && !townC) art.needsUpdate = true;
      if (townC) { if (townC.w && townC.w !== b.w) { b.x += (b.w - townC.w) / 2; b.w = townC.w; } b.h = townC.h; art =PIXROOM ? pixTex(townC.c, b.w, b.h) : texOf(townC.c); }
      if (it.encounter && SYM[it.encounter]) art = texOf(symbolCanvas(SYM[it.encounter], b.w, b.h), true); // 見えている敵は、戦う敵の姿 // 内装（絵柄）を「ドット」にすると町の絵もドットに
      const img = DAY && !interior && it.imageDay ? it.imageDay : it.image; // 昼は昼の背景
      if (img) { // 絵のファイルを張る（奥の背景。下をそろえ、板の形に合わせて上を切る＝引き伸ばさない）
        const bw = b.w, bh = b.h; art = loader.load(img, (t) => { const iw = t.image.width, ih = t.image.height, f = Math.min(1, (iw / ih) / (bw / bh)); t.repeat.set(1, f); t.offset.set(0, 0); t.needsUpdate = true; });
        art.colorSpace = THREE.SRGBColorSpace; art.anisotropy = 8;
      }
      // ブックヌック（中）の物は立体：板ではなく厚みのある箱にし、側面と上にも手ざわりを張る（2026-11-22 作者：「ブックヌックは、シャドーボックスと違って立体もある。横も描けるテクスチャで」）
      // 奥の壁の絵（backdrop）だけは、壁に貼った平らな絵のまま
      if (interior && layer.band !== 'backdrop' && !it.encounter) { // 見えている敵は、建物・ダンジョンの中でも立った板（敵の絵。倒すと消える。2026-11-25 ダンジョンの番人）
        const solid = solidMesh(name, art, rc, b, it);
        const hinge = new THREE.Group(); hinge.position.set(b.x + b.w / 2, 0, it.y + it.h); hinge.add(solid); root.add(hinge);
        boards.push({ hinge, mesh: solid, z: b.z, h: b.h, fade: it.fadeNearPlayer ? it : null, name: it.region ? `${it.asset}#${it.region}` : it.asset, solid: true, it });
        continue;
      }
      const mesh = boardMesh(art, b.w, b.h);
      if (townC?.file && !DAY && !interior) { const gl = cache && cache.glow !== undefined ? cache.glow : windowGlow(townC.c, townC.file, Math.abs(it.x * 31 + it.y * 17) | 0); if (cache) cache.glow = gl; if (gl) { mesh.material.emissiveMap = PIXROOM ? pixTex(gl, b.w, b.h) : texOf(gl); mesh.material.emissive = new THREE.Color(0xffffff); mesh.material.emissiveIntensity = 1.5; } } // 夜は家の窓に明かり
      if (layer.band === 'backdrop') { mesh.castShadow = false; mesh.material.fog = false; if (it.sink) mesh.position.y -= it.sink; } // sink：背景の下を本のページより下に沈める（絵の下のはしで切れた家の壁を見せない。2026-11-22 作者「屋根はあるけど家のドアや窓の部分がなくて変」）
      else if (!interior) holeMaterial(mesh.material);
      const cx = b.x + b.w / 2, hinge = new THREE.Group();
      // 外：板はページの上に立ち、本がひらくときはページといっしょに動く（左右どちらのページか）
      const parent = pages ? (cx < map.width / 2 ? pages.left : pages.right) : root;
      // ブックヌックの奥の壁の絵は、箱の奥の壁と同じ位置だと重なってちらつく（2026-11-22 作者「この部分ちかちかする」）ので、少し手前に出す
      const zb = interior && layer.band === 'backdrop' ? Math.max(b.z, 0) + 0.12 : b.z;
      if (pages) hinge.position.set(cx - map.width / 2, 0.01, zb - map.height / 2); else hinge.position.set(cx, 0.01, zb);
      hinge.add(mesh); parent.add(hinge);
      let door = null;
      if (doorCut?.hole) { // くりぬいた入口と窓（2026-11-23 作者：入口を扉の付け根まで・奥を深く・ブックヌックのような箱に、窓もくりぬいて、奥に中の眺めの写し）
        const cut = (townC ? TOWN_CFG?.doors?.[townC.file]?.cut : it.cut) || {}, D = 2.8; // 奥行き（写しの板が、後ろの町の景色の板より手前に来るように）
        const dw = (doorCut.x1 - doorCut.x0) * b.w, dh = (doorCut.y1 - doorCut.y0) * b.h, cx0 = ((doorCut.x0 + doorCut.x1) / 2 - 0.5) * b.w, y0 = (1 - doorCut.y1) * b.h;
        const holeTex = texOf(doorCut.c), uvPart = (/** @type {number} */ u0, /** @type {number} */ u1) => { const t = holeTex.clone(); t.needsUpdate = true; t.repeat.set(u1 - u0, 1); t.offset.set(u0, 0); return t; };
        const fx = (/** @type {number} */ x) => (x - doorCut.x0) / (doorCut.x1 - doorCut.x0);
        // くりぬいた所（入口と窓）の形を stencil に書く。奥の物は、この形の中だけに描く（家の後ろに箱が出っぱって見えない）
        const mask = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: texOf(doorCut.mask), alphaTest: 0.5, colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
        mask.position.set(0, b.h / 2, 0.005); mask.renderOrder = -2; hinge.add(mask);
        const portal = (/** @type {any} */ m) => { m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc; m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp; return m; };
        const recess = [];
        // 開いた扉の板（左右）
        // 扉の板の上のはし（leafTop）より上は透明に：アーチの内側の木の所もくりぬく（2026-11-23 作者「ここをくりぬいてほしい」）
        const lt = cut.leafTop, Wp = doorCut.c.width, Hp = doorCut.c.height, px = (/** @type {number} */ f) => (f - cut.x0) / (cut.x1 - cut.x0) * Wp, py = (/** @type {number} */ f) => (f - cut.y0) / (cut.y1 - cut.y0) * Hp;
        const leafCanvas = !lt ? null : canvas(Wp, Hp, (g) => {
          g.drawImage(doorCut.c, 0, 0);
          g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, 0); g.lineTo(Wp, 0); g.lineTo(Wp, py(lt.outer)); g.lineTo(px(lt.ro), py(lt.outer));
          for (let i = 1; i <= 16; i++) { const t = i / 16; g.lineTo(px(lt.ro + (lt.ri - lt.ro) * t), py(lt.outer + (lt.inner - lt.outer) * (1 - Math.sqrt(1 - t * t)))); } // 右の扉の上のはし（外→内）
          g.lineTo(px(lt.li), py(lt.inner));
          for (let i = 15; i >= 0; i--) { const t = i / 16; g.lineTo(px(lt.lo + (lt.li - lt.lo) * t), py(lt.outer + (lt.inner - lt.outer) * (1 - Math.sqrt(1 - t * t)))); } // 左の扉の上のはし（内→外）
          g.lineTo(0, py(lt.outer)); g.closePath(); g.fill();
        });
        const leafTex = leafCanvas ? texOf(leafCanvas) : holeTex, leafPart = (/** @type {number} */ u0, /** @type {number} */ u1) => { const t = leafTex.clone(); t.needsUpdate = true; t.repeat.set(u1 - u0, 1); t.offset.set(u0, 0); return t; };
        if (cut.mx0 && cut.mx1) for (const [u0, u1] of [[0, fx(cut.mx0)], [fx(cut.mx1), 1]]) {
          const lw = (u1 - u0) * dw, leaf = new THREE.Mesh(new THREE.PlaneGeometry(lw, dh), new THREE.MeshStandardMaterial({ map: leafPart(u0, u1), transparent: true, alphaTest: 0.3, roughness: 0.9 }));
          leaf.position.set(cx0 - dw / 2 + (u0 + u1) / 2 * dw, y0 + dh / 2, 0.02); hinge.add(leaf);
        }
        // 入口の奥の箱：床・左右の壁・天井に、中と同じ絵（ブックヌックのように）。中の床の模様と同じ位置合わせ（1枚4マス）
        const box = it.peekBox, base = box?.base || '', tx = (/** @type {string} */ f, rx, ry, ox = 0, oy = 0) => { const t = loader.load(base + f); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.offset.set(ox, oy); t.anisotropy = 8; return t; };
        const bh = dh * 1.04, lit = (/** @type {any} */ t) => portal(new THREE.MeshBasicMaterial({ map: t, color: box?.tint ?? 0xe8cfae, side: THREE.DoubleSide, fog: false }));
        if (box) {
          const FW = dw * 3, fxw = (box.frontX ?? 10.5) - FW / 2; // 床は横に広く（2026-11-23 作者「ゆかは横に広げよう」）。中の入口のまんなか（x）から、床の左のはし
          const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, D), lit(tx(box.floor, FW / 4, D / 4, fxw / 4, 0))); floor.rotation.x = -Math.PI / 2; floor.position.set(cx0, y0 + 0.005, -D / 2); hinge.add(floor); recess.push(floor);
          // 左右の壁は作らない（2026-11-23 作者「これいらないかな側面」：壁の板が浮いて見えた。横は奥の写しが見える）
          const ch = box.ceilH ?? bh; // 天井は中と同じ高さ（2026-11-23 作者「天井が低すぎる」）
          const top = new THREE.Mesh(new THREE.PlaneGeometry(dw * 3, D), lit(tx(box.ceiling, dw * 3 / 4, D / 4))); top.rotation.x = Math.PI / 2; top.position.set(cx0, y0 + ch, -D / 2); hinge.add(top); recess.push(top);
        }
        // 奥の写し：撮ったときのカメラ（peekPose：外の戸口から見たカメラの位置・向き・画角）に向けて、箱の奥より向こうに置く。写しの床と箱の床がつながる
        let peekT = null, veil = 0xd9a066; if (it.peek) { peekT = loader.load(it.peek, (t) => { // 写しの平均の色（切りかわりに重ねる色）
          try { const c = document.createElement('canvas'); c.width = c.height = 8; const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); g.drawImage(t.image, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, bb = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; } const n = d.length / 4; if (holeRecess) holeRecess.veil = (Math.round(r / n) << 16) | (Math.round(gg / n) << 8) | Math.round(bb / n); } catch { /* 色が取れなければ、いつもの暖かい色 */ }
        }); peekT.colorSpace = THREE.SRGBColorSpace; }
        const pose = it.peekPose, ex = (map.exits || []).find((/** @type {any} */ e) => e.id === it.doorExit);
        if (peekT && pose && ex) {
          const cam = new THREE.Vector3(ex.x + 0.5 - (b.x + b.w / 2) + pose.rel[0], pose.rel[1], pose.rel[2]), qt = new THREE.Quaternion().fromArray(pose.q), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(qt);
          const L = (pose.rel[2] + D + 0.1) / Math.max(0.2, -fwd.z), h = 2 * L * Math.tan(pose.fov * Math.PI / 360), w = h * (pose.aspect || 1.6);
          const inside = new THREE.Mesh(new THREE.PlaneGeometry(w, h), portal(new THREE.MeshBasicMaterial({ map: peekT, fog: false, toneMapped: false })));
          inside.position.copy(cam).addScaledVector(fwd, L); inside.quaternion.copy(qt); hinge.add(inside); recess.unshift(inside);
        } else if (peekT) {
          const ph = dh * 1.7, pw = ph * (it.peekAspect || 1.6);
          const inside = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), portal(new THREE.MeshBasicMaterial({ map: peekT, fog: false, toneMapped: false })));
          inside.position.set(cx0, y0 - 0.2 + ph / 2, -D); hinge.add(inside); recess.unshift(inside);
        } else {
          const m0 = cut.mx0 ? fx(cut.mx0) : 0, m1 = cut.mx1 ? fx(cut.mx1) : 1;
          const inside = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh * 1.35), portal(new THREE.MeshBasicMaterial({ map: uvPart(m0, m1), fog: false })));
          inside.position.set(cx0, y0 + dh * 1.35 / 2, -D); hinge.add(inside); recess.unshift(inside);
        }
        for (const m of recess) m.renderOrder = -1;
        holeRecess = { recess, hinge, inside: recess[0], peek: !!peekT, h: dh * 1.35, sill: y0, veil };
      }
      if (doorCut && !doorCut.hole) { // 切り抜いた扉の板：ちょうつがいの側を軸に、家の中（奥）へ開く
        const dw = (doorCut.x1 - doorCut.x0) * b.w, dh = (doorCut.y1 - doorCut.y0) * b.h, tex = PIXROOM ? pixTex(doorCut.c, dw, dh) : texOf(doorCut.c);
        // 扉の板（片開きは1枚、両開きは左右2枚。2026-11-24 作者「家はいる時でる時扉を開くように」）
        const leaves = doorCut.hinge === 'both' ? [[0, 0.5, false], [0.5, 1, true]] : [[0, 1, doorCut.hinge !== 'left']];
        const pivots = leaves.map(([u0, u1, right]) => {
          const t = leaves.length > 1 ? tex.clone() : tex; if (leaves.length > 1) { t.needsUpdate = true; t.repeat.set(u1 - u0, 1); t.offset.set(u0, 0); }
          const lw = (u1 - u0) * dw, dm = boardMesh(t, lw, dh); dm.position.set(right ? -lw / 2 : lw / 2, dh / 2, 0);
          if (!interior) holeMaterial(dm.material);
          const pivot = new THREE.Group(); pivot.position.set((doorCut.x0 + (right ? u1 : u0) * (doorCut.x1 - doorCut.x0) - 0.5) * b.w, (1 - doorCut.y1) * b.h, 0.015); pivot.add(dm); hinge.add(pivot);
          return { pivot, sign: right ? 1 : -1 };
        });
        door = { pivot: pivots[0].pivot, pivots, exit: it.doorExit, sign: pivots[0].sign };
      }
      let roomCard = null;
      if (it.doorExit && !interior) { // 人形の家の演出で、正面が開いたときに見える中の部屋（灯りのともった漆喰と梁と床。開くときだけ見せる）
        roomCard = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.96, b.h * 0.96), new THREE.MeshBasicMaterial({ map: texOf(roomCardCanvas()), fog: false }));
        roomCard.position.set(0, b.h * 0.48, -0.06); roomCard.visible = false; hinge.add(roomCard);
      }
      boards.push({ hinge, mesh, door, doorExit: it.doorExit, roomCard, mw: b.w, artH: townC?.artH, z: b.z, x0: b.x, x1: b.x + b.w, h: b.h, band: layer.band, fade: it.fadeNearPlayer ? it : null, name: it.region ? `${it.asset}#${it.region}` : it.asset, enc: it.encounter ? `${map.id}:${it.encounter}` : null });
      // 板の灯りは板（hinge）の中に入れない：板は倒れている間 visible=false で、そのたびに灯りの数が変わり、光の計算を全部組み直して止まっていた
      // （2026-11-23 作者「飛び出す様子をかくかくしたくない」）。灯りはいつも見えるところに置き、板が倒れている間は明るさを0にする
      const lightAt = (/** @type {number} */ color, /** @type {number} */ base, /** @type {number} */ dist, /** @type {number} */ y, /** @type {number} */ z) => { const L = new THREE.PointLight(color, 0, dist, 1.6); L.position.copy(hinge.position).add(new THREE.Vector3(0, y, z)); parent.add(L); const e = { L, base, ph: cx, z: b.z, hinge }; lights.push(e); return e; };
      if (name === 'lamp') { // 街灯：暖かい色（2026-11-23 作者「色を暖かな感じに」）。本が開いて板が立ったあと、手前から奥へ順に灯る（作者「A 本と一緒に灯る」）
        const e = lightAt(0xffc27a, 12, 6.5, b.h * 0.85, 0.4);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        glow.position.copy(e.L.position).add(new THREE.Vector3(0, 0, -0.35)); glow.scale.set(1.1, 1.1, 1); parent.add(glow); // ガラスの中の明るさ
        const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(hinge.position).add(new THREE.Vector3(0, 0.03, 0.6)); parent.add(ring); // 足もとに広がる光の輪
        e.street = { glow, ring, litAt: /** @type {number|null} */ (null), delay: 0 };
      }
      if (name === 'stall' || name === 'inn-front' || name === 'inn-tall') lightAt(0xffb45a, 18, 9, b.h * 0.45, 0.8);
    }
    delayOf = riseDelayFn(boards.map((b) => b.z));
    lights.filter((l) => l.street).sort((a, c) => c.z - a.z).forEach((l, i) => { l.street.delay = 0.25 + i * 0.28; }); // 手前（z が大きい）から順に
  }

  function actorMesh(id) {
    // デフォルメの歩きのドット絵（台帳の style: chibi）があれば、4方向×4コマのシートで歩かせる（2026-11-22 ナハトから）
    const pe = [...(assets.ledger.party || []), ...(assets.ledger.cast || [])].find((p) => p.id === id), byId = (x) => assets.ledger.assets.find((a) => a.id === x);
    const we = pe && byId(pe.walk), ie = pe && byId(pe.idle);
    if (we?.style === 'chibi' && assets.images[we.id] && assets.images[ie?.id]) {
      const art = we.artScale || 0; // ?chara=art：元の絵（なめらかに拡大縮小する）
      const mk = (img, smooth = false) => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; if (smooth) { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; } else { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; } t.needsUpdate = true; return t; };
      const walkT = mk(toneSheet(id, assets.images[we.id], we.frame[1]), !!art), idleT = mk(toneSheet(id, assets.images[ie.id], (ie.frame || we.frame)[1]), !!art);
      const [fw, fh] = we.frame, h = fh * DOT / (art || 1), w = h * fw / fh; // ドットの大きさはみんな同じ（DOT）。絵の高さで背の高さが決まる（フレアは小柄）
      const mesh = boardMesh(walkT, w, h); fillMaterial(mesh.material, walkT); mesh.position.y = h / 2 - (fh - we.anchor[1]) / fh * h; // 足の裏（anchor）を地面に
      const hinge = new THREE.Group(); hinge.add(mesh); root.add(hinge);
      // 顔の層（2026-11-22 作者の案「顔の部分だけ別のレイヤに。表情も変えられる」）：体の上に、顔のマスを重ねて描く。背中では出さない
      const fe = pe.faces && byId(pe.faces);
      let face = null;
      if (fe && assets.images[fe.id] && !art) { // 元の絵には顔が描いてあるので、顔の層は重ねない
        const ft = mk(toneSheet(id, assets.images[fe.id], 1)), [cw, ch] = fe.cell; // 顔のレイヤーの前髪も髪と同じ色に（fh=1：ぜんぶ髪あつかい。肌はもともと変えない）（2026-11-23 作者「顔のレイヤーも黒にしないと」）
        const fm = new THREE.Mesh(new THREE.PlaneGeometry(w * cw / fw, h * ch / fh), fillMaterial(new THREE.MeshStandardMaterial({ map: ft, transparent: true, alphaTest: 0.35, roughness: 1, side: THREE.DoubleSide }), ft));
        hinge.add(fm); face = { e: fe, t: ft, mesh: fm, w, h, fw, fh };
      }
      // 座り姿（2026-11-24 美術・演出室の座り姿をドット絵化）：あれば sheet.sit
      const se = pe.sit && byId(pe.sit), sit = se && assets.images[se.id] ? { e: se, t: mk(toneSheet(id, assets.images[se.id], se.frame[1])) } : null;
      return { hinge, mesh, face, sheet: { walk: { e: we, t: walkT }, idle: { e: ie, t: idleT }, sit } };
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

  /**
   * 先に準備（2026-11-23 作者「飛び出す様子をかくかくしたくない」）：板が起き上がる瞬間に、絵のほどき・GPUへの送りこみ・光の計算の組み立てが
   * 一度に来て 90〜120ms 止まっていた。マップを開くとき（表紙を待つ間・めくりの裏）に、見えていない板の分もまとめてすませる
   */
  async function warmUp() {
    scene.traverse((/** @type {any} */ o) => { if (o.isLight) o.layers.enable(1); }); // 灯りはキャラ（layer 1）も照らす
    const t0 = performance.now(), seen = new Set();
    scene.traverse((/** @type {any} */ o) => {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        for (const k of ['map', 'emissiveMap', 'bumpMap', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap']) {
          const t = m[k]; if (t?.isTexture && !seen.has(t)) seen.add(t);
        }
      }
    });
    // 絵を画面の側へ送るのは、1コマに少しずつ（123枚を一度に送ると0.2秒止まっていた。2026-11-23 作者「今もいったん止まって見えてしまう」）。合間に、取っておいた画面を描く
    let tb = performance.now();
    for (const t of seen) { renderer.initTexture(t); if (performance.now() - tb > 8) { await new Promise((res) => requestAnimationFrame(() => res(undefined))); tb = performance.now(); } }
    await renderer.compileAsync(scene, camera); // 光の計算の組み立ては、待てるところで（並べて）すませる
    // ぼかすとき（いったん絵に描く）の描き方も先に準備：はじめてぼかすコマで、全部の描き方を組み直して引っかかっていた（2026-11-23 作者「今もいったん止まって見えてしまう」）
    renderer.setRenderTarget(blurRT[0]); await renderer.compileAsync(scene, camera); renderer.setRenderTarget(null);
    renderer.compile(blurScene, fadeCam); renderer.compile(blurOutScene, fadeCam); renderer.compile(veilScene, fadeCam); renderer.compile(holdScene, fadeCam);
    return { textures: seen.size, ms: Math.round(performance.now() - t0) };
  }
  let lastWarm = { textures: 0, ms: 0 }, loading = false, /** @type {any} */ lastLoad = null;
  /**
   * きらきら光る所（2026-11-24 作者「きらきら光るオーブがあるところはアイテムが隠されているとかも」）：
   * 足もとの近くに、六角のオーブが3つ、ゆっくり回りながらまたたく。下にうすい光のたまり。調べて拾うと、すっと消える
   * @type {Map<string, {g:any, parts:any[], glow:any, fade:number, seed:number}>}
   */
  let sparkleObjs = new Map(), sparkleRoot = null;
  // きらっと光る星（2026-11-24 作者「オーブじゃなくて、きらきらひかるものにしてみようか目立たないから」）：細い十字の光と、まんなかの白い点
  const starTex = texOf(canvas(128, 128, (g, w, h) => {
    const c = w / 2; g.globalCompositeOperation = 'lighter';
    const core = g.createRadialGradient(c, c, 0, c, c, 22); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.35, 'rgba(255,240,190,.8)'); core.addColorStop(1, 'rgba(255,220,140,0)'); g.fillStyle = core; g.fillRect(0, 0, w, h);
    for (const [len, wid, rot] of [[62, 5, 0], [62, 5, Math.PI / 2], [30, 3, Math.PI / 4], [30, 3, -Math.PI / 4]]) {
      g.save(); g.translate(c, c); g.rotate(rot); const gr = g.createLinearGradient(-len, 0, len, 0); gr.addColorStop(0, 'rgba(255,230,160,0)'); gr.addColorStop(0.5, 'rgba(255,255,240,1)'); gr.addColorStop(1, 'rgba(255,230,160,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -wid, len, 0); g.quadraticCurveTo(0, wid, -len, 0); g.fill(); g.restore();
    }
  }));
  function updateSparkles(/** @type {{id:string,x:number,y:number}[]} */ list, /** @type {number} */ now, show = true) {
    if (sparkleRoot !== root) { sparkleObjs = new Map(); sparkleRoot = root; } // マップが変わると root ごと片づく
    if (!root || !map) return;
    const want = new Set(list.map((s) => s.id));
    for (const s of list) {
      if (sparkleObjs.has(s.id)) continue;
      const g = new THREE.Group(), seed = (s.x * 7.31 + s.y * 3.17) % 6.28, parts = [];
      for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.scale.setScalar(0.22); g.add(sp); parts.push(sp); }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); glow.scale.set(1.1, 0.55, 1); g.add(glow);
      g.position.set(s.x + 0.5, heightOf(map, s.x, s.y) * HU, s.y + 0.55); root.add(g); // キャラの組（layer 1）には入れない（2026-11-25 サニー：タイトルの机の上や、家に入るときのぼかしの上に、きらきらだけがくっきり出ていた）
      sparkleObjs.set(s.id, { g, parts, glow, fade: 0, seed });
    }
    for (const [id, o] of sparkleObjs) {
      o.g.visible = show; const on = want.has(id); o.fade = Math.max(0, Math.min(1, o.fade + (on ? 0.03 : -0.06)));
      if (!on && o.fade <= 0) { root.remove(o.g); o.g.traverse((/** @type {any} */ c) => c.material?.dispose?.()); sparkleObjs.delete(id); continue; }
      // 星はひとつずつ、ちがう時に「きらっ」と光って消える（光るたびに少し場所が変わる）
      o.parts.forEach((sp, i) => {
        // 2026-11-25 サニー「きらきらの点滅早すぎるもう少しゆっくりぽわぽわ」：1回 1.1秒→2.8秒。急に光らず、ふわっと明るくなって、ふわっと消える
        const T = 2.8, ph = (now / T + o.seed * 0.37 + i * 0.21) % 1, cyc = Math.floor(now / T + o.seed * 0.37 + i * 0.21), r = Math.sin(cyc * 12.9898 + i * 78.233 + o.seed) * 43758.5453, rr = r - Math.floor(r);
        const flash = ph < 0.8 ? Math.pow(Math.sin(ph / 0.8 * Math.PI), 2) : 0;
        sp.position.set((rr - 0.5) * 0.8, 0.15 + ((rr * 7.3) % 1) * 0.8, ((rr * 3.1) % 1 - 0.5) * 0.3 + 0.2);
        sp.material.opacity = o.fade * Math.min(1, flash * 1.1); sp.scale.setScalar(0.35 + 0.5 * flash * (0.65 + 0.35 * ((rr * 5.7) % 1)));
        sp.material.rotation = ph * 0.25;
      });
      o.glow.position.set(0, 0.12, 0); o.glow.material.opacity = o.fade * (0.45 + 0.12 * Math.sin(now * 0.9 + o.seed));
    }
  }

  return {
    name: 'paper',
    async load(mapData) {
      loading = true; holdT0 = performance.now() / 1000; if (holdOk) { holdMesh.scale.set(1, 1, 1); holdMat.uniforms.map.value = holdTex; holdMat.uniforms.op.value = 1; renderer.setRenderTarget(null); renderer.clear(); renderer.render(holdScene, fadeCam); } /* 読みはじめのコマから、取っておいた画面を出す */ // 組み立てている途中の舞台は描かない（半分の舞台を描くたびに光の計算を組み直して止まっていた）
      try { await this.loadInner(mapData); } finally { loading = false; }
    },
    /** @param {any} mapData */
    async loadInner(mapData) {
      await flutterReady; await bookReady;
      if (root) { scene.remove(root); disposeTree(root); }
      map = mapData; root = new THREE.Group(); scene.add(root); actors = {}; innerDoors = []; npcHinges = []; holeRecess = null; lights = []; fires = []; cam.init = false;
      interior = map.kind === 'interior'; nook = null;
      // ?perf=1：マップを開くときの各段の時間をコンソールに出す（2026-11-22 作者「町が出るまで時間がかかる理由」を調べるため）
      const PF = /[?&]perf=1/.test(location.search), pt = [performance.now()], mark = () => pt.push(performance.now());
      await loadArt(map); mark(); await loadTown(map); mark(); await loadSymbols(map); mark();
      const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res(undefined))); // 組み立ての合間に1コマ描く
      await nextFrame();
      if (interior) buildInterior(); else buildExterior(); mark();
      await nextFrame();
      buildBoards(); mark(); await nextFrame();
      buildExitMarks();
      applyOrbs(map); mark(); await nextFrame();
      if (PF) console.info('[perf] load', map.id, ['art', 'town', 'symbols', 'ground', 'boards', 'marks'].map((k, i) => k + ' ' + Math.round(pt[i + 1] - pt[i]) + 'ms').join(' / '));
      lastLoad = { id: map.id, parts: ['絵', '町', '敵', '床', '板', '印'].map((k, i) => k + Math.round(pt[i + 1] - pt[i])).join(' '), t0: pt[0] }; // ?perf=1 の画面の表示に（2026-11-24 作者「銀鹿亭の中の部屋に入るとき」重い：作者の画面で何にかかっているか見る）
      const W = map.width, H = map.height, ext = Math.max(W, H) * 0.75;
      Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 120 }); key.shadow.camera.updateProjectionMatrix();
      key.position.set(W / 2 - 14, 26, H / 2 + 16); key.target.position.set(W / 2, 0, H / 2);
      const tavern = interior && map.stage?.look !== 'dungeon' && map.stage?.look !== 'home', homeLook = interior && map.stage?.look === 'home'; // 建物の中は、部屋全体を照らす光を弱めて、灯りのまわりだけ暖かく（暗がりを作る。2026-11-23 作者「銀鹿亭なんだかまだチープ」）
      key.intensity = tavern ? 0.2 : interior ? 0.5 : DAY ? 2.6 : 1.6;
      key.color.set(DAY && !interior ? 0xfff8ec : 0xfff0d8);
      hemi.intensity = DAY && !interior ? 1.7 : tavern ? 0.28 : 0.9; hemi.color.set(DAY && !interior ? 0xcfe2ff : tavern ? 0xa88c70 : homeLook ? 0xeae4d8 : 0x8090c8); hemi.groundColor.set(DAY && !interior ? 0x6a5a40 : 0x2a1a10);
      lastWarm = await warmUp(); if (PF) console.info('[perf] warm', map.id, lastWarm.textures + '枚 ' + lastWarm.ms + 'ms');
      if (lastLoad) lastLoad.text = `${lastLoad.id} 読む${Math.round(performance.now() - lastLoad.t0)}ms（${lastLoad.parts} 準備${lastWarm.ms}・${lastWarm.textures}枚）`;
    },
    resize(w, h, dpr) {
      cssW = Math.max(1, w); cssH = Math.max(1, h);
      // 描く大きさは 420万画素まで（2026-11-24 作者の画面は 3820×1816＝約700万画素で、扉の出入りのぼかしなどが重かった）。ドット絵なので見た目はほとんど変わらない
      const pr = Math.min(2, dpr || 1, Math.sqrt(4.2e6 / (cssW * cssH)));
      renderer.setPixelRatio(Math.max(0.5, pr)); renderer.setSize(cssW, cssH, false); camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
      // ぼかし用の絵の置き場は、大きさが変わったときに作っておく（前は扉に入った最初のコマで作って、その分止まっていた）
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), bw = Math.max(2, sz.x >> 1), bh = Math.max(2, sz.y >> 1);
      for (const t of blurRT) if (t.width !== bw || t.height !== bh) { t.setSize(bw, bh); renderer.setRenderTarget(t); renderer.clear(); }
      renderer.setRenderTarget(null);
    },
    /**
     * @param {any} view
     * @param {{ intro?: { t:number, open:number, coverRad:number, zoom:number } | null, seconds?: number }} [fx]
     */
    draw(view, fx = {}) {
      if (loading) { // 読んでいる間：切りかわる直前の画面があれば、それを少しずつ寄せながら描く（止まって見えないように）。無ければ前の絵のまま
        if (holdOk) { const t = Math.min(1, (performance.now() / 1000 - holdT0) / 0.5), k = 1 + 0.035 * t; holdMesh.scale.set(k, k, 1); holdMat.uniforms.map.value = holdTex; holdMat.uniforms.op.value = 1; renderer.setRenderTarget(null); renderer.clear(); renderer.render(holdScene, fadeCam); }
        return;
      }
      if (!map) return;

      const intro = fx.intro ?? null, sec = fx.seconds ?? 0, now = performance.now() / 1000;
      lastIntro = intro;
      const W = map.width, H = map.height, { BW, BH } = bookSize(map);
      // 出入口の演出（2026-11-22 作者の決定）。view.effect：kind（page / nook-in / nook-out）・phase（leave / arrive）・p（0→1）
      const ef = view.effect || null, efk = ef ? `${ef.kind}:${ef.phase}` : '', ep = ef ? ef.p : 0;
      // ぼかして出る（2026-11-23 作者「出るところも演出を」）：入るときの逆。中では主人公たちが手前（カメラのほう）へ歩き、まわりがぼけて、外では戸口の奥から歩いて出てくる
      const exOf = (/** @type {any} */ id) => (map.exits || []).find((/** @type {any} */ e) => e.id === id);
      const outL = NOOKIN === 'blur' && efk === 'nook-out:leave' && exOf(ef.exit)?.dir === 'down', outA = NOOKIN === 'blur' && efk === 'nook-out:arrive' && !!carry?.out;
      // キャラの色：着いた直後は、前のマップの灯りで見えていた色から、少しずつ今の灯りの色へ（2026-11-23 作者「明かりの色も少しずつ移るように」）
      const arriving = (efk === 'nook-in:arrive' && NOOKIN === 'blur') || outA, tintK = arriving && carry?.ratio ? 1 - Math.min(1, Math.max(0, ep / 0.6)) : 0;
      const c01 = (/** @type {number} */ v) => Math.min(1, Math.max(0, v)), outDoor = outA ? exOf(carry.toExit) : null, emerge = outA && outDoor && (holeRecess || interior) ? -EMERGE * (1 - c01(ep / 0.6)) : 0,
        emDir = new THREE.Vector3(...(({ up: [0, 0, 1], down: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] })[outDoor?.dir] ?? [0, 0, 1])), /* 出てくる向き（扉の向きの反対） */ outward = outL ? WALK_OUT * c01((ep - 0.15) / 0.65) : 0;
      const cl = (/** @type {number} */ x) => Math.max(0, Math.min(1, x)), ez = (/** @type {number} */ x) => 1 - Math.pow(1 - cl(x), 3);
      lastEffect = efk;
      // 板の起き上がり：開始演出と同じ時間割（riseK）を借りる。riseT が null なら立ったまま
      let riseT = intro ? intro.t : null, fold = 1;
      if (efk === 'nook-in:leave' && NOOKIN === 'fold') fold = 1 - ez(cl((ep - 0.05) / 0.5)); // 飛び出す絵本の家や通りが、ページへ倒れてたたまれる
      // 奥の板から手前の板、キャラの順に、波のように倒れる（2026-11-23 作者「めくるときの、たたむときだすときの突然消えたり出てきたりする感をなくしたい」→「両方を組み合わせる」）
      let wave = null; // [始まり, 奥から手前までの時間差, 1枚が倒れる長さ]（演出の割合）
      if (efk === 'page:leave') wave = [0, 0.4, 0.55];                              // いまのエリアの板とキャラが倒れる
      if (efk === 'page:arrive') riseT = ep < 0.52 ? 0 : RS + (ep - 0.52) / 0.48 * 1.25; // ページがめくれ終わってから、次のエリアの板が起き上がる
      if (efk === 'nook-out:arrive' && pages && !outA) riseT = RS + ep * 1.3;                  // 外に出ると、板が起き上がって迎える
      // 背景に入りこむ（2026-11-23 作者「背景に入り込む演出試しに作ってみて」。試し）：
      //   離れる＝カメラが奥の背景の絵へ寄っていき、手前の板とキャラは手前から順にページへ倒れ、背景の絵だけが残って白い光に包まれる
      //   着く＝白い光が晴れると、次のエリアの板が奥から順に起き上がり、カメラは高いところから主人公のうしろへ下りてくる
      const diveL = efk === 'dive:leave', diveA = efk === 'dive:arrive';
      if (diveL) wave = [0.1, 0.3, 0.5];
      if (diveA) riseT = ep < 0.2 ? 0 : RS + (ep - 0.2) / 0.8 * 1.3;
      // 背景から出てくる（dive の戻り。2026-11-23 作者「戻るときは？」）：
      //   離れる＝カメラがうしろの高い所へ引いていき、板とキャラは奥から順に倒れ、白い光に包まれる
      //   着く＝白い光が晴れると、カメラは奥の背景の絵のすぐ前にいて、絵から抜け出すように主人公のうしろへ下がってくる。板は奥から順に起き上がる
      const emL = efk === 'emerge:leave', emA = efk === 'emerge:arrive';
      if (emL) wave = [0.15, 0.3, 0.5];
      if (emA) riseT = ep < 0.15 ? 0 : RS + (ep - 0.15) / 0.85 * 1.3;
      const deep = diveL || diveA || emL || emA ? DEEP : null, deepIn = diveL || diveA, deepLeave = diveL || emL; // deepIn：奥へ（dive）か
      const riffle = deep === 'riffle', rEnd = (RIFFLE.n - 1) * RIFFLE.gap + RIFFLE.dur; // めくり終わる時刻（着く演出の割合）
      if (riffle && (diveA || emA)) riseT = ep < rEnd ? 0 : RS + (ep - rEnd) / (1 - rEnd) * 1.25; // めくり終わってから起き上がる
      if (deep === 'map' && (diveA || emA)) riseT = ep < 0.45 ? 0 : RS + (ep - 0.45) / 0.55 * 1.3; // 地図：光の点が着いてから起き上がる
      const zfOf = (/** @type {number} */ z, /** @type {boolean} */ isActor) => delayOf(z, isActor) / (INTRO_TIMING.riseSpread + INTRO_TIMING.actorsAfter); // 0＝いちばん奥 … 1＝キャラ
      const kOf = (/** @type {number} */ z, /** @type {boolean} */ isActor) => (riseT === null ? 1 : riseK(riseT, delayOf(z, isActor))) * fold * (wave ? 1 - ez(cl((ep - wave[0] - wave[1] * zfOf(z, isActor)) / wave[2])) : 1);
      // 倒れた板は消さずに、ページに描かれた絵のように平らに残す（外の本のページの上だけ）。板どうし・ページと重ならないよう、手前の板ほど少し上に。
      // 奥へ倒れてページからはみ出す長い板（家）は、倒れるにつれて縮めてページの中に収める
      const flatLay = (/** @type {any} */ hinge, /** @type {number} */ k, /** @type {number} */ z, /** @type {number} */ h, /** @type {boolean} */ isActor, x0 = 0) => {
        const f = 1 - Math.min(1, Math.max(0, k)); if (!pages) { hinge.visible = k > 0.01; return; }
        // 本がひらききるまでは、左半分（表紙といっしょに回るページの所）にかかる板は見せない。閉じた本のまわりに、寝た板や背景が見えていた（2026-11-23 作者「一番最初の本のところ、明かりや屋台が見えてしまっている」）
        // 本がひらく演出のあいだは、寝た板は見せず、起き上がりはじめたら見せる（2026-11-23 作者「開いてからオブジェクトがあったほうがいいかな」）。ページをめくるときは寝たまま残す
        hinge.visible = !(intro && f > 0.99); hinge.position.y += f * (0.03 + 0.05 * zfOf(z, isActor));
        const room = Math.max(0.5, z - (H / 2 - bookSize(map).BH / 2) - 0.3), fit = h > room ? room / h : 1; hinge.scale.y = 1 + (fit - 1) * f;
      };
      // 本がひらく
      // 閉じた本は、表紙を上にして置いてある（右半分が左半分の上に重なっている）。ひらくと、右半分が背を軸に表紙ごと右へめくれて開く
      // （2026-11-22 作者：「クリックする前は、表紙が上に置かれているのでは」）
      if (pages) { const open = intro ? intro.open : 1; pages.right.rotation.z = 0; pages.left.rotation.z = -Math.PI * 0.995 * (1 - open); } // 左半分（表紙）が右から左へひらく
      // 見返しの紙：表紙が開くのを少し遅れて追い、しなりながら右ページへ。表（はじめ上）は白い紙、裏は右ページの絵（着いたら右ページと同じ）
      flyleaves.forEach((f, k) => {
        // 紙は自分の時計で進む（表紙がひらき終わってもそのまま寝るまで動き、寝てから消す。2026-11-23 作者「ページがなくなるのが早い、消えている」：表紙がひらき終わった所で消していた）
        // 紙は自分のなめらかな動き（はじめと終わりがゆるやか）で、表紙よりずっとうしろを進み、表紙が寝てから少しして寝る。追いこさず、途中で急にゆっくりにならない
        // （2026-11-23 作者「まだ追い越しているね」「なんか空中で止まる」「急にゆっくりになるから変」：表紙の動きをなぞると、表紙がゆっくり寝る終わりに紙も急にゆっくりになった）
        const x = intro ? intro.t / INTRO_TIMING.open : 9, s0 = 0.56 + 0.04 * k, s1 = 1.11 + 0.04 * k; // 動きはじめと寝る時刻（本がひらく長さを1として）。表紙を越えない中でいちばん早く寝る値（2026-11-23 作者「開ききってから飛び出さないと変かな」→「ページを速く」：紙が寝てから板が起きる）
        const pf = (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, (x - s0) / (s1 - s0))))) / 2;
        f.group.visible = !!(intro && pages) && pf < 0.999;
        if (!f.group.visible) return;
        if (f.A.material.map !== turnTex) setTurnTex(f.A, turnTex);
        if (f.B.material.map !== (curPageTex || turnTex)) setTurnTex(f.B, curPageTex);
        f.group.position.set(W / 2, 0.12 + 0.012 * (flyleaves.length - k), H / 2); /* 寝た板（高さ0.08まで）より上に */
        bendSheet(f, pf, BW / 2, BH, 1); // 表紙を追って右から左へ。表紙を追いこさない（2026-11-23 作者「表紙よりも先にページがめくれている」：なめらかに速くなる動きで、途中で表紙を追いこしていた）
      });
      // めくれるページ（右から左へ。先のほうが遅れて、紙がしなる）
      const turning = efk === 'page:arrive' && !!pages && ep > 0.01 && ep < 0.56;
      turnMesh.visible = turning;
      { const sg = ef && ef.dir === 'left' ? -1 : 1, keep = efk === 'page:arrive' && !!pages && snapPrevOk && ep < 0.56; oldHalf.visible = keep; if (keep) { setOldHalf(-sg, BW, BH); oldHalf.position.set(W / 2 - sg * BW / 4, 0.11, H / 2); } }
      // 何枚もめくる：1枚目の表は前のページ、最後の1枚の裏は新しいページ、あいだは白い紙
      riffleSheets.forEach((f, k) => {
        const q = riffle && (diveA || emA) && pages ? cl((ep - k * RIFFLE.gap) / RIFFLE.dur) : 0;
        f.group.visible = q > 0 && q < 1; if (!f.group.visible) return;
        const last = k === RIFFLE.n - 1, ta = k === 0 ? (snapPrevOk ? snapRT[0].texture : prevPageTex) : null, tb = last ? (snapCurOk ? snapRT[1].texture : curPageTex) : null;
        if (f.A.material.map !== (ta || turnTex)) setTurnTex(f.A, ta);
        if (f.B.material.map !== (tb || turnTex)) setTurnTex(f.B, tb);
        f.group.position.set(W / 2, 0.05 + 0.006 * (q < 0.5 ? RIFFLE.n - k : k), H / 2); bendSheet(f, ez(q), BW / 2, BH, deepIn ? 1 : -1);
      });
      if (turning) {
        const ta = snapPrevOk ? snapRT[0].texture : prevPageTex, tb = snapCurOk ? snapRT[1].texture : curPageTex;
        if (turnA.material.map !== (ta || turnTex)) setTurnTex(turnA, ta); // 表＝前のページ（倒れた板ごと）
        if (turnB.material.map !== (tb || turnTex)) setTurnTex(turnB, tb); // 裏＝新しいページ（倒れた板ごと）
        turnMesh.position.set(W / 2, 0.14, H / 2); bendSheet(sheet, ez(ep / 0.54), BW / 2, BH, ef && ef.dir === 'left' ? -1 : 1); // 左へ出たら左からめくる。寝た板（高さ0.08まで）より上に
      }
      // 板：起き上がる（少し行きすぎて戻る）。手前の板は、主人公が近いと薄くなる
      const lead = view.actors[0];
      for (const b of boards) {
        const keepBack = b.band === 'backdrop' && ((deep === 'light' && (diveL || emA)) || deep === 'curtain');
        const k = deep === 'layers' || keepBack ? 1 : kOf(b.z, false); // 背景に入りこむ・出てくるとき、背景の絵は倒さない（幕・紙の層は倒さない）
        b.hinge.rotation.x = -Math.PI / 2 * (1 - k);
        { // 奥へ・手前への演出で板を動かす（もとの位置を覚えておき、毎回もどしてから足す）
          const hp = b.hinge.position; if (b.y0 === undefined) { b.y0 = hp.y; b.z0 = hp.z; }
          let dy = 0, dz = 0;
          if (deep === 'curtain' && b.band === 'backdrop') dy = (b.h || 20) * 1.1 * (deepLeave ? ez(ep / 0.8) : 1 - ez(ep / 0.7)); // 幕：上がる／（着いたら）下りてくる
          if (deep === 'layers') { // 紙の層：離れるときは手前の層から、着くときは奥の層から、順にすべる
            const zf = cl(b.z / H), st = 0.35 * (deepLeave ? (deepIn ? 1 - zf : zf) : (deepIn ? zf : 1 - zf)), q = ez(cl((ep - st) / 0.6));
            const dir = deepIn ? 1 : -1; dz = deepLeave ? dir * 16 * q : -dir * 16 * (1 - q);
          }
          hp.y = b.y0 + dy; hp.z = b.z0 + dz;
        }
        if (keepBack || deep === 'layers') { b.hinge.visible = true; b.hinge.scale.y = 1; } else flatLay(b.hinge, k, b.z, b.h || 1, false, b.x0 ?? b.x ?? 0);
        if (b.enc && (view.defeated || []).includes(b.enc)) { b.hinge.visible = false; continue; } // 倒した見えている敵は消す
        if (b.it?.gate && (view.openGates || []).includes(b.it.gate)) { b.hinge.visible = false; continue; } // 開いた仕掛けの扉は消す
        if (b.it?.gate && b.mesh.userData.seal) { const pr = view.gateProgress?.[b.it.gate] ?? 0, sm = b.mesh.userData.seal.material; sm.emissive.setHex(pr > 0 ? 0xffc860 : 0x2a1c08); sm.emissiveIntensity = pr > 0 ? 0.6 + 1.4 * pr * (0.85 + 0.15 * Math.sin(now * 2)) : 1; }
        let alpha = 1;
        // 外では、主人公より手前にあって主人公と重なる板（家・露店など）を透かす（2026-11-22 ノルンを広げたら、手前の家が主人公を隠した）
        // 主人公より手前の板は、主人公のまわりの丸（のぞき穴）だけ透かす。板のほかの所はそのまま
        // （前は「基本手前にあるやつは近づかなくても透けるように」で板ぜんぶを 0.35 にしていた。2026-11-22 作者「スポットライトが当たるところだけすけるとか」）
        const hole = b.mesh.material && b.mesh.material.userData && b.mesh.material.userData.holeOn;
        const low = (b.artH ?? b.h ?? 99) < CHIBI_H; // キャラより低い物（荷箱・植木など）は透かさない（2026-11-23 作者「キャラよりひくいオブジェクトは別に透過しなくていい」）
        if (hole) hole.value = !low && !b.fade && b.z > lead.y + 0.7 ? 1 : 0;
        if (interior && b.solid && b.it && heightLerp(map, lead.x, lead.y) > 0 && lead.y + 0.5 < b.it.y + b.it.h && lead.x + 0.5 > b.it.x - 1 && lead.x + 0.5 < b.it.x + b.it.w + 1) alpha = 0.3; // 2階にいるとき、手前の物（暖炉の煙突）がキャラを隠すなら透かす（2026-11-23 2階の通路で煙突に隠れた）
        if (b.fade) { const it = b.fade; if (lead.x >= it.x - 1 && lead.x <= it.x + it.w && lead.y >= it.y - 2 && lead.y <= it.y + it.h) alpha = 0.4; if (interior && it.y + it.h > lead.y + 0.8 && it.y < lastEye[2] + 0.5) alpha = 0.25; } // 建物・ダンジョンの中は、カメラと主人公のあいだにある壁を、横の位置にかかわらず透かす（2026-11-25 サニー「ダンジョンが…見づらい」）
        // カメラに近すぎる板は透かす（2026-11-22 作者「カメラに近すぎる家とかは透明にしてほしい」）。カメラ（前の絵の位置）から板のいちばん近い所までの
        // 横の距離が NEAR_FAR マスより近いと薄くなりはじめ、NEAR_NEAR マスでいちばん薄く（NEAR_MIN）
        if (!low && !interior && b.x1 !== undefined && b.band !== 'backdrop') {
          const dx = Math.max(b.x0 - lastEye[0], 0, lastEye[0] - b.x1), dz = lastEye[2] - b.z;
          if (dz > -0.5) { const dd = Math.hypot(dx, Math.max(0, dz)); if (dd < NEAR_FAR) alpha = Math.min(alpha, Math.round((NEAR_MIN + (1 - NEAR_MIN) * cl((dd - NEAR_NEAR) / (NEAR_FAR - NEAR_NEAR))) * 20) / 20); }
        }
        if (b.doorExit !== undefined && ((efk === 'nook-in:leave' && (NOOKIN === 'walk' || NOOKIN === 'blur')) || outA)) { alpha = 1; if (hole) hole.value = 0; } // くぐる家は透かさない（カメラが近づいても家の正面と戸口が見えるように）
        if (b.solid) { // 立体（ブックヌックの箱）：箱ぜんぶを薄くする
          if ((b.alpha ?? 1) !== alpha) { b.alpha = alpha; b.mesh.traverse((o) => { if (o.material) for (const mt of [].concat(o.material)) { mt.transparent = true; mt.opacity = alpha; mt.depthWrite = alpha >= 1; } o.castShadow = alpha >= 1; }); }
          continue;
        }
        const m = b.mesh.material; if (m.opacity !== alpha) { const was = m.opacity >= 1; m.opacity = alpha; if (was !== (alpha >= 1)) { m.depthWrite = alpha >= 1; m.alphaTest = alpha >= 1 ? 0.35 : 0.05; m.needsUpdate = true; b.mesh.castShadow = alpha >= 1; } } // 作り直しは「不透明⇔薄い」が変わるときだけ
        if (b.door) for (const pv of b.door.pivots || [b.door]) for (const o of pv.pivot.children) { const dm = /** @type {any} */ (o).material; if (!dm) continue; if (dm.userData.holeOn && hole) dm.userData.holeOn.value = hole.value; if (dm.opacity !== alpha) { const was = dm.opacity >= 1; dm.opacity = alpha; if (was !== (alpha >= 1)) { dm.depthWrite = alpha >= 1; dm.alphaTest = alpha >= 1 ? 0.35 : 0.05; dm.needsUpdate = true; o.castShadow = alpha >= 1; } } } // 扉の板も家といっしょに透かす（2026-11-24 手前の家が透けても扉だけ浮いて残っていた）
      }
      // 仲間の並び（2026-11-24 作者「5人一列ってまあ昔のゲームでもあるもんな、もっと何かあるかな」→「２，４」）：
      // 2＝かたまって歩く：一列の足あと（core）をたどりながら、ひとりおきに左右へ半歩ずれ、前の人に少し寄る（横のマスが通れないときは一列のまま）。
      // 4＝止まると集まる：しばらく止まっていると、主人公の左右とすぐ後ろに集まり、少しすると左右の2人は主人公のほうを向く。歩きだすと並びにもどる。
      // 家に入るあいだは一列になって戸口を通る。マップが変わったときは、その場の並びに置く
      const gdt = grp.lastT ? Math.min(0.1, now - grp.lastT) : 0; grp.lastT = now;
      const DV = /** @type {Record<string,number[]>} */ ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
      const floorAt = (/** @type {number} */ x, /** @type {number} */ y) => { const r = map.collision?.[y]; const c = r?.[x]; return c !== undefined && map.legend?.[c] === 'floor' && !(view.npcs || []).some((/** @type {any} */ n) => n.x === x && n.y === y); };
      const okAt = (/** @type {number} */ bx, /** @type {number} */ by, /** @type {number} */ tx, /** @type {number} */ ty) => { const cx = Math.round(tx), cy = Math.round(ty); return floorAt(cx, cy) && heightOf(map, cx, cy) === heightOf(map, Math.round(bx), Math.round(by)); };
      const still = !efk && view.actors.every((/** @type {any} */ a) => a.motion !== 'walk');
      grp.idleT = still ? grp.idleT + gdt : 0;
      const snapAll = grp.mapId !== map.id; grp.mapId = map.id; // 演出のあいだは一列の位置へなめらかに寄る（飛ばない）。マップが変わったらその場に置く
      const L0 = view.actors[0], fv = DV[L0?.dir] || [0, 1], rv = [-fv[1], fv[0]];
      // 主人公の速さ（1秒に何マス）：仲間がついていく速さの上限に使う。止まっていても、少しは歩ける（集まる・もどる）
      // 1コマごとの速さは、画面のコマと動きの刻みがずれて 0 と 2倍をくりかえすので、ならした速さを使う（2026-11-24：前は2倍の速さで追いついて「ひゅん」と見えた）
      if (gdt > 0 && grp.lx !== undefined && !snapAll) grp.ls = (grp.ls ?? 0) + (Math.hypot(L0.x - grp.lx, L0.y - grp.ly) / gdt - (grp.ls ?? 0)) * (1 - Math.exp(-gdt * 8));
      const leadSpeed = grp.ls ?? 6.5; grp.lx = L0.x; grp.ly = L0.y;
      const GATHER_ON = false;
      const GATHER = [[1.0, -0.2], [-1.0, -0.2], [1.9, -0.6], [-1.9, -0.6]]; // 主人公から見て [右へ, 前へ]。左右に広がる（すぐ後ろに立つと、奥を向いたとき主人公がカメラから隠れた）
      /** @type {Record<string,{x:number,y:number,dir:string,walk:boolean}>} */ const place = {};
      // 位置そのものを遅れて追わせない（2026-11-24 作者「仲間が残像が見える、横に動くと」：位置を後から追いかけていたので、主人公とちがう刻みで動いてドットがにじんだ）。
      // 位置はいつも、core の補間した並び（主人公と同じ速さで動く）から決め、なめらかに変えるのは「横へずれる量・よける量・集まる度合い」の数だけ
      const leaveIn = efk === 'nook-in:leave'; // 家に入るあいだは一列（戸口を通る。横にずれたまま奥へ歩くと、入口でない壁を通りぬけて見えた）
      // 出入りの演出のあいだ（入る・出る・着く）は一列のまま。マップが変わったら、一列（core の並びのまま）から始めて、演出が終わってからなめらかに組へ広がる
      // （2026-11-24 作者「建物に入ったりでたりした直後が仲間が瞬間移動する」：着いた瞬間に組の並びへ飛んでいた）
      const ease = (/** @type {number} */ cur, /** @type {number} */ to, /** @type {number} */ rate) => cur + (to - cur) * (1 - Math.exp(-gdt * rate));
      // マップが変わったら、仲間は「入る前（出る前）の主人公からの位置」をそのまま持ってきて（扉の向きで回す）、そこから歩いて並びなおす
      // （2026-11-24 作者「まだ瞬間移動するよ出入りで」：家の中は狭く、着いたときの立ち位置が入る前の並びとちがう所になって、そこへ飛んでいた）
      if (snapAll) {
        const D4 = ['up', 'right', 'down', 'left'], i0 = D4.indexOf(grp.ldir ?? ''), i1 = D4.indexOf(L0?.dir), turns = i0 >= 0 && i1 >= 0 ? (i1 - i0 + 4) % 4 : 0;
        for (const k of Object.keys(grp.vis)) { const st = grp.vis[k]; Object.assign(st, { lat: 0, dx: 0, g: 0, sp: 0.7, ox: 0, oy: 0, pv: null, snap: true });
          if (st.rx !== undefined && L0 && k !== L0.id) { let rx = st.rx, ry = st.ry; for (let n = 0; n < turns; n++) [rx, ry] = [-ry, rx]; st.px = L0.x + rx; st.py = L0.y + ry; st.snap = false; } }
      }
      grp.ldir = L0?.dir;
      const along0 = (/** @type {number} */ d) => { // 一列の並びの線の上で、主人公から d の所と、そこでの「主人公へ向かう向き」
        let px0 = view.actors[0].x, py0 = view.actors[0].y, ux = fv[0], uy = fv[1];
        for (let j = 1; j < view.actors.length; j++) { const b = view.actors[j], sx = b.x - px0, sy = b.y - py0, sl = Math.hypot(sx, sy); if (sl < 0.01) continue; ux = -sx / sl; uy = -sy / sl; if (d <= sl) return { x: px0 + sx / sl * d, y: py0 + sy / sl * d, ux, uy }; d -= sl; px0 = b.x; py0 = b.y; }
        return { x: px0 - ux * d, y: py0 - uy * d, ux, uy };
      };
      // 主人公が引き返すと、一列の足あと（core）は主人公の前へ折れ返る（仲間が主人公とすれちがう）。そのときは主人公のまうしろを並びの線にする
      // （前は、仲間が一度うしろへ下がってから、主人公を追いこして駆けもどっていた）
      const along = (/** @type {number} */ d) => { const c = along0(d); if (!efk && L0 && (c.x - L0.x) * fv[0] + (c.y - L0.y) * fv[1] > 0.2 * d) return { x: L0.x - fv[0] * d, y: L0.y - fv[1] * d, ux: fv[0], uy: fv[1] }; return c; };
      // 並びの「場所」（主人公のすぐ後ろ＝1番、…）と、そこに立つ人を分ける（2026-11-24 作者「反転も結構急になっている」）：
      // 主人公が引き返して仲間のあいだを通りぬけると、いちばん遠かった人がいちばん近くなる。前は決まった順の場所へ、みんなが主人公を追いこして駆けもどっていた。
      // いまは、近い人から近い場所につく（並び順は少しのあいだ入れかわる）。止まって集まるときに、もとの並び順にもどる
      const ids = view.actors.map((/** @type {any} */ a) => a.id), base = ids.join(',');
      if (grp.base !== base || snapAll) { grp.base = base; grp.who = ids.slice(); grp.slots = {}; }
      if (GATHER_ON && grp.idleT > 1.2 && !efk) grp.who = ids.slice(); // 入れかわった並び順は、集まるとき（いまは使わない）か、マップが変わったときにもどる
      /** @type {Record<number,{tx:number,ty:number,dir:string,moving:boolean}>} */ const slotT = {};
      view.actors.forEach((/** @type {any} */ a, i) => {
        if (i === 0) return;
        const st = grp.slots[i] || (grp.slots[i] = { lat: 0, dx: 0, g: 0, sp: efk ? 0.7 : 0.85 });
        let tx = a.x, ty = a.y, dir = a.dir, moving = false;
        {
          // 2人ずつ組になって、主人公から 0.95・1.9 マスうしろ（一列の線の上）に、左右へ半歩ずつ並ぶ。横が通れないとき・家に入るときは一列（少しつめる）
          st.sp = ease(st.sp ?? 0.85, efk ? 0.7 : 0.85, 6); // 一列のときの間（出入りのあいだはつめる）
          const pair = Math.ceil(i / 2), side = i % 2 ? -1 : 1, c = along(pair * 0.95), px = -c.uy, py = c.ux, s = along(i * st.sp);
          // 左右は、進む向きが逆になっても入れかえない（2026-11-24 作者「いまだに、しゅんかんいどうするよ」：家の中で向きを変えた瞬間、組の2人の左右が1コマで2マス入れかわっていた）
          let sd = side; if (st.pv && (px * sd * st.pv[0] + py * sd * st.pv[1]) < 0) sd = -sd; st.pv = [px * sd, py * sd];
          st.lat = ease(st.lat, !efk && okAt(c.x, c.y, c.x + px * sd, c.y + py * sd) ? 1 : 0, efk ? 10 : 5);
          // 一列の位置からのずれは、急に変わる所（曲がり角・ふり返り）でもなめらかに（まっすぐ歩くあいだはずれが変わらないので、主人公と同じ刻みで動く）
          const ox = (c.x + px * sd * 0.45 - s.x) * st.lat, oy = (c.y + py * sd * 0.45 - s.y) * st.lat;
          if (st.ox === undefined || snapAll) { st.ox = ox; st.oy = oy; } else { st.ox = ease(st.ox, ox, 9); st.oy = ease(st.oy, oy, 9); }
          tx = s.x + st.ox; ty = s.y + st.oy;
          // 主人公の手前（カメラとのあいだ）には立たず、左右へよける（家の中のように近いカメラで主人公がかくれた）
          let want = 0;
          if (!efk && L0 && ty > L0.y + 0.3 && ty < L0.y + 3 && Math.abs(tx - L0.x) < 0.75) { const sgn = Math.abs(tx - L0.x) < 0.01 ? side : Math.sign(tx - L0.x); if (okAt(a.x, a.y, L0.x + sgn * 0.8, ty)) want = L0.x + sgn * 0.8 - tx; else if (okAt(a.x, a.y, L0.x - sgn * 0.8, ty)) want = L0.x - sgn * 0.8 - tx; }
          st.dx = ease(st.dx, want, 6); tx += st.dx;
          // 止まると集まる：集まる所へ、度合い g（0→1）でなめらかに寄る
          const g = GATHER[(i - 1) % GATHER.length], gx = L0.x + rv[0] * g[0] + fv[0] * g[1], gy = L0.y + rv[1] * g[0] + fv[1] * g[1];
          // 止まっても集まらない（2026-11-24 作者「ゴレンジャーみたい…別にその場にいていいんじゃないの？」）。集まる仕組みは残して、いまは使わない
          const canG = GATHER_ON && grp.idleT > 1.2 && !efk && okAt(L0.x, L0.y, gx, gy) && okAt(L0.x, L0.y, (L0.x + gx) / 2, (L0.y + gy) / 2);
          const g0 = st.g; st.g = ease(st.g, canG ? 1 : 0, 3.5); if (Math.abs(st.g - g0) > 0.0015) moving = true;
          if (st.g > 0.001) { const k = st.g * st.g * (3 - 2 * st.g); tx += (gx - tx) * k; ty += (gy - ty) * k; }
          if (st.g > 0.98) dir = L0.dir; // 集まったら主人公と同じ向きのまま（2026-11-24 作者「最後まで同じ方向向いてていいよ」：前は少しすると左右の2人が主人公のほうを向いた）
          if (Math.abs(st.dx - want) > 0.02) moving = true;
        }
        slotT[i] = { tx, ty, dir, moving };
      });
      // 近い人から近い場所へ：2人の場所を入れかえると、歩く道のりの合計がはっきり短くなるなら入れかえる（出入りの演出のあいだ・止まって集まるときはしない）
      if (!efk && !snapAll && grp.idleT <= 1.2) {
        const pos = (/** @type {string} */ id) => { const s = grp.vis[id]; return s && s.px !== undefined ? s : null; };
        for (let pass = 0; pass < 3; pass++) for (let j = 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) {
          const A = pos(grp.who[j]), B = pos(grp.who[k]), Tj = slotT[j], Tk = slotT[k]; if (!A || !B || !Tj || !Tk) continue;
          const d = (/** @type {any} */ p, /** @type {any} */ t) => Math.hypot(p.px - t.tx, p.py - t.ty);
          if (d(A, Tj) + d(B, Tk) - (d(A, Tk) + d(B, Tj)) > 0.6) [grp.who[j], grp.who[k]] = [grp.who[k], grp.who[j]];
        }
      }
      view.actors.forEach((/** @type {any} */ a, i) => {
        const st = grp.vis[a.id] || (grp.vis[a.id] = { px: a.x, py: a.y, gdir: a.dir });
        const j = i === 0 ? 0 : Math.max(1, grp.who.indexOf(a.id)), T = slotT[j];
        let tx = T ? T.tx : a.x, ty = T ? T.ty : a.y, dir = T ? T.dir : a.dir, moving = T ? T.moving : false;
        const sg = grp.slots[j]?.g ?? 0;
        // 1コマで動ける距離に上限（走る速さより少し速いまで）。並びの線が折れ返る所（主人公が仲間のほうへ引き返す）でも、飛ばずに歩いて寄る。マップが変わったときはその場に置く
        // 主人公が引き返してきたら、その場で待つ（2026-11-24 作者「向きを反転したとき、急にひゅんてくる、まってればいいのでは」）：
        // いまの位置が、行きたい所より主人公に 0.3 マス以上近ければ動かない。主人公が離れはじめたら、主人公と同じくらいの速さで歩いてついていく
        if (i > 0 && !st.snap) {
          const dc = Math.hypot(st.px - L0.x, st.py - L0.y), dT = Math.hypot(tx - L0.x, ty - L0.y);
          const ahead = (st.px - L0.x) * fv[0] + (st.py - L0.y) * fv[1] > 0.1; // 主人公の前（進む向きの側）にいる＝引き返してきた主人公がまだ通りすぎていない
          if (!efk && sg < 0.3 && (dc < dT - 0.3 || (ahead && a.motion === 'walk'))) { tx = st.px; ty = st.py; }
          const dd = Math.hypot(tx - st.px, ty - st.py), lim = gdt * Math.max(3, leadSpeed * 1.15) + 0.005;
          if (dd > lim) { tx = st.px + (tx - st.px) * lim / dd; ty = st.py + (ty - st.py) * lim / dd; moving = true; }
        }
        st.snap = false;
        const mx = tx - st.px, my = ty - st.py; st.px = tx; st.py = ty; if (L0) { st.rx = tx - L0.x; st.ry = ty - L0.y; }
        if (moving && a.motion !== 'walk' && Math.hypot(mx, my) > 0.0005) { dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up'); st.gdir = dir; } // 集まる・もどるあいだは、歩く向きを向く
        else if (moving && a.motion !== 'walk') dir = st.gdir;
        place[a.id] = { x: tx, y: ty, dir, walk: a.motion === 'walk' || moving };
      });
      updateSparkles(view.sparkles || [], now, !intro); // 本がひらく前（タイトルの机）は出さない（2026-11-25 サニー：机の上にきらきらが見えていた）
      // キャラ（左右反転しない。いまは1方向の絵のまま）
      const seen = new Set();
      for (const a0 of view.actors) {
        const pl = place[a0.id], a = pl ? { ...a0, x: pl.x, y: pl.y, dir: pl.dir, motion: pl.walk ? 'walk' : 'idle', animMs: pl.walk && a0.motion !== 'walk' ? now * 1000 : a0.animMs } : a0;
        seen.add(a.id);
        if (!actors[a.id]) { const am = actorMesh(a.id); if (!am) continue; am.hinge.traverse((/** @type {any} */ o) => o.layers.set(1)); actors[a.id] = am; }
        const am = actors[a.id], k = efk.startsWith('nook') ? 1 : kOf(a.y + 0.5, true);
        { const r = carry?.ratio, t = tintK; for (const mt of [am.mesh.material, am.face?.mesh.material]) { if (!mt) continue; if (t > 0 && r) { mt.color.setRGB(1 + (r[0] - 1) * t, 1 + (r[1] - 1) * t, 1 + (r[2] - 1) * t); mt.emissive.setHex(0xfff4e6).multiply(mt.color); } else if (mt.color.r !== 1 || mt.color.g !== 1 || mt.color.b !== 1) { mt.color.setRGB(1, 1, 1); mt.emissive.setHex(0xfff4e6); } } } // 建物の出入りのあいだ（読みこみ中も）キャラは立ったまま（2026-11-23 作者「キャラはロード中も存在」）
        am.hinge.rotation.x = -Math.PI / 2 * (1 - k);
        // 入るとき：キャラは入口の奥へ歩いて、入口の板の向こうに消える（カメラがキャラの絵に寄りすぎない）
        const inward = efk === 'nook-in:leave' && NOOKIN === 'blur' ? WALK_IN * cl((ep - 0.15) / 0.65) /* 主人公たちも戸口の奥へ歩く（作者「主人公も奥へ進む」）。2マス奥＝中に着いたときの立ち位置と同じ */ : efk === 'nook-in:leave' ? (NOOKIN === 'walk' && !(ef?.at && ef.at.x === 0 && ef.at.y > 0) ? ep * 3.2 : ez(ep / 0.45) * 1.8) : 0, sideDoor = ef?.at && ef.at.x === 0 && ef.at.y > 0; // 左の壁の扉では左へ歩いて消える
        am.hinge.position.set(snapDot(a.x + 0.5) - (sideDoor ? inward : 0), 0.02 + heightLerp(map, a.x, a.y) * HU, snapDot(a.y + 0.62) - (sideDoor ? 0 : inward) + outward + emDir.z * emerge); am.hinge.position.x += emDir.x * emerge;
        if (a0 !== view.actors[0] && NOOKIN === 'blur' && (efk === 'nook-in:leave' || efk === 'nook-in:arrive')) { // 仲間は主人公の後ろから半歩よける（カメラが真後ろから主人公を見られるように）
          const st = efk === 'nook-in:leave' ? ASIDE * ez(cl(ep / 0.3)) : ASIDE * (1 - ez(cl((ep - 0.25) / 0.45)));
          if (efk === 'nook-in:leave' && sideDoor) am.hinge.position.z -= st; else am.hinge.position.x -= st; // 奥へ進む向きの左へ（左の壁の扉では、奥＝左なので手前の反対へ）
        }
        { // 戸口に近づいたら、戸口の幅の中へ寄せる（2026-11-24 作者「建物の入り口じゃないとこ通ってるように見える」）
          // 寄せる量は1コマで動ける分だけ（2026-11-24 作者の録画：集まって立っている所から扉へ入ると、戸口のすぐ横にいた仲間が1コマで真ん中へ飛んでいた）
          let want = 0;
          if (efk === 'nook-in:leave' && ef?.at && !sideDoor && a0 !== view.actors[0]) {
            const dz = am.hinge.position.z - (ef.at.y + 0.62);
            if (dz < 2) { const cx = ef.at.x + 0.5, lim = 0.2 + Math.max(0, dz) * 0.6, hx = am.hinge.position.x, w = cl((2 - dz) / 1.2); want = (Math.max(cx - lim, Math.min(cx + lim, hx)) - hx) * w; }
          }
          const cur = am.doorX ?? 0, step = gdt * 4 + 0.002, nx = efk === 'nook-in:leave' ? cur + Math.max(-step, Math.min(step, want - cur)) : 0;
          am.doorX = nx; am.hinge.position.x += nx;
        }
        if (emerge < 0 && outDoor && !interior && holeRecess?.sill) am.hinge.position.y += holeRecess.sill * cl((outDoor.y + 0.3 - am.hinge.position.z) / 0.5); // 戸口の中（敷居の高さ）から通りへ下りる
        flatLay(am.hinge, k, a.y + 0.5, CHIBI_H, true, a.x);
        if (inward > 0 && NOOKIN === 'blur' && ef?.at && holeRecess?.sill) am.hinge.position.y += holeRecess.sill * cl((ef.at.y + 0.3 - am.hinge.position.z) / 0.5); // 戸口をくぐったら敷居の高さへ // ドット1つ分の刻みにそろえる。高さのあるマス（階段・2階の通路）では持ち上げる
        if (am.sheet) { // 4方向のシート：向きの行・歩きのコマを選ぶ（左右は別の行。反転しない）
          const walkIn = (inward > 0 && inward < WALK_IN && NOOKIN === 'blur') || (outward > 0 && outward < WALK_OUT) || emerge < 0, fdir = inward > 0 ? (sideDoor ? 'left' : 'up') : outward > 0 ? 'down' : emerge < 0 ? (emDir.x > 0 ? 'right' : emDir.x < 0 ? 'left' : emDir.z < 0 ? 'up' : 'down') : a.dir /* 出入りで歩くあいだは、みんな歩く向きを向く */, s = a.motion === 'walk' || walkIn ? am.sheet.walk : am.sheet.idle, f = sheetFrame(s.e, fdir, walkIn ? now * 1000 : a.animMs), img = s.t.image;
          const m = am.mesh.material; if (m.map !== s.t) { m.map = s.t; m.emissiveMap = s.t; am.mesh.customDepthMaterial.map = s.t; m.needsUpdate = true; }
          s.t.repeat.set(f.sw / img.width, f.sh / img.height); s.t.offset.set(f.sx / img.width, 1 - (f.sy + f.sh) / img.height);
          if (am.face) { // 顔の層：このコマの顔の位置（コマごとに頭が少し動く）に、向き・表情のマスを置く
            const F = am.face, e = F.e, list = e.anchors[a.motion === 'walk' || walkIn ? 'walk' : 'idle'][fdir], an = list && list[Math.round(f.sx / f.sw)], row = e.dirs.indexOf(fdir);
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
      // 町の人（2026-11-24 作者「イベントや会話、適当に沢山作っといて」）：仲間と同じ形で描く。立ったまま、向きだけ変わる（話すとこちらを向く）
      for (const n of view.npcs || []) {
        const key = 'npc:' + n.id; seen.add(key);
        if (!actors[key]) {
          let am = actorMesh(n.sprite);
          if (!am) { // 絵（ドット絵）がまだ無い町の人は、コードで描いた仮の人影（モブのドット絵待ち）
            const hgt = CHIBI_H, mesh = boardMesh(texOf(mobCanvas(n.tone || '#6a5a4a', false)), hgt / 2, hgt), hinge = new THREE.Group(); hinge.add(mesh); root.add(hinge); am = { hinge, mesh };
          }
          am.hinge.traverse((/** @type {any} */ o) => o.layers.set(1)); actors[key] = am;
        }
        const am = actors[key], k = efk.startsWith('nook') ? 1 : kOf(n.y + 0.5, true);
        am.hinge.visible = efk !== 'nook-in:leave' && efk !== 'nook-out:leave'; am.hinge.rotation.x = -Math.PI / 2 * (1 - k); // 建物に出入りするとき（まわりがぼける間）は、町の人を消す（2026-11-25 サニー「家に入るとき町のキャラたちが見える」：仲間と同じくっきり描く組にいた）
        am.hinge.position.set(snapDot(n.x + 0.5), 0.02 + heightLerp(map, n.x, n.y) * HU, snapDot(n.y + 0.62));
        flatLay(am.hinge, k, n.y + 0.5, CHIBI_H, true, n.x);
        if (am.sheet) {
          const s = am.sheet.idle, f = sheetFrame(s.e, n.dir, now * 1000), img = s.t.image, m = am.mesh.material;
          if (m.map !== s.t) { m.map = s.t; m.emissiveMap = s.t; am.mesh.customDepthMaterial.map = s.t; m.needsUpdate = true; }
          if (am.npcDir !== n.dir || am.npcCol !== f.sx) { am.npcDir = n.dir; am.npcCol = f.sx; s.t.repeat.set(f.sw / img.width, f.sh / img.height); s.t.offset.set(f.sx / img.width, 1 - (f.sy + f.sh) / img.height); }
          if (am.face) {
            const F = am.face, e = F.e, list = e.anchors.idle[n.dir], an = list && list[Math.round(f.sx / f.sw)], row = e.dirs.indexOf(n.dir), col = Math.max(0, e.expressions.indexOf('normal'));
            F.mesh.visible = !!an && row >= 0;
            if (F.mesh.visible) { const [cw, ch] = e.cell, fi = F.t.image; F.mesh.position.set(((an[0] + cw / 2) / F.fw - 0.5) * F.w, am.mesh.position.y + (0.5 - (an[1] + ch / 2) / F.fh) * F.h, 0.004); F.t.repeat.set(cw / fi.width, ch / fi.height); F.t.offset.set(col * cw / fi.width, 1 - (row + 1) * ch / fi.height); }
          }
        }
      }
      for (const id of Object.keys(actors)) if (!seen.has(id)) actors[id].hinge.visible = false;
      // 入れる家の扉（2026-11-23 作者「ドアを切り取って開くようにできるかい？」）：入るときは寄りながら開き、出てきたときは開いたまま着いて、閉まる
      for (const b of boards) {
        if (!b.door) continue;
        let open = 0;
        if (efk === 'nook-in:leave' && ef.exit === b.door.exit) open = ez(cl((ep - 0.05) / 0.4));
        if (efk === 'nook-out:arrive') { const ex = (map.exits || []).find((/** @type {any} */ e) => e.id === b.door.exit); if (ex && Math.abs(lead.x - ex.x) + Math.abs(lead.y - ex.y) <= 2) open = outA ? 1 - ez(cl((ep - 0.6) / 0.35)) : 1 - ez(cl((ep - 0.3) / 0.45)); }
        for (const pv of b.door.pivots || [b.door]) pv.pivot.rotation.y = pv.sign * open * Math.PI * 0.55;
      }
      for (const dr of innerDoors) { // 中の扉：入るときに開き、部屋から出てきたら開いたまま着いて閉まる
        let open = 0;
        if (ef && ef.phase === 'leave' && ef.exit === dr.exit) open = ez(cl((ep - 0.05) / 0.4));
        if (ef && ef.phase === 'arrive' && Math.abs(lead.x - dr.x) + Math.abs(lead.y - dr.y) <= 1) open = 1 - ez(cl((ep - 0.3) / 0.45));
        dr.pivot.rotation.y = dr.sign * open * Math.PI * 0.55; // 約100度、手前（外）へ開く（家の中へ開くと、暗い戸口の板に隠れて見えない）
      }
      // 灯り：ブックヌックに入るときは、手前から奥へ順にともる（ちらつきながら）
      for (const l of lights) {
        let on = 1;
        if (efk === 'nook-in:arrive' && NOOKIN !== 'walk' && NOOKIN !== 'blur') { const t0 = 0.1 + 0.5 * (1 - cl((l.z ?? 0) / H)); on = cl((ep - t0) / 0.14); if (on > 0 && on < 1) on *= 0.6 + 0.4 * Math.abs(Math.sin(now * 40 + l.ph)); }
        const flick = l.fire ? 0.82 + 0.18 * Math.sin(now * 11.3 + l.ph) * Math.sin(now * 6.7) + 0.08 * Math.sin(now * 23) : 1 + Math.sin(now * 7 + l.ph) * 0.04; // 火はよくゆらめく
        if (l.hinge && (!l.hinge.visible || 1 + l.hinge.rotation.x / (Math.PI / 2) < 0.6)) on = 0; // 板が倒れている間は消す（灯りの数は変えない）。倒れた板はページに残して見せるので、向きで決める（2026-11-23 作者「一番最初の本のところ、明かりが見えてしまっている」）
        if (l.street) { // 街灯：板が立ちきってから、順番が来たら灯る。ぽっと明るくなって一度ちらつき、落ちつく。倒れたら消えて、次に立ったらまた灯る
          const lp = l.street;
          if (!l.hinge.visible || 1 + l.hinge.rotation.x / (Math.PI / 2) < 0.98) lp.litAt = null; // 板が立ちきっていない
          else if (lp.litAt === null) lp.litAt = now + lp.delay;
          const t = lp.litAt === null ? -1 : now - lp.litAt;
          const ig = t < 0 ? 0 : t < 0.07 ? 0.7 : t < 0.14 ? 0.15 : t < 0.5 ? 0.15 + 0.85 * ez((t - 0.14) / 0.36) : 1;
          on *= ig;
          const day = DAY && !interior ? 0.25 : 1;
          lp.glow.material.opacity = 0.85 * ig * day;
          const rs = 1.2 + 2.6 * ez(cl(t / 0.9)); lp.ring.scale.set(rs, rs, 1); lp.ring.material.opacity = 0.32 * ig * day;
        }
        l.L.intensity = l.base * on * flick * (DAY && !interior ? 0.12 : 1); // 昼は灯りをほのかに
        if (l.glow) l.glow.material.opacity = 0.9 * on * (1 + Math.sin(now * 7 + l.ph) * 0.05);
      }
      for (const f of fires) {
        f.tex.offset.x = (Math.floor(now * 9) % f.frames) / f.frames;
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
      if (deep === 'riffle') zoom = deepLeave ? 1 - ez(ep) : ep < rEnd ? 0 : ez((ep - rEnd) / (1 - rEnd)); // 本全体を見て、めくって、寄る
      if (efk === 'nook-out:arrive' && pages && !outA) zoom = ez((ep - 0.1) / 0.85);
      if (zoom < 1 && pages) { // 本全体を見るカメラから、ふだんのカメラへ寄る
        const p0 = 38 * Math.PI / 180, th = Math.tan(fov * Math.PI / 360), M = camera.aspect < 1 ? 5 : 2.5; // スマホ縦は、手前の角が切れないよう余白を広く
        const half = BW / 2 - (intro && pages ? (BW / 4) * (1 - intro.open) : 0); // 閉じているあいだは、閉じた本（右半分）の大きさに合わせて寄る
        const D = Math.max((half + M) / (th * camera.aspect), (BH / 2 + M) / th) * 1.08;
        wideD = D; // 本全体を見せているあいだは、もやを遠ざける（スマホ縦で本がもやに隠れた。2026-11-22）
        const cxB = W / 2 + (intro ? (BW / 4) * (1 - intro.open) : 0); // 閉じているあいだは、閉じた本（右半分の位置）を真ん中に
        const wl = new THREE.Vector3(cxB, 0, H / 2), we = new THREE.Vector3(cxB, Math.sin(p0) * D, H / 2 + Math.cos(p0) * D);
        eye = we.lerp(eye, zoom); look.copy(wl.lerp(look, zoom));
      }
      // ブックヌックに入る：外では入口の暗がりへ寄って暗くなり、中では遠く（本棚の前）から額縁の中へ寄る
      let fade = view.transition || 0;
      doorGlow.visible = false; blurAmt = 0; veilAmt = 0;
      for (const b of boards) if (b.doorExit !== undefined && b.mesh) { // 人形の家：入口の家の正面が、左のはしを軸に手前へ開く
        const th = efk === 'nook-in:leave' && NOOKIN === 'doll' && ef.exit === b.doorExit ? ez(cl((ep - 0.05) / 0.5)) * 1.45 : 0, hw = (b.mw || 0) / 2;
        b.mesh.rotation.y = -th; b.mesh.position.x = -hw + hw * Math.cos(th); b.mesh.position.z = hw * Math.sin(th);
        if (b.roomCard) b.roomCard.visible = th > 0.01;
      }
      if (efk === 'nook-in:leave' && NOOKIN === 'blur') { // ぼかす：キャラはそのまま、まわりがぼけていく。カメラは主人公のすぐ後ろへ寄り、頭の上を越えて戸口をくぐり、家より奥まで進む
        // （2026-11-23 作者「もっと主人公に近づいて、そして、家よりも奥まで進む演出を。後ろのスクリーンショットがぼかして映ることで、入った時にそこまで色味が変わらない」）
        fade = 0; blurAmt = cl((ep - 0.15) / 0.85); // ぼけ方・色・画角は等速で（2026-11-23 作者「ぼかし方とかを等速にしたい」）
        const lw = new THREE.Vector3(lead.x + 0.5, heightLerp(map, lead.x, lead.y) * HU, lead.y + 0.62), head = lw.clone().add(new THREE.Vector3(0, 1.3, 0));
        // 主人公はいつも見えるように（2026-11-23 作者「主人公も奥へ進む」「主人公はいつも見えていてほしい」）：カメラは、いちばん後ろの仲間の少し横・頭の上・後ろについて、主人公の頭を見る。
        // 歩くにつれて後ろとの間をつめ、最後は家の正面より少し奥（中の始まりと同じ見え方）
        // 2階の扉なら2階の高さで、左の壁の扉なら扉のほうを向いて（2026-11-23 作者「銀鹿亭の2階のはいるときドアに向かってほしい、1階の目線になってる」）
        const walkNow = WALK_IN * cl((ep - 0.15) / 0.65), rearA = (() => { const r = view.actors[view.actors.length - 1], p = place[r.id]; return p ? { ...r, x: p.x, y: p.y } : r; })() /* 絵の位置（2人ずつの組）のいちばん後ろ */, sdIn = !!(ef.at && ef.at.x === 0 && ef.at.y > 0);
        const dv = sdIn ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1), pv = sdIn ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), gyL = heightLerp(map, lead.x, lead.y) * HU;
        const rear = new THREE.Vector3(rearA.x + 0.5, heightLerp(map, rearA.x, rearA.y) * HU, rearA.y + 0.62).addScaledVector(dv, walkNow), leadHead = new THREE.Vector3(lead.x + 0.5, gyL + 1.55, lead.y + 0.62).addScaledVector(dv, walkNow);
        if (ef.at && holeRecess?.sill) { const up = (/** @type {any} */ v) => { v.y += holeRecess.sill * cl((ef.at.y + 0.3 - v.z) / 0.5); }; up(rear); up(leadHead); } // 戸口をくぐったら敷居の高さ（カメラもいっしょに上がる）
        const near = cl((ep - 0.55) / 0.45), gap = 2.2 + (1.0 - 2.2) * near; // 画角を広げるのと同時に、ぐっと近づく（2026-11-23 作者「同時に距離も近づけて」）
        // 見下ろす角度は、外のいつもの角度（マップの pitchDeg）のまま変えない（2026-11-24 作者「ブックヌックに入るとき、一瞬見下ろし角度が下がってまた戻る？」：
        // カメラの高さを決めていたので、近づくほど・戸口の敷居で主人公の頭が上がるほど角度が下がり、見上げる向き（-4度）まで行っていた）
        const eTo = rear.clone().addScaledVector(dv, -gap) /* 真後ろ（2026-11-23 作者「真後ろ」「ヴォルトがよける」：仲間は横へよけるので、主人公が隠れない） */;
        eTo.y = leadHead.y + Math.tan(pitch) * Math.hypot(eTo.x - leadHead.x, eTo.z - leadHead.z);
        const z1 = ez(cl(ep / 0.35)); eye.lerp(eTo, z1); /* 近づくほど横へ：主人公が後ろの仲間に隠れないように。高さは頭の少し上＝見下ろす角度は低いまま（2026-11-23 作者「見下ろし角度はもっと低いまま」） */ look.lerp(leadHead, z1);
        if (ef.at) {
          const ax = ef.at.x + 0.5, az = ef.at.y;
          camera.fov += (FOV_BURST - camera.fov) * cl((ep - 0.55) / 0.45); // 入る瞬間に画角を目いっぱい広げる（2026-11-23 作者「入る瞬間に画角を目いっぱい広げて」）。中はこの画角から、ふつうの画角へ戻る（carry.fov）
          const ex = (map.exits || []).find((/** @type {any} */ e) => e.id === ef.exit), anchor = sdIn ? new THREE.Vector3(ef.at.x, gyL, ef.at.y + 0.5) : new THREE.Vector3(ax, gyL, az);
          const turn = (/** @type {any} */ v) => (sdIn ? v.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2) : v); // 左の壁の扉から入ったら、中（奥へ進む向き）に合わせて回しておく
          veilAmt = VEIL * cl((ep - 0.55) / 0.45); veilMat.color.setHex(holeRecess?.veil ?? 0xd9a066); // 最後に向けて、中の色をうっすら重ねる
          carry = { veil: holeRecess?.veil ?? 0xd9a066, door: true, eye: turn(eye.clone().sub(leadHead)), look: turn(look.clone().sub(leadHead)), fov: camera.fov, toExit: ex?.to?.exit, sill: holeRecess?.sill ?? 0 };
        } else carry = { eye: eye.clone().sub(lw), look: look.clone().sub(lw), fov: camera.fov };
        void head;
      }
      else if (efk === 'nook-in:leave' && ef.at && NOOKIN === 'walk' && !(ef.at.x === 0 && ef.at.y > 0)) { // 入口をくぐる：キャラの少し後ろ・目の高さから、いっしょに戸口を通りぬける
        const at = ef.at, dy = heightOf(map, at.x, at.y) * HU, cz = at.y + 0.62 - ep * 3.2, q = ez(cl(ep / 0.45)), push = ez(cl((ep - 0.45) / 0.55));
        eye.lerp(new THREE.Vector3(at.x + 0.5, 3.0 + dy, cz + 2.6 - 2.0 * push), q); look.lerp(new THREE.Vector3(at.x + 0.5, 1.3 + dy, cz - 4), q); // 仲間の頭の上を越えて（後ろの仲間の背中にぶつからないよう、目の高さより上から）
        if (holeRecess?.peek) { // 奥の絵（中の眺めの写し）が画面の縦いっぱいになる所へ寄って、そのまま中に着く（暗くしない）
          const wp = holeRecess.inside.getWorldPosition(new THREE.Vector3()), d = (holeRecess.h / 2) / Math.tan(camera.fov * Math.PI / 360), f = ez(cl((ep - 0.55) / 0.45));
          eye.lerp(new THREE.Vector3(wp.x, wp.y, wp.z + d), f); look.lerp(wp, f); fade = 0; peekEntry = true;
        } else { fade = cl((ep - 0.86) / 0.14); peekEntry = false; }
      } else if (efk === 'nook-in:leave' && ef.at && NOOKIN !== 'zoom') {
        const at = ef.at, dy = heightOf(map, at.x, at.y) * HU;
        if (NOOKIN === 'shelf' && studyShelf && pages) { // 本から目を上げて、書斎の奥の本棚へ寄る
          const q = ez(ep), sp = studyShelf.position;
          eye.lerp(new THREE.Vector3(sp.x, sp.y + 1, sp.z + 9), q); look.lerp(new THREE.Vector3(sp.x, sp.y, sp.z), q); fade = cl((ep - 0.6) / 0.4);
        } else {
          const late = NOOKIN === 'doll' ? 0.35 : NOOKIN === 'fold' ? 0.3 : 0.15, q = ez(cl((ep - late) / (1 - late)));
          eye.lerp(new THREE.Vector3(at.x + 0.5, 1.4 + dy, at.y + 2.4), q); look.lerp(new THREE.Vector3(at.x + 0.5, 1.0 + dy, at.y - 0.6), q);
          const g0 = NOOKIN === 'light' ? 0.05 : NOOKIN === 'doll' ? 0.25 : 0.2, gq = cl((ep - g0) / (1 - g0));
          doorGlow.visible = true; doorGlow.position.set(at.x + 0.5, 1.1 + dy, at.y + 0.2);
          const big = NOOKIN === 'fold' ? 2.5 : 14; const sc = 1 + (big - 1) * ez(gq); doorGlow.scale.set(sc, sc, 1); doorGlow.material.opacity = Math.min(1, gq * 1.6);
          fade = cl((ep - (NOOKIN === 'fold' ? 0.6 : 0.62)) / 0.38);
        }
      } else if (efk === 'nook-in:leave' && ef.at) {
        const q = ez(ep / 0.8), at = ef.at;
        const dy = heightOf(map, at.x, at.y) * HU; // 2階の通路の扉なら、その高さの扉へ寄る（2026-11-22 作者「ブックヌックの演出は扉に向かって」）
        if (at.x === 0 && at.y > 0) { eye.lerp(new THREE.Vector3(at.x + 2.6, 1.3 + dy, at.y + 0.5), q); look.lerp(new THREE.Vector3(at.x - 0.6, 1.0 + dy, at.y + 0.5), q); } // 左の壁の扉：横から寄る
        else { eye.lerp(new THREE.Vector3(at.x + 0.5, 1.3 + dy, at.y + 2.2), q); look.lerp(new THREE.Vector3(at.x + 0.5, 1.0 + dy, at.y - 0.6), q); }
        fade = cl((ep - 0.45) / 0.55);
      }
      // くぐって着いたら：はじめの一瞬は、戸口の奥に置いた絵（tools/capture-peek.html で撮った、この眺め）と同じ所から、いつもの眺めへ引く
      if (efk === 'nook-in:arrive' && NOOKIN === 'blur') { const q0 = cl(ep / 0.7), q = q0; /* 等速で、外の最後の見え方からいつもの眺めへ（ぼけ・画角・位置） */ /* はじめはゆっくり（外の最後と同じ見え方から） */ if (carry?.veil !== undefined) { veilAmt = VEIL * (1 - cl(ep / 0.55)); veilMat.color.setHex(carry.veil); } /* 同じ色を重ねた所から、ぼけと一緒に外す */ blurAmt = 1 - q; fade = 0; if (carry) { const inEx = carry.door ? (map.exits || []).find((/** @type {any} */ e) => e.id === carry.toExit) : null; /* 戸口から入った位置を、中の入口（手前のふち）に当てはめる。中の床は外の敷居の高さ */ const lw = inEx ? new THREE.Vector3(lead.x + 0.5, heightLerp(map, lead.x, lead.y) * HU + 1.55, lead.y + 0.62) /* 主人公の頭からのずれで受けわたす（どの部屋でも、主人公が画面の同じ所に。2026-11-23 2階の部屋で1マスずれた） */ : new THREE.Vector3(lead.x + 0.5, heightLerp(map, lead.x, lead.y) * HU, lead.y + 0.62); eye.copy(lw.clone().add(carry.eye).lerp(eye, q)); look.copy(lw.clone().add(carry.look).lerp(look, q)); camera.fov = carry.fov + (camera.fov - carry.fov) * q; } } // 外の最後の見え方から、いつもの眺めへ // 中は、ぼけた所から始まって、だんだんはっきり
      else if (efk === 'nook-in:arrive' && NOOKIN === 'walk') { const q = ez(cl((ep - 0.12) / 0.63)); eye.lerp(new THREE.Vector3(lead.x + 0.5, 3.0 + heightLerp(map, lead.x, lead.y) * HU, lead.y + 3.2), 1 - q); look.lerp(new THREE.Vector3(lead.x + 0.5, 1.3, lead.y - 4), 1 - q); /* くぐるときと同じ、仲間の頭の上・少し後ろから */ fade = peekEntry ? 0 : 1 - cl(ep / 0.12); }
      else if (efk === 'nook-in:arrive') { const z = ez((ep - 0.3) / 0.7), HT = nook ? nook.HT : 7; eye.lerp(new THREE.Vector3(W / 2, eye.y + HT * 0.2, eye.z + HT * 1.6), 1 - z); look.lerp(new THREE.Vector3(W / 2, HT * 0.45, H), 1 - z); fade = 1 - cl(ep / 0.18); } // 暗い本棚を遠くから見る → 灯りがともる → 額縁の中へ寄る
      if (outL) { // ぼかして出る（中）：カメラは主人公の前（手前）・頭の少し上から主人公を見て、主人公たちが歩いてくるのに合わせて下がる。最後に画角を広げ、外の色をうっすら重ねる
        fade = 0; blurAmt = cl((ep - 0.15) / 0.85);
        const head = new THREE.Vector3(lead.x + 0.5, 1.55 + heightLerp(map, lead.x, lead.y) * HU, lead.y + 0.62 + outward), near = cl((ep - 0.55) / 0.45), gap = 2.4 + (1.2 - 2.4) * near;
        const z1 = ez(cl(ep / 0.35)); eye.lerp(head.clone().add(new THREE.Vector3(0.6 + 0.4 * near, 0.4, gap)), z1); look.lerp(head, z1);
        camera.fov += (FOV_BURST - camera.fov) * near;
        const outVeil = nextMap?.kind === 'interior' ? 0xd9a066 : DAY ? 0xdfe4e6 : 0x3a3850; /* 行き先が建物の中（銀鹿亭の1階など）なら暖かい色 */ veilAmt = VEIL * near; veilMat.color.setHex(outVeil);
        carry = { out: true, veil: outVeil, eye: eye.clone().sub(head), look: look.clone().sub(head), fov: camera.fov, toExit: exOf(ef.exit)?.to?.exit };
      }
      else if (efk === 'nook-out:leave') { const q = ez(ep), HT = nook ? nook.HT : 7; eye.add(new THREE.Vector3(0, HT * 0.2 * q, HT * 1.6 * q)); fade = cl((ep - 0.4) / 0.6); } // 本棚まで引いて暗くなる
      if (outA) { // ぼかして出る（外）：中の最後と同じ見え方（主人公の前）から始まり、主人公たちが戸口から出てくるのについて、ぼけを取りながら、いつもの眺めへ
        const q = cl(ep / 0.7); blurAmt = 1 - q; fade = 0; veilAmt = VEIL * (1 - cl(ep / 0.55)); veilMat.color.setHex(carry.veil);
        const head = new THREE.Vector3(lead.x + 0.5 + emDir.x * emerge, 1.55 + heightLerp(map, lead.x, lead.y) * HU, lead.y + 0.62 + emDir.z * emerge);
        if (emerge < 0 && outDoor && !interior && holeRecess?.sill) head.y += holeRecess.sill * cl((outDoor.y + 0.3 - head.z) / 0.5);
        // 中の最後の見え方（主人公の正面）を、出てくる向きに回してから始め、主人公のまわりを回って、いつもの眺めへ（2026-11-23 作者「左の部屋から出てくるときは工夫が必要だね、カメラの回転方向とか」）
        const Yax = new THREE.Vector3(0, 1, 0), th = Math.atan2(emDir.x, emDir.z), o0 = carry.eye.clone().applyAxisAngle(Yax, th), l0 = carry.look.clone().applyAxisAngle(Yax, th), o1 = eye.clone().sub(head);
        const a0 = Math.atan2(o0.x, o0.z), a1 = Math.atan2(o1.x, o1.z); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const ang = a0 + da * q, rr = Math.hypot(o0.x, o0.z) + (Math.hypot(o1.x, o1.z) - Math.hypot(o0.x, o0.z)) * q;
        eye.copy(head).add(new THREE.Vector3(Math.sin(ang) * rr, o0.y + (o1.y - o0.y) * q, Math.cos(ang) * rr)); look.copy(head.clone().add(l0).lerp(look, q)); camera.fov = carry.fov + (camera.fov - carry.fov) * q;
      }
      else if (efk === 'nook-out:arrive') fade = 1 - cl(ep / 0.15);
      let fadeCol = 0x0a0a10;
      if ((efk === 'nook-in:leave' || efk === 'nook-in:arrive') && (NOOKIN === 'light' || NOOKIN === 'doll')) fadeCol = 0xffe2b0;
      if ((efk === 'nook-in:leave' || efk === 'nook-in:arrive') && NOOKIN === 'walk') fadeCol = 0x1a1008; // くぐる：戸口の暗がりで、ほんの一瞬だけ // 光の中へ入り、光の中から出てくる
      if (deep && deep !== 'light' && deep !== 'riffle') { // 幕・地図・紙の層：切りかわる一瞬だけ、部屋の色にうすく暗くする（地面の絵が入れかわる所を見せない）
        fadeCol = DAY ? ROOM_DAY : ROOM_NIGHT; fade = deepLeave ? 0.8 * cl((ep - 0.8) / 0.2) : 0.8 * (1 - cl(ep / 0.2));
        if (deep === 'curtain') { const q = deepLeave ? ez(ep) : 1 - ez(ep); eye.z += (deepIn ? -5 : 5) * (deepLeave ? q : -q); eye.y += 1.2 * q; } // 前へ進む（戻りはうしろへ下がる）
        if (deep === 'map') { // 見開きを真上から
          const th = Math.tan(fov * Math.PI / 360), Mg = 3, D = Math.max((BW / 2 + Mg) / (th * camera.aspect), (BH / 2 + Mg) / th) * 1.05;
          const q = deepLeave ? ez(ep / 0.45) : 1 - ez((ep - 0.45) / 0.55);
          eye.lerp(new THREE.Vector3(W / 2, D, H / 2 + 0.01), q); look.lerp(new THREE.Vector3(W / 2, 0, H / 2), q);
        }
      }
      if (deep === 'light' && diveL) { // 奥の背景の絵へ寄る（背景の板は地図の奥のはし z=0 に立っている）
        const q = ez(ep), bh = (boards.find((b) => b.band === 'backdrop')?.h ?? 20);
        eye.lerp(new THREE.Vector3(cam.x, bh * 0.16, 2.2), q); look.lerp(new THREE.Vector3(cam.x, bh * 0.15, -1), q); // 背景の絵の町並み・地平線の高さへ
        fade = cl((ep - 0.55) / 0.45); fadeCol = 0xf4ead4;
      }
      if (deep === 'light' && diveA) { const q = ez((ep - 0.1) / 0.9); eye.add(new THREE.Vector3(0, 7 * (1 - q), -5 * (1 - q))); fade = 1 - cl(ep / 0.3); fadeCol = 0xf4ead4; }
      if (deep === 'light' && emL) { const q = ez(ep); eye.add(new THREE.Vector3(0, 6 * q, 9 * q)); look.add(new THREE.Vector3(0, 1.5 * q, 0)); fade = cl((ep - 0.5) / 0.5); fadeCol = 0xf4ead4; }
      if (deep === 'light' && emA) { // 背景の絵の前（dive で寄った所）から、ふだんのカメラへ
        const q = ez((ep - 0.05) / 0.95), bh = (boards.find((b) => b.band === 'backdrop')?.h ?? 20);
        eye.lerp(new THREE.Vector3(cam.x, bh * 0.16, 2.2), 1 - q); look.lerp(new THREE.Vector3(cam.x, bh * 0.15, -1), 1 - q);
        fade = 1 - cl(ep / 0.3); fadeCol = 0xf4ead4;
      }
      fadeMat.color.setHex(fadeCol);
      // 建物の中の階段（上下の階）：階段のほうへ少し寄りながら暗くなり、着いた階では明るくなりながら上から下りてくる
      if (efk === 'floor:leave' && ef.at) { const q = ez(ep); look.lerp(new THREE.Vector3(ef.at.x + 0.5, 2.5, ef.at.y), q * 0.5); eye.y += 1.5 * q; fade = cl((ep - 0.25) / 0.75); }
      if (efk === 'floor:arrive') { eye.y += 1.5 * (1 - ez(ep)); fade = 1 - cl(ep / 0.55); }
      if (pages && scene.fog && scene.fog.isFog) { const k = zoom < 1 ? 1 - zoom : 0, far = Math.max(80, wideD * 2.2) * k + 80 * (1 - k); scene.fog.near = 34 + (far - 80) * 0.6; scene.fog.far = far; camera.far = Math.max(400, far * 1.5); }
      if (deep === 'map' && scene.fog && scene.fog.isFog) { scene.fog.near = 400; scene.fog.far = 900; camera.far = 1200; } // 真上から見るあいだは、もやをなくす
      // 地図：光の点（と、うしろに続く足あと）がページの上を奥（手前）のはしへ／はしから主人公へ
      trailDots.forEach((s, i) => {
        s.visible = deep === 'map'; if (!s.visible) return;
        const t = cl(deepLeave ? (ep - 0.4) / 0.6 : ep / 0.45) - i * 0.035, edgeZ = deepIn ? (deepLeave ? -1.5 : H + 1.5) : (deepLeave ? H + 1.5 : -1.5);
        const fromZ = deepLeave ? lead.y + 0.5 : edgeZ, toZ = deepLeave ? edgeZ : lead.y + 0.5;
        s.visible = t > 0 && t < 1; if (!s.visible) return;
        s.position.set(lead.x + 0.5, 0.35, fromZ + (toZ - fromZ) * ez(t)); const sz = (i === 0 ? 2.4 : 1.4 - i * 0.12); s.scale.set(sz, sz, 1); s.material.opacity = i === 0 ? 1 : 0.7 - i * 0.08;
      });
      { // ページの写し：去る最後（板が倒れきったところ）と、着いた最初（新しいページの板がまだ寝ているところ）
        const leaveP = (efk === 'page:leave' || diveL || emL) && !!pages, arriveP = (efk === 'page:arrive' || diveA || emA) && !!pages;
        if (leaveP && ep > 0.96) { snapPage(snapRT[0]); snapPrevOk = true; snapCurOk = false; }
        else if (arriveP && !snapCurOk && (riseT === null || riseT <= RS)) { snapPage(snapRT[1]); snapCurOk = true; }
        else if (!ef) { snapPrevOk = false; snapCurOk = false; }

      }
      camera.position.copy(eye); camera.lookAt(look);
      if (capturePose) { camera.position.fromArray(capturePose.p); camera.quaternion.fromArray(capturePose.q); camera.fov = capturePose.fov; } // 撮影の道具（tools/capture-peek.html）が決めたカメラ
      camera.updateProjectionMatrix();
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
      orbSprites.forEach((s, i) => { const p = ps[i]; if (!p) { s.visible = false; return; } s.visible = p.alpha * orbMul > 0.01; if (!s.visible) return; s.position.set(p.x, p.y * 1.4, p.z); const sz = p.size * 2.0 * orbCfg.size; s.scale.set(sz, sz, 1); s.material.opacity = Math.min(1, p.alpha * orbMul * orbCfg.alpha * 1.45); /* 2026-11-23 作者「オーブの量を増やして」：濃さも1.6倍 */ orbsShown++; }); // 2026-11-23 作者「オーブについてもう少し存在感あってもいい」：大きさ1.25倍・濃さ1.5倍
      { // カメラのそばのオーブ：カメラの前（横10・奥7マスの箱）にただよう。箱は世界に止まっていて、カメラが動くと、はしで折り返して反対側から出る（はしでは薄く）
        const fw = camera.getWorldDirection(new THREE.Vector3()); fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1); fw.normalize();
        const c = camera.position.clone().addScaledVector(fw, 3.5), BX = 10, BZ = 7, gy = camera.position.y - 2.2;
        const show = orbCfg.count > 0 && (zoom >= 1 || !pages) ? orbMul * (intro ? cl((intro.zoom ?? 1) * 1.2 - 0.2) : 1) : 0;
        const np = orbPositions(NEAR_ORBS, sec * 0.9 + 37, { w: BX, h: BZ });
        nearOrbs.forEach((s, i) => {
          const p = np[i]; if (!p || show <= 0.01) { s.visible = false; return; }
          const wrap = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ L) => lo + ((((v - lo) % L) + L) % L);
          const x = wrap(p.x + i * 3.1, c.x - BX / 2, BX), z = wrap(p.z + i * 1.7, c.z - BZ / 2, BZ);
          const edge = Math.min(1, (x - (c.x - BX / 2)) / 1.2, (c.x + BX / 2 - x) / 1.2, (z - (c.z - BZ / 2)) / 1.2, (c.z + BZ / 2 - z) / 1.2);
          const a = (0.35 + p.alpha) * show * orbCfg.alpha * Math.max(0, edge); s.visible = a > 0.01; if (!s.visible) return; /* そばのオーブは見えるように、少し濃く大きく */
          s.position.set(x, gy + p.y * 1.3, z); const sz = p.size * 2.4 * orbCfg.size; s.scale.set(sz, sz, 1); s.material.opacity = Math.min(1, a);
        });
      }
      { // キャラの絵は、いつもカメラと平行に向ける（2026-11-23 作者「左の側面の部屋に入るとき、キャラクターがそのままだから、つねに、カメラと平行にしておいてほしい」）。回すだけで左右は返さない
        const f = camera.getWorldDirection(new THREE.Vector3()), yaw = Math.atan2(-f.x, -f.z);
        for (const id of Object.keys(actors)) { const h = actors[id].hinge; h.rotation.order = 'YXZ'; h.rotation.y = yaw; }
        for (const h of npcHinges) h.rotation.y = yaw; // YXZ：起き上がり（x）のあとで向きを回す
      }
      if (holeRecess) { // くぐる途中、カメラが家の正面の面より奥に入ったら、戸口の奥を穴の外にも描く（穴を後ろから見ることになるため）
        const wp = holeRecess.hinge.getWorldPosition(new THREE.Vector3()), inside = camera.position.z < wp.z;
        for (const m of holeRecess.recess) if (m.material.stencilWrite === inside) { m.material.stencilWrite = !inside; }
      }
      const grabNow = ((efk === 'nook-in:leave' && NOOKIN === 'blur') || outL) && ep > 0.85, arriveNow = arriving;
      const heroCol = () => { // 主人公の胸のあたり（4×4ピクセル）の、画面に出ている色
        const am = actors[lead.id]; if (!am) return null;
        const buf = renderer.getDrawingBufferSize(new THREE.Vector2()), c = [0, 0, 0]; let n = 0;
        const gl = renderer.getContext(), a = new Uint8Array(64);
        for (const hy of [0.7, 1.2, 1.7, 2.1]) { // 足・胸・顔・髪のあたり（4×4ピクセルずつ）
          const v = am.hinge.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, hy, 0)).project(camera), px = Math.round((v.x + 1) / 2 * buf.x) - 2, py = Math.round((v.y + 1) / 2 * buf.y) - 2;
          if (px < 0 || py < 0 || px > buf.x - 4 || py > buf.y - 4) continue;
          gl.readPixels(px, py, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, a); for (let i = 0; i < 64; i += 4) { c[0] += a[i]; c[1] += a[i + 1]; c[2] += a[i + 2]; n++; }
        }
        return n ? c.map((x) => x / n) : null;
      };
      if (blurAmt > 0.002) { // キャラ以外をぼかして描き、その上にキャラをくっきり
        const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(2, sz.x >> 1), h = Math.max(2, sz.y >> 1);
        for (const t of blurRT) if (t.width !== w || t.height !== h) t.setSize(w, h);
        camera.layers.disable(1); renderer.setRenderTarget(blurRT[0]); renderer.clear(); renderer.render(scene, camera);
        const Rb = blurAmt * 5;
        for (let i = 0; i < 4; i++) { // 4回くり返して、ぼかしを強く
          blurMat.uniforms.tDiffuse.value = blurRT[0].texture; blurMat.uniforms.dir.value.set(Rb * (i + 1) / w, 0); renderer.setRenderTarget(blurRT[1]); renderer.render(blurScene, fadeCam);
          blurMat.uniforms.tDiffuse.value = blurRT[1].texture; blurMat.uniforms.dir.value.set(0, Rb * (i + 1) / h); renderer.setRenderTarget(blurRT[0]); renderer.render(blurScene, fadeCam);
        }
        renderer.setRenderTarget(null); renderer.clear(); blurOutMat.map = blurRT[0].texture; renderer.render(blurOutScene, fadeCam);
        if (veilAmt > 0.002) { veilMat.opacity = veilAmt; renderer.render(veilScene, fadeCam); }
        if (grabNow) grabBg(); // 去る最後のほう：背景だけを取っておく
        if (holdOk && holdBg && arriveNow) { const op = 1 - cl(ep / (outA ? 0.2 : 0.15)); if (op > 0.002) { holdMesh.scale.set(1, 1, 1); holdMat.uniforms.map.value = holdBg; holdMat.uniforms.op.value = op; renderer.render(holdScene, fadeCam); } } // 着いた直後：去る最後の背景を重ねて、すっと消す（キャラはその上にくっきり）
        const bg = scene.background; scene.background = null; camera.layers.set(1); renderer.clearDepth(); renderer.render(scene, camera); scene.background = bg; camera.layers.set(0); camera.layers.enable(1);
        if (grabNow && carry) carry.heroCol = heroCol(); // 去る最後：前の灯りでの主人公の色
        if (arriveNow && carry?.heroCol && !carry.ratio) { const d = heroCol(); if (d) carry.ratio = d.map((x, i) => Math.min(10, Math.max(0.1, Math.pow((carry.heroCol[i] + 4) / (x + 4), 2.2))) /* 画面の色の比を、光の強さの比へ（2.2乗） */); } // 着いた最初：今の灯りでの色との比
      } else { renderer.clear(); renderer.render(scene, camera); }
      if (fade > 0) { fadeMat.opacity = fade; renderer.render(fadeScene, fadeCam); }
      if (grabNow) grabHold(); else if (!ef) holdOk = false; // 読みこみ中に見せる、キャラ込みの画面
      // 着いた直後に背景どうしを重ねる（上のぼかしの描画の中）：切りかわりの前後の色と形がそのままつながる（2026-11-23 作者「色の重ね方を合わせて」）
    },
    /** 次のマップの絵を先に読む（去る演出のあいだに。待たなくてよい） @param {any} m */
    prefetch(m) { nextMap = m; return prefetchMap(m); },
    /** 内装をドット絵にするか（右上の「内装」ボタン。2026-11-22 作者「元絵もドットもどっちもあり」）。変えたら、いまのマップを読み直す */
    /** いまのカメラ（位置・向き・画角）。撮影の道具（tools/capture-peek.html）が、入る直前の外のカメラを読むのに使う */
    cameraPose: () => ({ p: camera.position.toArray(), q: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect }),
    /** 撮影の道具だけ：カメラをこの位置・向き・画角に決める（null で戻す） @param {any} pose */
    setCapturePose(pose) { capturePose = pose || null; },
    setPixelRoom(on) { PIXROOM = !!on; },
    /** 奥へ・手前へ移る演出の見せ方（読み直し不要） @param {string} s */
    setDeepStyle(s) { DEEP = ['riffle', 'curtain', 'map', 'layers', 'light'].includes(s) ? s : 'riffle'; },
    deepStyle: () => DEEP,
    /** 建物に入るときの見せ方（読み直し不要） @param {string} s */
    setNookStyle(s) { NOOKIN = ['blur', 'walk', 'zoom', 'doll', 'fold', 'light', 'shelf'].includes(s) ? s : 'blur'; },
    nookStyle: () => NOOKIN,
    /** 昼・夜（変えたら、いまのマップを読み直す） @param {'day'|'night'} t */
    setTime(t) { DAY = t === 'day'; },
    time: () => (DAY ? 'day' : 'night'),
    pixelRoom: () => PIXROOM,
    dispose() { if (root) { scene.remove(root); disposeTree(root); } renderer.dispose(); map = null; },
    debug: () => ({ name: 'paper', engine: 'three', drawCalls: renderer.info.render.calls, boards: boards.length, inner: [Math.round(cssW * renderer.getPixelRatio()), Math.round(cssH * renderer.getPixelRatio())], eye: [...lastEye], pitch: +(Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y) * 180 / Math.PI).toFixed(1), intro: lastIntro ? { ...lastIntro } : null, orbs: orbsShown, interior, hinges: Object.fromEntries(Object.entries(actors).map(([k, am]) => [k, [+am.hinge.position.x.toFixed(3), +am.hinge.position.z.toFixed(3)]])), actors: Object.keys(actors), effect: lastEffect, map: map?.id ?? null, warm: { ...lastWarm }, loadText: lastLoad?.text ?? '' }),
  };
}
