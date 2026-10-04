// GET /api/config              配置文件清单（含是否支持表单编辑）
// GET /api/config?file=xxx.ts  读取单个配置文件内容
// PUT /api/config              保存配置文件 { file, content }

import { json, utf8ToB64, getFile, putFile, decodeDetail, CONFIG_DIR } from "./_gh.js";
import { requireAuth, unauthorized } from "./_auth.js";

// 白名单：仅允许读写 src/config 下的这些文件（防止任意路径写入）
export const CONFIG_FILES = [
	"siteConfig.ts",
	"homeConfig.ts",
	"commentConfig.ts",
	"footerConfig.ts",
	"navBarConfig.ts",
	"friendsConfig.ts",
	"sponsorConfig.ts",
	"calendarConfig.ts",
	"guestbookConfig.ts",
	"galleryConfig.ts",
	"announcementConfig.ts",
	"coverImageConfig.ts",
	"pioConfig.ts",
	"musicConfig.ts",
	"fontConfig.ts",
	"licenseConfig.ts",
	"expressiveCodeConfig.ts",
	"plantumlConfig.ts",
	"mermaidConfig.ts",
	"llmsConfig.ts",
	"collectionsApiConfig.ts",
];

// 表单标签（源码编辑器下拉用）
export const CONFIG_LABELS = {
	"siteConfig.ts": "站点信息",
	"homeConfig.ts": "首页",
	"commentConfig.ts": "评论",
	"footerConfig.ts": "页脚",
	"navBarConfig.ts": "导航栏",
	"friendsConfig.ts": "友链",
	"sponsorConfig.ts": "打赏",
	"calendarConfig.ts": "日历",
	"guestbookConfig.ts": "留言板",
	"galleryConfig.ts": "相册",
	"announcementConfig.ts": "公告",
	"coverImageConfig.ts": "封面图",
	"pioConfig.ts": "看板娘",
	"musicConfig.ts": "音乐",
	"fontConfig.ts": "字体",
	"licenseConfig.ts": "文章许可",
	"expressiveCodeConfig.ts": "代码块",
	"plantumlConfig.ts": "PlantUML",
	"mermaidConfig.ts": "Mermaid",
	"llmsConfig.ts": "LLMS",
	"collectionsApiConfig.ts": "收藏API",
};

const MAX_CONTENT = 300 * 1024;

export async function onRequestGet({ request, env }) {
	if (!(await requireAuth(request, env))) return unauthorized();
	const file = new URL(request.url).searchParams.get("file");
	if (!file) {
		return json({
			files: CONFIG_FILES.map((name) => ({ name, label: CONFIG_LABELS[name] || name })),
		});
	}
	if (!CONFIG_FILES.includes(file)) return json({ error: "非法配置文件名" }, 400);
	try {
		const detail = await getFile(env, CONFIG_DIR, file);
		return json({ name: file, content: decodeDetail(detail) });
	} catch (e) {
		if (e.status === 404) return json({ error: `配置文件不存在：${file}` }, 404);
		return json({ error: `读取配置失败：${e.message}` }, 502);
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
	if (!CONFIG_FILES.includes(file)) return json({ error: "非法配置文件名" }, 400);
	if (!content.trim()) return json({ error: "内容不能为空" }, 400);
	if (!/export\s+const\s+\w+\s*[:=]/.test(content)) {
		return json({ error: "内容不像配置文件（缺少 export const），请检查是否误删" }, 400);
	}
	if (content.length > MAX_CONTENT) return json({ error: "文件过大" }, 413);

	// 基于远端最新版本写入，避免 sha 冲突
	let detail;
	try {
		detail = await getFile(env, CONFIG_DIR, file);
	} catch (e) {
		if (e.status === 404) detail = null;
		else return json({ error: `读取配置失败：${e.message}` }, 502);
	}
	try {
		await putFile(
			env,
			CONFIG_DIR,
			file,
			utf8ToB64(content),
			`更新配置 ${file} via firefly-cms`,
			detail?.sha,
		);
	} catch (e) {
		return json({ error: `保存配置失败：${e.message}` }, 502);
	}
	return json({ ok: true });
}
