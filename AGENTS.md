# STERNENRING_RPG_NEXT　作業規約

DEV-DESIGN-001（受入済み）の `examples/AGENTS.next.md` をもとに、DEV-PLAYABLE-001 で作成。旧版 `STERNENRING_RPG_CORE/AGENTS.md` の「作り直さない」方針は、この新基盤には適用しない（作者の指示 2026-11-22）。

## 書く人
- この新作業場所のゲームコード・データは **Claude の技術担当だけ**が書く。
- 作業の記録は共通フォルダー `OneDrive/ドキュメント/ChatGPT/物語/production/claude/reports/` に書く（`連携手順.txt` に従う）。`roadmap.json`・`orders/`・`連携手順.txt`・`reports/作者との決定事項.md`・検証役のファイルは書かない。

## 守ること
- 旧版 `STERNENRING_RPG_CORE` のファイル・作業ツリー・利用者のセーブ（ポート8081）は変えない。旧キー `sternenring-core-save-v1` を読み書きしない。
- 新しい保存キーは `sternenring-next-save-v1`（スロット付き、まず `:slot1`）。設定は `sternenring-next-settings-v1`。P1 は永続保存なし（localStorage を使わない）。
- 確認は隔離ポートで行う：技術担当 8130〜8139、検証役 8140〜8149。使ったサーバーは止める。
- push・公開・公開サイトの変更は、作者がそのつど頼んだときだけ（2026-11-22 作者「公開する」で GitHub sunny-lotus/sternenring-next と GitHub Pages に公開した）。予定済みタスク・検証役は push・公開をしない。
- 世界設定は非公開GitHub `sunny-lotus/STERNENRING-Development` の最新mainを読むだけ。原稿・世界設定は編集しない。序盤の世界の正体や魔法の名前の開示順を守る（序盤は「魔法」）。
- キャラの絵を左右反転しない（ナハトは左の腰に刀、ヴォルトは右の義足と杖）。素材台帳の `noFlip` を守り、描画で負の拡大を使わない。
- ToDo は達成しなくても罰が無く、物語の進行の条件にしない。
- 新しい設定・台詞・曲・元絵（水彩の原画）は作らず、4室へ依頼する。仮の物は `placeholder:` と `status: provisional` で区別する。

### 例外：ドット絵化と歩きのコマ（作者の決定 2026-11-22）
- **ドット絵を作るのは、作者とClaudeの相談の場（チャット）だけ**（作者の決定 2026-11-22 12時ごろ）。技術担当（予定済みタスク）はドット絵を作らず、`production/claude/pixel/<名前>/` にできた PNG を、この作業場所へ写して組み込むだけ（元のファイルは変えない）。まだ無いものは仮だとわかる絵で進め、報告に「ドット絵待ち」を書く。
- 以下はチャットでドット絵を作るときの決まり：採用済み（または美術・演出室から受領した）元絵をもとにする。元絵に無い歩きのコマ（4方向×4コマ）も、元絵の色と形に合わせて描き起こしてよい。
  - 元絵は変えない・上書きしない。ドット絵は別ファイルにし、台帳に `sourceArt`（元絵のID）と `status: provisional` を付ける。
  - 左右は別に描く（反転で作らない）。ナハトは左の腰に刀、ヴォルトは右の義足と杖を、どの向きでも確かめる。
  - 新しい衣装・持ち物・形は足さない（必要なら4室へ依頼）。
  - ドット絵の採用（`status: adopted`）は、美術・演出室と作者が判断する。
- 根拠：`reports/作者との決定事項.md`（見た目の方向）、DEV-DESIGN-001 設計書 §6.1。

## 舞台の扱い（DEV-PLAYABLE-001 revision 4、世界設定 統合版 第42節・main cf472d7）
- 第一巻の開始はノルン。ノルンはカルディア市の第三城壁のすぐ外に隣接する独立した城壁都市（独自の城壁と門、カルディアと街道で連絡、交易・辺境都市）。カルディア市内の地区ではない（その案は不採用）。カルディア市（§36：王都の外側に接する環状扇形、第二城壁が内壁・第三城壁が外壁）とは別の都市・別の地図として扱う。
- 既存本文の描写（城壁・門、導機灯、大通り、広場、星環祭、星獣の侵入、宿《銀鹿亭》）を生かす。城壁外のため魔獣・星獣の脅威は近いが、星獣の出現は一般人にとって重大事件のまま。
- 今の `norn-plaza`・`silver-deer-1f` は旧版由来の**仮の技術試験区画**（`status: provisional`）。正式な舞台として扱わない。
- 未確定（マップ・UI・コメントで勝手に確定しない）：ノルンとカルディアの正確な方角・距離・規模・行政所属・接続する第三城壁の門、エルデ森林への方位・距離・所要時間（本文「王国の東端」との整合は世界設定側の課題で、こちらで補わない）、「国境都市」の呼び方（第三城壁＝国境としない）、銀鹿亭の所在と間取り・開始座標。§36-D の大都市景観をノルンへ当てはめない。§36 の五地区・門・水路の位置は提案段階なので、地図案と確定設定を分ける。

## 作り方
- `src/core/` は描画に依存しない（Node のテストで動く）。`src/render/` は状態を読むだけ。
- マップは `data/maps/*.json` と `data/world.json` の一覧だけで足す。コードでマップを作らない。読込時に検証し、問題があれば起動しない。
- 検証用の分岐を本編に入れない（`tests/`・`tools/` に置く）。`window.STERNENRING_NEXT` は読み取り専用の確認口。
- 型は JSDoc と `// @ts-check`。外部パッケージは使わない。ただし three.js 0.160.0 だけは `src/vendor/three/`（MIT、LICENSE 同梱）に置いて使う（作者の決定 2026-11-22 14:35「NEXTの見た目は試作に合わせる・three.js を同梱してよい」）。ネットから読まない。
- 紙の舞台はいま `src/render/three-stage.js`（three.js 版。見た目の基準は `STERNENRING_Codex/試作_飛び出す絵本`・`試作_ブックヌック`）。外のマップは本の見開き、`kind: interior` はブックヌック（箱の内側）。これまでの素の WebGL1 版 `paper-stage.js` は、three.js 版が作れないときの予備と、`?stage=webgl1` での見比べ用に残す。
- 紙の舞台の計算は `src/render/paper-math.js`（Node でテスト）、WebGL は `src/render/paper-stage.js`。テクスチャは最近傍・ミップマップなし、UV は常に u0<u1（左右反転しない）。ふち・影は板の真後ろ（boardNormal の逆）へ下げる。
- カメラ：マップの `stage.camera` の `pitchDeg 10`・`fovDeg 60` が作者の決定（2026-11-22 13:20）。新しいマップもそろえる（tests/cam.test.mjs）。`?cam=1` の調整パネル（`src/ui/cam-panel.js`、上書きは `window.SR_CAM`、保存しない）は作者の決定で残す。消さない。
- 変更したら `node --test tests/*.test.mjs` を通し、実ブラウザで確かめたことだけを報告に書く。

## 起動
- `START_NEXT.cmd`（ダブルクリック）→ http://127.0.0.1:8131/
- スマホ（同じWi-Fi）：`START_NEXT_PHONE.cmd` → 黒い窓に出る `http://<PCのアドレス>:8132/`（`--host 0.0.0.0`。作者が使うためのもので、技術担当・検証役の確認は 127.0.0.1 の隔離ポートで行う）。サーバーは http 専用。スマホで開けないときの切り分けは README「開けないときの切り分け」
- 手動：`<node> tools/serve.cjs --port 8131`（Node は `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`）
- テスト：`<node> --test tests/*.test.mjs`

## 戦闘（battle/）（作者の決定 2026-11-22「まず移す」）
- 戦闘は、もとのバトル試作から NEXT の中の `battle/` に写した（`battle/README.md`）。これからの戦闘の直しは `battle/` で行う。
- フィールドは戦闘・メニュー（ステータス・アイテム・技の書・隊列ほか）を `battle/` のページとして上に重ねて開き、合図（postMessage：sr-battle-result・sr-battle-close・sr-field-ready・sr-field-page・sr-formation）でつなぐ。
- 育ち・お金・隊列の保存は `battle/` の側にある。NEXT 本体（src/）はブラウザの保存を使わない（tests/guards.test.mjs）。
- 次の段階は、戦いの計算を src/core に移して NEXT が状態を持つこと（作者と相談してから）。
