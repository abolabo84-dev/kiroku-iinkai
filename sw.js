// きろく委員会：ネットが落ちてもページが開けるようにする（2026-09-25 パパ採択）
// きっかけ＝9/23、J:COM不調でアプリが開けず、なごみが普通のストップウォッチで計って夜に手入力した。
// タイマーは端末の中だけで動く作りやから、ページさえ開ければオフラインでも測れる。
// 方針：同じサイトのGETは「ネット優先 → ダメなら前回の控え」。オンラインなら更新は今までどおり即反映。
// 同期（Netlify関数）など別サイトへの通信には触らん（失敗したら今までどおり「同期できへんかった」表示）。
const C = "kiroku-v1";
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(["./", "./index.html", "./help.html"])));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  const fromCache = () => caches.match(r, { ignoreSearch: true })
    .then(m => m || (r.mode === "navigate" ? caches.match("./index.html") : undefined));
  const net = fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); }
    return res;
  });
  net.catch(() => {});
  // ponytail: 4秒待ってネットが返らんかったら控えを出す。回線が遅いだけの日に1つ前の版が出る天井あり。
  //           困ったら秒数を延ばす
  const slow = new Promise(ok => setTimeout(ok, 4000));
  e.respondWith(
    Promise.race([net, slow])
      .then(x => x || fromCache().then(m => m || net))
      .catch(() => fromCache())
  );
});
