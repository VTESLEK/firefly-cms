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
export const POSTS_DIR = "src/content/posts";
export const IMAGE_DIR = "public/shuoshuo/images";
export const POST_IMAGE_DIR = "src/content/posts/images";
export const CONFIG_DIR = "src/config";
export const SPEC_DIR = "src/content/spec";
export const PUBLIC_DIR = "public";

// GitHub Contents API 返回的 base64 内容 → UTF-8 文本
export function decodeDetail(detail) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(String(detail?.content || "").replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
}

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

// 解析标量：行内数组 [a, b] / 带引号字符串 / 裸值
function parseScalar(v) {
  v = v.trim();
  if (v === "[]") return [];
  if (/^\[[\s\S]*\]$/.test(v)) {
    const inner = v.slice(1, -1);
    if (!inner.trim()) return [];
    const items = [];
    let cur = "";
    let inQ = null;
    for (const ch of inner) {
      if (inQ) {
        if (ch === inQ) inQ = null;
        else cur += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQ = ch;
        continue;
      }
      if (ch === ",") {
        items.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    items.push(cur.trim());
    return items.map((s) => s.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  }
  if (/^"[\s\S]*"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  if (/^'[\s\S]*'$/.test(v)) return v.slice(1, -1);
  return v;
}

// 极简解析，覆盖本 CMS 与 Telegram Bot 产出的字段；行内数组与块列表均支持
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
      if (kv[2].trim()) data[currentKey] = parseScalar(kv[2]);
    }
  }
  return { data, content: (m[2] || "").replace(/^\r?\n/, "").replace(/\s+$/, "") };
}

// YAML 双引号字符串（处理转义，含冒号等特殊字符也安全）
export function yq(s) {
  return `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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

/* ---------- 文章表单规范化 ---------- */

const SLUG_RE = /^[\w\u4e00-\u9fa5-]+$/;

// published/updated 取 YYYY-MM-DD；slug 校验后生成文件名，非法时自动兜底
export function normalizeArticle(body) {
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();

  let slug = String(body.slug || "").trim().replace(/\s+/g, "-");
  if (!SLUG_RE.test(slug)) {
    slug = `post-${new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/\D/g, "").slice(0, 14)}`;
  }

  const day = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  let published = String(body.published || "").trim();
  published = /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : day();
  let updated = String(body.updated || "").trim();
  updated = /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : "";

  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((t) => String(t).trim().replace(/["']/g, ""))
    .filter(Boolean)
    .slice(0, 20);

  return {
    file: `${slug}.md`,
    title,
    published,
    updated,
    draft: body.draft === true,
    pinned: body.pinned === true,
    comment: body.comment !== false,
    description: String(body.description || "").trim(),
    image: String(body.image || "").trim(),
    category: String(body.category || "").trim(),
    author: String(body.author || "").trim(),
    tags,
    content,
  };
}

// 文章 frontmatter 构建：字段与博客 zod schema 对齐
export function buildPostMarkdown(p) {
  const lines = ["---", `title: ${yq(p.title)}`, `published: ${p.published}`];
  if (p.updated) lines.push(`updated: ${p.updated}`);
  lines.push(`draft: ${p.draft === true}`, `pinned: ${p.pinned === true}`);
  if (p.description) lines.push(`description: ${yq(p.description)}`);
  if (p.image) lines.push(`image: ${yq(p.image)}`);
  if (p.tags && p.tags.length) {
    lines.push("tags:");
    for (const t of p.tags) lines.push(`  - ${t}`);
  }
  if (p.category) lines.push(`category: ${yq(p.category)}`);
  if (p.author) lines.push(`author: ${yq(p.author)}`);
  if (p.comment === false) lines.push("comment: false");
  lines.push("---", "", String(p.content || "").trim(), "");
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
