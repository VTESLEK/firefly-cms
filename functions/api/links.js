// GET /api/links  读取博客友链（解析 src/config/friendsConfig.ts）
// PUT /api/links  全量保存友链（只替换 friendsConfig 数组段，文件其余内容原样保留）

import { json, utf8ToB64, getFile, putFile } from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

const FRIENDS_FILE_DIR = "src/config";
const FRIENDS_FILE_NAME = "friendsConfig.ts";
const ARRAY_MARKER = "export const friendsConfig: FriendLink[] =";

/* ---------- TS 数组段定位 ---------- */

// 返回 { segStart, segEnd, body }：数组 [ 与 ]; 之间的内容（不含两端括号）
export function locateArray(source) {
  const markerAt = source.indexOf(ARRAY_MARKER);
  if (markerAt === -1) return null;
  const open = source.indexOf("[", markerAt + ARRAY_MARKER.length);
  if (open === -1) return null;
  const close = source.indexOf("\n];", open);
  if (close === -1) return null;
  return { segStart: open + 1, segEnd: close, body: source.slice(open + 1, close) };
}

/* ---------- 解析（容忍注释 / 单双引号 / 尾逗号） ---------- */

// 去掉字符串外的注释后按顶层大括号切分对象
export function splitObjects(body) {
  const objs = [];
  let depth = 0;
  let start = -1;
  let inStr = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      const nl = body.indexOf("\n", i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = body.indexOf("*/", i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        objs.push(body.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objs;
}

function pickString(obj, key) {
  const m = obj.match(
    new RegExp(`${key}\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`),
  );
  if (!m) return "";
  return (m[1] !== undefined ? m[1] : m[2]).replace(/\\(["'\\])/g, "$1");
}

function pickTags(obj) {
  const m = obj.match(/tags\s*:\s*\[([^\]]*)\]/);
  if (!m) return [];
  const tags = [];
  for (const t of m[1].matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
    const v = (t[1] !== undefined ? t[1] : t[2]).replace(/\\(["'\\])/g, "$1").trim();
    if (v) tags.push(v);
  }
  return tags;
}

export function parseLink(obj) {
  return {
    title: pickString(obj, "title"),
    imgurl: pickString(obj, "imgurl"),
    desc: pickString(obj, "desc"),
    siteurl: pickString(obj, "siteurl"),
    tags: pickTags(obj),
    weight: Number((obj.match(/weight\s*:\s*(-?\d+)/) || [])[1] || 0),
    enabled: (obj.match(/enabled\s*:\s*(true|false)/) || [])[1] !== "false",
  };
}

/* ---------- 序列化 ---------- */

const q = (s) => `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function serializeLink(link) {
  const lines = [
    "\t{",
    `\t\ttitle: ${q(link.title)},`,
    `\t\timgurl: ${q(link.imgurl)},`,
    `\t\tdesc: ${q(link.desc)},`,
    `\t\tsiteurl: ${q(link.siteurl)},`,
    `\t\ttags: [${(link.tags || []).map(q).join(", ")}],`,
    `\t\tweight: ${Number(link.weight) || 0},`,
    `\t\tenabled: ${link.enabled !== false},`,
    "\t},",
  ];
  return lines.join("\n");
}

export function serializeLinks(links) {
  if (!links.length) return "\n";
  return "\n" + links.map(serializeLink).join("\n") + "\n";
}

/* ---------- 校验 ---------- */

function normalizeLink(raw) {
  const title = String(raw.title || "").trim();
  const siteurl = String(raw.siteurl || "").trim();
  if (!title) return { error: "友链名称不能为空" };
  if (!/^https?:\/\/.+/.test(siteurl)) return { error: `站点地址不合法：${siteurl || title}` };
  return {
    link: {
      title,
      imgurl: String(raw.imgurl || "").trim(),
      desc: String(raw.desc || "").trim(),
      siteurl,
      tags: (Array.isArray(raw.tags) ? raw.tags : [])
        .map((t) => String(t).trim().replace(/["'\\]/g, ""))
        .filter(Boolean)
        .slice(0, 6),
      weight: Number.isFinite(Number(raw.weight)) ? Math.trunc(Number(raw.weight)) : 0,
      enabled: raw.enabled !== false,
    },
  };
}

/* ---------- 路由 ---------- */

export async function onRequestGet({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  let detail;
  try {
    detail = await getFile(env, FRIENDS_FILE_DIR, FRIENDS_FILE_NAME);
  } catch (e) {
    return json({ error: `读取友链配置失败：${e.message}` }, 502);
  }
  const source = new TextDecoder().decode(
    Uint8Array.from(atob(String(detail.content || "").replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
  const seg = locateArray(source);
  if (!seg) return json({ error: "friendsConfig.ts 中未找到 friendsConfig 数组，文件格式可能已变更" }, 500);
  const links = splitObjects(seg.body).map(parseLink);
  return json({ links });
}

export async function onRequestPut({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }
  if (!Array.isArray(body.links)) return json({ error: "links 必须是数组" }, 400);

  const links = [];
  for (const raw of body.links) {
    const { link, error } = normalizeLink(raw);
    if (error) return json({ error }, 400);
    links.push(link);
  }

  // 基于远端最新内容做替换，避免覆盖其他文件改动
  let detail;
  try {
    detail = await getFile(env, FRIENDS_FILE_DIR, FRIENDS_FILE_NAME);
  } catch (e) {
    return json({ error: `读取友链配置失败：${e.message}` }, 502);
  }
  const source = new TextDecoder().decode(
    Uint8Array.from(atob(String(detail.content || "").replace(/\s/g, "")), (c) => c.charCodeAt(0)),
  );
  const seg = locateArray(source);
  if (!seg) return json({ error: "friendsConfig.ts 中未找到 friendsConfig 数组，文件格式可能已变更" }, 500);

  const updated = source.slice(0, seg.segStart) + serializeLinks(links) + source.slice(seg.segEnd);
  try {
    await putFile(
      env,
      FRIENDS_FILE_DIR,
      FRIENDS_FILE_NAME,
      utf8ToB64(updated),
      `友链更新（${links.length} 条）via firefly-cms`,
      detail.sha,
    );
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      return json({ error: "保存冲突：配置文件刚被其他操作修改，请刷新后重试" }, 409);
    }
    return json({ error: String(e.message) }, 502);
  }
  return json({ saved: links.length }, 200);
}
