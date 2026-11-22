// @ts-check
// 冒険の記録（2026-11-22 作者の決定：「NEXTが冒険の記録を持つ」「戦闘はその記録を受け取って戦い、結果を返す」「フィールドの出来事から記録を書きかえる」）。
// 描画にも DOM にも保存にも依存しない（Node のテストで確かめる）。保存は src/save.js が行う。
//
// 中身：
// - store：戦闘（battle/）が今まで自分で保存していた項目（育ち・レベル・お金・アイテム・技の組み合わせ・設定など）を、名前（キー）ごとに文字列でそのまま持つ。
//   フィールドから開いた戦闘は、ブラウザの保存の代わりにこの store を読み書きする（storeFor）。戦闘の中身は今までどおり動く。
// - flags：旗（サブクエの進み・会話の既読など）
// - 親密度：戦闘の親密度（sr-battle-bond-v1：bond＝親密度、ev＝その仲間のイベントで連携技が開いたか）を、そのまま読み書きする。
//   ナハトの連携技の経験値（2026-11-21 作者の設計）。フィールドの出来事でも、戦闘で連携技を使っても、同じ数が増える（2026-11-22 作者「親密度を連携技につなげて」）
// - 戦闘に渡すもの（store の中の、フィールド用の項目）：
//   inbox＝フィールドで手に入れたお金・経験値（戦闘やメニューが次に開いたときに受け取って、育ちに足す）
//   skills＝フィールドで覚えた技（戦闘で使える）／formation＝隊列

export const RECORD_FORMAT = 'sternenring-next-record';
export const RECORD_VERSION = 1;
/** 戦闘と分け合う、フィールド用の項目の名前 */
export const FIELD_KEYS = Object.freeze({ inbox: 'sr-field-inbox-v1', skills: 'sr-field-skills-v1', formation: 'sr-field-formation-v1' });
/** 戦闘の親密度の項目と、上限（戦闘の SR.bondLv[2] + 20） */
export const BOND_KEY = 'sr-battle-bond-v1', BOND_MAX = 120;
/** NEXT の名前 → 戦闘の1文字の名前 */
export const BATTLE_CODE = Object.freeze({ nacht: 'N', volt: 'V', flare: 'F', serena: 'S', licht: 'L' });
export const MEMBERS = Object.freeze(Object.keys(BATTLE_CODE));
/** 親密度を持つ仲間（ナハトとの親密度。ナハト自身は持たない） */
export const COMPANIONS = Object.freeze(['volt', 'flare', 'serena', 'licht']);
const GROWTH_KEY = 'sr-battle-growth-v2';

/** @typedef {{ format:string, version:number, store:Record<string,string>, flags:Record<string, boolean|number|string> }} AdventureRecord */

/** @returns {AdventureRecord} 新しい記録 */
export function createRecord() {
  return { format: RECORD_FORMAT, version: RECORD_VERSION, store: {}, flags: {} };
}

/**
 * 保存してあった文字列から記録を作る。壊れている・形が違うときは新しい記録（例外は投げない）
 * @param {string|null|undefined} text
 * @returns {AdventureRecord}
 */
export function parseRecord(text) {
  const fresh = createRecord();
  if (!text) return fresh;
  let o; try { o = JSON.parse(text); } catch { return fresh; }
  if (!o || o.format !== RECORD_FORMAT || o.version !== RECORD_VERSION) return fresh;
  const store = {}; for (const [k, v] of Object.entries(o.store || {})) if (typeof v === 'string') store[k] = v;
  const flags = {}; for (const [k, v] of Object.entries(o.flags || {})) if (['boolean', 'number', 'string'].includes(typeof v)) flags[k] = v;
  const rec = { format: RECORD_FORMAT, version: RECORD_VERSION, store, flags };
  // 前の形（intimacy を別に持っていた）から引きつぐ：戦闘の親密度に足す
  for (const c of COMPANIONS) if (Number.isFinite(o.intimacy?.[c]) && o.intimacy[c] > 0) addIntimacy(rec, c, o.intimacy[c]);
  return rec;
}

/** @param {AdventureRecord} rec */
export const serializeRecord = (rec) => JSON.stringify(rec);

/** @param {AdventureRecord} rec @param {string} key @param {any} fallback */
function readJSON(rec, key, fallback) { try { const v = JSON.parse(rec.store[key] ?? 'null'); return v ?? fallback; } catch { return fallback; } }
/** @param {AdventureRecord} rec @param {string} key @param {any} value */
function writeJSON(rec, key, value) { rec.store[key] = JSON.stringify(value); }

/**
 * 戦闘に渡す、ブラウザの保存と同じ形の入口（getItem・setItem・removeItem）。書きかえるたびに onChange を呼ぶ（保存のきっかけ）
 * @param {AdventureRecord} rec @param {() => void} [onChange]
 */
export function storeFor(rec, onChange = () => {}) {
  return {
    getItem: (/** @type {string} */ k) => (Object.prototype.hasOwnProperty.call(rec.store, k) ? rec.store[k] : null),
    setItem: (/** @type {string} */ k, /** @type {unknown} */ v) => { rec.store[k] = String(v); onChange(); },
    removeItem: (/** @type {string} */ k) => { delete rec.store[k]; onChange(); },
  };
}

/** @param {AdventureRecord} rec @returns {{ gold:number, exp:Record<string,number> }} */
const inbox = (rec) => { const b = readJSON(rec, FIELD_KEYS.inbox, {}); return { gold: Math.max(0, b.gold || 0), exp: { ...(b.exp || {}) } }; };

/** いまのお金（銅貨の数。戦闘の育ちにあるお金＋まだ受け取っていないお金） @param {AdventureRecord} rec */
export function goldOf(rec) { return Math.max(0, readJSON(rec, GROWTH_KEY, {}).gold || 0) + inbox(rec).gold; }

/** お金を手に入れる（戦闘・メニューが次に開いたときに育ちへ足される） @param {AdventureRecord} rec @param {number} n */
export function giveGold(rec, n) { const b = inbox(rec); b.gold += Math.max(0, Math.round(n)); writeJSON(rec, FIELD_KEYS.inbox, b); }

/** 経験値を手に入れる（レベルの経験値。戦闘・メニューが次に開いたときに足される） @param {AdventureRecord} rec @param {string} who NEXT の名前 @param {number} n */
export function giveExp(rec, who, n) {
  const code = BATTLE_CODE[/** @type {keyof typeof BATTLE_CODE} */ (who)]; if (!code) throw Error(`仲間ではない：${who}`);
  const b = inbox(rec); b.exp[code] = (b.exp[code] || 0) + Math.max(0, Math.round(n)); writeJSON(rec, FIELD_KEYS.inbox, b);
}

/** フィールドで覚えた技（NEXT の名前ごと） @param {AdventureRecord} rec @returns {Record<string,string[]>} */
export function fieldSkills(rec) {
  const s = readJSON(rec, FIELD_KEYS.skills, {}); const out = {};
  for (const [name, code] of Object.entries(BATTLE_CODE)) out[name] = Array.isArray(s[code]) ? [...s[code]] : [];
  return out;
}
/** 技を覚える（フィールドの出来事で）。もう覚えていれば false @param {AdventureRecord} rec @param {string} who @param {string} skill */
export function learnSkill(rec, who, skill) {
  const code = BATTLE_CODE[/** @type {keyof typeof BATTLE_CODE} */ (who)]; if (!code) throw Error(`仲間ではない：${who}`);
  const s = readJSON(rec, FIELD_KEYS.skills, {}); const list = Array.isArray(s[code]) ? s[code] : [];
  if (list.includes(skill)) return false;
  s[code] = [...list, skill]; writeJSON(rec, FIELD_KEYS.skills, s); return true;
}

/** @param {AdventureRecord} rec */
function bondData(rec) {
  const b = readJSON(rec, BOND_KEY, null);
  const out = { bond: { V: 0, F: 0, S: 0, L: 0 }, ev: { V: false, F: false, S: false, L: false } };
  if (b && b.bond) for (const k of Object.keys(out.bond)) { out.bond[k] = Math.max(0, Math.round(b.bond[k] || 0)); out.ev[k] = !!b.ev?.[k]; }
  return out;
}
/** @param {string} who */
const companionCode = (who) => { if (!COMPANIONS.includes(who)) throw Error(`親密度を持たない：${who}`); return BATTLE_CODE[/** @type {keyof typeof BATTLE_CODE} */ (who)]; };
/** 親密度（NEXT の名前ごと） @param {AdventureRecord} rec @returns {Record<string,number>} */
export function intimacyOf(rec) { const b = bondData(rec); return Object.fromEntries(COMPANIONS.map((c) => [c, b.bond[companionCode(c)]])); }
/** その仲間との連携技が、イベントで開いたか（NEXT の名前ごと） @param {AdventureRecord} rec @returns {Record<string,boolean>} */
export function linkOpenOf(rec) { const b = bondData(rec); return Object.fromEntries(COMPANIONS.map((c) => [c, b.ev[companionCode(c)]])); }
/**
 * 親密度を上げる（0〜120）。戦闘の親密度そのものを書きかえる（戦闘で連携技を使ったときと同じ数）。
 * 連携技が開く前でも、フィールドの出来事で上がった分はたまる
 * @param {AdventureRecord} rec @param {string} who @param {number} n
 */
export function addIntimacy(rec, who, n) {
  const c = companionCode(who), b = bondData(rec);
  b.bond[c] = Math.max(0, Math.min(BOND_MAX, b.bond[c] + Math.round(n)));
  writeJSON(rec, BOND_KEY, b); return b.bond[c];
}
/** その仲間とのはじめての連携技を開く（その仲間のイベント・サブクエで。作者の設計）。もう開いていれば false @param {AdventureRecord} rec @param {string} who */
export function openLink(rec, who) {
  const c = companionCode(who), b = bondData(rec);
  if (b.ev[c]) return false;
  b.ev[c] = true; writeJSON(rec, BOND_KEY, b); return true;
}

/** 隊列（NEXT の名前の並び。決めていなければ null） @param {AdventureRecord} rec @returns {string[]|null} */
export function formationOf(rec) {
  const f = readJSON(rec, FIELD_KEYS.formation, null);
  return Array.isArray(f) && f.length && f.every((x) => MEMBERS.includes(x)) ? f : null;
}

/** @param {AdventureRecord} rec @param {string} flag */
export const hasFlag = (rec, flag) => !!rec.flags[flag];

/**
 * 出来事の結果をまとめて記録に書く（マップの出来事の pages[].set・give から）。
 * @param {AdventureRecord} rec
 * @param {{ flags?: Record<string, boolean|number|string>, gold?: number, exp?: Record<string, number>, skills?: {who:string, skill:string}[], intimacy?: Record<string, number>, openLink?: string[] }} eff
 * @returns {string[]} 画面に出すお知らせ（例：「銅貨を50枚手に入れた」）
 */
export function applyEffects(rec, eff) {
  const notes = [];
  for (const [k, v] of Object.entries(eff.flags || {})) rec.flags[k] = v;
  if (eff.gold) { giveGold(rec, eff.gold); notes.push(`銅貨を${eff.gold}枚手に入れた`); }
  for (const [who, n] of Object.entries(eff.exp || {})) { giveExp(rec, who, n); notes.push(`${NAME_JA[who] ?? who}は経験値を${n}手に入れた`); }
  for (const s of eff.skills || []) if (learnSkill(rec, s.who, s.skill)) notes.push(`${NAME_JA[s.who] ?? s.who}は「${s.skill}」を覚えた`);
  for (const who of eff.openLink || []) if (openLink(rec, who)) notes.push(`ナハトと${NAME_JA[who] ?? who}の連携技が開いた`);
  for (const [who, n] of Object.entries(eff.intimacy || {})) { addIntimacy(rec, who, n); notes.push(`${NAME_JA[who] ?? who}との親密度が上がった`); }
  return notes;
}
const NAME_JA = { nacht: 'ナハト', volt: 'ヴォルト', flare: 'フレア', serena: 'セレナ', licht: 'リヒト' };

/**
 * 出来事のページを選ぶ：when の旗がすべて合う最初のページ（when が無いページはいつでも合う）
 * @param {AdventureRecord} rec @param {{ when?: { flags?: Record<string, any> } }[]} pages
 */
export function pickPage(rec, pages) {
  return pages.find((p) => Object.entries(p.when?.flags || {}).every(([k, v]) => (rec.flags[k] ?? false) === v)) || null;
}
