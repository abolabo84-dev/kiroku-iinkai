// きろく委員会 同期プロキシ
//
// 目的: なごみのiPadやママの端末に GitHub のトークンを一切置かんこと。
// 端末が持つのは「あいことば」だけ。GitHubのトークンはこのFunctionの環境変数にだけ在る。
// あいことばが漏れても、届くのは kiroku-data の中身だけ。GitHubアカウントには届かん。
// しかも作り直しはNetlifyの環境変数を書き換えるだけで、端末を触らんでええ。
//
// 必要な環境変数:
//   GH_TOKEN       … kiroku-data だけにスコープしたfine-grained PAT (Contents: R/W)
//   KIROKU_PASS    … 家族のあいことば
//   ALLOWED_ORIGIN … 例 https://abolabo84-dev.github.io
//
// 設計方針: GitHub の contents API のレスポンスを「そのまま」返す。
// そうすればクライアント側は URL とヘッダを差し替えるだけで、
// sha の扱いも 404 の扱いも既存コードのまま動く（＝差分が最小になる）。

import { timingSafeEqual } from 'node:crypto';

const OWNER = 'abolabo84-dev';
const REPO = 'kiroku-data';

// このアプリが実際に使うパスだけ通す。プロキシを踏み台にして
// リポジトリの他の場所を触られんようにするための保険。
const ALLOWED_PATH = /^(data\.json|evlog-[A-Za-z0-9_-]{1,32}\.json|photos\/[A-Za-z0-9_-]{1,64}\.jpg)$/;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Kiroku-Pass',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// 長さの違いで早期に返らんようにする。あいことばの総当たりを少しでも鈍らせるため。
function passOk(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export default async (req) => {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  const CORS = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // 貼り付け時に紛れ込む山かっこ・空白・改行を落として、トークン本体だけを取り出す。
  // 実際に `<github_pat_xxx\n>` の形で保存されとって、HTTPヘッダとして不正になり
  // fetch が例外を投げた（502の原因）。外側のtrimでは中の改行が取れんかった。
  const rawToken = process.env.GH_TOKEN || '';
  const m = rawToken.match(/(?:github_pat_|ghp_|gho_)[A-Za-z0-9_]+/);
  const token = m ? m[0] : rawToken.trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'server not configured' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (!passOk(req.headers.get('x-kiroku-pass'), process.env.KIROKU_PASS)) {
    return new Response(JSON.stringify({ error: 'bad passphrase' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const path = new URL(req.url).searchParams.get('path') || '';
  if (!ALLOWED_PATH.test(path)) {
    return new Response(JSON.stringify({ error: 'path not allowed' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // 写真の実体取得だけは raw で受け取る（クライアントが blob として読む）
  const wantsRaw = (req.headers.get('accept') || '').includes('raw');

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: wantsRaw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
    'User-Agent': 'kiroku-iinkai',
  };

  const init = { method: req.method, headers: ghHeaders };
  if (req.method === 'PUT' || req.method === 'DELETE') {
    init.body = await req.text();
    ghHeaders['Content-Type'] = 'application/json';
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  let gh;
  try {
    gh = await fetch(url, init);
  } catch (e) {
    // 原因が分からんと詰むので種別だけ返す。トークンが混じらんよう伏せてから返す。
    const why = String((e && e.message) || e).replace(/github_pat_[A-Za-z0-9_]+/g, '«token»').slice(0, 200);
    return new Response(JSON.stringify({ error: 'upstream unreachable', why }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ステータスも本文もそのまま返す。404 を握り潰すとクライアントの
  // 「ファイルがまだ無い」判定が壊れる。
  const body = wantsRaw ? await gh.arrayBuffer() : await gh.text();
  return new Response(body, {
    status: gh.status,
    headers: {
      ...CORS,
      'Content-Type': gh.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

export const config = { path: '/api/kiroku' };
