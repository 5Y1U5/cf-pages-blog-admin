// GitHub Contents API の代役。テストがネットワークへ出ないようにし、
// 書き込まれた中身を確認できるようにする。
//
// `globalThis.fetch` を差し替えるが、実物の参照はこのモジュールの読み込み時に1度だけ
// 取っておく。createSite のたびに差し替えても、実物が入れ子に隠れることはない。

const realFetch = globalThis.fetch;

/** いま応答を返すスタブ。createSite のたびに入れ替わる。 */
let current = null;

function pathOf(url) {
  const [, rest] = String(url).split("/contents/");
  return decodeURIComponent((rest || "").split("?")[0]);
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function stubFetch(url, init = {}) {
  if (!current || !String(url).startsWith("https://api.github.com/")) {
    return realFetch(url, init);
  }
  const path = pathOf(url);
  const method = init.method || "GET";
  current.calls.push({ method, path });

  if (current.failWrites && method !== "GET") {
    return jsonResponse(403, { message: "forbidden" });
  }
  if (method === "GET") {
    if (!current.files.has(path)) return jsonResponse(404, { message: "Not Found" });
    return jsonResponse(200, { sha: `sha_${path}` });
  }
  if (method === "PUT") {
    const body = JSON.parse(init.body);
    current.files.set(path, Buffer.from(body.content, "base64").toString("utf8"));
    return jsonResponse(200, { commit: { sha: "commit_test" } });
  }
  if (method === "DELETE") {
    current.files.delete(path);
    return jsonResponse(200, { commit: { sha: "commit_test" } });
  }
  return jsonResponse(405, { message: "method not allowed" });
}

/**
 * このプロセスの GitHub 呼び出しをスタブへ向ける。
 * 戻り値の `files` は書き出されたファイル（パス→中身）、`calls` は呼び出しの記録。
 * `failWrites` を true にすると、以降の書き込みが 403 で失敗する。
 */
export function installGitHubStub() {
  globalThis.fetch = stubFetch;
  current = { files: new Map(), calls: [], failWrites: false };
  return current;
}
