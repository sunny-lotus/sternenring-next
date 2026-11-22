// @ts-check
// 入力の「意図」。キーやタッチの細かい違いはここで吸収し、場面には方向の意図だけを渡す。
// - 押した瞬間の方向は先行入力の列へ（最大 buffer 個。旧版の「70ms間隔4回で3歩」を直す）
// - 押しっぱなしの方向は held（最後に押したものが優先）

export class InputState {
  /** @param {{ buffer?: number }} [opt] */
  constructor(opt = {}) {
    this.buffer = opt.buffer ?? 2;
    /** @type {string[]} */ this.queue = [];
    /** @type {string[]} */ this.heldStack = [];
    this.enabled = true;
  }
  /** 方向キーを押した（キーリピートは呼ばない） @param {string} dir */
  press(dir) {
    if (!this.enabled) return;
    this.heldStack = this.heldStack.filter((d) => d !== dir);
    this.heldStack.push(dir);
    // 止まっているときは次の更新ですぐ使われる。歩いている間は buffer 個まで先に貯め、あふれた分は捨てる。
    if (this.queue.length < this.buffer) this.queue.push(dir);
  }
  /** @param {string} dir */
  release(dir) { this.heldStack = this.heldStack.filter((d) => d !== dir); }
  releaseAll() { this.heldStack = []; }
  clearQueue() { this.queue = []; }
  /** 次の1歩の方向（先行入力が先、なければ押しっぱなし） */
  next() { return this.queue.shift() ?? this.held(); }
  held() { return this.heldStack.at(-1) ?? null; }
  /** 歩いている間にたまっている数 */
  pending() { return this.queue.length; }
}
