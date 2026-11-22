// STERNENRING_RPG_NEXT の確認用サーバー（Node 標準だけ）。http 専用（https は使わない）。
// 使い方: node tools/serve.cjs [--port 8131] [--host 127.0.0.1]
// スマホ（同じWi-Fi）から開くとき: --host 0.0.0.0 （START_NEXT_PHONE.cmd）。このPCの家庭内のアドレスを表示する
// - 配信するのは NEXT の index.html・src/・data/・assets/ だけ（tests/ や tools/ は配信しない）
// - /battle/ は、NEXT の中の battle/（戦闘。もとはバトル試作）の index.html・formation.html・js/・img/・audio/・manifest.json を配信する
//   （2026-11-22 作者「バトルも入れてみよう」→「NEXTに入れ込めないの？」「まず移す」：となりのバトル試作のフォルダを読みに行くのをやめ、NEXT の中に写した）
// - ポート：技術担当 8130〜8139、検証役 8140〜8149。8081（旧版・利用者）は使わない
// - 接続の切り分けのため、次のことを黒い窓に表示する（中身は保存しない）
//   ・起動時に、このPC自身から各アドレスへ http で応答が返るか
//   ・ほかの機器（スマホなど）から画面が開かれたこと
//   ・https で開こうとした接続が来たこと（「安全に接続できない」の主な原因）
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

/**
 * スマホから開くアドレスの候補（IPv4・内部用でない・169.254.x.x の自動割当てを除く）。
 * 192.168.137.x は Windows のモバイルホットスポット（スマホをPCのホットスポットにつないだときだけ使う）。
 * @returns {{url:string, address:string, iface:string, kind:'lan'|'hotspot'}[]}
 */
function lanCandidates(interfaces, port) {
  const out = [];
  for (const [iface, list] of Object.entries(interfaces || {})) {
    for (const n of list || []) {
      if (!n || (n.family !== 'IPv4' && n.family !== 4) || n.internal) continue;
      if (n.address.startsWith('169.254.')) continue;
      const kind = n.address.startsWith('192.168.137.') ? 'hotspot' : 'lan';
      out.push({ url: `http://${n.address}:${port}/`, address: n.address, iface, kind });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'lan' ? -1 : 1));
}

/** 最初の1バイトが 0x16 なら TLS（https）の接続 */
function looksLikeTls(firstChunk) {
  return !!firstChunk && firstChunk.length > 0 && firstChunk[0] === 0x16;
}

const isLoopback = (addr) => !addr || addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.');
const plainAddr = (addr) => String(addr || '').replace(/^::ffff:/, '');
const now = () => new Date().toTimeString().slice(0, 8);
const SELF_CHECK_HEADER = 'x-next-selfcheck';
/** このPC自身のアドレス（ほかの機器からの接続と区別して表示するため） */
const ownAddresses = () => new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map((n) => n.address));

function createServer({ root, log = console.log, own = ownAddresses(), battleRoot = path.resolve(root, 'battle') }) {
  const allowed = ['index.html', 'src', 'data', 'assets'];
  const battleAllowed = ['index.html', 'formation.html', 'js', 'img', 'audio', 'manifest.json'];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
  const seen = new Set();

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const raw = decodeURIComponent(req.url.split('?')[0]);
      const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
      // 「..」・「\」・NUL を含む要求は断る（ふつうのブラウザは送らない。配信する4か所の外を読ませないため）
      if (rel.split('/').includes('..') || rel.includes('\\') || rel.includes('\0')) { res.writeHead(404); return res.end('Not found'); }
      const from = req.socket.remoteAddress;
      if (rel === 'index.html' && !isLoopback(from) && !req.headers[SELF_CHECK_HEADER]) {
        const who = own.has(plainAddr(from)) ? '（このPC自身から）' : '（ほかの機器から・つながっています）';
        log(`[${now()}] ${plainAddr(from)} から http で画面が開かれました${who}`);
      }
      const inBattle = rel === 'battle' || rel.startsWith('battle/');
      const base = inBattle ? battleRoot : root, rel2 = inBattle ? (rel.replace(/^battle\/?/, '') || 'index.html') : rel;
      if (!(inBattle ? battleAllowed : allowed).includes(rel2.split('/')[0])) { res.writeHead(404); return res.end('Not found'); }
      const file = path.resolve(base, rel2);
      const real = await fs.realpath(file);
      if (!real.startsWith(base + path.sep) || !(await fs.stat(real)).isFile()) { res.writeHead(404); return res.end('Not found'); }
      const data = await fs.readFile(real);
      res.writeHead(200, { 'Content-Type': types[path.extname(real)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });

  // 前段で最初の1バイトを見て、https の接続なら知らせて閉じる。http ならそのまま渡す
  const front = net.createServer((socket) => {
    socket.once('error', () => socket.destroy());
    socket.setTimeout(30000, () => socket.destroy()); // 何も送ってこない接続は30秒で閉じる
    socket.once('data', (chunk) => {
      socket.setTimeout(0);
      if (looksLikeTls(chunk)) {
        const key = `tls:${plainAddr(socket.remoteAddress)}`; // 同じ機器からの繰り返しは1回だけ表示
        if (!seen.has(key)) {
          seen.add(key);
          log([
            `[${now()}] ${plainAddr(socket.remoteAddress)} から https で開こうとした接続が来ました。`,
            '  このサーバーは http 専用です。スマホでは「https://」ではなく「http://」から始まるアドレスを、最後まで打ってください。',
            '  （https で開くと「安全に接続できません」と出ます。履歴やおすすめに出る https のアドレスは選ばないでください）',
          ].join('\n'));
        }
        socket.destroy();
        return;
      }
      socket.pause();
      socket.unshift(chunk);
      httpServer.emit('connection', socket);
      socket.resume();
    });
  });
  front.httpServer = httpServer;
  return front;
}

/** このPC自身から各アドレスへ http で応答が返るか（スマホから届くかは別。ファイアウォールやWi-Fiの分離は調べられない） */
function selfCheck(urls, timeoutMs = 3000) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const req = http.get(url, { headers: { [SELF_CHECK_HEADER]: '1' } }, (res) => { res.resume(); resolve({ url, ok: res.statusCode === 200, status: res.statusCode }); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ url, ok: false, status: 'timeout' }); });
    req.on('error', (e) => resolve({ url, ok: false, status: e.code || e.message }));
  })));
}

module.exports = { lanCandidates, looksLikeTls, createServer, selfCheck };

if (require.main === module) {
  const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
  const port = Number(arg('--port', '8131'));
  const host = arg('--host', '127.0.0.1');
  if (port === 8081) { console.error('8081 は旧版（利用者）のポートです。8130〜8149 を使ってください。'); process.exit(1); }
  const root = path.resolve(__dirname, '..');
  const server = createServer({ root });
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `ポート ${port} は使用中です（START_NEXT_PHONE がもう開いていないか、黒い窓を確かめてください）。` : err.message);
    process.exitCode = 1;
  });
  server.listen(port, host, async () => {
    console.log(`STERNENRING NEXT（http 専用）: http://127.0.0.1:${port}/ （このPC）  （Ctrl+C で止まります）`);
    if (host !== '0.0.0.0') return;
    const cands = lanCandidates(os.networkInterfaces(), port);
    if (!cands.length) { console.log('このPCの家庭内のアドレスが見つかりません（Wi-Fiか有線LANにつながっているか確かめてください）。'); return; }
    const results = await selfCheck(cands.map((c) => c.url));
    const lines = ['', 'スマホでは、次のアドレスを「http://」から最後まで打って開いてください（https ではありません）:'];
    cands.forEach((c, i) => {
      const r = results[i];
      const note = c.kind === 'hotspot' ? '（スマホをこのPCのモバイルホットスポットにつないだときだけ）' : '（スマホを家のWi-Fiにつないだとき）';
      lines.push(`  ${c.url}  ${note}  [${c.iface}・このPCからの確認: ${r.ok ? 'OK' : 'NG ' + r.status}]`);
    });
    lines.push(`  重さを見るときは末尾に ?perf=1 を付けます（例: ${cands[0].url}?perf=1）`);
    lines.push(`  カメラ角度を一緒に見るときは末尾に ?cam=1 を付けます（例: ${cands[0].url}?cam=1）`);
    lines.push('', '【注意】家の中で試すためのものです。パスワードは無く、開いている間は同じWi-Fiのほかの機器からも画面と素材が見えます。終わったらこの窓で Ctrl+C を押して止めてください。');
    lines.push('', 'スマホで開くと、ここに「… から http で画面が開かれました（ほかの機器から…）」と出ます。何も出ないときは、スマホからの通信がこのPCに届いていません。');
    console.log(lines.join('\n'));
  });
}
