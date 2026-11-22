// @ts-check
// 効果音（DEV-BOOK-001 rev2）。作者の本の実録音5点（data/audio.json）を Web Audio で鳴らす。
// - ブラウザは、人がページを操作するまで音を出させない（自動再生の制限）。最初の操作（キー・タップ・クリック）で音を有効にする。
// - 有効になっていないあいだに始まった音は、鳴らさずに捨てる。あとから古い「本がひらく音」を遅れて鳴らさない。
// - 開始演出を省略した・タブを離れた → 鳴っている音を止める。同じ音を重ねて鳴らさない。
// - 音量は「なし／小／中／大」。保存しない（再読み込みで「中」に戻る。永続保存は今回広げない）。
// 時刻・状態から決める部分（decideOpenCue・nextLevel）は DOM に依存しない（Node のテストで確かめる）。

/** 音量の段階。gain は元の音への掛け算（増幅しない＝1 が最大） */
export const SOUND_LEVELS = Object.freeze([
  { id: 'off', label: 'なし', gain: 0 },
  { id: 'low', label: '小', gain: 0.3 },
  { id: 'mid', label: '中', gain: 0.6 },
  { id: 'high', label: '大', gain: 1 },
]);
export const DEFAULT_LEVEL = 'mid';

/** 「本がひらく音」を鳴らしてよい、演出の始まりからの遅れ（秒）。これより遅く有効になったら鳴らさない（絵と音がずれるため） */
export const OPEN_CUE_WINDOW = 0.15;

/** 音量ボタンを押したときの次の段階（中→大→なし→小→中…） @param {string} id */
export function nextLevel(id) {
  const order = ['mid', 'high', 'off', 'low'];
  const i = order.indexOf(id);
  return order[(i + 1) % order.length];
}

/**
 * 開始演出の「本がひらく音」を、いま鳴らすか。
 * @param {{ introPhase: string, introT: number, ctxState: string, loaded: boolean, level: string, already: string }} o
 *   introPhase：演出の状態（'playing' のときだけ）。introT：演出の経過秒。ctxState：AudioContext の state（'running' で鳴らせる）
 *   loaded：音を読み終えたか。already：すでに決まった結果（'' ならまだ）
 * @returns {{ decided: boolean, play: boolean, offset: number, reason: string }}
 *   decided=true になったら、もう決め直さない（あとから遅れて鳴らさない）
 */
export function decideOpenCue(o) {
  if (o.already) return { decided: true, play: false, offset: 0, reason: o.already };
  if (o.introPhase !== 'playing') return { decided: o.introPhase === 'done', play: false, offset: 0, reason: 'not-playing' };
  if (o.introT > OPEN_CUE_WINDOW) return { decided: true, play: false, offset: 0, reason: o.ctxState !== 'running' ? 'locked' : !o.loaded ? 'not-loaded' : 'late' };
  if (o.level === 'off') return { decided: true, play: false, offset: 0, reason: 'muted' };
  if (o.ctxState !== 'running' || !o.loaded) return { decided: false, play: false, offset: 0, reason: 'waiting' };
  // 少し遅れて有効になったときは、音の頭を同じだけ飛ばして絵に合わせる
  return { decided: true, play: true, offset: Math.max(0, o.introT), reason: 'played' };
}

/**
 * ブラウザで音を鳴らす部品。音が使えない端末・読込失敗でも、ゲームは無音で進む。
 * @param {{ sounds: { id:string, path:string }[] }} ledger data/audio.json
 * @param {{ level?: string }} [opts] 始めの音量（?mute=1 のとき 'off'）
 */
export function createSound(ledger, opts = {}) {
  const AC = /** @type {typeof AudioContext | undefined} */ (globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext);
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  let level = SOUND_LEVELS.some((l) => l.id === opts.level) ? /** @type {string} */ (opts.level) : DEFAULT_LEVEL;
  let error = '';
  /** @type {Record<string, AudioBuffer>} */
  const buffers = {};
  /** @type {Map<string, AudioBufferSourceNode>} いま鳴っている音（id ごとに1つ。重ねない） */
  const playing = new Map();
  /** @type {{ id:string, at:number, offset:number }[]} 鳴らした記録（確認口用。直近10件） */
  const log = [];
  let loaded = false, unlockedBy = '';

  const gainOf = (/** @type {string} */ id) => SOUND_LEVELS.find((l) => l.id === id)?.gain ?? 0;
  try {
    if (!AC) throw Error('Web Audio が使えません');
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = gainOf(level);
    master.connect(ctx.destination);
  } catch (e) { error = /** @type {Error} */ (e).message; ctx = null; }

  const ready = (async () => {
    if (!ctx) return;
    try {
      await Promise.all(ledger.sounds.map(async (s) => {
        const r = await fetch(s.path, { cache: 'no-store' });
        if (!r.ok) throw Error(`${s.path} を読めません (${r.status})`);
        buffers[s.id] = await ctx.decodeAudioData(await r.arrayBuffer());
      }));
      loaded = true;
    } catch (e) { error = /** @type {Error} */ (e).message; }
  })();

  return {
    ready,
    get state() { return ctx ? ctx.state : 'unavailable'; },
    get loaded() { return loaded; },
    get level() { return level; },
    /**
     * 人の操作の中で呼ぶ（音を有効にする）。何度呼んでもよい。
     * @param {string} why
     * @returns {Promise<boolean>} 有効になったか（使えない・断られたら false。待ちつづける場合があるので、呼ぶ側が上限を決める）
     */
    unlock(why) {
      if (!ctx || ctx.state === 'closed') return Promise.resolve(false);
      if (ctx.state === 'running') return Promise.resolve(true);
      const c = ctx;
      return c.resume().then(() => { if (!unlockedBy) unlockedBy = why; return c.state === 'running'; }, () => false);
    },
    /** 音量を変える（鳴っている音にもすぐ効く） @param {string} id */
    setLevel(id) {
      if (!SOUND_LEVELS.some((l) => l.id === id)) return;
      level = id;
      if (ctx && master) master.gain.setValueAtTime(gainOf(id), ctx.currentTime);
    },
    /**
     * 1つ鳴らす。同じ id が鳴っていれば止めてから鳴らす（重ねない）。鳴らせないときは何もしない（あとで鳴らし直さない）。
     * @param {string} id @param {number} [offset] 音の頭から飛ばす秒
     * @returns {boolean} 鳴らしたか
     */
    play(id, offset = 0) {
      if (!ctx || !master || ctx.state !== 'running' || level === 'off') return false;
      const buf = buffers[id];
      if (!buf || offset >= buf.duration) return false;
      this.stop(id);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(master);
      src.onended = () => { if (playing.get(id) === src) playing.delete(id); };
      src.start(0, offset);
      playing.set(id, src);
      log.push({ id, at: Math.round(ctx.currentTime * 1000) / 1000, offset: Math.round(offset * 1000) / 1000 });
      if (log.length > 10) log.shift();
      return true;
    },
    /** @param {string} id */
    stop(id) {
      const src = playing.get(id);
      if (!src) return;
      playing.delete(id);
      try { src.stop(); } catch { /* もう止まっている */ }
    },
    stopAll() { for (const id of [...playing.keys()]) this.stop(id); },
    /** 確認口用（読むだけ） */
    snapshot: () => ({ state: ctx ? ctx.state : 'unavailable', loaded, level, error, unlockedBy, playing: [...playing.keys()], log: log.map((x) => ({ ...x })) }),
  };
}
