// GET    /api/posts/<file>  读取完整文章（编辑用）
// PUT    /api/posts/<file>  更新文章（文件名/slug 不可改）
// DELETE /api/posts/<file>  删除文章

import {
  json,
  utf8ToB64,
  b64ToUtf8,
  getFile,
  putFile,
  deleteFile,
  parseFrontmatter,
  buildPostMarkdown,
  normalizeArticle,
  POSTS_DIR,
} from "../_gh.js";
import { requireAuth, unauthorized } from "../_auth.js";

// 文章文件名即 slug：字母数字下划线连字符或中文
const NAME_RE = /^[\w\u4e00-\u9fa5-]+\.md$/;

// parseScalar 对裸值返回字符串，这里收敛为真布尔
const toBool = (v) => v === true || v === "true";
const isFalse = (v) => v === false || v === "false";

export async function onRequestGet({ request, env, params }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  const name = params.file;
  if (!NAME_RE.test(name)) return json({ error: "非法文件名" }, 400);

  try {
    const detail = await getFile(env, POSTS_DIR, name);
    const { data, content } = parseFrontmatter(b64ToUtf8(detail.content || ""));
    return json({
      file: name,
      title: String(data.title || ""),
      published: String(data.published || ""),
      updated: data.updated ? String(data.updated) : "",
      draft: toBool(data.draft),
      pinned: toBool(data.pinned),
      comment: !isFalse(data.comment),
      tags: Array.isArray(data.tags) ? data.tags : [],
      category: String(data.category || ""),
      description: String(data.description || ""),
      image: String(data.image || ""),
      author: String(data.author || ""),
      content,
    });
  } catch (e) {
    if (e.status === 404) return json({ error: "文章不存在，可能已被删除" }, 404);
    return json({ error: String(e.message) }, 502);
  }
}

export async function onRequestPut({ request, env, params }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  const name = params.file;
  if (!NAME_RE.test(name)) return json({ error: "非法文件名" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }
  if (!String(body.title || "").trim()) return json({ error: "标题不能为空" }, 400);
  if (!String(body.content || "").trim()) return json({ error: "正文不能为空" }, 400);

  try {
    const old = await getFile(env, POSTS_DIR, name);
    // slug 锁定为当前文件名，编辑不支持改名
    const post = normalizeArticle({ ...body, slug: name.replace(/\.md$/, "") });
    await putFile(
      env,
      POSTS_DIR,
      name,
      utf8ToB64(buildPostMarkdown(post)),
      `更新文章 ${name} via firefly-cms`,
      old.sha,
    );
    return json({ ok: true, file: name });
  } catch (e) {
    if (e.status === 404) return json({ error: "文章不存在，可能已被删除" }, 404);
    return json({ error: String(e.message) }, 502);
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  const name = params.file;
  if (!NAME_RE.test(name)) return json({ error: "非法文件名" }, 400);

  try {
    const old = await getFile(env, POSTS_DIR, name);
    await deleteFile(env, POSTS_DIR, name, old.sha);
    return json({ ok: true });
  } catch (e) {
    if (e.status === 404) return json({ error: "文章不存在，可能已被删除" }, 404);
    return json({ error: String(e.message) }, 502);
  }
}
