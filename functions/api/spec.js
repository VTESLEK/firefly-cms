// GET /api/spec              页面文件清单（src/content/spec/）
// GET /api/spec?file=xxx.md  读取单个页面内容
// PUT /api/spec              保存页面 { file, content }

import { json, utf8ToB64, listDir, getFile, putFile, decodeDetail, SPEC_DIR } from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

// 文件名白名单：md / mdx，不含路径分隔符
const NAME_RE = /^[A-Za-z0-9_-]+\.(md|mdx)$/;
const MAX_CONTENT = 200 * 1024;

export const SPEC_LABELS = {
	"about.mdx": "关于",
	"friends.mdx": "友链页",
	"guestbook.md": "留言板页",
	"privacy.md": "隐私政策",
	"user-agreement.md": "用户协议",
	"log.md": "更新日志",
};

export async function onRequestGet({ request, env }) {
	if (!(await requireAuth(request, env))) return unauthorized();
	const file = new URL(request.url).searchParams.get("file");
	if (!file) {
		try {
			const files = await listDir(env, SPEC_DIR);
			return json({
				files: files
					.filter((f) => f.type === "file" && NAME_RE.test(f.name))
					.map((f) => ({
						name: f.name,
						size: f.size,
						label: SPEC_LABELS[f.name] || f.name.replace(/\.(md|mdx)$/, ""),
					})),
			});
		} catch (e) {
			if (e.status === 404) return json({ files: [] });
			return json({ error: `读取页面列表失败：${e.message}` }, 502);
		}
	}
	if (!NAME_RE.test(file)) return json({ error: "非法页面文件名" }, 400);
	try {
		const detail = await getFile(env, SPEC_DIR, file);
		return json({ name: file, label: SPEC_LABELS[file] || file, content: decodeDetail(detail) });
	} catch (e) {
		if (e.status === 404) return json({ error: `页面不存在：${file}` }, 404);
		return json({ error: `读取页面失败：${e.message}` }, 502);
	}
}

export async function onRequestPut({ request, env }) {
	if (!(await requireAuth(request, env))) return unauthorized();
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "请求体不是合法 JSON" }, 400);
	}
	const file = String(body.file || "");
	const content = String(body.content ?? "");
	if (!NAME_RE.test(file)) return json({ error: "非法页面文件名" }, 400);
	if (!content.trim()) return json({ error: "内容不能为空" }, 400);
	if (content.length > MAX_CONTENT) return json({ error: "内容过大" }, 413);

	let detail;
	try {
		detail = await getFile(env, SPEC_DIR, file);
	} catch (e) {
		if (e.status === 404) detail = null;
		else return json({ error: `读取页面失败：${e.message}` }, 502);
	}
	try {
		await putFile(
			env,
			SPEC_DIR,
			file,
			utf8ToB64(content),
			`更新页面 ${file} via firefly-cms`,
			detail?.sha,
		);
	} catch (e) {
		return json({ error: `保存页面失败：${e.message}` }, 502);
	}
	return json({ ok: true });
}
