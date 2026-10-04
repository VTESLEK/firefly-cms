// ConfigForms — src/config/*.ts 的字段级解析与回写（纯函数，无依赖）
// 原理：按 Biome 格式化约定（tab 缩进、双引号、行尾逗号）定位 "key:" 锚点，
// 扫描值的范围（字符串/括号深度感知）后整段替换。源码编辑器作为兜底手段。
// node 环境可 require 本文件做单元测试（UMD 挂到 globalThis）。
(function (g) {
	"use strict";

	/* ---------- 底层扫描 ---------- */

	// 跳过空白后扫描一个"值"的范围 [start, end)：
	// 终止于深度 0 的逗号或换行（字符串与 [] {} 深度感知）
	function scanValue(src, from) {
		let i = from;
		while (i < src.length && /\s/.test(src[i])) i++;
		const start = i;
		let depth = 0;
		let inStr = null;
		for (; i < src.length; i++) {
			const ch = src[i];
			if (inStr) {
				if (ch === "\\") i++;
				else if (ch === inStr) inStr = null;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === "`") {
				inStr = ch;
				continue;
			}
			if (ch === "[" || ch === "{") depth++;
			else if (ch === "]" || ch === "}") depth--;
			else if (depth === 0 && (ch === "," || ch === "\n")) break;
		}
		return [start, i];
	}

	// 在 [lo, hi) 内查找 depth 层 tab 缩进的 key:，返回冒号后位置；未找到返回 -1
	function findKeyInRange(src, key, depth, lo, hi) {
		const re = new RegExp("\\n\\t{" + depth + "}" + key + "\\s*:");
		const m = src.slice(lo, hi).match(re);
		if (!m) return -1;
		return lo + m.index + m[0].length;
	}

	// marker（如 "waline: {"）后第一个 { 到匹配 } 的内容范围 [open+1, close)
	function findBlockRange(src, marker) {
		const at = src.indexOf(marker);
		if (at === -1) return null;
		const open = src.indexOf("{", at + marker.length - 1);
		if (open === -1) return null;
		let depth = 0;
		let inStr = null;
		for (let i = open; i < src.length; i++) {
			const ch = src[i];
			if (inStr) {
				if (ch === "\\") i++;
				else if (ch === inStr) inStr = null;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === "`") {
				inStr = ch;
				continue;
			}
			if (ch === "{" || ch === "[") depth++;
			else if (ch === "}" || ch === "]") {
				depth--;
				if (depth === 0) return [open + 1, i];
			}
		}
		return null;
	}

	// 字段定位：block 为嵌套 marker 数组，逐层缩小范围
	function locateField(src, field) {
		let lo = 0;
		let hi = src.length;
		if (field.block && field.block.length) {
			for (const marker of field.block) {
				const r = findBlockRange(src.slice(lo, hi), marker);
				if (!r) return -1;
				lo += r[0];
				hi = lo + (r[1] - r[0]);
			}
		}
		return findKeyInRange(src, field.key, field.depth, lo, hi);
	}

	// 读取字段原始值文本
	function rawValue(src, field) {
		const at = locateField(src, field);
		if (at === -1) throw new Error(`未找到配置项 ${field.key}`);
		const [vs, ve] = scanValue(src, at);
		return src.slice(vs, ve);
	}

	// 替换字段值并返回新源码
	function replaceField(src, field, serialized) {
		const at = locateField(src, field);
		if (at === -1) throw new Error(`未找到配置项 ${field.key}`);
		const [vs, ve] = scanValue(src, at);
		return src.slice(0, vs) + serialized + src.slice(ve);
	}

	// 顶层数组（anchor 如 "\n\tlinks: ["）的内容范围 [open+1, close)
	function findArrayRange(src, anchor) {
		const at = src.indexOf(anchor);
		if (at === -1) return null;
		const open = src.indexOf("[", at + anchor.length - 1);
		if (open === -1) return null;
		let depth = 0;
		let inStr = null;
		for (let i = open; i < src.length; i++) {
			const ch = src[i];
			if (inStr) {
				if (ch === "\\") i++;
				else if (ch === inStr) inStr = null;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === "`") {
				inStr = ch;
				continue;
			}
			if (ch === "[" || ch === "{") depth++;
			else if (ch === "]" || ch === "}") {
				depth--;
				if (depth === 0) return [open + 1, i];
			}
		}
		return null;
	}

	// 切分数组内容里的顶层对象（字符串/深度感知，容忍注释）
	function splitObjects(body) {
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

	/* ---------- 序列化 ---------- */

	function q(s) {
		return `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}

	function serializeValue(v, field, eol = "\n") {
		switch (field.type) {
			case "string":
			case "enum":
				return q(v);
			case "number":
				return String(Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
			case "boolean":
				return v === true || v === "true" ? "true" : "false";
			case "stringArray":
				return `[${(Array.isArray(v) ? v : []).map(q).join(", ")}]`;
			default:
				return String(v);
		}
	}

	// 块状字符串数组（与源文件多行数组格式一致：每行一项，闭括号与 key 对齐）
	function serializeArrayBlock(items, depth, eol = "\n") {
		if (!Array.isArray(items) || !items.length) return "[]";
		const t = "\t".repeat(depth + 1);
		return (
			"[" +
			eol +
			items.map((s) => t + q(s) + ",").join(eol) +
			eol +
			"\t".repeat(depth) +
			"]"
		);
	}

	function parseScalar(raw, type) {
		raw = String(raw ?? "").trim();
		switch (type) {
			case "string":
			case "enum": {
				const m = raw.match(/^"([\s\S]*)"$/) || raw.match(/^'([\s\S]*)'$/);
				return m ? m[1].replace(/\\(["'\\])/g, "$1") : raw;
			}
			case "number": {
				const n = Number(raw);
				return Number.isFinite(n) ? n : 0;
			}
			case "boolean":
				return raw === "true";
			case "stringArray": {
				const inner = raw.match(/^\[([\s\S]*)\]$/);
				if (!inner || !inner[1].trim()) return [];
				const items = [];
				let cur = "";
				let inStr = null;
				const body = inner[1];
				for (let i = 0; i < body.length; i++) {
					const ch = body[i];
					if (inStr) {
						if (ch === "\\") {
							cur += ch + (body[i + 1] || "");
							i++;
							continue;
						}
						if (ch === inStr) {
							inStr = null;
							continue;
						}
						cur += ch;
						continue;
					}
					if (ch === '"' || ch === "'") {
						inStr = ch;
						continue;
					}
					if (ch === ",") {
						items.push(cur.trim());
						cur = "";
						continue;
					}
					cur += ch;
				}
				if (cur.trim()) items.push(cur.trim());
				return items
					.map((s) => s.replace(/^["']|["']$/g, "").replace(/\\(["'\\])/g, "$1"))
					.filter(Boolean);
			}
			default:
				return raw;
		}
	}

	/* ---------- objectList（对象数组） ---------- */

	function pickString(obj, key) {
		const m = obj.match(
			new RegExp(`${key}\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`),
		);
		if (!m) return "";
		return (m[1] !== undefined ? m[1] : m[2]).replace(/\\(["'\\])/g, "$1");
	}

	function parseObjectList(src, field) {
		const r = findArrayRange(src, field.anchor);
		if (!r) throw new Error(`未找到列表 ${field.label || field.anchor}`);
		return splitObjects(src.slice(r[0], r[1])).map((obj) => {
			const item = {};
			for (const col of field.columns) {
				if (col.type === "boolean") {
					item[col.key] = (obj.match(new RegExp(`${col.key}\\s*:\\s*(true|false)`)) || [])[1] !== "false";
				} else if (col.type === "number") {
					item[col.key] = Number((obj.match(new RegExp(`${col.key}\\s*:\\s*(-?\\d+)`)) || [])[1] || 0);
				} else {
					item[col.key] = pickString(obj, col.key);
				}
			}
			// 记录原文与初值（不可枚举，不影响 JSON/渲染）：未改动的项序列化时原样回写，
			// 保持源文件里 Biome 换行等格式不变
			Object.defineProperty(item, "__raw", { value: obj, enumerable: false });
			Object.defineProperty(item, "__orig", { value: { ...item }, enumerable: false });
			return item;
		});
	}

	// 所有列的值与初始解析值一致 → 视为未改动
	function objUnchanged(item, field) {
		if (!item || !item.__orig) return false;
		return field.columns.every((col) => item[col.key] === item.__orig[col.key]);
	}

	function serializeObjectList(items, field, eol = "\n") {
		const t = "\t";
		// 闭括号缩进与 key 对齐（anchor 形如 "\n\tlinks: ["）
		const indent = ((field.anchor.match(/\n(\t+)/) || [])[1] || "").length;
		const body = (Array.isArray(items) ? items : [])
			.map((item) => {
				// 未改动项：原文回写（含原格式）
				if (objUnchanged(item, field) && typeof item.__raw === "string") {
					return `${t}${t}${item.__raw},`;
				}
				const lines = [`${t}${t}{`];
				for (const col of field.columns) {
					const v = item[col.key];
					// optional 列：值为空时整行省略（与源文件可选字段保持一致）
					if (col.optional && (v === "" || v == null)) continue;
					const out =
						col.type === "boolean"
							? v === true || v === "true"
							: col.type === "number"
								? Number.isFinite(Number(v))
									? Math.trunc(Number(v))
									: 0
								: q(v);
					lines.push(`${t}${t}${t}${col.key}: ${out},`);
				}
				lines.push(`${t}${t}},`);
				return lines.join(eol);
			})
			.join(eol);
		if (!body) return "";
		return eol + body + eol + t.repeat(indent);
	}

	/* ---------- 表单定义 ---------- */

	const FORMS = {
		"siteConfig.ts": {
			label: "站点信息",
			groups: [
				{
					title: "基本信息",
					fields: [
						{ key: "title", depth: 1, type: "string", label: "站点标题" },
						{ key: "subtitle", depth: 1, type: "string", label: "副标题" },
						{ key: "site_url", depth: 1, type: "string", label: "站点 URL" },
						{ key: "description", depth: 1, type: "string", label: "站点描述", textarea: true },
						{ key: "keywords", depth: 1, type: "stringArray", label: "关键词（逗号分隔）" },
						{ key: "defaultOgImage", depth: 1, type: "string", image: true, label: "默认 OG 图" },
					],
				},
				{
					title: "外观",
					fields: [
						{ key: "hue", depth: 2, block: ["themeColor: {"], type: "number", label: "主题色相（0-360）", min: 0, max: 360 },
						{ key: "fixed", depth: 2, block: ["themeColor: {"], type: "boolean", label: "隐藏主题色选择器" },
						{ key: "defaultMode", depth: 2, block: ["themeColor: {"], type: "enum", options: ["light", "dark", "system"], label: "默认明暗模式" },
						{ key: "pageWidth", depth: 1, type: "number", label: "页面宽度（rem）", min: 60, max: 200 },
					],
				},
				{
					title: "功能",
					fields: [
						{ key: "siteStartDate", depth: 1, type: "string", label: "建站日期（YYYY-MM-DD）" },
						{ key: "postsPerPage", depth: 2, block: ["pagination: {"], type: "number", label: "每页文章数", min: 1, max: 50 },
						{ key: "generateOgImages", depth: 1, type: "boolean", label: "生成 OG 分享图" },
						{ key: "postShare", depth: 1, type: "boolean", label: "文章分享按钮" },
						{ key: "showLastModified", depth: 1, type: "boolean", label: "显示上次编辑时间" },
					],
				},
				{
					title: "页面开关（关闭后返回 404）",
					fields: [
						{ key: "friends", depth: 2, block: ["pages: {"], type: "boolean", label: "友链页" },
						{ key: "sponsor", depth: 2, block: ["pages: {"], type: "boolean", label: "打赏页" },
						{ key: "guestbook", depth: 2, block: ["pages: {"], type: "boolean", label: "留言板页" },
						{ key: "gallery", depth: 2, block: ["pages: {"], type: "boolean", label: "相册页" },
						{ key: "collections", depth: 2, block: ["pages: {"], type: "boolean", label: "收藏API页" },
						{ key: "music", depth: 2, block: ["pages: {"], type: "boolean", label: "音乐页" },
						{ key: "postList", depth: 2, block: ["pages: {"], type: "boolean", label: "文档列表页" },
						{ key: "archive", depth: 2, block: ["pages: {"], type: "boolean", label: "归档页" },
						{ key: "about", depth: 2, block: ["pages: {"], type: "boolean", label: "关于页" },
						{ key: "categories", depth: 2, block: ["pages: {"], type: "boolean", label: "图谱页" },
					],
				},
				{
					title: "访问统计（Umami）",
					fields: [
						{ key: "scriptUrl", depth: 3, block: ["analytics: {", "umamiAnalytics: {"], type: "string", label: "Umami 脚本地址（跟踪代码里 script 的 src）" },
						{ key: "websiteId", depth: 3, block: ["analytics: {", "umamiAnalytics: {"], type: "string", label: "Website ID（跟踪代码 data-website-id）" },
						{ key: "shareId", depth: 3, block: ["analytics: {", "umamiAnalytics: {"], type: "string", label: "Share ID（共享链接 /share/ 后那段）" },
					],
				},
				{
					title: "访问统计（自建计数器）",
					fields: [
						{ key: "apiUrl", depth: 3, block: ["analytics: {", "visitorCounter: {"], type: "string", label: "计数器 API 地址（如 https://stats.xane.eu.cc）" },
						{ key: "site", depth: 3, block: ["analytics: {", "visitorCounter: {"], type: "string", label: "站点标识（域名，如 xane.eu.cc）" },
					],
				},
			],
		},
		"homeConfig.ts": {
			label: "首页",
			groups: [
				{
					title: "个人信息",
					fields: [
						{ key: "avatar", depth: 1, type: "string", image: true, label: "头像地址" },
						{ key: "name", depth: 1, type: "string", label: "名字" },
						{ key: "displayName", depth: 1, type: "string", label: "展示名字（留空用名字）" },
						{ key: "bio", depth: 1, type: "stringArray", label: "个性签名（每行一条，循环打字）", textarea: true },
					],
				},
				{
					title: "首屏",
					fields: [
						{ key: "backgroundImage", depth: 2, block: ["hero: {"], type: "string", image: true, label: "首屏背景图" },
						{ key: "mobileBackgroundImage", depth: 2, block: ["hero: {"], type: "string", image: true, label: "手机壁纸（留空用电脑壁纸）" },
						{ key: "enabled", depth: 3, block: ["hero: {", "rain: {"], type: "boolean", label: "玻璃雨珠动画" },
					],
				},
				{
					title: "社交链接（图标集：fa7-brands / fa7-solid / material-symbols / simple-icons）",
					fields: [
						{
							anchor: "\n\tlinks: [",
							type: "objectList",
							label: "首页链接",
							columns: [
								{ key: "name", type: "string", label: "名称" },
								{ key: "icon", type: "string", label: "图标" },
								{ key: "url", type: "string", label: "地址" },
								{ key: "showName", type: "boolean", label: "显示名称" },
							],
						},
					],
				},
			],
		},
		"commentConfig.ts": {
			label: "评论",
			groups: [
				{
					title: "评论系统",
					fields: [
						{ key: "type", depth: 1, type: "enum", options: ["none", "twikoo", "waline", "giscus", "disqus", "artalk"], label: "评论系统类型" },
						{ key: "serverURL", depth: 2, block: ["waline: {"], type: "string", label: "Waline 服务地址" },
						{ key: "login", depth: 2, block: ["waline: {"], type: "enum", options: ["enable", "force", "disable"], label: "Waline 登录模式" },
						{ key: "visitorCount", depth: 2, block: ["waline: {"], type: "boolean", label: "Waline 访问量统计" },
						{ key: "envId", depth: 2, block: ["twikoo: {"], type: "string", label: "Twikoo 环境地址" },
						{ key: "shortname", depth: 2, block: ["disqus: {"], type: "string", label: "Disqus 短名" },
					],
				},
			],
		},
		"footerConfig.ts": {
			label: "页脚",
			groups: [
				{
					title: "社交链接",
					fields: [
						{
							anchor: "\n\tsocialLinks: [",
							type: "objectList",
							label: "页脚链接",
							columns: [
								{ key: "label", type: "string", label: "名称" },
								{ key: "href", type: "string", label: "链接" },
								{ key: "icon", type: "string", label: "图标" },
							],
						},
					],
				},
				{
					title: "备案信息（留空不显示）",
					fields: [
						{ key: "icp", depth: 2, block: ["beian: {"], type: "string", label: "ICP 备案号" },
						{ key: "police", depth: 2, block: ["beian: {"], type: "string", label: "公安备案号" },
					],
				},
			],
		},
		"announcementConfig.ts": {
			label: "公告",
			groups: [
				{
					title: "公告设置",
					fields: [
						{ key: "title", depth: 1, type: "string", label: "公告标题" },
						{ key: "closable", depth: 1, type: "boolean", label: "允许访客关闭公告" },
					],
				},
				{
					title: "公告列表（sort 越大越靠前）",
					fields: [
						{
							anchor: "\n\titems: [",
							type: "objectList",
							label: "公告列表",
							columns: [
								{ key: "tag", type: "string", label: "标签" },
								{ key: "title", type: "string", label: "标题" },
								{ key: "content", type: "string", textarea: true, label: "内容" },
								{ key: "time", type: "string", label: "日期" },
								{ key: "link", type: "string", optional: true, label: "链接（可留空）" },
								{ key: "sort", type: "number", label: "排序" },
							],
						},
					],
				},
			],
		},
	};

	// 展开字段：补 id（block 路径 + key），供表单渲染与定位
	function flatFields(file) {
		const def = FORMS[file];
		if (!def) return [];
		const out = [];
		for (const group of def.groups) {
			for (const f of group.fields) {
				out.push({
					...f,
					id: f.type === "objectList" ? f.anchor : (f.block ? f.block.join(" > ") + " > " : "") + (f.key || ""),
					key: f.key || "",
				});
			}
		}
		return out;
	}

	// 源码 → { values, lists }
	function extract(src, file) {
		const values = {};
		const lists = {};
		for (const f of flatFields(file)) {
			if (f.type === "objectList") {
				try {
					lists[f.id] = parseObjectList(src, f);
				} catch {
					lists[f.id] = [];
				}
				continue;
			}
			try {
				values[f.id] = parseScalar(rawValue(src, f), f.type);
			} catch {
				values[f.id] = f.type === "boolean" ? false : f.type === "number" ? 0 : "";
			}
		}
		return { values, lists };
	}

	// 表单值 → 新源码（只触碰定义过的字段，其余原样保留）；任一定位失败抛错
	function apply(src, file, values, lists) {
		const eol = src.includes("\r\n") ? "\r\n" : "\n";
		let out = src;
		for (const f of flatFields(file)) {
			if (f.type === "objectList") {
				const r = findArrayRange(out, f.anchor);
				if (!r) throw new Error(`未找到列表 ${f.label}`);
				out = out.slice(0, r[0]) + serializeObjectList(lists?.[f.id] || [], f, eol) + out.slice(r[1]);
				continue;
			}
			const v = values?.[f.id];
			let ser;
			if (f.type === "stringArray") {
				// 源文件里是块状数组（跨行）则保持块状格式
				let raw = "";
				try {
					raw = rawValue(out, f);
				} catch {
					/* ignore */
				}
				ser = raw.includes("\n") ? serializeArrayBlock(v, f.depth, eol) : serializeValue(v, f, eol);
			} else {
				ser = serializeValue(v, f, eol);
			}
			out = replaceField(out, f, ser);
		}
		return out;
	}

	// 模板直接遍历 FORMS 渲染，字段统一补 id（objectList 用 anchor，其余用 block 路径 + key），
	// 与 extract/apply 里 flatFields 的 id 公式保持一致
	for (const def of Object.values(FORMS)) {
		for (const g of def.groups) {
			for (const f of g.fields) {
				f.id = f.type === "objectList" ? f.anchor : (f.block ? f.block.join(" > ") + " > " : "") + (f.key || "");
			}
		}
	}

	const api = {
		FORMS,
		flatFields,
		extract,
		apply,
		// 内部函数（测试用）
		scanValue,
		findKeyInRange,
		findBlockRange,
		findArrayRange,
		splitObjects,
		parseObjectList,
		serializeObjectList,
		parseScalar,
		serializeValue,
		q,
		rawValue,
		replaceField,
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	g.ConfigForms = api;
})(typeof window !== "undefined" ? window : globalThis);
