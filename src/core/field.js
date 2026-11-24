// @ts-check
// フィールドの場面：マス移動・衝突・追従・出入口の転送。描画にも DOM にも依存しない。
import { DIR_VEC, mapQuery } from './map.js';
import { placeFollower, pushTrail, dirBetween } from './party.js';
import { pickPage, applyEffects } from './record.js';

/**
 * @typedef {{ id:string, x:number, y:number, dir:string, from:{x:number,y:number}|null, t:number, animMs:number }} Actor
 */

/**
 * @param {{ maps: Record<string, any>, collision: any, world: any, party: {id:string}[], record?: import("./record.js").AdventureRecord, onRecordChange?: () => void, rng?: () => number }} data
 */
export function createField(data) {
  const baseStepMs = data.world.stepMs ?? 160;
  let stepMs = baseStepMs; // 1マス歩く時間。開発者の窓の「歩く速さ」で短くできる（setStepScale）
  const RUN = 0.55; let curStep = stepMs; // 走っている間（input.run）は 1マスの時間を 0.55倍に（2026-11-23 作者「SHIFTで早く動けるようにしてほしい」）
  const transitionMs = data.world.transitionMs ?? 240;
  /** @type {Record<string, {leaveMs:number, arriveMs:number}>} 出入口の演出の長さ（data/world.json の effects） */
  const effects = data.world.effects ?? {};
  const queries = Object.fromEntries(Object.entries(data.maps).map(([id, m]) => [id, mapQuery(m, data.collision)]));

  const state = {
    mapId: data.world.start.map,
    /** @type {Actor[]} */ actors: [],
    /** @type {{x:number,y:number}[]} */ trail: [],
    /** 転送直後の暗転の残り時間（この間は入力を受けない） */ transitionLeft: 0,
    steps: 0,
    transfers: 0,
    /** @type {{from:string,to:string,exit:string}[]} */ transferLog: [],
    /** @type {{exit:any, kind:string, left:number, total:number}|null} 演出のある出入口を踏んで、転送を待っているあいだ */ leaving: null,
    /** @type {string|null} 着いたときの演出の種類（演出なしの転送は null） */ arriveKind: null,
    transitionTotal: 0,
    /** @type {string|null} 転送したときに出た向き */ arriveDir: null,
    /** @type {{id:string, battle:string, mapId:string, random?:boolean}|null} いま戦闘中の敵（見えている敵か、ランダム。このあいだフィールドは止まる） */ battle: null,
    /** 街道の外を、前の戦闘から歩いた歩数（ランダムの戦闘に使う） */ wildSteps: 0,
    /** 開発者メニュー：ランダムの戦闘を起こさない */ devNoRandom: false,
    /** @type {string|null} 逃げた・負けたばかりの見えている敵（1歩動くまで戦わない） */ foeRest: null,
    /** @type {{ event:string, dialogue:string|null, notes:string[] }|null} 調べた出来事の言葉（出ているあいだフィールドは止まる） */ message: null,
    /** @type {string[]} 倒した見えている敵（"マップ:敵の id"） */ defeated: [],
    /** @type {{id:string, mapId:string, outcome:string}[]} 戦闘の記録 */ battles: [],
    /** @type {Record<string, string>} 話しかけた町の人の向き（話すと主人公のほうを向く。マップが変わると元に戻る） */ npcFace: {},
  };
  // 町の人（2026-11-24 作者「イベントや会話、適当に沢山作っといて」）：マップの npcs。立っているマスは通れない。向かいあって調べると話す（pages は出来事と同じ形）
  /** @param {number} x @param {number} y */
  const npcAt = (x, y) => (data.maps[state.mapId].npcs || []).find((/** @type {any} */ n) => n.x === x && n.y === y) || null;
  const OPP = /** @type {Record<string,string>} */ ({ up: 'down', down: 'up', left: 'right', right: 'left' });

  /** @param {string} mapId @param {{x:number,y:number,dir:string}} at */
  /** @param {string} mapId @param {any} at @param {{dx:number,dy:number}[]} [keep] 仲間の、主人公からの位置（そのまま並べたいとき） */
  function placeParty(mapId, at, keep) {
    state.mapId = mapId;
    const q = queries[mapId];
    const lead = { id: data.party[0].id, x: at.x, y: at.y, dir: at.dir, from: null, t: 0, animMs: 0 };
    // 仲間は1人ずつ、前の人のうしろ（だめなら横）の空いたマスに並ぶ（2026-11-24 5人になって、前は全員が主人公のうしろの同じマスに重なっていた）
    /** @type {{x:number,y:number}[]} */ const taken = [{ x: at.x, y: at.y }];
    const followers = data.party.slice(1).map((p, i) => {
      const k = keep?.[i], kx = k ? at.x + k.dx : 0, ky = k ? at.y + k.dy : 0;
      let pos = k && q.passable(kx, ky) && !taken.some((t) => t.x === kx && t.y === ky) ? { x: kx, y: ky } : null; // 同じ並び（立てない所なら、いつもの置き方）
      if (!pos) { for (let j = taken.length - 1; j >= 0 && !pos; j--) { const c = placeFollower(q, { ...taken[j], dir: at.dir }, taken); if (!taken.some((t) => t.x === c.x && t.y === c.y)) pos = c; } }
      if (!pos) pos = taken[taken.length - 1]; // どこも空いていなければ、すぐ前の人と重なる（前と同じ）
      taken.push(pos);
      return { id: p.id, x: pos.x, y: pos.y, dir: at.dir, from: null, t: 0, animMs: 0 };
    });
    state.actors = [lead, ...followers]; state.npcFace = {};
    state.trail = followers.map((f) => ({ x: f.x, y: f.y }));
  }

  const startSpawn = data.maps[state.mapId].spawns[data.world.start.spawn ?? 'default'];
  placeParty(state.mapId, startSpawn);

  /** まだ倒していない、見えている敵（そのマスにいれば） @param {number} x @param {number} y */
  function encounterAt(x, y) {
    const list = data.maps[state.mapId].encounters || [];
    return list.find((/** @type {any} */ e) => e.x === x && e.y === y && !state.defeated.includes(`${state.mapId}:${e.id}`) && state.foeRest !== `${state.mapId}:${e.id}`) || null;
  }
  /**
   * 戦闘が終わったら呼ぶ。win なら、その敵を倒したことにする（そのマスは通れるようになり、板も消える）。lose・escape なら敵は残る
   * @param {'win'|'lose'|'escape'} outcome
   */
  function endBattle(outcome) {
    const b = state.battle; if (!b) return;
    if (outcome === 'win' && !b.random) state.defeated.push(`${b.mapId}:${b.id}`); // ランダムの戦闘は、倒しても何も残らない
    state.battles.push({ id: b.id, mapId: b.mapId, outcome });
    state.battle = null;
    // 戦闘のすぐあとに、また戦闘にならないように（2026-11-22 作者「シンボルエンカウントした後に、またバトルになるのはどうして？」）：
    // ランダムの戦闘の歩数は、どの戦闘のあとも0から数え直す。逃げた・負けた見えている敵は、1歩動くまでぶつかっても戦わない
    state.wildSteps = 0;
    state.foeRest = outcome !== 'win' && !b.random ? `${b.mapId}:${b.id}` : null;
  }

  // ランダムの戦闘（2026-11-22 作者「街道の上はシンボルエンカウントのみ、街道以外ではランダムで、シンボルもあるときがある」）：
  // マップの randomEncounters があるとき、街道（マップの roads）の外を歩いた歩数を数え、minSteps 歩をこえたら1歩ごとに rate の確率で戦闘。
  // 乱数は決まった種から（同じ歩き方なら同じ結果。テストのため）。data.rng を渡せば差しかえられる
  let seed = 0x5eed1234;
  const rng = data.rng || (() => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  /** 街道の上か @param {string} mapId @param {number} x @param {number} y */
  const onRoad = (mapId, x, y) => (data.maps[mapId].roads || []).some((/** @type {any} */ r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  function randomEncounter() {
    const m = data.maps[state.mapId], re = m.randomEncounters, p = player();
    if (!re || state.devNoRandom || onRoad(state.mapId, p.x, p.y)) return false;
    state.wildSteps++;
    if (state.wildSteps < (re.minSteps ?? 8) || rng() >= (re.rate ?? 0.08)) return false;
    const list = re.battles || [];
    state.battle = { id: 'random', battle: list[Math.floor(rng() * list.length)] || 'normal', mapId: state.mapId, random: true };
    state.wildSteps = 0;
    return true;
  }

  /**
   * 調べる（2026-11-22 作者「フィールドの出来事から記録を書きかえる：サブクエの完了で技を覚える、会話で親密度が上がる」）：
   * 向いている先のマス（無ければ立っているマス）の出来事（trigger: examine）を、冒険の記録の旗でページを選んで動かし、
   * ページの set（旗）・give（お金・経験値・技・親密度）を記録に書く。言葉とお知らせは state.message に出す
   */
  function examine() {
    const p = player(), [dx, dy] = DIR_VEC[p.dir] || [0, 0], rec = data.record;
    const list = (data.maps[state.mapId].events || []).filter((/** @type {any} */ e) => (e.trigger || 'examine') === 'examine');
    const npc = npcAt(p.x + dx, p.y + dy);
    const ev = (npc && npc.pages ? { id: 'npc:' + npc.id, pages: npc.pages } : null) || list.find((/** @type {any} */ e) => e.x === p.x + dx && e.y === p.y + dy) || list.find((/** @type {any} */ e) => e.x === p.x && e.y === p.y);
    if (!ev || !rec) return false;
    if (npc && npc.pages && npc.turn !== false) state.npcFace[npc.id] = OPP[p.dir]; // 話すと、こちらを向く
    const page = pickPage(rec, ev.pages); if (!page) return false;
    const notes = applyEffects(rec, { ...(page.give || {}), flags: { ...(page.set?.flags || {}) } });
    state.message = { event: ev.id, dialogue: page.dialogue || null, notes };
    data.onRecordChange?.();
    return true;
  }
  /** 言葉を閉じる（画面の係が呼ぶ） */
  function closeMessage() { state.message = null; }

  const player = () => state.actors[0];
  const moving = () => player().from !== null;

  /** 1歩を始める（プレイヤーと仲間を同時に）。通れなければ向きだけ変える。 @param {string} dir @param {number} carry */
  function tryStep(dir, carry) {
    const p = player();
    p.dir = dir;
    const [dx, dy] = DIR_VEC[dir];
    const nx = p.x + dx, ny = p.y + dy;
    // 見えている敵（マップの encounters）：まだ倒していない敵のマスへ進もうとすると戦闘になる（2026-11-22 作者「森に敵が見えていて、ぶつかると戦闘」）
    const foe = encounterAt(nx, ny);
    if (foe) { state.battle = { id: foe.id, battle: foe.battle, mapId: state.mapId }; return false; }
    if (npcAt(nx, ny)) return false; // 町の人のマスは通れない
    if (!queries[state.mapId].passable(nx, ny)) return false;
    // 高さが1段より大きくちがうマスへは歩けない（2階の通路へは階段からだけ上がれる。2026-11-22）
    if (Math.abs(queries[state.mapId].heightAt(nx, ny) - queries[state.mapId].heightAt(p.x, p.y)) > 1) return false;
    state.foeRest = null; // 1歩動いたら、逃げた敵ともまた戦える
    const from = { x: p.x, y: p.y };
    p.from = from; p.x = nx; p.y = ny; p.t = carry;
    pushTrail(state.trail, from, state.actors.length - 1);
    state.actors.slice(1).forEach((f, i) => {
      const target = state.trail[i];
      if (!target || (target.x === f.x && target.y === f.y)) return;
      const d = dirBetween(f, target);
      if (d) f.dir = d;
      f.from = { x: f.x, y: f.y }; f.x = target.x; f.y = target.y; f.t = carry;
    });
    state.steps++;
    return true;
  }

  /** 歩き終えたマスが出入口なら転送する @returns {boolean} */
  function checkExit() {
    const p = player();
    const exit = queries[state.mapId].exitAt(p.x, p.y);
    if (!exit) return false;
    // 出入口の演出（2026-11-22 作者の決定）：page＝外どうしでページをめくる／nook-in・nook-out＝建物・ダンジョンに入る・出る。
    // 演出のある出入口は、まず「離れる」時間（入力を受けない）を置いてから転送し、着いたあとは「着く」時間（入力を受けない）を置く
    const ef = exit.effect ? effects[exit.effect] : null;
    // 広い出入口（span）では、出入口のどのマスから出たか（lane）を覚えて、着いた先でも同じ列に着く
    const lane = exit.dir === 'left' || exit.dir === 'right' ? p.y - exit.y : p.x - exit.x;
    if (ef) { state.leaving = { exit, kind: exit.effect, left: ef.leaveMs, total: ef.leaveMs, lane, at: { x: p.x, y: p.y } }; return true; }
    transfer(exit, null, lane);
    return true;
  }
  /** @param {any} exit @param {string|null} kind @param {number} [lane] 広い出入口のどの列から出たか */
  function transfer(exit, kind, lane = 0) {
    const fromMap = state.mapId;
    // 着く先の出入口も広ければ、同じ列に着く（通れなければ、いつもの着く位置）
    const back = (data.maps[exit.to.map].exits || []).find((/** @type {any} */ b) => b.id === exit.to.exit), a = exit.to.arrive;
    let at = a;
    if (lane > 0 && back && (back.span || 1) > lane) {
      const vert = back.dir === 'left' || back.dir === 'right', cand = vert ? { ...a, y: a.y + lane } : { ...a, x: a.x + lane };
      if (queries[exit.to.map].passable(cand.x, cand.y) && !queries[exit.to.map].exitAt(cand.x, cand.y)) at = cand;
    }
    // 建物に出入りするときは、外と同じ並び・同じ向きのまま（2026-11-23 作者「ほかのキャラが瞬間移動しています。同じ並び、同じ向きでそのまま」）
    // 向きが変わる扉（左の壁の扉など）では、並びも同じだけ回す（2026-11-23 作者「左の部屋から出てくるときは工夫が必要だね」：前は並びが変わって見えた）
    const prev = state.actors, D4 = ['up', 'right', 'down', 'left'], i0 = prev[0] ? D4.indexOf(prev[0].dir) : -1, i1 = D4.indexOf(at.dir);
    const turns = i0 >= 0 && i1 >= 0 ? (i1 - i0 + 4) % 4 : -1;
    const rot = (/** @type {number} */ dx, /** @type {number} */ dy) => { for (let n = 0; n < turns; n++) [dx, dy] = [-dy, dx]; return { dx, dy }; }; // 右回りに turns 回
    const keep = (kind === 'nook-in' || kind === 'nook-out') && turns >= 0 ? prev.slice(1).map((f) => rot(f.x - prev[0].x, f.y - prev[0].y)) : undefined;
    placeParty(exit.to.map, at, keep);
    state.transfers++;
    state.transferLog.push({ from: fromMap, to: exit.to.map, exit: exit.id });
    state.arriveKind = kind;
    state.arriveDir = exit.dir || null; // 出た向き（ページをめくる向きに使う：右へ出たら右から、左へ出たら左から。2026-11-22 作者）
    state.transitionLeft = kind ? effects[kind].arriveMs : transitionMs;
    state.transitionTotal = state.transitionLeft;
  }

  /**
   * 固定刻みの更新。
   * @param {number} dt ミリ秒
   * @param {import('./input.js').InputState} input
   */
  function update(dt, input) {
    if (state.battle) { input.clearQueue(); return; } // 戦闘中はフィールドを止める
    if (state.message) { input.clearQueue(); input.takeAction?.(); return; } // 言葉が出ているあいだも止める（閉じるのは画面の係：closeMessage）
    if (state.leaving) { // 出入口の演出の「離れる」あいだ
      state.leaving.left = Math.max(0, state.leaving.left - dt);
      input.clearQueue();
      if (state.leaving.left <= 0) { const l = state.leaving; state.leaving = null; transfer(l.exit, l.kind, l.lane); }
      return;
    }
    if (state.transitionLeft > 0) {
      state.transitionLeft = Math.max(0, state.transitionLeft - dt);
      input.clearQueue(); // 暗転中の連打で扉へ戻らないように捨てる
      return;
    }
    let carry = 0;
    if (!moving()) curStep = input.run ? stepMs * RUN : stepMs; // 1歩の途中では変えない（位置が跳ねないように）
    if (moving()) {
      for (const a of state.actors) if (a.from) { a.t += dt; a.animMs += dt * stepMs / curStep; } // 走るときは足も速く
      const p = player();
      if (p.t < curStep) return;
      carry = Math.min(p.t - curStep, curStep);
      curStep = input.run ? stepMs * RUN : stepMs;
      for (const a of state.actors) if (a.from) { a.from = null; a.t = 0; }
      if (checkExit()) { input.clearQueue(); return; }
      if (randomEncounter()) { for (const a of state.actors) a.animMs = 0; input.clearQueue(); return; }
    }
    if (input.takeAction?.() && examine()) { input.clearQueue(); return; }
    const dir = input.next();
    if (!dir) { for (const a of state.actors) a.animMs = 0; return; }
    if (!tryStep(dir, carry)) for (const a of state.actors) a.animMs = 0;
  }

  /** 描画用の読み取り専用の見え方（補間した位置） */
  function view() {
    return {
      mapId: state.mapId,
      battle: state.battle ? { ...state.battle } : null,
      message: state.message ? { ...state.message, notes: [...state.message.notes] } : null,
      defeated: [...state.defeated],
      transition: state.arriveKind || !transitionMs ? 0 : state.transitionLeft / transitionMs,
      // 出入口の演出：kind（page / nook-in / nook-out）、phase（leave＝転送の前・arrive＝転送のあと）、p（0→1）、at（踏んだ出入口のマス）
      effect: state.leaving
        ? { kind: state.leaving.kind, phase: 'leave', p: 1 - state.leaving.left / (state.leaving.total || 1), at: state.leaving.at || { x: state.leaving.exit.x, y: state.leaving.exit.y }, exit: state.leaving.exit.id }
        : state.arriveKind && state.transitionLeft > 0 ? { kind: state.arriveKind, phase: 'arrive', p: 1 - state.transitionLeft / (state.transitionTotal || 1), at: null, dir: state.arriveDir, exit: state.transferLog.at(-1)?.exit ?? null } : null, // exit：通った出入口の id（扉の音に使う）
      // きらきら光る所（2026-11-24 作者「きらきら光るオーブがあるところはアイテムが隠されているとかも」）：出来事に sparkle があり、その旗がまだ立っていない所
      sparkles: (data.maps[state.mapId].events || []).filter((/** @type {any} */ e) => e.sparkle && !(data.record?.flags?.[e.sparkle.flag])).map((/** @type {any} */ e) => ({ id: e.id, x: e.x, y: e.y })),
      npcs: (data.maps[state.mapId].npcs || []).map((/** @type {any} */ n) => ({ id: n.id, sprite: n.sprite, tone: n.tone, x: n.x, y: n.y, dir: state.npcFace[n.id] || n.dir || 'down' })),
      actors: state.actors.map((a) => {
        const k = a.from ? Math.min(1, a.t / curStep) : 1;
        const fx = a.from ? a.from.x : a.x, fy = a.from ? a.from.y : a.y;
        return { id: a.id, x: fx + (a.x - fx) * k, y: fy + (a.y - fy) * k, tileX: a.x, tileY: a.y, dir: a.dir, motion: a.from ? 'walk' : 'idle', animMs: a.animMs };
      }),
    };
  }

  /**
   * 仲間の並び（隊列）を変える（2026-11-22 作者「仲間の隊列を組めるようにして、その通りの順番で並ぶ」）。先頭がいまの場所に立ち、後ろはその後ろに並びなおす
   * @param {{id:string}[]} list
   */
  function setParty(list) {
    if (!list.length || state.battle) return;
    const p = player();
    data.party = list;
    placeParty(state.mapId, { x: p.x, y: p.y, dir: p.dir });
  }

  // 開発者メニュー（2026-11-22 作者「開発者メニューを作ってほしい」）
  const dev = {
    /** マップの始まりの位置へ飛ぶ（演出なし） @param {string} mapId @param {string} [spawn] */
    warp(mapId, spawn = 'default') {
      const m = data.maps[mapId]; if (!m || state.battle || state.leaving) return false;
      const at = m.spawns?.[spawn] || Object.values(m.spawns || {})[0]; if (!at) return false;
      placeParty(mapId, at); state.message = null; state.arriveKind = null; state.transitionLeft = transitionMs; state.transitionTotal = transitionMs; state.transfers++;
      state.transferLog.push({ from: '(dev)', to: mapId, exit: '(dev)' });
      return true;
    },
    /** その場で戦闘を始める @param {string} battle */
    fight(battle) { if (state.battle) return false; state.battle = { id: 'dev', battle, mapId: state.mapId, random: true }; return true; },
    /** ランダムの戦闘を起こさない（true）／起こす @param {boolean} off */
    setNoRandom(off) { state.devNoRandom = !!off; state.wildSteps = 0; },
    /** 倒した見えている敵を、すべて元に戻す */
    reviveFoes() { state.defeated = []; },
  };

  return {
    state, update, view, endBattle, setParty, closeMessage, dev, transitionMs,
    get stepMs() { return stepMs; },
    /** 歩く速さの倍率（1＝ふつう。開発用。2026-11-23 作者「急ぎたいように」） @param {number} k */
    /** 確かめ用のワープ（?warp=マップ:x,y[,向き]。2026-11-23 作者「テストの時ワープとか使ったら？」）。行けないマスなら何もしない @param {string} mapId @param {number} x @param {number} y @param {string} [dir] */
    warp(mapId, x, y, dir = 'up') { if (!data.maps[mapId] || !queries[mapId].passable(x, y)) return false; state.leaving = null; state.transitionLeft = 0; state.arriveKind = null; placeParty(mapId, { x, y, dir }); return true; },
    setStepScale(k) { stepMs = baseStepMs / Math.max(0.5, Math.min(4, Number(k) || 1)); },
  };
}
