# 中継サーバ（Netlify Function）の手順 — 管理者用

なごみのiPadやママの端末に GitHub のトークンを置かんための中継サーバ。
端末が持つのは「あいことば」だけになる。

## 何が変わって、何が変わらんか

| | 変わるか |
|---|---|
| 記録の保管場所（`kiroku-data` リポジトリ） | **変わらん**。同じリポジトリ・同じ `data.json`・同じ `photos/` |
| 端末の中の記録（localStorage / IndexedDB） | **変わらん**。触らん |
| アプリのURL（なごみのホーム画面） | **変わらん**。GitHub Pages のまま |
| 端末に入れるもの | トークン → **あいことば** |
| GitHubのトークンの置き場所 | 端末とLINE → **Netlifyの環境変数だけ** |

過去データは移行の対象やない。経路が変わるだけで、保管庫はそのまま。

---

## 手順

### 1. Netlifyサイト（2026-08-04 に作成済み・作業不要）

```
Project:    kiroku-iinkai
URL:        https://kiroku-iinkai.netlify.app
Admin:      https://app.netlify.com/projects/kiroku-iinkai
```

このディレクトリに既にリンク済み（`.netlify/state.json`）。**`netlify init` は二度と使わんこと。**
あれは「pushしたら自動デプロイ」用に GitHub の Webhook / Deploy Key 権限を要求してくる。
今回は手動デプロイで足りるので、その権限は渡さんでええ。
（もし作り直す必要が出たら `netlify sites:create --name <名前>` を使う。GitHub権限を一切要求せん）

### 2. GitHubトークンを新しくして、Netlifyにだけ入れる

**重要: 新しいトークンはどの端末にも入れん。LINEでも送らん。ここだけ。**

1. https://github.com/settings/personal-access-tokens で `kiroku-sync` を **Regenerate**
   （スコープは `kiroku-data` のみ / Contents: Read and write のままでよい。
   有効期限は90日を推奨）
2. 表示された新しいトークンをコピー

3. **環境変数はNetlifyの管理画面から入れる**（下記URL）:

   https://app.netlify.com/projects/kiroku-iinkai/settings/env

   | Key | Value |
   |---|---|
   | `GH_TOKEN` | Regenerateした新しいトークン |
   | `KIROKU_PASS` | 家族のあいことば（**実物はここには書かん**。このファイルは公開リポに入る） |
   | `ALLOWED_ORIGIN` | `https://abolabo84-dev.github.io` |

> **なぜ管理画面か。** `netlify env:set GH_TOKEN "..."` をターミナルで打つと、
> トークンがシェル履歴に残る。Claude Code 経由で打てばセッションログにも残る。
> 今回のトークン漏れは、まさにそれが積み重なって起きた。
> ブラウザで入れれば、どこにも文字列が残らん。

あいことばは打ちやすいものでええ。93文字のトークンをiPadに打つのに比べたら圧倒的に楽。

### 3. デプロイ

```bash
netlify deploy --prod
```

### 4. 動作確認（端末を触る前に）

```bash
# あいことばが違う → 401 が返るはず
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Kiroku-Pass: wrong" \
  "https://kiroku-iinkai.netlify.app/api/kiroku?path=data.json"

# 正しいあいことば → 200 が返るはず
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Kiroku-Pass: <あいことば>" \
  "https://kiroku-iinkai.netlify.app/api/kiroku?path=data.json"

# 許可外パス → 400 が返るはず
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Kiroku-Pass: <あいことば>" \
  "https://kiroku-iinkai.netlify.app/api/kiroku?path=README.md"
```

**401 / 200 / 400 の3つが揃ってから**次に進む。

### 5. アプリ本体を公開

```bash
git add index.html help.html netlify.toml netlify/ DEPLOY.md
git commit -m "同期をあいことば方式に変更（端末からGitHubトークンを排除）"
git push
```

GitHub Pages に反映されるまで1〜2分。

### 6. 各端末であいことばを入れ直す

なごみのiPad / ママの端末 / パパのPC で:

「ぶんせき」タブ → 「☁️ 自動同期」→ あいことばを入力 → 「同期をオンにする」

古いトークンが入ったままでも、**あいことばで上書きすれば直る**（同じ入力欄）。

---

## うまくいかんとき

| 症状 | 原因 |
|---|---|
| 「同期できへんかった」が出続ける | あいことばが違う、または `KIROKU_PASS` 未設定 |
| ブラウザのコンソールにCORSエラー | `ALLOWED_ORIGIN` がアプリのURLと不一致 |
| 401 だけ返る | `KIROKU_PASS` の前後に空白が入ってへんか確認 |
| 500 が返る | `GH_TOKEN` 未設定 |
| 200 やのに中身が空 | `data.json` がまだ無い（初回は正常。404が返る） |

環境変数を変えたら **必ず再デプロイ**（`netlify deploy --prod`）。反映されん。

---

## あいことばを変えたくなったら

```bash
netlify env:set KIROKU_PASS "<新しいあいことば>"
netlify deploy --prod
```

各端末で入れ直すだけ。**GitHubは一切触らんでええ。** ここが今までとの一番の違い。
