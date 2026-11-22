// @ts-check
// 曲（BGM）（DEV-BOOK-001 rev3）。作者指定の完成版ケルト街BGM v30（data/audio.json の bgm）を Web Audio で流す。
// - 効果音（sound.js）とは別の経路（別の AudioContext と音量）。効果音の音量・停止は曲に効かない。
// - 曲の音源はそのまま流す：再合成・切詰め・速度変更をしない。ループは音源の先頭 0 から終わりまで全体（導入2小節も毎周）。
//   AudioBufferSourceNode の loop（loopStart=loopEnd=0＝バッファ全体）で、境界に無音も重ねも入れない。
//   可能なら AudioContext を音源と同じ 44,100Hz で作り、読込後のフレーム数が台帳（3,024,000）と同じかを確かめる。
// - ブラウザは人の操作まで音を出させない。最初の操作で有効にし、そのとき流すべき曲があれば頭から流す。
// - マップが変わっても同じ曲なら続ける（頭に戻さない・重ねない）。曲の無いマップへ行けば止める。
// - タブを離れたら一時停止し（同じ位置で止める）、戻ったら続きから。開始演出のあいだは流さない（歩きはじめから）。
// - 音量は効果音と同じ段階（なし／小／中／大）。「なし」は音量0で流しつづける（位置は進む）。保存しない。
// 曲を選ぶ判断（decideBgm）と音源の照合（checkBuffer）は DOM に依存しない（Node のテストで確かめる）。
import { SOUND_LEVELS } from './sound.js';

export const DEFAULT_BGM_LEVEL = 'mid';

/**
 * いま流すべき曲と、そのための操作。
 * @param {{ mapId: string, byMap: Record<string, string|null|undefined>, current: string|null, introBlocking: boolean }} o
 * @returns {{ want: string|null, action: 'keep'|'start'|'switch'|'stop'|'none' }}
 *   keep：同じ曲を続ける（頭に戻さない）。start：流しはじめる。switch：別の曲へ。stop：止める。none：何もしない
 */
export function decideBgm(o) {
  const want = o.introBlocking ? null : (o.byMap[o.mapId] ?? null);
  if (want === o.current) return { want, action: want ? 'keep' : 'none' };
  if (!want) return { want, action: 'stop' };
  return { want, action: o.current ? 'switch' : 'start' };
}

/**
 * 読み込んだ音源が、台帳の音源とフレーム単位で同じか（再標本化されていないか）。
 * @param {{ sampleRate: number, length: number, numberOfChannels: number }} buf
 * @param {{ sampleRateHz: number, frames: number, channels: number }} spec
 * @returns {{ exact: boolean, reason: string }}
 */
export function checkBuffer(buf, spec) {
  if (buf.numberOfChannels !== spec.channels) return { exact: false, reason: `channels ${buf.numberOfChannels}≠${spec.channels}` };
  if (buf.sampleRate !== spec.sampleRateHz) return { exact: false, reason: `resampled ${spec.sampleRateHz}→${buf.sampleRate}Hz（${buf.length}フレーム）` };
  if (buf.length !== spec.frames) return { exact: false, reason: `frames ${buf.length}≠${spec.frames}` };
  return { exact: true, reason: 'ok' };
}

/**
 * ブラウザで曲を流す部品。音が使えない端末・読込失敗でも、ゲームは無音で進む。
 * @param {{ bgm?: { id:string, path:string, sampleRateHz:number, frames:number, channels:number }[] }} ledger data/audio.json
 * @param {{ level?: string }} [opts] 始めの曲の音量（?mute=1 のとき 'off'）
 */
export function createBgm(ledger, opts = {}) {
  const tracks = ledger.bgm || [];
  const AC = /** @type {typeof AudioContext | undefined} */ (globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext);
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  let level = SOUND_LEVELS.some((l) => l.id === opts.level) ? /** @type {string} */ (opts.level) : DEFAULT_BGM_LEVEL;
  let error = '', unlockedBy = '', hiddenPaused = false;
  /** @type {Record<string, AudioBuffer>} */
  const buffers = {};
  /** @type {Record<string, { exact: boolean, reason: string }>} */
  const checks = {};
  /** @type {string|null} 流すべき曲 */
  let current = null;
  /** @type {{ id: string, src: AudioBufferSourceNode, startedAt: number, more?: AudioBufferSourceNode[] } | null} いま流れている音（1曲だけ。周期で重ねる曲は、2周目からを more に持つ） */
  let live = null;
  let starts = 0; // 頭から流しはじめた回数（確認口用。同じ曲の移動で増えないこと）
  const gainOf = (/** @type {string} */ id) => SOUND_LEVELS.find((l) => l.id === id)?.gain ?? 0;

  try {
    if (!AC) throw Error('Web Audio が使えません');
    const rate = tracks[0]?.sampleRateHz;
    try { ctx = rate ? new AC({ sampleRate: rate }) : new AC(); } catch { ctx = new AC(); } // 指定できない端末は既定の周波数（再標本化される。確認口に出す）
    master = ctx.createGain();
    master.gain.value = gainOf(level);
    master.connect(ctx.destination);
  } catch (e) { error = /** @type {Error} */ (e).message; ctx = null; }

  /** 周期で重ねる曲（loop.mode が overlap_period）の、次の周を予約する見張り */
  let periodTimer = 0;
  const halt = () => {
    if (periodTimer) { clearInterval(periodTimer); periodTimer = 0; }
    if (!live) return;
    const all = [live.src, ...(live.more || [])]; live = null;
    for (const s of all) { try { s.stop(); } catch { /* もう止まっている */ } s.disconnect(); }
  };
  /** 流すべき曲があり、音が有効で、読み終えていれば、頭から流す（すでに流れていれば何もしない） */
  const tryStart = () => {
    if (!ctx || !master || !current || ctx.state !== 'running' || hiddenPaused) return;
    if (live && live.id === current) return;
    halt();
    const buf = buffers[current];
    if (!buf) return;
    const spec = tracks.find((t) => t.id === current);
    if (spec?.loop?.mode === 'overlap_period') { // 周期で重ねる曲（光のアルペジオ。2026-11-22 作者「町以外は光のアルペジオを流そう」）
      // 音源の終わりを待たず、periodSeconds ごとに次の周を頭から始める（前の周の余韻は鳴らしたまま重ねる）。速度・音源は変えない
      const period = spec.loop.periodSeconds, c = ctx, m = master;
      const play1 = (/** @type {number} */ at) => { const s = c.createBufferSource(); s.buffer = buf; s.connect(m); s.start(at, 0); return s; };
      const t0 = c.currentTime + 0.02, first = play1(t0);
      /** @type {AudioBufferSourceNode[]} */ const more = [];
      live = { id: current, src: first, startedAt: t0, more };
      let nextAt = t0 + period;
      periodTimer = /** @type {any} */ (setInterval(() => {
        if (!live || c.state !== 'running') return;
        while (c.currentTime > nextAt - 1.5) { more.push(play1(nextAt)); nextAt += period; }
        while (more.length > 3) { const old = more.shift(); old?.disconnect(); } // 終わった周を手放す（鳴っている周は最大2つ）
      }, 250));
      starts++;
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true; // loopStart=loopEnd=0：バッファ全体 [0, length) をくり返す
    src.connect(master);
    src.start(0, 0);
    live = { id: current, src, startedAt: ctx.currentTime };
    starts++;
  };

  const ready = (async () => {
    if (!ctx) return;
    try {
      await Promise.all(tracks.map(async (t) => {
        const r = await fetch(t.path, { cache: 'no-cache' });
        if (!r.ok) throw Error(`${t.path} を読めません (${r.status})`);
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        buffers[t.id] = buf;
        checks[t.id] = checkBuffer(buf, t);
      }));
      tryStart();
    } catch (e) { error = /** @type {Error} */ (e).message; }
  })();

  return {
    ready,
    get state() { return ctx ? ctx.state : 'unavailable'; },
    get level() { return level; },
    /** 流すべき曲（want で決めたもの） */
    get wanted() { return current; },
    /** 人の操作の中で呼ぶ（音を有効にする）。何度呼んでもよい @param {string} why */
    unlock(why) {
      if (!ctx || ctx.state === 'closed' || hiddenPaused) return Promise.resolve(false);
      if (ctx.state === 'running') { tryStart(); return Promise.resolve(true); }
      const c = ctx;
      return c.resume().then(() => { if (!unlockedBy) unlockedBy = why; tryStart(); return c.state === 'running'; }, () => false);
    },
    /** 流すべき曲を決める（同じなら何もしない） @param {string|null} id */
    want(id) {
      if (id === current) return;
      current = id;
      if (!id || (live && live.id !== id)) halt();
      tryStart();
    },
    /** タブを離れた（true）・戻った（false）。離れたら同じ位置で一時停止、戻ったら続きから @param {boolean} hidden */
    setHidden(hidden) {
      if (!ctx || ctx.state === 'closed') return;
      if (hidden) {
        if (ctx.state === 'running') { hiddenPaused = true; ctx.suspend().catch(() => {}); }
      } else if (hiddenPaused) {
        hiddenPaused = false;
        ctx.resume().then(tryStart, () => {}); // 許されなければ止まったまま。次の操作（unlock）で続きから
      }
    },
    /** 音量を変える（流れている曲にもすぐ効く） @param {string} id */
    setLevel(id) {
      if (!SOUND_LEVELS.some((l) => l.id === id)) return;
      level = id;
      if (ctx && master) master.gain.setValueAtTime(gainOf(id), ctx.currentTime);
    },
    /** 確認口用（読むだけ） */
    snapshot() {
      const buf = live ? buffers[live.id] : null;
      const elapsed = live && ctx ? ctx.currentTime - live.startedAt : 0;
      return {
        state: ctx ? ctx.state : 'unavailable', contextRate: ctx ? ctx.sampleRate : 0, level, gain: master ? master.gain.value : 0, error, unlockedBy, hiddenPaused,
        want: current, playing: live ? live.id : null, starts,
        loop: live ? { loop: live.src.loop, loopStart: live.src.loopStart, loopEnd: live.src.loopEnd } : null,
        position: buf ? Math.round((elapsed % buf.duration) * 1000) / 1000 : 0,
        laps: buf ? Math.floor(elapsed / buf.duration) : 0,
        loaded: Object.fromEntries(Object.entries(buffers).map(([k, b]) => [k, { sampleRate: b.sampleRate, length: b.length, channels: b.numberOfChannels, duration: b.duration, ...checks[k] }])),
      };
    },
  };
}
