// POST /api/upload  { filename, data: base64, dir?: "shuoshuo"|"post" }
// dir=shuoshuo（默认）→ 博客仓库 public/shuoshuo/images/，返回 /shuoshuo/images/xx.png
// dir=post → 博客仓库 src/content/posts/images/，返回 ./images/xx.png（文章相对路径）

import { json, putFile, IMAGE_DIR, POST_IMAGE_DIR } from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

const EXT_WHITELIST = ["png", "jpg", "jpeg", "gif", "webp", "avif"];

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();

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
  if (body.data.length > 9 * 1024 * 1024) {
    // GitHub Contents API 单文件上限 100MB，但 base64 走 JSON，取 6.7MB 原图保守值
    return json({ error: "图片过大，请压缩后再上传（原图约 6MB 以内）" }, 413);
  }

  const isPost = body.dir === "post";
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  try {
    await putFile(env, isPost ? POST_IMAGE_DIR : IMAGE_DIR, name, body.data, `上传配图 ${name} via firefly-cms`);
  } catch (e) {
    return json({ error: String(e.message) }, 502);
  }
  return json({ path: isPost ? `./images/${name}` : `/shuoshuo/images/${name}` }, 201);
}
