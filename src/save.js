// @ts-check
// 冒険の記録の保存（2026-11-22 作者「NEXTが冒険の記録を持つ」）。NEXT で、ブラウザの保存にさわってよいのはこのファイルだけ（tests/guards.test.mjs）。
// - 保存の名前は sternenring-next-save-v1:slot1（AGENTS.md で決めてあった新しいキー。まずスロット1）。旧版のキーは読まない・書かない
// - 書きかえは、まとめて少しあとに保存する（戦闘が細かく書きかえても、保存は1回にまとめる）
// - 保存できない（プライベートモードなど）ときは、記録はその画面のあいだだけ残る（ゲームは止めない）
import { parseRecord, serializeRecord } from './core/record.js';

export const SAVE_KEY = 'sternenring-next-save-v1:slot1';

/** @returns {Storage|null} */
function storage() { try { return globalThis.localStorage ?? null; } catch { return null; } }

/**
 * 保存してある記録を読む（無ければ新しい記録）。
 * 記録がまだ無いときだけ、今まで戦闘が同じアドレスに自分で保存していた項目（sr- で始まる名前：育ち・レベル・お金・アイテム・隊列など）を1回だけ写して引きつぐ
 */
export function loadRecord() {
  const s = storage(); let text = null;
  try { text = s ? s.getItem(SAVE_KEY) : null; } catch { text = null; }
  const rec = parseRecord(text);
  if (!text && s) {
    try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith('sr-')) { const v = s.getItem(k); if (v !== null) rec.store[k] = v; } } } catch { /* 読めなければ引きつがない */ }
  }
  return rec;
}

/**
 * 記録を保存する係を作る。schedule() で少しあとに1回だけ保存する
 * @param {import('./core/record.js').AdventureRecord} rec
 */
export function createSaver(rec) {
  let timer = 0, lastError = '', saves = 0;
  const now = () => {
    timer = 0;
    const s = storage(); if (!s) { lastError = '保存できない端末'; return false; }
    try { s.setItem(SAVE_KEY, serializeRecord(rec)); saves++; lastError = ''; return true; } catch (e) { lastError = /** @type {Error} */ (e).message; return false; }
  };
  return {
    schedule() { if (!timer) timer = /** @type {any} */ (setTimeout(now, 300)); },
    now,
    get info() { return { saves, lastError, pending: !!timer }; },
  };
}
