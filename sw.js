// 公開ページで、プログラム（.js・.css・.html）をいつも新しい版で読むための小さな仕組み（2026-11-24）。
// GitHub Pages はプログラムを10分ほど覚えさせる（Cache-Control: max-age=600）。データ（JSON）は毎回新しく読むので、
// 公開したすぐあとは「新しいデータ＋古いプログラム」が混ざり、扉が残る・扉の音が鳴らないことがあった（作者「やっぱり家はいる時ドアの音ならない」）。
// ここでは、プログラムだけ毎回サーバーに「変わった？」と聞いてから使う（変わっていなければ覚えた版を使うので、重くはならない）。絵・音・データには手を出さない。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== self.location.origin) return;
  if (!/\.(js|mjs|css|html)$/.test(u.pathname) && !u.pathname.endsWith('/')) return;
  e.respondWith(fetch(new Request(u.href, { cache: 'no-cache', credentials: 'same-origin' })).catch(() => fetch(req)));
});
