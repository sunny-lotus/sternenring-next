// 確認用サーバー（tools/serve.cjs）のスマホ接続の診断。127.0.0.1 の隔離ポートだけで試す
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { lanCandidates, looksLikeTls, createServer, selfCheck } = require('../tools/serve.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PORT = 0; // 空いている番号をOSに選ばせる（ほかの確認用サーバーとぶつからないように）

test('アドレス候補：内部用・169.254 を除き、家のLANを先、ホットスポット(192.168.137.x)を後にする', () => {
  const ifs = {
    'Wi-Fi 5': [{ family: 'IPv4', address: '192.168.137.1', internal: false }],
    'Wi-Fi 4': [{ family: 'IPv4', address: '169.254.54.38', internal: false }],
    'イーサネット': [{ family: 'IPv4', address: '192.168.1.6', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    'Loopback': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  };
  const c = lanCandidates(ifs, 8132);
  assert.deepEqual(c.map((x) => [x.url, x.kind, x.iface]), [
    ['http://192.168.1.6:8132/', 'lan', 'イーサネット'],
    ['http://192.168.137.1:8132/', 'hotspot', 'Wi-Fi 5'],
  ]);
  assert.ok(c.every((x) => x.url.startsWith('http://')), 'https の候補を出さない');
  assert.deepEqual(lanCandidates({}, 8132), []);
});

test('TLS（https）の最初の1バイトを見分ける', () => {
  assert.equal(looksLikeTls(Buffer.from([0x16, 0x03, 0x01])), true);
  assert.equal(looksLikeTls(Buffer.from('GET / HTTP/1.1\r\n')), false);
  assert.equal(looksLikeTls(Buffer.alloc(0)), false);
});

test('サーバー：http は従来どおり配信し、https の接続は知らせて閉じる。tests/ は配信しない', async () => {
  const logs = [];
  const server = createServer({ root, log: (s) => logs.push(s), own: new Set(['127.0.0.1']) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  PORT = server.address().port;
  try {
    const get = (p) => new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}${p}`, (res) => { let n = 0; res.on('data', (d) => { n += d.length; }); res.on('end', () => resolve({ status: res.statusCode, n })); }).on('error', reject);
    });
    const top = await get('/');
    assert.equal(top.status, 200);
    assert.ok(top.n > 100);
    assert.equal((await get('/tests/serve.test.mjs')).status, 404);
    assert.equal((await get('/tools/serve.cjs')).status, 404);

    // https のふりをした接続（TLS ClientHello の先頭）
    const closed = await new Promise((resolve) => {
      const s = net.connect(PORT, '127.0.0.1', () => s.write(Buffer.from([0x16, 0x03, 0x01, 0x00, 0x05, 0x01, 0x00, 0x00, 0x01, 0x00])));
      s.on('close', () => resolve(true));
      s.on('error', () => {});
    });
    assert.equal(closed, true);
    assert.ok(logs.some((l) => l.includes('https で開こうとした') && l.includes('http://')), logs.join('\n'));
    // 自分（127.0.0.1）から開いたとき・自己確認のときは「画面が開かれました」を出さない
    assert.ok(!logs.some((l) => l.includes('画面が開かれました')));

    const sc = await selfCheck([`http://127.0.0.1:${PORT}/`, 'http://127.0.0.1:1/'], 1000);
    assert.equal(sc[0].ok, true);
    assert.equal(sc[1].ok, false);
    assert.ok(!logs.some((l) => l.includes('画面が開かれました')), '自己確認は表示しない');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('サーバー：「..」や「\」を含む要求（ブラウザは送らない特殊な形）でも、配信する4か所の外は読めない', async () => {
  const server = createServer({ root, log: () => {}, own: new Set(['127.0.0.1']) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  // ふつうの http.get は「..」を縮めてしまうので、生の要求をそのまま送る
  const raw = (p) => new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let buf = ''; s.on('data', (d) => { buf += d; }); s.on('close', () => resolve(Number(buf.split(' ')[1]))); s.on('error', () => resolve(0));
  });
  try {
    for (const p of ['/src/../tools/serve.cjs', '/src/%2e%2e/tools/serve.cjs', '/data/../tests/serve.test.mjs', '/src/..%5ctools%5cserve.cjs', '/assets/../../STERNENRING_RPG_CORE/index.html']) {
      assert.equal(await raw(p), 404, p);
    }
    assert.equal(await raw('/src/main.js'), 200);
  } finally { await new Promise((r) => server.close(r)); }
});
