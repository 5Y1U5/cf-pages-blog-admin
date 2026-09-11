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

/**
 * Git Data API（ref / commits / trees）。まとめて1コミットで書く経路が使う。
 * 実際の Git と違い、tree は「このコミットで書いたファイル」だけを覚えておき、
 * ref を進めた時点で `files` へ反映する。ref を進めるまで何も書かれない、
 * という本番と同じ順序だけを再現する。
 */
async function gitDataFetch(url, init, method) {
  const suffix = String(url).split("/git/")[1];

  if (method === "GET" && suffix.startsWith("ref/heads/")) {
    return jsonResponse(200, { object: { sha: "commit_head" } });
  }
  if (method === "GET" && suffix.startsWith("commits/")) {
    return jsonResponse(200, { tree: { sha: "tree_head" } });
  }
  if (method === "POST" && suffix === "trees") {
    if (current.failWrites) return jsonResponse(403, { message: "forbidden" });
    const body = JSON.parse(init.body);
    const id = `tree_${current.trees.size + 1}`;
    current.trees.set(id, body.tree);
    return jsonResponse(201, { sha: id });
  }
  if (method === "POST" && suffix === "commits") {
    if (current.failWrites) return jsonResponse(403, { message: "forbidden" });
    const body = JSON.parse(init.body);
    const id = `commit_${current.commits.size + 1}`;
    current.commits.set(id, current.trees.get(body.tree) || []);
    return jsonResponse(201, { sha: id });
  }
  if (method === "PATCH" && suffix.startsWith("refs/heads/")) {
    if (current.failWrites || current.failRefUpdate) {
      return jsonResponse(422, { message: "reference cannot be updated" });
    }
    const body = JSON.parse(init.body);
    for (const entry of current.commits.get(body.sha) || []) {
      // sha: null は「その path を tree から外す」＝削除。
      if (entry.sha === null) current.files.delete(entry.path);
      else current.files.set(entry.path, entry.content);
    }
    return jsonResponse(200, { object: { sha: body.sha } });
  }
  return jsonResponse(404, { message: "Not Found" });
}

async function stubFetch(url, init = {}) {
  if (!current || !String(url).startsWith("https://api.github.com/")) {
    return realFetch(url, init);
  }
  const method = init.method || "GET";
  if (String(url).includes("/git/")) {
    current.calls.push({ method, path: String(url).split("/git/")[1] });
    return gitDataFetch(url, init, method);
  }

  const path = pathOf(url);
  current.calls.push({ method, path });

  if (current.failWrites && method !== "GET") {
    return jsonResponse(403, { message: "forbidden" });
  }
  if (method === "GET") {
    if (!current.files.has(path)) return jsonResponse(404, { message: "Not Found" });
    return jsonResponse(200, {
      sha: `sha_${path}`,
      encoding: "base64",
      content: Buffer.from(current.files.get(path), "utf8").toString("base64"),
    });
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
 * `failWrites` を true にすると、以降の書き込みが失敗する。
 * `failRefUpdate` を true にすると、まとめ書きの最後（ブランチの付け替え）だけが失敗する。
 */
export function installGitHubStub() {
  globalThis.fetch = stubFetch;
  current = {
    files: new Map(),
    calls: [],
    trees: new Map(),
    commits: new Map(),
    failWrites: false,
    // ファイルは作れたのに、最後の付け替えだけ失敗する場合。
    failRefUpdate: false,
  };
  return current;
}
