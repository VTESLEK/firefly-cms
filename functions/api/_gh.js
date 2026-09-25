// 共享工具：GitHub Contents API 封装 + Markdown frontmatter 处理
// 以 _ 开头的文件不会被 Pages Functions 当作路由

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/* ---------- UTF-8 安全的 Base64 ---------- */

export function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------- GitHub Contents API ---------- */

const API = "https://api.github.com";

export const SHUOSHUO_DIR = "src/content/shuoshuo";
export const IMAGE_DIR = "public/shuoshuo/images";

function gh(env, path, options = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "firefly-cms",
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  });
}

const base = (env, dir) => `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${dir}`;
const refQ = (env) => `?ref=${env.GITHUB_BRANCH || "master"}`;

export const listDir = (env, dir) => gh(env, base(env, dir) + refQ(env));

export const getFile = (env, dir, name) =>
  gh(env, `${base(env, dir)}/${encodeURIComponent(name)}${refQ(env)}`);

export function putFile(env, dir, name, contentB64, message, sha) {
  const body = { message, branch: env.GITHUB_BRANCH || "master", content: contentB64 };
  if (sha) body.sha = sha;
  return gh(env, `${base(env, dir)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

export function deleteFile(env, dir, name, sha) {
  return gh(env, `${base(env, dir)}/${encodeURIComponent(name)}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: `删除 ${dir}/${name} via firefly-cms`,
      branch: env.GITHUB_BRANCH || "master",
      sha,
    }),
    headers: { "content-type": "application/json" },
  });
}

/* ---------- Markdown frontmatter ---------- */

// 极简解析，覆盖本 CMS 与 Telegram Bot 产出的字段（date / tags / image）
export function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, content: md };
  const data = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") && currentKey) {
      const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
      if (Array.isArray(data[currentKey])) data[currentKey].push(item);
      else if (data[currentKey] === undefined) data[currentKey] = [item];
      continue;
    }
    const kv = trimmed.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const v = kv[2].trim().replace(/^["']|["']$/g, "");
      if (v === "[]") data[currentKey] = [];
      else if (v) data[currentKey] = v;
    }
  }
  return { data, content: (m[2] || "").replace(/^\r?\n/, "").replace(/\s+$/, "") };
}

// date 为带时区的 ISO 字符串（不加引号，让 js-yaml 解析成 Date）
export function buildMarkdown({ date, tags = [], image = "", content = "" }) {
  const lines = ["---", `date: ${date}`];
  if (image) lines.push(`image: ${image}`);
  if (tags.length) {
    lines.push("tags:");
    for (const t of tags) lines.push(`  - ${t}`);
  }
  lines.push("---", "", content.trim(), "");
  return lines.join("\n");
}

/* ---------- 表单数据规范化 ---------- */

// date 兼容 datetime-local 的 "YYYY-MM-DDTHH:mm(:ss)"，按东八区写入
export function normalizePost(body) {
  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((t) => String(t).trim().replace(/["']/g, ""))
    .filter(Boolean)
    .slice(0, 10);
  const image = String(body.image || "").trim();
  const content = String(body.content || "").trim();

  let date = String(body.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)) date += ":00+08:00";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) date += "+08:00";
  else if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    // 兜底：按东八区取当前时间
    date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19) + "+08:00";
  }

  // 文件名取 YYYYMMDDHHmmss，可排序且基本唯一
  const filename = `${date.replace(/[-:T+]/g, "").slice(0, 14)}.md`;
  return { date, tags, image, content, filename };
}
