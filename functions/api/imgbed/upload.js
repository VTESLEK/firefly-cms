// POST /api/imgbed/upload  { filename, data: base64, dir?: "shuoshuo"|"post" }
// 代理 Sanyue ImgHub（CloudFlare-ImgBed v2）/upload 接口
// token 与站点地址通过 Cloudflare Pages 环境变量注入：
//   IMGHUB_BASE  图床实例地址，如 https://img.example.com（不带尾斜杠）
//   IMGHUB_TOKEN API Token（需 upload 权限）
// 成功返回 { path: "https://图床/.../xxx.png" }（完整外链）

import { json } from "../_gh.js";
import { requireAuth, unauthorized } from "../_auth.js";

const EXT_WHITELIST = ["png", "jpg", "jpeg", "gif", "webp", "avif"];
const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};
const FOLDER = { post: "blog/posts", shuoshuo: "blog/shuoshuo" };
// base64 后约 20MB（原图约 15MB），Pages Functions 请求上限 100MB
const MAX_B64 = 20 * 1024 * 1024;

function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// 从各种可能的响应结构中取出图片链接
function pickUrl(payload) {
  const item = Array.isArray(payload) ? payload[0] : payload?.data?.[0] || payload?.data || payload;
  let url = item?.publicUrl || item?.src || item?.url || item?.links?.url || "";
  return typeof url === "string" ? url : "";
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();

  const base = (env.IMGHUB_BASE || "").replace(/\/+$/, "");
  const token = env.IMGHUB_TOKEN || "";
  if (!base || !token) {
    return json({ error: "图床未配置（缺少 IMGHUB_BASE / IMGHUB_TOKEN 环境变量）" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }

  const ext = ((body.filename || "").match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || "";
  if (!EXT_WHITELIST.includes(ext)) {
    return json({ error: `不支持的图片格式：${ext || "未知"}（仅支持 ${EXT_WHITELIST.join("/")}）` }, 400);
  }
  if (!body.data || typeof body.data !== "string") {
    return json({ error: "缺少图片数据" }, 400);
  }
  if (body.data.length > MAX_B64) {
    return json({ error: "图片过大，请压缩到 15MB 以内再上传" }, 413);
  }

  // 去掉可能存在的 data:*;base64, 前缀
  const b64 = body.data.includes(",") ? body.data.split(",").pop() : body.data;
  let blob;
  try {
    blob = b64ToBlob(b64, MIME[ext]);
  } catch {
    return json({ error: "图片数据解析失败" }, 400);
  }

  const folder = FOLDER[body.dir] || "blog";
  const form = new FormData();
  form.append("file", blob, body.filename || `upload.${ext}`);
  const qs = new URLSearchParams({
    returnFormat: "full",
    uploadFolder: folder,
    autoRetry: "true",
  });

  let upstream;
  try {
    upstream = await fetch(`${base}/upload?${qs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
    });
  } catch (e) {
    return json({ error: `图床请求失败：${String(e.message)}` }, 502);
  }

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok || !payload) {
    const msg =
      payload?.message || payload?.error || (typeof payload === "string" ? payload : `图床返回 ${upstream.status}`);
    return json({ error: `图床上传失败：${msg}` }, 502);
  }

  let url = pickUrl(payload);
  if (!url) return json({ error: "图床返回中未找到图片链接" }, 502);
  if (url.startsWith("/")) url = base + url;

  return json({ path: url }, 201);
}
