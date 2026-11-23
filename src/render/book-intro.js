// @ts-check
// 開始演出「飛び出す絵本」（DEV-BOOK-001）の時間割と状態。DOM にも WebGL にも依存しない（Node のテストで確かめる）。
// 2026-11-22 作者の決定（14:00ごろ「この感じで行こう」）：
//   1. 本がひらく → 2. 紙の板がページから時間差で起き上がる（少し行きすぎて戻る） → 3. カメラが主人公へ寄る。あわせて六角形のオーブがただよう。
// 「本の世界」は見た目だけ。物語・世界設定には関係させない（ここにも物語の意味は持たせない）。
// 演出は起動したときの最初のマップだけ。室内外の移動のたびには行わない。ページめくり・ダンジョンに入る演出は未採用（ここには入れない）。

/** 時間割（秒）。参照試作の尺を元にした仮の値。歩行へ自然に移ることを優先し、方向の入力でいつでも終わる。 */
export const INTRO_TIMING = Object.freeze({
  open: 2.2,        // 本がひらく（2026-11-23 作者「本が開く演出はやすぎるかも」で 0.9→2.2。全体も 2.8→4.4）
  riseStart: 2.2,   // 板が起き上がりはじめる（本がひらき終わってから）
  riseSpread: 0.6,  // 奥の板から手前の板までの時間差
  riseDur: 0.55,    // 1枚が起き上がる長さ
  actorsAfter: 0.15,// キャラの板は、いちばん手前の板より少しあと
  zoomStart: 2.6,   // カメラが主人公へ寄りはじめる
  zoomDur: 1.8,     // 寄る長さ
  end: 4.4,         // 終わり（ここで歩けるようになる）
  skipGraceMs: 220, // 方向の入力でとばしたあと、この間は歩かない（短く押しただけなら1歩も進まない。押しつづければ歩く）
  // rev4：表紙の「タップしてはじめる」（プロデュース室の判断 2026-11-22 14:23）
  startWaitMs: 800, // 開始の一押しのあと、音が有効になる／効果音を読み終えるのを待つ上限。過ぎたら無音のまま本がひらく（待ち続けない）
  pressGuardMs: 350,// 開始の一押しから、この間のタップ・キー・「とばす」は省略に使わない（二度押しで演出が消えない）
});

export const clamp01 = (/** @type {number} */ x) => Math.max(0, Math.min(1, x));
/** 終わりほどゆっくり */
export const easeOut = (/** @type {number} */ x) => 1 - Math.pow(1 - clamp01(x), 3);
/** 起き上がって少し行きすぎ、戻る（x=1 でちょうど 1） */
export function overshoot(/** @type {number} */ x) {
  const c = 1.9, u = clamp01(x) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/**
 * 板ごとの時間差（秒）。足もとの奥行き z が小さい（奥の）板から順に起き上がる。
 * @param {number[]} zs 板の z（舞台の板だけ）
 * @param {typeof INTRO_TIMING} [T]
 * @returns {(z:number, isActor?:boolean) => number}
 */
export function riseDelayFn(zs, T = INTRO_TIMING) {
  const lo = zs.length ? Math.min(...zs) : 0, hi = zs.length ? Math.max(...zs) : 0, span = hi - lo;
  return (z, isActor = false) => isActor ? T.riseSpread + T.actorsAfter : span > 0 ? T.riseSpread * clamp01((z - lo) / span) : 0;
}

/**
 * 板の起き上がり具合（0＝ページに寝ている、1＝立っている。途中で 1 を少し超える）。
 * @param {number} t 演出の経過秒 @param {number} delay @param {typeof INTRO_TIMING} [T]
 */
export function riseK(t, delay, T = INTRO_TIMING) {
  const x = (t - T.riseStart - delay) / T.riseDur;
  return x <= 0 ? 0 : x >= 1 ? 1 : overshoot(x);
}

/**
 * ある時刻の見え方。
 * @param {number} t 演出の経過秒
 * @param {typeof INTRO_TIMING} [T]
 * @returns {{ t:number, open:number, coverRad:number, zoom:number, done:boolean }}
 *   open：本のひらき具合（0〜1） coverRad：片側のページの起き上がり角（ラジアン。0＝平らにひらいた）
 *   zoom：カメラの寄り（0＝本全体、1＝ふだんのカメラ）
 */
export function introPose(t, T = INTRO_TIMING) {
  const x = clamp01(t / T.open), open = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; // 重い表紙：ゆっくり持ち上がり、まん中で速く、ゆっくり寝る
  return { t, open, coverRad: (1 - open) * Math.PI / 2 * 0.98, zoom: easeOut((t - T.zoomStart) / T.zoomDur), done: t >= T.end };
}

/**
 * 演出を見せるかどうか。
 * - ?intro=0：見せない ／ ?intro=1：動きを抑える設定でも見せる
 * - 端末の「視差効果を減らす（動きを抑える）」設定があれば見せない
 * - 平面表示（flat2d・WebGL 無し）では見せない
 * @param {{ param: string|null, reducedMotion: boolean, mode: string }} o
 * @returns {{ play: boolean, reason: string }}
 */
export function shouldPlayIntro(o) {
  if (o.mode !== 'paper') return { play: false, reason: 'flat2d' };
  if (o.param === '0') return { play: false, reason: 'param-off' };
  if (o.param === '1') return { play: true, reason: 'param-on' };
  if (o.reducedMotion) return { play: false, reason: 'reduced-motion' };
  return { play: true, reason: 'default' };
}

/** 省略に使う「人の一押し」（開始の一押しの直後は、二度押しとみなして省略に使わない） */
const PRESS_SKIPS = new Set(['skip-tap', 'skip-key', 'skip-button']);

/**
 * 演出の状態。時刻は呼ぶ側が渡す（ミリ秒、performance.now など）。
 * 状態：'waiting'（最初のマップの読込待ち）→ 'playing' → 'done'。play=false なら最初から 'done'。
 * cover=true（rev4・ゲーム本編）のときは：'waiting' →（最初のマップを描けた）'cover'（閉じた本の表紙。「タップしてはじめる」）
 *   →（開始の一押し）'starting'（音を有効にするのを短く待つ）→ 'playing' → 'done'。
 *   - 表紙のあいだは、方向の入力・タブ離脱・タップで終わらない（一押しを待つ）。終わるのは表示切替（平面へ）だけ
 *   - 開始の一押しは一度だけ（press が true を返すのは1回）。その一押し・二度押しは、省略にも歩行にも使わない
 * 'done' になったら、二度と 'playing' に戻らない（タブ復帰・表示切替・マップ移動で再生しない）。
 * @param {{ play: boolean, reason: string }} decision
 * @param {typeof INTRO_TIMING} [T]
 * @param {{ cover?: boolean }} [opts]
 */
export function createIntro(decision, T = INTRO_TIMING, opts = {}) {
  const cover = !!opts.cover;
  const st = {
    phase: decision.play ? 'waiting' : 'done',
    /** 終わった理由：'complete'（最後まで）／'skip-input'（方向の入力）／'skip-button'／'skip-key'／'skip-tap'／'hidden'（タブを離れた）／'toggle'（表示切替）／見せなかった理由 */
    endedBy: decision.play ? '' : `not-played:${decision.reason}`,
    startMs: 0,
    t: 0,
    graceMs: 0,
    /** 開始の一押し（cover のとき）：なにで・いつ（ミリ秒） */
    pressedBy: '',
    pressMs: -1,
    /** 開始待ちが終わった理由（'ready'＝音の用意ができた／'timeout'＝待ちの上限／'error'） */
    startedBy: '',
  };
  return {
    get phase() { return st.phase; },
    get endedBy() { return st.endedBy; },
    /** 歩けない（フィールドを止める）あいだ true */
    get blocking() { return st.phase !== 'done'; },
    /** 最初のマップを描けるようになった（cover のときは表紙を出す。cover でなければすぐ始める） @param {number} nowMs */
    shown(nowMs) {
      if (st.phase !== 'waiting') return;
      if (cover) st.phase = 'cover'; else this.begin(nowMs);
    },
    /**
     * 表紙の開始の一押し。表紙のときだけ、1回だけ true（二度押し・キーの連打では始め直さない）。
     * @param {string} why @param {number} nowMs
     */
    press(why, nowMs) {
      if (st.phase !== 'cover') return false;
      st.phase = 'starting'; st.pressedBy = why; st.pressMs = nowMs;
      return true;
    },
    /**
     * 本がひらきはじめる。cover のときは開始の一押しのあと（'starting'）だけ。cover でなければ読込待ちから。
     * @param {number} nowMs @param {string} [why] 開始待ちが終わった理由
     */
    begin(nowMs, why = '') {
      if (st.phase === 'starting' || (!cover && st.phase === 'waiting')) { st.phase = 'playing'; st.startMs = nowMs; st.t = 0; st.startedBy = why; }
    },
    /**
     * 省略・中断。すぐ終わりの状態（ふだんのカメラ・板は立った状態）にする。
     * 表紙・読込待ちのあいだは表示切替だけで終わる。開始待ちのあいだと、開始の一押しから pressGuardMs のあいだは、タップ・キー・「とばす」で終わらない。
     * @param {string} why @param {number} [nowMs] 省略の時刻（開始の一押しの直後かを見る）
     * @returns {boolean} 終えたか
     */
    skip(why, nowMs = Infinity) {
      if (st.phase === 'done') return false;
      if (cover && (st.phase === 'waiting' || st.phase === 'cover') && why !== 'toggle') return false;
      if (cover && PRESS_SKIPS.has(why) && (st.phase === 'starting' || nowMs - st.pressMs < T.pressGuardMs)) return false;
      st.phase = 'done'; st.endedBy = why; st.graceMs = why === 'skip-input' ? T.skipGraceMs : 0;
      return true;
    },
    /** 方向でとばした直後の猶予。残っていれば dt だけ減らして true @param {number} dt */
    inGrace(dt) { if (st.graceMs <= 0) return false; st.graceMs = Math.max(0, st.graceMs - dt); return true; },
    /**
     * いまの見え方。'playing' でなければ null（ふだんの描画）。
     * @param {number} nowMs
     */
    pose(nowMs) {
      if (st.phase === 'cover' || st.phase === 'starting') return introPose(0, T); // 閉じた本（表紙）のまま待つ
      if (st.phase !== 'playing') return null;
      st.t = Math.max(0, (nowMs - st.startMs) / 1000);
      const p = introPose(st.t, T);
      if (p.done) { st.phase = 'done'; st.endedBy = 'complete'; return null; }
      return p;
    },
    snapshot: () => ({ phase: st.phase, endedBy: st.endedBy, t: Math.round(st.t * 1000) / 1000, reason: decision.reason, cover, pressedBy: st.pressedBy, startedBy: st.startedBy }),
  };
}

/**
 * 開始の一押しのあと、用意（音の有効化・効果音の読込）ができたら、または上限の時間が来たら、一度だけ done を呼ぶ。
 * 用意が失敗・待ちつづけでも、上限で必ず進む（無音で演出へ）。
 * @param {Promise<unknown>} ready @param {number} ms 上限（ミリ秒）
 * @param {(why: 'ready'|'timeout'|'error') => void} done
 * @param {(fn: () => void, ms: number) => unknown} [timer]
 */
export function startWhenReady(ready, ms, done, timer = setTimeout) {
  let fired = false;
  const go = (/** @type {'ready'|'timeout'|'error'} */ why) => { if (!fired) { fired = true; done(why); } };
  ready.then(() => go('ready'), () => go('error'));
  timer(() => go('timeout'), ms);
}

/**
 * 六角形の光の玉（オーブ）の位置。時刻から決まる（状態を持たない）。舞台の上を、ゆっくり上へただよい、上で消えて下から出る。
 * @param {number} n 数 @param {number} seconds 経過秒（動きを抑えるときは 0 のまま渡す）
 * @param {{ w:number, h:number }} area 舞台の広さ（マス）
 * @returns {{ x:number, y:number, z:number, size:number, alpha:number }[]}
 */
export function orbPositions(n, seconds, area) {
  let s = 42;
  const R = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const out = [];
  const top = 4.2, bottom = 0.3;
  for (let i = 0; i < n; i++) {
    const x0 = R() * area.w, z0 = R() * area.h, y0 = bottom + R() * (top - bottom);
    const vx = (R() - 0.5) * 0.12, vy = 0.05 + R() * 0.1, size = 0.22 + R() * 0.45, base = 0.25 + R() * 0.4, ph = R() * 6.28;
    const span = top - bottom;
    const y = bottom + ((((y0 - bottom) + vy * seconds) % span) + span) % span;
    const x = ((x0 + vx * seconds) % area.w + area.w) % area.w;
    // 下から出てくるとき・上で消えるときは薄く（ぱっと現れない）
    const edge = Math.min(1, (y - bottom) / 0.5, (top - y) / 0.6);
    out.push({ x, y, z: z0, size, alpha: base * (0.75 + 0.25 * Math.sin(seconds * 0.8 + ph)) * clamp01(edge) });
  }
  return out;
}

/**
 * 固定刻みの更新の入口（main.js が毎回呼ぶ）。演出中はフィールドを進めない。
 * 方向の入力（先行分）が来たら演出を終える。その入力は捨てる（とばすための入力で1歩進まない）。
 * とばしたあと skipGraceMs のあいだも歩かない（短く押しただけで1歩進む誤操作を防ぐ）。
 * 押しつづけている方向（held）は残すので、猶予より長く押したままなら、演出のあと自然に歩きはじめる。
 * 表紙・開始待ち（rev4）のあいだの方向の入力は、捨てるだけ（演出を省略しない・歩かない）。
 * @param {{ blocking:boolean, phase?:string, inGrace?:(dt:number)=>boolean }} intro
 * @param {{ pending:()=>number, clearQueue:()=>void }} input
 * @param {(why:string)=>void} skip
 * @param {number} [dt] 固定刻みの長さ（ミリ秒）
 * @returns {boolean} フィールドを進めてよいか
 */
export function gateInput(intro, input, skip, dt = 1000 / 60) {
  if (!intro.blocking) {
    if (!intro.inGrace?.(dt)) return true;
    input.clearQueue();
    return false;
  }
  if (input.pending() > 0 && (intro.phase === undefined || intro.phase === 'playing' || intro.phase === 'waiting')) skip('skip-input');
  input.clearQueue();
  return false;
}
