// GET  /api/posts  列出全部文章（按发布时间倒序）
// POST /api/posts  新建文章（写入 src/content/posts/<slug>.md）

import {
  json,
  utf8ToB64,
  b64ToUtf8,
  listDir,
  getFile,
  putFile,
  parseFrontmatter,
  buildPostMarkdown,
  normalizeArticle,
  POSTS_DIR,
} from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

// parseScalar 对裸值返回字符串，这里收敛为真布尔
const toBool = (v) => v === true || v === "true";

export async function onRequestGet({ request, env }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  const files = await listDir(env, POSTS_DIR);
  const list = await Promise.all(
    files
      .filter((f) => f.type === "file" && f.name.endsWith(".md"))
      .map(async (f) => {
        try {
          const detail = await getFile(env, POSTS_DIR, f.name);
          const { data } = parseFrontmatter(b64ToUtf8(detail.content || ""));
          return {
            file: f.name,
            title: String(data.title || f.name.replace(/\.md$/, "")),
            published: String(data.published || ""),
            updated: data.updated ? String(data.updated) : "",
            draft: toBool(data.draft),
            pinned: toBool(data.pinned),
            tags: Array.isArray(data.tags) ? data.tags : [],
            category: String(data.category || ""),
            description: String(data.description || ""),
          };
        } catch {
          return null;
        }
      }),
  );
  const posts = list.filter(Boolean).sort((a, b) => {
    const pa = Date.parse(a.published) || 0;
    const pb = Date.parse(b.published) || 0;
    if (pb !== pa) return pb - pa;
    return a.file.localeCompare(b.file);
  });
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
  if (!String(body.title || "").trim()) return json({ error: "标题不能为空" }, 400);
  if (!String(body.content || "").trim()) return json({ error: "正文不能为空" }, 400);
  const post = normalizeArticle(body);
  try {
    await putFile(
      env,
      POSTS_DIR,
      post.file,
      utf8ToB64(buildPostMarkdown(post)),
      `文章 ${post.file} via firefly-cms`,
    );
  } catch (e) {
    if (e.status === 422) return json({ error: "同名文章已存在，请换一个 slug" }, 409);
    return json({ error: String(e.message) }, 502);
  }
  return json({ file: post.file }, 201);
}
