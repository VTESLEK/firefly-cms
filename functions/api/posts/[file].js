// PUT    /api/posts/<file>  更新说说
// DELETE /api/posts/<file>  删除说说

import {
  json,
  utf8ToB64,
  getFile,
  putFile,
  deleteFile,
  buildMarkdown,
  normalizePost,
  SHUOSHUO_DIR,
} from "../_gh.js";
import { requireAuth, unauthorized } from "../_auth.js";

const NAME_RE = /^[\w-]+\.md$/;

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
  if (!String(body.content || "").trim()) {
    return json({ error: "内容不能为空" }, 400);
  }

  try {
    const old = await getFile(env, SHUOSHUO_DIR, name);
    const post = normalizePost(body);
    await putFile(
      env,
      SHUOSHUO_DIR,
      name,
      utf8ToB64(buildMarkdown(post)),
      `更新说说 ${name} via firefly-cms`,
      old.sha,
    );
    return json({ ok: true, file: name });
  } catch (e) {
    if (e.status === 404) return json({ error: "说说不存在，可能已被删除" }, 404);
    return json({ error: String(e.message) }, 502);
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await requireAuth(request, env))) return unauthorized();
  const name = params.file;
  if (!NAME_RE.test(name)) return json({ error: "非法文件名" }, 400);

  try {
    const old = await getFile(env, SHUOSHUO_DIR, name);
    await deleteFile(env, SHUOSHUO_DIR, name, old.sha);
    return json({ ok: true });
  } catch (e) {
    if (e.status === 404) return json({ error: "说说不存在，可能已被删除" }, 404);
    return json({ error: String(e.message) }, 502);
  }
}
