// @ts-check
// 起動だけ。部品を組み立てて loop を回す。永続保存なし（ブラウザの保存領域を読み書きしない。保存は P3 から）。
// 描画は2つ：紙の舞台（paper・WebGL）と平面（flat2d・Canvas 2D の予備）。右上のボタンか ?render=flat2d で切りかえる。
import { loadGameData } from './data.js';
import { InputState } from './core/input.js';
import { createField } from './core/field.js';
import { startLoop } from './core/loop.js';
import { createFlat2d } from './render/flat2d.js';
import { createPaperStage } from './render/paper-stage.js';
import { createThreeStage } from './render/three-stage.js';
import { bindKeyboard, bindTouchpad } from './ui/controls.js';
import { createCamPanel } from './ui/cam-panel.js';
import { createIntro, shouldPlayIntro, gateInput, startWhenReady, INTRO_TIMING } from './render/book-intro.js';
import { createSound, decideOpenCue, nextLevel, SOUND_LEVELS } from './audio/sound.js';
import { createBgm, decideBgm } from './audio/bgm.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const params = new URLSearchParams(location.search);

async function boot() {
  // 音の台帳は、ゲームのデータと並べて読む。読めなくても無音で進む（音はゲームの進行に要らない）
  const audioLedger = fetch('data/audio.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { sounds: [] }), () => ({ sounds: [] }));
  const d = await loadGameData();
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
  const field = createField({ maps: d.maps, collision: d.collision, world: d.world, party });
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
  const bgm = createBgm(ledger, { level: startLevel });
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stopAll(); bgm.setHidden(document.hidden); });
  const skipIntro = (/** @type {string} */ why) => { if (!intro.blocking) return; if (intro.skip(why, performance.now())) { input.clearQueue(); sound.stop('sfx.book.open'); } syncIntroUi(); };
  // 表紙の開始の一押し（人の操作の中で音を有効にする）。用意を待つのは上限まで。そのあいだにタブ離脱・表示切替で終われば始めない
  const startFromCover = (/** @type {string} */ why) => {
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

  // 重さの計測（?perf=1 のときだけ表示）
  const perfEl = $('perf'); perfEl.hidden = params.get('perf') !== '1';
  const perf = { frames: 0, since: performance.now(), fps: 0, worstMs: 0, last: performance.now(), drawMs: 0 };

  let uiPhase = intro.phase;
  const PAGE_TURNS = ['sfx.page.turn01', 'sfx.page.turn02', 'sfx.page.turn03'];
  let pageCueAt = -1, pageCueN = 0;
  const draw = async () => {
    const r = renderers[mode];
    if (field.state.mapId !== shown) {
      shown = field.state.mapId; const m = d.maps[shown];
      await r.load(m, d.collision);
      $('map-title').textContent = m.title; $('map-badge').hidden = m.status !== 'provisional';
      syncRoomUi();
      camUi?.sync();
      if (mode === 'paper') { intro.shown(performance.now()); syncIntroUi(); }
    }
    const t0 = performance.now();
    const pose = intro.pose(t0);
    if (!openCue) { // 本がひらく音：演出の始まりに間に合ったときだけ鳴らす（一度決めたら決め直さない）
      const c = decideOpenCue({ introPhase: intro.phase, introT: pose ? pose.t : 0, ctxState: sound.state, loaded: sound.loaded, level: sound.level, already: openCue });
      if (c.decided) openCue = c.play && !sound.play('sfx.book.open', c.offset) ? 'play-failed' : c.reason;
    }
    // ページをめくる音（2026-11-22 作者「ページめくりの音を入れてほしい」）：外どうしの出入口でページがめくれはじめるとき（着いた直後）に、
    // 作者の本の録音3つを順に鳴らす（同じ音が続かないように）。1回の転送で1回だけ
    const ev = field.view().effect;
    if (ev && ev.kind === 'page' && ev.phase === 'arrive' && pageCueAt !== field.state.transfers) {
      pageCueAt = field.state.transfers;
      sound.play(PAGE_TURNS[pageCueN++ % PAGE_TURNS.length]);
    }
    if (intro.phase !== uiPhase) { uiPhase = intro.phase; syncIntroUi(); } // 最後まで再生して終わったときなど
    const b = decideBgm({ mapId: field.state.mapId, byMap: bgmByMap, current: bgm.wanted, introBlocking: intro.blocking });
    if (b.action !== 'keep' && b.action !== 'none') bgm.want(b.want);
    r.draw(field.view(), { intro: pose, seconds: reducedMotion ? 0 : t0 / 1000 });
    const now = performance.now();
    perf.drawMs = now - t0; perf.frames++; perf.worstMs = Math.max(perf.worstMs, now - perf.last); perf.last = now;
    if (now - perf.since >= 1000) {
      perf.fps = Math.round(perf.frames * 1000 / (now - perf.since));
      if (!perfEl.hidden) {
        const dbg = r.debug();
        perfEl.textContent = `${mode}  ${perf.fps}fps  最長${Math.round(perf.worstMs)}ms  描画${perf.drawMs.toFixed(1)}ms${dbg.drawCalls != null ? `  draw${dbg.drawCalls}  板${dbg.boards}` : ''}  内部${(dbg.inner || [dbg.W, dbg.H]).join('×')}`;
      }
      perf.frames = 0; perf.since = now; perf.worstMs = 0;
    }
  };
  // 戦闘（2026-11-22 作者「バトルも入れてみよう」「1で森に敵が見えていて、ぶつかると戦闘」）：見えている敵にぶつかったら、
  // バトル試作（/battle/、試作そのもの）をフィールドの上に重ねて開く。勝ち負けは試作から知らせが来る。上のボタンでフィールドへ戻る
  // （結果が出る前に押すと「逃げる」＝敵は残る。試しのためのボタン）。戦闘中はフィールドの曲を止める
  /** @type {{ box: HTMLElement, outcome: string|null } | null} */
  let battleUi = null;
  const closeBattle = () => {
    if (!battleUi) return;
    const outcome = battleUi.outcome === 'win' ? 'win' : battleUi.outcome === 'lose' ? 'lose' : 'escape';
    // 戻る演出（2026-11-22 作者「戦闘結果後はボタンを押すと終了するのも演出を加えて」）：戦闘の画面が明るく光って消え、フィールドが現れる
    const box = battleUi.box; battleUi = null; box.classList.add('closing');
    setTimeout(() => { box.remove(); field.endBattle(outcome); input.releaseAll?.(); input.clearQueue(); bgm.setHidden(false); window.focus(); }, 700);
  };
  const openBattle = (/** @type {{battle:string}} */ b) => {
    // エンカウントの演出（2026-11-22 作者「エンカウント時の演出も追加」）：白く光ったあと、金のふちの斬撃が3本走って暗転。そのあいだに戦闘を読み込む
    const fx = document.createElement('div'); fx.id = 'enc-fx'; fx.innerHTML = '<i></i><i></i><i></i>'; document.body.appendChild(fx); setTimeout(() => fx.remove(), 1100);
    const box = document.createElement('div'); box.id = 'battle-overlay';
    box.innerHTML = `<iframe title="戦闘" src="battle/index.html?field=1&enc=${encodeURIComponent(b.battle)}" allow="autoplay; fullscreen"></iframe><button type="button" id="battle-back">逃げる（試し）</button>`;
    document.body.appendChild(box); battleUi = { box, outcome: null };
    bgm.setHidden(true);
    /** @type {HTMLButtonElement} */ (box.querySelector('#battle-back')).addEventListener('click', closeBattle);
    const fr = /** @type {HTMLIFrameElement} */ (box.querySelector('iframe')); fr.addEventListener('load', () => { box.classList.add('ready'); fr.contentWindow?.focus(); });
  };
  // メニュー（2026-11-22 作者「ステータスメニューを追加」→「ステータスだけじゃなくて、メニューをつけて」「技の書とか」）：右上の「メニュー」ボタン（キーボードは M）で、
  // バトル試作のメニューのページ（?field=1&page=menu：ステータス・アイテム・技の書・設定・遊び方）をフィールドの上に開く。戦闘で育った分は同じ画面の保存から読むので、戦闘とつながる。開いているあいだフィールドは止まる
  // 隊列（2026-11-22 作者「仲間の隊列を組めるようにして、その通りの順番で並ぶ」）：メニューの「隊列」で決めた順に、仲間（台帳の party と cast）が並んで歩く。
  // 並びはバトル試作の側に保存してあり、起動したときに小さなページ（battle/formation.html）が知らせてくる（NEXT は保存しない）。?only・?party で決めたときは使わない
  const applyFormation = (/** @type {unknown} */ order) => {
    if (onlyId || params.get('party') || !Array.isArray(order)) return;
    const list = order.map((id) => people.find((/** @type {any} */ p) => p.id === id)).filter(Boolean);
    if (list.length) field.setParty(list);
  };
  { const fr = document.createElement('iframe'); fr.src = 'battle/formation.html'; fr.hidden = true; fr.title = '隊列'; fr.addEventListener('load', () => setTimeout(() => fr.remove(), 1000)); document.body.appendChild(fr); }
  /** @type {HTMLElement | null} */
  let statusUi = null;
  // 本のページをめくるように開く・閉じる（2026-11-22 作者「本をめくるみたいな演出を入れてほしい、メニューでも」）
  // 音（2026-11-22 作者「メニューも開く音、めくる音3種類、閉じる音使ってよ」）：開く＝本がひらく音、ページを移る＝めくる音3つを順に、閉じる＝本を閉じる音
  const closeStatus = () => { if (!statusUi) return; const box = statusUi; statusUi = null; box.classList.add('closing'); sound.play('sfx.book.close'); setTimeout(() => { box.remove(); input.releaseAll?.(); input.clearQueue(); window.focus(); }, 520); };
  const openStatus = () => {
    if (statusUi || battleUi || field.state.battle || intro.blocking) return;
    sound.unlock('menu'); sound.play('sfx.book.open');
    const box = document.createElement('div'); box.id = 'battle-overlay'; box.className = 'status';
    box.innerHTML = '<iframe title="メニュー" src="battle/index.html?field=1&page=menu"></iframe><button type="button" id="battle-back" class="done">閉じる</button>';
    document.body.appendChild(box); statusUi = box;
    /** @type {HTMLButtonElement} */ (box.querySelector('#battle-back')).addEventListener('click', closeStatus);
    const fr = /** @type {HTMLIFrameElement} */ (box.querySelector('iframe')); fr.addEventListener('load', () => { box.classList.add('ready'); fr.contentWindow?.focus(); });
  };
  $('status-toggle').addEventListener('click', () => { /** @type {HTMLElement} */ ($('status-toggle')).blur(); openStatus(); });
  window.addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && !e.repeat) openStatus(); });
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.type === 'sr-battle-close') { if (statusUi) closeStatus(); return; }
    if (ev.data?.type === 'sr-formation') { applyFormation(ev.data.order); return; } // 隊列（メニューで変えたとき・起動したとき）
    if (ev.data?.type === 'sr-field-page') { if (statusUi) sound.play(PAGE_TURNS[pageCueN++ % PAGE_TURNS.length]); return; } // メニューの中でページを移った
    if (ev.data?.type === 'sr-field-ready') { for (const b of document.querySelectorAll('#battle-overlay')) b.classList.add('ready'); return; } // 試作が切りかえ終わったら見せる（タイトルを一瞬見せない）
    if (!battleUi || ev.data?.type !== 'sr-battle-result') return;
    battleUi.outcome = ev.data.outcome;
    const btn = /** @type {HTMLButtonElement} */ (battleUi.box.querySelector('#battle-back')); btn.textContent = 'フィールドへ戻る'; btn.classList.add('done');
  });
  // 演出中は歩かない。方向の入力が来たら演出を終える（その入力では歩かない）。ステータスを開いているあいだも歩かない
  startLoop((dt) => { if (field.state.battle && !battleUi) openBattle(field.state.battle); if (statusUi) { input.clearQueue(); return; } if (gateInput(intro, input, skipIntro, dt)) field.update(dt, input); }, () => { draw(); });
  $('status').hidden = true;
  // 確認用の読み取り口（状態を書きかえない）。検証役・自動確認がマップと位置を読むために使う。
  window.STERNENRING_NEXT = Object.freeze({
    view: () => structuredClone(field.view()),
    stats: () => ({ steps: field.state.steps, transfers: field.state.transfers, log: structuredClone(field.state.transferLog) }),
    renderer: () => ({ mode, paperError, fps: perf.fps, ...renderers[mode].debug() }),
    input: () => ({ held: input.held(), pending: input.pending() }),
    intro: () => ({ ...intro.snapshot(), blocking: intro.blocking, reducedMotion }),
    sound: () => ({ ...sound.snapshot(), openCue }),
    bgm: () => bgm.snapshot(),
  });
}

boot().catch((e) => { $('status').textContent = `起動できません：${e.message}`; $('status').classList.add('error'); });
