// GET  /api/shuoshuo  列出全部说说（按时间倒序）
// POST /api/shuoshuo  新建说说

import {
  json,
  utf8ToB64,
  b64ToUtf8,
  listDir,
  getFile,
  putFile,
  parseFrontmatter,
  buildMarkdown,
  normalizePost,
  SHUOSHUO_DIR,
} from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  const files = await listDir(env, SHUOSHUO_DIR);
  const list = await Promise.all(
    files
      .filter((f) => f.type === "file" && f.name.endsWith(".md"))
      .map(async (f) => {
        try {
          const detail = await getFile(env, SHUOSHUO_DIR, f.name);
          const { data, content } = parseFrontmatter(b64ToUtf8(detail.content || ""));
          return {
            file: f.name,
            date: data.date || "",
            tags: Array.isArray(data.tags) ? data.tags : [],
            image: data.image || "",
            content,
          };
        } catch {
          return null;
        }
      }),
  );
  const posts = list
    .filter(Boolean)
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return json({ posts });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }
  if (!String(body.content || "").trim()) {
    return json({ error: "内容不能为空" }, 400);
  }
  const post = normalizePost(body);
  try {
    await putFile(
      env,
      SHUOSHUO_DIR,
      post.filename,
      utf8ToB64(buildMarkdown(post)),
      `说说 ${post.filename} via firefly-cms`,
    );
  } catch (e) {
    if (e.status === 422) return json({ error: "同名说说已存在（同一秒发布），请稍后再发" }, 409);
    return json({ error: String(e.message) }, 502);
  }
  return json({ file: post.filename }, 201);
}
