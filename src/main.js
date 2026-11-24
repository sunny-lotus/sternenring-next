// @ts-check
// 起動だけ。部品を組み立てて loop を回す。冒険の記録は src/core/record.js、保存は src/save.js（2026-11-22 作者「NEXTが冒険の記録を持つ」）。
// 描画は2つ：紙の舞台（paper・WebGL）と平面（flat2d・Canvas 2D の予備）。右上のボタンか ?render=flat2d で切りかえる。
import { loadGameData, getJson } from './data.js';
import { InputState } from './core/input.js';
import { createField } from './core/field.js';
import { startLoop } from './core/loop.js';
import { createFlat2d } from './render/flat2d.js';
import { createPaperStage } from './render/paper-stage.js';
import { createThreeStage, RIFFLE } from './render/three-stage.js';
import { bindKeyboard, bindTouchpad } from './ui/controls.js';
import { createCamPanel } from './ui/cam-panel.js';
import { createIntro, shouldPlayIntro, gateInput, startWhenReady, INTRO_TIMING } from './render/book-intro.js';
import { createSound, decideOpenCue, nextLevel, SOUND_LEVELS, OPEN_CUE_DELAY } from './audio/sound.js';
import { createBgm, decideBgm } from './audio/bgm.js';
import { storeFor, formationOf, goldOf, fieldSkills, intimacyOf, linkOpenOf } from './core/record.js';
import { loadRecord, createSaver } from './save.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const params = new URLSearchParams(location.search);

async function boot() {
  // 音の台帳は、ゲームのデータと並べて読む。読めなくても無音で進む（音はゲームの進行に要らない）
  const audioLedger = getJson('data/audio.json').catch(() => ({ sounds: [] }));
  const dialogueP = getJson('data/dialogue.json').catch(() => ({ lines: {} })); // 調べたときの言葉も、はじめに並べて読む
  let day = false; try { day = JSON.parse(loadRecord().store['sr-settings-v1'] || '{}')?.time === 'day'; } catch { day = false; } // 昼の設定なら昼の背景を先に読む
  const d = await loadGameData({ day });
  const boot = { data: performance.now(), stage: 0, map: 0, draw: 0 }; // 起動にかかった時間（?perf=1 で右上に出す。2026-11-23 作者「はじめの読み込みが遅い　クロームでやると」）
  if (d.errors.length) { $('status').textContent = `データに問題があるため起動しません：\n${d.errors.join('\n')}`; $('status').classList.add('error'); return; }
  const input = new InputState({ buffer: d.world.inputBuffer });
  // ?lead=volt など：その仲間を先頭にして動かす（作者が歩きの絵を確かめるため。2026-11-22 作者「ヴォルトだけ動かしたい」）
  const leadId = params.get('lead'), party = leadId && d.ledger.party.some((/** @type {any} */ p) => p.id === leadId)
    ? [...d.ledger.party.filter((/** @type {any} */ p) => p.id === leadId), ...d.ledger.party.filter((/** @type {any} */ p) => p.id !== leadId)] : [...d.ledger.party]; // 台帳の並びは変えない（写しを並べかえる）
  // ?only=volt など：その仲間ひとりだけで歩く（ほかの仲間は出さない。作者「ヴォルト単体を見たい」）
  // 仲間の並びに無い登場人物（台帳の cast。例：フレア）も、?only= で確かめられる
  const onlyId = params.get('only'), people = [...d.ledger.party, ...(d.ledger.cast || [])];
  if (onlyId && people.some((/** @type {any} */ p) => p.id === onlyId)) party.splice(0, party.length, ...people.filter((/** @type {any} */ p) => p.id === onlyId));
  // ?party=nacht,volt,flare,serena など：その順で並べて歩く（見た目の確かめ用。2026-11-22 作者「4人並べてみようか」）。台帳の party は変えない
  const partyIds = (params.get('party') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const picked = partyIds.map((id) => people.find((/** @type {any} */ p) => p.id === id)).filter(Boolean);
  if (picked.length) party.splice(0, party.length, ...picked);
  // 冒険の記録（2026-11-22）：起動したときに読み、戦闘・メニュー（battle/）にはブラウザの保存の代わりにこれを渡す（window.SR_RECORD_STORE）。書きかえたら少しあとに保存
  const record = loadRecord(), saver = createSaver(record);
  /** @type {any} */ (window).SR_RECORD_STORE = storeFor(record, () => saver.schedule());
  window.addEventListener('pagehide', () => saver.now());
  const field = createField({ maps: d.maps, collision: d.collision, world: d.world, party, record, onRecordChange: () => saver.schedule() });
  { // 確かめ用：?warp=test-forest:58,4（,up）で、その場所から始める（開発のときだけ使う URL。カメラの ?cam=1 と同じあつかい）
    const w = (params.get('warp') || '').match(/^([\w-]+):(\d+),(\d+)(?:,(up|down|left|right))?$/);
    if (w) field.warp(w[1], Number(w[2]), Number(w[3]), w[4] || 'up');
  }
  // 調べたときの言葉（仮の文。data/dialogue.json）
  const dialogue = await dialogueP;
  const assets = { ledger: d.ledger, images: d.images, regions: d.regions, style: d.style };
  // カメラ角度の調整パネル（右上の「カメラ」ボタンで開け閉め。?cam=1 なら開いて始まる）。いまのマップの値から始まる
  const camUi = createCamPanel(params, () => d.maps[field.state.mapId]?.stage?.camera);
  const camBtn = $('cam-toggle');
  const syncCamBtn = () => { camBtn.textContent = camUi.isOpen() ? 'カメラ：閉じる' : 'カメラ'; camBtn.setAttribute('aria-pressed', String(camUi.isOpen())); };
  camBtn.addEventListener('click', () => { camUi.setOpen(!camUi.isOpen()); syncCamBtn(); camBtn.blur(); });
  syncCamBtn();

  // 描画の用意。紙の舞台が作れなければ（WebGL 無しなど）平面に落とす
  const flatCanvas = /** @type {HTMLCanvasElement} */ ($('stage')), paperCanvas = /** @type {HTMLCanvasElement} */ ($('paper'));
  /** @type {Record<string, any>} */
  const renderers = { flat2d: createFlat2d(flatCanvas, assets) };
  let paperError = '';
  // 紙の舞台は three.js 版（作者の決定 2026-11-22 14:35：見た目は試作に合わせる）。作れなければ、これまでの素の WebGL 版、それも無理なら平面
  // ?stage=webgl1 で、これまでの素の WebGL 版を見られる（見比べ用）
  try { renderers.paper = params.get('stage') === 'webgl1' ? createPaperStage(paperCanvas, assets) : createThreeStage(paperCanvas, assets); }
  catch (e) { paperError = /** @type {Error} */ (e).message; try { renderers.paper = createPaperStage(paperCanvas, assets); } catch (e2) { paperError += ` / ${/** @type {Error} */ (e2).message}`; } }
  boot.stage = performance.now();
  let mode = params.get('render') === 'flat2d' || !renderers.paper ? 'flat2d' : 'paper';
  let shown = '';
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const [k, r] of Object.entries(renderers)) { const c = k === 'paper' ? paperCanvas : flatCanvas; r.resize(c.clientWidth || window.innerWidth, c.clientHeight || window.innerHeight, dpr); }
  };
  const showMode = () => {
    flatCanvas.hidden = mode !== 'flat2d'; paperCanvas.hidden = mode !== 'paper';
    $('render-toggle').textContent = mode === 'paper' ? '表示：紙の舞台' : '表示：平面';
    shown = ''; fit();
  };
  $('render-toggle').addEventListener('click', () => {
    if (!renderers.paper) { $('status').hidden = false; $('status').textContent = `紙の舞台は使えません：${paperError}`; return; }
    mode = mode === 'paper' ? 'flat2d' : 'paper'; showMode();
  });
  window.addEventListener('resize', fit);
  showMode();
  // 内装の見え方の切りかえ（元絵のまま／ドット絵）。元絵の手ざわりがあるマップ（stage.textures）だけでボタンを出す。保存はしない
  const roomBtn = $('room-toggle');
  const syncRoomUi = () => { const r = renderers.paper; const has = !!d.maps[field.state.mapId]?.stage?.textures && mode === 'paper' && !!r?.setPixelRoom;
    roomBtn.hidden = !has; if (has) { roomBtn.textContent = r.pixelRoom() ? '内装：ドット' : '内装：絵'; roomBtn.setAttribute('aria-label', '内装の見え方（押すと元絵とドット絵が入れかわる）'); } };
  roomBtn.addEventListener('click', () => { const r = renderers.paper; if (!r?.setPixelRoom) return; r.setPixelRoom(!r.pixelRoom()); shown = ''; syncRoomUi(); });

  // 開始演出「飛び出す絵本」（DEV-BOOK-001）。起動したときの最初のマップだけ。紙の舞台のときだけ。
  // - 演出中はフィールドを止め、入力の先行分は捨てる（演出のあとに勝手に歩かない）
  // - 方向の入力・「とばす」・Esc/Enter/Space・画面を触る → すぐ終わる（とばした入力では歩かない。押しつづけていれば、そのまま歩きはじめる）
  // - タブを離れた・表示を切りかえた → 終わった状態にする（戻ったとき演出を待たせない）
  // - ?intro=0 で見せない、?intro=1 で必ず見せる。端末の「動きを抑える」設定のときは見せず、オーブも止める
  // rev4：演出を見せるときは、まず閉じた本の表紙に「タップしてはじめる」（PCはクリック・Enter・Space）を一つ出す。
  //   その一押しで音を有効にしてから本がひらく（ひらく音が絵に合う）。音が使えない・断られた・読めないときも、待ちの上限で無音のまま進む。
  //   一押しは一度だけ。歩行にも「とばす」にも使わない。演出を見せないとき（?intro=0・平面・動きを抑える設定）は表紙も出さない。
  const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const intro = createIntro(shouldPlayIntro({ param: params.get('intro'), reducedMotion, mode }), INTRO_TIMING, { cover: true });
  const skipBtn = $('intro-skip'), coverBtn = $('intro-cover');
  if (window.matchMedia?.('(pointer: coarse)').matches) $('cover-label').textContent = 'タップしてはじめる';
  const syncIntroUi = () => {
    skipBtn.hidden = intro.phase !== 'playing'; coverBtn.hidden = intro.phase !== 'cover';
    document.body.classList.toggle('intro', intro.blocking);
    document.body.classList.toggle('cover', intro.blocking && intro.phase !== 'playing'); // 表紙・開始待ち：十字ボタンを出さない
  };
  // 効果音（DEV-BOOK-001 rev2）。最初の操作で音を有効にする。有効でないあいだの音は捨てる（あとから遅れて鳴らさない）
  // ?mute=1：曲・効果音を「なし」で始める（作者・確認用。あとから右上のボタンで上げられる）
  const startLevel = params.get('mute') === '1' ? 'off' : undefined;
  const ledger = await audioLedger;
  const sound = createSound(ledger, { level: startLevel });
  let openCue = '';
  // 曲（rev3）：効果音とは別の経路・別の音量。マップの割当（data/audio.json の bgmByMap）どおりに流し、開始演出のあいだは流さない
  /** @type {() => void} */ let firstDrawn = () => {};
  const afterFirstDraw = new Promise((res) => { firstDrawn = () => res(undefined); setTimeout(res, 4000); }); // 描けなくても4秒で読みはじめる
  const bgm = createBgm(ledger, { level: startLevel, after: afterFirstDraw });
  const bgmByMap = ledger.bgmByMap || {};
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, () => { sound.unlock(ev); bgm.unlock(ev); }, { capture: true, passive: true });
  const soundBtn = $('sound-toggle');
  const syncSoundUi = () => { const l = SOUND_LEVELS.find((x) => x.id === sound.level); soundBtn.textContent = `音：${l?.label}`; soundBtn.setAttribute('aria-label', `音の大きさ：${l?.label}（押すと変わる）`); };
  soundBtn.addEventListener('click', () => { sound.unlock('sound-button'); sound.setLevel(nextLevel(sound.level)); syncSoundUi(); });
  syncSoundUi();
  const bgmBtn = $('bgm-toggle');
  const syncBgmUi = () => { const l = SOUND_LEVELS.find((x) => x.id === bgm.level); bgmBtn.textContent = `曲：${l?.label}`; bgmBtn.setAttribute('aria-label', `曲の大きさ：${l?.label}（押すと変わる）`); };
  bgmBtn.addEventListener('click', () => { bgm.unlock('bgm-button'); bgm.setLevel(nextLevel(bgm.level)); syncBgmUi(); });
  syncBgmUi();
  // 設定の統一（2026-11-22 作者「設定を統一しよう」）：曲・効果音の大きさ、表示、内装は、メニューの「設定」（フィールドと戦闘で共通）で決め、
  // 冒険の記録の sr-settings-v1 に保存する。起動したとき・メニューで変えたとき（sr-settings）に、ここで当てる。右上はメニューだけにした
  const readSettings = () => { let s = {}; try { s = JSON.parse(record.store['sr-settings-v1'] || '{}') || {}; } catch { s = {}; } return { se: 'mid', bgm: 'mid', render: 'paper', pixelRoom: false, time: 'night', deep: 'riffle', nookin: 'blur', ...s }; };
  const applySettings = () => {
    const s = readSettings(), lv = (/** @type {string} */ v) => (SOUND_LEVELS.some((l) => l.id === v) ? v : 'mid');
    if (params.get('mute') !== '1') { sound.setLevel(lv(s.se)); bgm.setLevel(lv(s.bgm)); syncSoundUi(); syncBgmUi(); }
    if (!params.get('render') && renderers.paper) { const m = s.render === 'flat2d' ? 'flat2d' : 'paper'; if (m !== mode) { mode = m; showMode(); } }
    const r = renderers.paper; if (r?.setPixelRoom && r.pixelRoom() !== !!s.pixelRoom) { r.setPixelRoom(!!s.pixelRoom); shown = ''; }
    if (r?.setDeepStyle) r.setDeepStyle(s.deep);
    if (r?.setNookStyle) r.setNookStyle(s.nookin); // 建物に入るときの演出（開発者の窓で見くらべる。2026-11-23 作者「全部試したい」）
    field.setStepScale(Number(s.walk) || 1); // 歩く速さ（開発者の窓だけ。2026-11-23 作者「移動速度の調整も開発のみできるように」） // 奥へ・手前へ移る演出（開発者の窓で見くらべる。2026-11-23）
    const tm = s.time === 'day' ? 'day' : 'night'; if (r?.setTime && r.time() !== tm) { r.setTime(tm); shown = ''; } // 時間（昼・夜）。変えたらマップを読み直す
    syncRoomUi();
  };
  applySettings();
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stopAll(); bgm.setHidden(document.hidden); });
  const skipIntro = (/** @type {string} */ why) => { if (!intro.blocking) return; if (intro.skip(why, performance.now())) { input.clearQueue(); sound.stop('sfx.book.open'); } syncIntroUi(); };
  // 表紙の開始の一押し（人の操作の中で音を有効にする）。用意を待つのは上限まで。そのあいだにタブ離脱・表示切替で終われば始めない
  // 全画面（2026-11-23 作者「全画面をスマホ用に」）：右上の「全画面」で切りかえ。スマホ（指で触る画面）では、表紙の「はじめる」でそのまま全画面に。
  // 全画面の仕組みが無いブラウザ（iPhone の Safari）と、ホーム画面から開いた（もう全画面の）ときは、ボタンを出さない
  const fsEl = /** @type {any} */ (document.documentElement), fsDoc = /** @type {any} */ (document), fsBtn = $('fs-toggle');
  const fsCan = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const fsOn = () => !!(fsDoc.fullscreenElement || fsDoc.webkitFullscreenElement);
  const fsApp = !!(window.matchMedia?.('(display-mode: fullscreen)').matches || window.matchMedia?.('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone);
  const fsEnter = () => { try { const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch { /* 断られたら、そのまま */ } };
  const fsExit = () => { try { const p = (fsDoc.exitFullscreen || fsDoc.webkitExitFullscreen).call(fsDoc); if (p && p.catch) p.catch(() => {}); } catch { /* そのまま */ } };
  // 全画面のあいだは横向きに（2026-11-23 作者「全画面にしたら横にしてほしい」）。向きを決められるのは全画面のときだけ（Android）。iPhone のブラウザは向きを決められない
  const fsTurn = (/** @type {boolean} */ on) => { try { const o = /** @type {any} */ (screen).orientation; if (!o) return; if (on) { const p = o.lock?.('landscape'); if (p && p.catch) p.catch(() => {}); } else o.unlock?.(); } catch { /* 向きを決められなければ、そのまま */ } };
  const fsSync = () => { fsBtn.hidden = !fsCan || fsApp; fsBtn.textContent = fsOn() ? '全画面をやめる' : '全画面'; fsTurn(fsOn()); };
  fsBtn.addEventListener('click', () => { /** @type {HTMLElement} */ (fsBtn).blur(); if (fsOn()) fsExit(); else fsEnter(); });
  document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync); fsSync();
  const startFromCover = (/** @type {string} */ why) => {
    if (fsCan && !fsApp && !fsOn() && window.matchMedia?.('(pointer: coarse)').matches) fsEnter(); // スマホは、はじめる一押しで全画面に（ブラウザは、押したときだけ全画面を許す）
    if (!intro.press(why, performance.now())) return;
    input.clearQueue(); syncIntroUi();
    const sOk = sound.unlock(why); bgm.unlock(why);
    const ready = sound.level === 'off' ? sOk : sOk.then((ok) => (ok ? sound.ready : ok));
    startWhenReady(ready, INTRO_TIMING.startWaitMs, (w) => { intro.begin(performance.now(), w); syncIntroUi(); });
  };
  coverBtn.addEventListener('click', () => startFromCover('cover-click'));
  skipBtn.addEventListener('click', () => skipIntro('skip-button'));
  paperCanvas.addEventListener('pointerdown', () => skipIntro('skip-tap'));
  window.addEventListener('keydown', (e) => {
    if (!intro.blocking || !(e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) return;
    if (intro.phase === 'cover') { if (e.code !== 'Escape') { e.preventDefault(); startFromCover('cover-key'); } return; }
    e.preventDefault();
    if (!e.repeat) skipIntro('skip-key'); // 押しっぱなしの連打では省略しない
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) skipIntro('hidden'); });
  $('render-toggle').addEventListener('click', () => skipIntro('toggle'));
  syncIntroUi();

  bindKeyboard(input); bindTouchpad($('pad'), input);
  // 言葉の窓（2026-11-22 作者「フィールドの出来事から記録を書きかえる」）：調べた出来事の言葉と、手に入れたもののお知らせ（金の字）。
  // 調べる（Enter・Space・Z・画面の「調べる」）か、窓を押すと閉じる。閉じた同じ押しで、また調べてしまわないようにする
  const msgBox = $('msg'); let msgShownAt = 0;
  // 会話（2026-11-24 作者「イベントや会話、適当に沢山作っといて」）：dialogue.lines の値は1行の文か、行の並び（文字列か {who:話す人, text}）。
  // 押すたびに次の行へ。最後の行で、手に入れたもののお知らせ（金の字）も出す
  /** @type {{who?:string, text:string}[]} */ let msgLines = []; let msgAt = 0; /** @type {string[]} */ let msgNotes = [];
  const esc = (/** @type {string} */ t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || c);
  const drawMsg = () => {
    const l = msgLines[msgAt], last = msgAt >= msgLines.length - 1;
    msgBox.innerHTML = (l?.who ? `<p class="who">${esc(l.who)}</p>` : '') + (l?.text ? `<p>${esc(l.text)}</p>` : '') + (last ? msgNotes.map((n) => `<p class="note">${n}</p>`).join('') : '');
    msgShownAt = performance.now();
  };
  const syncMsg = () => {
    const m = field.state.message;
    if (m && msgBox.hidden) {
      const raw = m.dialogue ? (dialogue.lines?.[m.dialogue] ?? m.dialogue) : '';
      msgLines = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => (typeof x === 'string' ? { text: x } : x)); if (!msgLines.length) msgLines = [{ text: '' }];
      msgAt = 0; msgNotes = m.notes; drawMsg(); msgBox.hidden = false;
      if (m.notes.length) sound.play(PAGE_TURNS[pageCueN++ % PAGE_TURNS.length]);
    } else if (!m && !msgBox.hidden) msgBox.hidden = true;
  };
  const closeMsg = () => {
    if (!field.state.message || performance.now() - msgShownAt < 200) return false;
    if (msgAt < msgLines.length - 1) { msgAt++; drawMsg(); input.takeAction(); return true; } // 次の行へ
    field.closeMessage(); input.takeAction(); msgBox.hidden = true; return true;
  };
  window.addEventListener('keydown', (e) => { if (['Enter', 'Space', 'KeyZ'].includes(e.code) && !e.repeat) closeMsg(); });
  msgBox.addEventListener('pointerdown', (e) => { e.preventDefault(); closeMsg(); });
  $('act-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!closeMsg()) input.pressAction(); });

  // 重さの計測（?perf=1 のときだけ表示）
  const perfEl = $('perf'); perfEl.hidden = params.get('perf') !== '1';
  const perf = { frames: 0, since: performance.now(), fps: 0, worstMs: 0, last: performance.now(), drawMs: 0 };

  let uiPhase = intro.phase;
  const PAGE_TURNS = ['sfx.page.turn01', 'sfx.page.turn02', 'sfx.page.turn03'];
  let pageCueAt = -1, pageCueN = 0;
  let doorCue = '', stepCueAt = 0, lastStep = '', riffleCue = -1;
  const STEP_WOOD = ['sfx.step.wood01', 'sfx.step.wood02', 'sfx.step.wood03', 'sfx.step.wood04'], STEP_SOFT = ['sfx.step.soft01', 'sfx.step.soft02', 'sfx.step.soft03', 'sfx.step.soft04'];
  const STEP_STONE = ['sfx.step.stone01', 'sfx.step.stone02', 'sfx.step.stone03', 'sfx.step.stone04'];
  /** 足もとの足音の種類：木の床のマップは木、町の石畳（stage.paved）の上は石、ほかは布（2026-11-23 作者「石の上の足音使ってみて」） */
  const stepSet = (/** @type {any} */ m, /** @type {number} */ x, /** @type {number} */ y) => m?.footsteps === 'wood' ? STEP_WOOD
    : (m?.stage?.paved || []).some((/** @type {any} */ p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) ? STEP_STONE : STEP_SOFT;
  let loadingMap = false, prefetched = '';
  const draw = async () => {
    const r = renderers[mode];
    if (field.state.mapId !== shown) {
      shown = field.state.mapId; const m = d.maps[shown];
      loadingMap = true; // 読んでいる間は、出入口の演出を進めない（読み終えてから続きを見せる。2026-11-23 作者「飛び出す様子をかくかくしたくない」）
      try { await r.load(m, d.collision); } finally { loadingMap = false; }
      if (!boot.map) boot.map = performance.now();
      $('map-title').textContent = m.title; $('map-badge').hidden = m.status !== 'provisional';
      syncRoomUi();
      camUi?.sync();
      if (mode === 'paper') { intro.shown(performance.now()); syncIntroUi(); }
    }
    { // 去る演出が始まったら、行き先のマップの絵を先に読む（演出のあいだに読み終え、着いたときの待ちを短く）
      const ef = field.view().effect;
      if (ef?.phase === 'leave' && ef.exit) { const to = d.maps[shown]?.exits?.find((/** @type {any} */ e) => e.id === ef.exit)?.to?.map; if (to && to !== prefetched) { prefetched = to; r.prefetch?.(d.maps[to]); } }
      else if (!ef) prefetched = '';
    }
    const t0 = performance.now();
    const pose = intro.pose(t0);
    if (!openCue) { // 本がひらく音：演出の始まりに間に合ったときだけ鳴らす（一度決めたら決め直さない）
      const c = decideOpenCue({ introPhase: intro.phase, introT: pose ? pose.t - OPEN_CUE_DELAY : 0, ctxState: sound.state, loaded: sound.loaded, level: sound.level, already: openCue });
      if (c.decided) openCue = c.play && !sound.play('sfx.book.open', c.offset) ? 'play-failed' : c.reason;
    }
    // ページをめくる音（2026-11-22 作者「ページめくりの音を入れてほしい」）：外どうしの出入口でページがめくれはじめるとき（着いた直後）に、
    // 作者の本の録音3つを順に鳴らす（同じ音が続かないように）。1回の転送で1回だけ
    const ev = field.view().effect;
    if (ev && ev.kind === 'page' && ev.phase === 'arrive' && pageCueAt !== field.state.transfers) {
      pageCueAt = field.state.transfers;
      sound.play(PAGE_TURNS[pageCueN++ % PAGE_TURNS.length]);
    }
    // 奥へ何枚もめくるとき：1枚めくれはじめるごとに、本のページをめくる音（作者の本の録音3つを順に）
    // （2026-11-23 何枚もめくる録音の音も試したが、作者が「もっとめくる」のときの形に戻した）
    if (ev && (ev.kind === 'dive' || ev.kind === 'emerge') && ev.phase === 'arrive' && renderers.paper?.deepStyle?.() === 'riffle') {
      const k = Math.min(RIFFLE.n - 1, Math.floor(ev.p / RIFFLE.gap)), key = field.state.transfers * 100 + k;
      if (ev.p < (RIFFLE.n - 1) * RIFFLE.gap + 0.02 && riffleCue !== key) { riffleCue = key; sound.play(PAGE_TURNS[pageCueN++ % PAGE_TURNS.length]); }
    }
    // 扉と足音（2026-11-23 作者「足音とドアの音など録音したから入れてほしい」）：
    // 扉（id に door がある出入口）を通るとき、離れはじめに開く音、着いた側で閉まる音。1回の転送で1回ずつ
    if (ev && /door|^house-/.test(ev.exit || '')) { // house-NN＝町の家の扉（2026-11-24 作者「入る時の音も入れてね」）
      const key = `${field.state.transfers}:${ev.phase}`;
      if (doorCue !== key) {
        doorCue = key; sound.play(ev.phase === 'leave' ? 'sfx.door.open' : 'sfx.door.close');
        // 玄関の鈴（2026-11-23 作者「ちりんちりんていう音を玄関はいったらいれたい」）：出入口に bell: true がある扉に入るとき、扉が開く音に少し遅れて
        if (ev.phase === 'leave' && d.maps[shown]?.exits?.find((/** @type {any} */ e) => e.id === ev.exit)?.bell) setTimeout(() => sound.play('sfx.door.bell'), 250);
      }
    }
    // 足音：2マスに1回（2026-11-23 作者「足音間隔が狭すぎる」：前は1マスごと）。木の床のマップ（footsteps: wood）は木の足音4つ、ほかは布の足音2つを順に
    if (field.state.steps !== stepCueAt) {
      const n = field.state.steps - stepCueAt; stepCueAt = field.state.steps;
      if (n > 0 && field.state.steps % 2 === 0 && !ev && !field.state.battle) { const me = field.state.actors[0], set = stepSet(d.maps[field.state.mapId], me.x, me.y);
        // ランダムに選ぶ（同じ音は続けない）。高さ ±6%・大きさ ±15% も毎回少し変える（2026-11-23 作者「足音ランダムにしてほしい」）
        let k = Math.floor(Math.random() * set.length); if (set[k] === lastStep && set.length > 1) k = (k + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length;
        lastStep = set[k]; sound.play(set[k], 0, { rate: 0.94 + Math.random() * 0.12, vol: 0.85 + Math.random() * 0.3 }); }
    }
    if (intro.phase !== uiPhase) { uiPhase = intro.phase; syncIntroUi(); } // 最後まで再生して終わったときなど
    const b = decideBgm({ mapId: field.state.mapId, byMap: bgmByMap, current: bgm.wanted, introBlocking: intro.blocking });
    if (b.action !== 'keep' && b.action !== 'none') bgm.want(b.want);
    r.draw(field.view(), { intro: pose, seconds: reducedMotion ? 0 : t0 / 1000 });
    if (boot.map && !boot.draw) { boot.draw = performance.now(); firstDrawn(); console.info(`[perf] 起動 ${(boot.draw / 1000).toFixed(2)}秒：データ ${(boot.data / 1000).toFixed(2)} / 舞台 ${((boot.stage - boot.data) / 1000).toFixed(2)} / 町 ${((boot.map - boot.stage) / 1000).toFixed(2)} / 最初の描画 ${((boot.draw - boot.map) / 1000).toFixed(2)}`); }
    const now = performance.now();
    perf.drawMs = now - t0; perf.frames++; perf.worstMs = Math.max(perf.worstMs, now - perf.last); perf.last = now;
    if (now - perf.since >= 1000) {
      perf.fps = Math.round(perf.frames * 1000 / (now - perf.since));
      if (!perfEl.hidden) {
        const dbg = r.debug();
        perfEl.textContent = `${boot.draw ? `起動${(boot.draw / 1000).toFixed(1)}秒（データ${(boot.data / 1000).toFixed(1)} 舞台${((boot.stage - boot.data) / 1000).toFixed(1)} 町${((boot.map - boot.stage) / 1000).toFixed(1)} 描画${((boot.draw - boot.map) / 1000).toFixed(1)}）
` : ''}${mode}  ${perf.fps}fps  最長${Math.round(perf.worstMs)}ms  描画${perf.drawMs.toFixed(1)}ms${dbg.drawCalls != null ? `  draw${dbg.drawCalls}  板${dbg.boards}` : ''}  内部${(dbg.inner || [dbg.W, dbg.H]).join('×')}`;
      }
      perf.frames = 0; perf.since = now; perf.worstMs = 0;
    }
  };
  // 戦闘（2026-11-22 作者「バトルも入れてみよう」「1で森に敵が見えていて、ぶつかると戦闘」）：見えている敵にぶつかったら、
  // バトル試作（/battle/、試作そのもの）をフィールドの上に重ねて開く。勝ち負けは試作から知らせが来る。上のボタンでフィールドへ戻る
  // （結果が出る前に押すと「逃げる」＝敵は残る。試しのためのボタン）。戦闘中はフィールドの曲を止める
  /** @type {{ box: HTMLElement, outcome: string|null } | null} */
  let battleUi = null;
  let battleClosing = false;
  const closeBattle = () => {
    if (!battleUi) return;
    const outcome = battleUi.outcome === 'win' ? 'win' : battleUi.outcome === 'lose' ? 'lose' : 'escape';
    // 戻る演出（2026-11-22 作者「戦闘結果後はボタンを押すと終了するのも演出を加えて」）：戦闘の画面が明るく光って消え、フィールドが現れる
    // 戦闘はすぐ終わらせる（前は戻る演出の0.7秒のあとに終えていたので、そのあいだに「まだ戦闘中」と見て、同じ戦闘をもう一度開いていた。
    // 2026-11-22 作者「シンボルエンカウントした後に、またバトルになるのはどうして？」）。演出のあいだは歩かない（battleClosing）
    const box = battleUi.box; battleUi = null; box.classList.add('closing'); field.endBattle(outcome); battleClosing = true;
    setTimeout(() => { box.remove(); battleClosing = false; input.releaseAll?.(); input.clearQueue(); bgm.setHidden(false); window.focus(); }, 700);
  };
  // エンカウントの演出（2026-11-22 作者「エンカウントの演出もっとかっこよく」）：白い光と画面のゆれ → フィールドがぐっと寄って色があせる
  // → 金の魔法陣が回りながら広がる → 真ん中から金のひびが走る → 黒い破片が四方から飛びこんで画面をおおう → 戦闘へ（約1.4秒）
  const encounterFx = () => {
    const fx = document.createElement('div'); fx.id = 'enc-fx';
    const ticks = Array.from({ length: 24 }, (_, i) => { const a = i * 15 * Math.PI / 180, r1 = i % 3 ? 78 : 72; return `<line x1="${(Math.cos(a) * r1).toFixed(1)}" y1="${(Math.sin(a) * r1).toFixed(1)}" x2="${(Math.cos(a) * 86).toFixed(1)}" y2="${(Math.sin(a) * 86).toFixed(1)}"/>`; }).join('');
    const cracks = ['50,50 38,30 30,12 22,0', '50,50 66,36 80,30 100,18', '50,50 72,58 88,74 100,82', '50,50 54,72 46,88 50,100', '50,50 30,62 14,60 0,72', '50,50 26,44 10,36 0,30', '50,50 58,24 64,8 70,0', '50,50 40,78 28,92 22,100']
      .map((p) => `<polyline points="${p}"/>`).join('');
    // 破片：真ん中を囲む8つの三角（四方から飛びこむ）
    const P = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50]];
    const shards = P.map((p, i) => { const q = P[(i + 1) % 8]; return `<b style="clip-path:polygon(50% 50%,${p[0]}% ${p[1]}%,${q[0]}% ${q[1]}%);--dx:${(p[0] + q[0] - 100) * 0.9}%;--dy:${(p[1] + q[1] - 100) * 0.9}%;--r:${(i % 2 ? 1 : -1) * (14 + i * 3)}deg;animation-delay:${(0.78 + i * 0.03).toFixed(2)}s"></b>`; }).join('');
    fx.innerHTML = `<div class="ef-flash"></div><svg class="ef-ring" viewBox="-100 -100 200 200"><circle r="92"/><circle r="70" class="thin"/><g>${ticks}</g><path d="M0,-60 L52,30 L-52,30 Z M0,60 L-52,-30 L52,-30 Z" class="thin"/></svg><svg class="ef-crack" viewBox="0 0 100 100" preserveAspectRatio="none">${cracks}</svg><div class="ef-shards">${shards}</div>`;
    document.body.appendChild(fx); document.body.classList.add('encountering');
    setTimeout(() => document.body.classList.remove('encountering'), 1300);
    setTimeout(() => fx.remove(), 1700);
  };
  const openBattle = (/** @type {{battle:string}} */ b) => {
    if (statusUi) { const sb = statusUi; statusUi = null; sb.remove(); } // 開発者の窓・メニューから戦闘を始めたら、窓は閉じる（開いたままだと、戦闘のあと歩けなかった。2026-11-23 作者「逃げたら歩けなくなった」）
    // エンカウントの演出（2026-11-22 作者「エンカウント時の演出も追加」）：白く光ったあと、金のふちの斬撃が3本走って暗転。そのあいだに戦闘を読み込む
    encounterFx();
    const box = document.createElement('div'); box.id = 'battle-overlay';
    box.innerHTML = `<iframe title="戦闘" src="battle/index.html?field=1&enc=${encodeURIComponent(b.battle)}" allow="autoplay; fullscreen"></iframe><button type="button" id="battle-back">逃げる（試し）</button>`;
    box.dataset.wait = '1'; setTimeout(() => { delete box.dataset.wait; }, 1350); // エンカウントの演出が終わるまで、戦闘の画面は見せない（読み込みは先に進める）
    document.body.appendChild(box); battleUi = { box, outcome: null };
    bgm.setHidden(true);
    /** @type {HTMLButtonElement} */ (box.querySelector('#battle-back')).addEventListener('click', closeBattle);
    const fr = /** @type {HTMLIFrameElement} */ (box.querySelector('iframe')); fr.addEventListener('load', () => { box.classList.add('ready'); fr.contentWindow?.focus(); });
  };
  // メニュー（2026-11-22 作者「ステータスメニューを追加」→「ステータスだけじゃなくて、メニューをつけて」「技の書とか」）：右上の「メニュー」ボタン（キーボードは M）で、
  // バトル試作のメニューのページ（?field=1&page=menu：ステータス・アイテム・技の書・設定・遊び方）をフィールドの上に開く。戦闘で育った分は同じ画面の保存から読むので、戦闘とつながる。開いているあいだフィールドは止まる
  // 隊列（2026-11-22 作者「仲間の隊列を組めるようにして、その通りの順番で並ぶ」）：メニューの「隊列」で決めた順に、仲間（台帳の party と cast）が並んで歩く。
  // 並びは冒険の記録にある（メニューの「隊列」が書きかえ、sr-formation で知らせてくる）。起動したときは記録から読む。?only・?party で決めたときは使わない
  // 開発者メニュー（2026-11-22 作者「開発者メニューを作ってほしい」）：メニューの「開発者」からの知らせを、フィールドで行う
  const posEl = $('dev-pos');
  let showPos = false;
  /** @param {any} m */
  const devAction = (m) => {
    if (m.action === 'warp') { if (!statusUi?.classList.contains('devwin')) closeStatus(); field.dev.warp(m.value); }
    else if (m.action === 'fight') { closeStatus(); setTimeout(() => field.dev.fight(m.value), 550); }
    else if (m.action === 'random') field.dev.setNoRandom(m.off);
    else if (m.action === 'revive') field.dev.reviveFoes();
    else if (m.action === 'retry') { for (const k of ['tryHerbs', 'tryCamp', 'tryStone']) delete record.flags[k]; saver.schedule(); }
    else if (m.action === 'pos') { showPos = !!m.on; posEl.hidden = !showPos; }
    else if (m.action === 'reset') { for (const k of Object.keys(record.store)) delete record.store[k]; for (const k of Object.keys(record.flags)) delete record.flags[k]; record.store['sr-dev-fresh'] = '1'; saver.now(); location.reload(); }
  };
  const applyFormation = (/** @type {unknown} */ order) => {
    if (onlyId || params.get('party') || !Array.isArray(order)) return;
    const list = order.map((id) => people.find((/** @type {any} */ p) => p.id === id)).filter(Boolean);
    if (list.length) field.setParty(list);
  };
  applyFormation(formationOf(record));
  /** @type {HTMLElement | null} */
  let statusUi = null;
  // 本のページをめくるように開く・閉じる（2026-11-22 作者「本をめくるみたいな演出を入れてほしい、メニューでも」）
  // 音（2026-11-22 作者「メニューも開く音、めくる音3種類、閉じる音使ってよ」）：開く＝本がひらく音、ページを移る＝めくる音3つを順に、閉じる＝本を閉じる音
  const closeStatus = () => { if (!statusUi) return; const box = statusUi; statusUi = null; box.classList.add('closing'); sound.play('sfx.book.close'); setTimeout(() => { box.remove(); input.releaseAll?.(); input.clearQueue(); window.focus(); }, 520); };
  /** @param {string} [startPage] 開いてすぐ出すページ（'fdev'＝開発者） */
  const openStatus = (startPage) => {
    if (statusUi && startPage) { if (!statusUi.classList.contains('devwin')) goMenuPage(startPage); return; } // もう開いていれば、そのページへ
    if (statusUi || battleUi || field.state.battle || intro.blocking) return;
    sound.unlock('menu'); sound.play('sfx.book.open');
    const box = document.createElement('div'); box.id = 'battle-overlay'; box.className = 'status';
    const win = startPage === 'fdev'; // 開発者は、うしろの画面が見える半透明の窓
    if (win) box.classList.add('devwin');
    box.innerHTML = `<iframe title="メニュー" src="battle/index.html?field=1&page=${win ? 'fdev' : 'menu'}"></iframe><button type="button" id="battle-back" class="done">閉じる</button>`;
    if (startPage && !win) box.dataset.start = startPage;
    document.body.appendChild(box); statusUi = box;
    /** @type {HTMLButtonElement} */ (box.querySelector('#battle-back')).addEventListener('click', closeStatus);
    const fr = /** @type {HTMLIFrameElement} */ (box.querySelector('iframe')); fr.addEventListener('load', () => { box.classList.add('ready'); fr.contentWindow?.focus(); });
  };
  $('status-toggle').addEventListener('click', () => { /** @type {HTMLElement} */ ($('status-toggle')).blur(); openStatus(); });
  window.addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && !e.repeat) openStatus(); });
  // 開発者メニューは、いつでも開ける（2026-11-22 作者「開発者メニューはいつでも開けるようにしておきたい。ショートカットキーでもボタンでも」）：F2・右上の「開発」
  /** メニューの中のページへ移る（メニューのボタンを押したのと同じ） @param {string} page */
  const goMenuPage = (page) => { try { const d = /** @type {HTMLIFrameElement} */ (statusUi?.querySelector('iframe')).contentDocument; /** @type {HTMLElement|null} */ (d?.querySelector(`#pg-menu [data-page="${page}"]`))?.click(); } catch { /* まだ読みこみ中 */ } };
  window.addEventListener('keydown', (e) => { if (e.key === 'F2' && !e.repeat) { e.preventDefault(); openStatus('fdev'); } });
  $('dev-toggle').addEventListener('click', () => { /** @type {HTMLElement} */ ($('dev-toggle')).blur(); openStatus('fdev'); });
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.type === 'sr-battle-close') { const fromBattle = !!battleUi && ev.source === /** @type {HTMLIFrameElement|null} */ (battleUi.box.querySelector('iframe'))?.contentWindow; if (fromBattle) closeBattle(); else if (statusUi) closeStatus(); else if (battleUi) closeBattle(); return; } // 送ってきた画面を閉じる（2026-11-23 作者「バトルで逃げたら歩けなくなった」：開発者の窓が開いたままだと、戦闘ではなく窓のほうを閉じていた） // メニューを閉じる／戦闘の結果の「フィールドへ戻る」
    if (ev.data?.type === 'sr-settings') { applySettings(); return; } // メニューの「設定」で変えた
    if (ev.data?.type === 'sr-dev') { devAction(ev.data); return; } // 開発者メニュー
    if (ev.data?.type === 'sr-dev-open') { openStatus('fdev'); return; } // メニューの中で F2
    if (ev.data?.type === 'sr-open-camera') { if (!statusUi?.classList.contains('devwin')) closeStatus(); camUi.setOpen(true); syncCamBtn(); return; } // 設定の「カメラの角度を調整する」
    if (ev.data?.type === 'sr-fullscreen') { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => {}); return; }
    if (ev.data?.type === 'sr-formation') { applyFormation(ev.data.order); return; } // 隊列（メニューで変えたとき・起動したとき）
    if (ev.data?.type === 'sr-field-page') { if (statusUi) sound.play(PAGE_TURNS[pageCueN++ % PAGE_TURNS.length]); return; } // メニューの中でページを移った
    if (ev.data?.type === 'sr-field-ready') { for (const b of document.querySelectorAll('#battle-overlay')) b.classList.add('ready'); if (statusUi?.dataset.start) { const p = statusUi.dataset.start; delete statusUi.dataset.start; setTimeout(() => goMenuPage(p), 0); } return; } // 試作が切りかえ終わったら見せる（タイトルを一瞬見せない）
    if (!battleUi || ev.data?.type !== 'sr-battle-result') return;
    battleUi.outcome = ev.data.outcome;
    const btn = /** @type {HTMLButtonElement} */ (battleUi.box.querySelector('#battle-back')); btn.textContent = 'フィールドへ戻る'; btn.classList.add('done');
  });
  // 演出中は歩かない。方向の入力が来たら演出を終える（その入力では歩かない）。ステータスを開いているあいだも歩かない
  startLoop((dt) => { syncMsg(); if (showPos) { const a = field.state.actors[0]; posEl.textContent = `${field.state.mapId}  (${a.x}, ${a.y})  ${a.dir}`; } if (field.state.battle && !battleUi && !battleClosing) openBattle(field.state.battle); if (statusUi || battleClosing) { input.clearQueue(); return; } if (loadingMap) return; if (gateInput(intro, input, skipIntro, dt)) field.update(dt, input); }, () => { draw(); });
  $('status').hidden = true;
  // 確認用の読み取り口（状態を書きかえない）。検証役・自動確認がマップと位置を読むために使う。
  window.STERNENRING_NEXT = Object.freeze({
    view: () => structuredClone(field.view()),
    stats: () => ({ steps: field.state.steps, transfers: field.state.transfers, log: structuredClone(field.state.transferLog) }),
    renderer: () => ({ mode, paperError, fps: perf.fps, ...renderers[mode].debug() }),
    input: () => ({ held: input.held(), pending: input.pending() }),
    intro: () => ({ ...intro.snapshot(), blocking: intro.blocking, reducedMotion }),
    sound: () => ({ ...sound.snapshot(), openCue }),
    record: () => ({ gold: goldOf(record), flags: { ...record.flags }, intimacy: intimacyOf(record), linkOpen: linkOpenOf(record), skills: fieldSkills(record), formation: formationOf(record), keys: Object.keys(record.store), save: saver.info }),
    bgm: () => bgm.snapshot(),
  });
}

boot().catch((e) => { $('status').textContent = `起動できません：${e.message}`; $('status').classList.add('error'); });
