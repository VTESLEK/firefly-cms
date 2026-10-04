// GET    /api/assets?dir=favicon  列出 public/<dir> 下的条目
// POST   /api/assets              上传/替换文件 { path: "favicon/favicon.ico", data: base64 }
// DELETE /api/assets              删除文件 { path }

import { json, getFile, putFile, deleteFile, listDir, PUBLIC_DIR } from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

// 允许上传/删除的扩展名（站点静态资源）
const EXT_WHITELIST = [
	"png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "ico", "cur", "bmp",
	"woff", "woff2", "ttf", "otf", "mp3", "mp4", "webm",
	"txt", "json", "xml", "webmanifest", "md",
];
const MAX_B64 = 9 * 1024 * 1024; // base64 体积上限（约 6.7MB 原文件）

// 校验并规范化目录/文件路径（相对 public/），非法返回 null
export function normalizePath(raw, { allowEmpty = false } = {}) {
	let p = String(raw || "").trim().replace(/\\/g, "/");
	if (!p) return allowEmpty ? "" : null;
	if (p.endsWith("/")) p = p.slice(0, -1);
	if (p.startsWith("/")) p = p.slice(1);
	const parts = p.split("/");
	for (const part of parts) {
		if (!part || part === "." || part === "..") return null;
		if (!/^[A-Za-z0-9._\u4e00-\u9fa5-]+$/.test(part)) return null;
	}
	return p;
}

const extOf = (p) => ((p.match(/\.([A-Za-z0-9]+)$/) || [])[1] || "").toLowerCase();

export async function onRequestGet({ request, env }) {
	if (!(await requireAuth(request, env))) return unauthorized();
	const dir = normalizePath(new URL(request.url).searchParams.get("dir") || "", { allowEmpty: true });
	if (dir === null) return json({ error: "非法目录" }, 400);
	try {
		const files = await listDirPublic(env, dir);
		return json({
			dir,
			entries: files
				.filter((f) => f.type === "file" || f.type === "dir")
				.map((f) => ({ name: f.name, type: f.type, size: f.size || 0 })),
		});
	} catch (e) {
		if (e.status === 404) return json({ error: "目录不存在" }, 404);
		return json({ error: `读取资源列表失败：${e.message}` }, 502);
	}
}

export async function onRequestPost({ request, env }) {
	if (!(await requireAuth(request, env))) return unauthorized();
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "请求体不是合法 JSON" }, 400);
	}
	const path = normalizePath(body.path);
	if (!path) return json({ error: "非法文件路径" }, 400);
	const ext = extOf(path);
	if (!EXT_WHITELIST.includes(ext)) {
		return json({ error: `不支持的文件类型：${ext || "未知"}` }, 400);
	}
	if (!body.data || typeof body.data !== "string") return json({ error: "缺少文件数据" }, 400);
	if (body.data.length > MAX_B64) return json({ error: "文件过大（原图约 6MB 以内）" }, 413);

	// 已存在则带上 sha 覆盖
	let oldSha;
	let replaced = false;
	try {
		const old = await getFile(env, PUBLIC_DIR, path);
		oldSha = old.sha;
		replaced = true;
	} catch {
		/* 新文件 */
	}
	try {
		await putFile(
			env,
			PUBLIC_DIR,
			path,
			body.data,
			`${replaced ? "替换" : "上传"} public/${path} via firefly-cms`,
			oldSha,
		);
	} catch (e) {
		return json({ error: `上传失败：${e.message}` }, 502);
	}
	return json({ ok: true, path: `/${path}`, replaced }, replaced ? 200 : 201);
}

export async function onRequestDelete({ request, env }) {
	if (!(await requireAuth(request, env))) return unauthorized();
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "请求体不是合法 JSON" }, 400);
	}
	const path = normalizePath(body.path);
	if (!path) return json({ error: "非法文件路径" }, 400);
	const ext = extOf(path);
	if (!EXT_WHITELIST.includes(ext)) return json({ error: `不支持的文件类型：${ext || "未知"}` }, 400);
	try {
		const old = await getFile(env, PUBLIC_DIR, path);
		await deleteFile(env, PUBLIC_DIR, path, old.sha);
	} catch (e) {
		if (e.status === 404) return json({ error: "文件不存在" }, 404);
		return json({ error: `删除失败：${e.message}` }, 502);
	}
	return json({ ok: true });
}

const listDirPublic = (env, dir) => listDir(env, dir ? `${PUBLIC_DIR}/${dir}` : PUBLIC_DIR);
