// 临时单测：node test.mjs
import { parseFrontmatter, buildMarkdown, normalizePost, utf8ToB64, b64ToUtf8 } from "./functions/api/_gh.js";
import { hmacSign, requireAuth, issueToken, checkEnv } from "./functions/api/_auth.js";

let pass = 0;
let fail = 0;
function eq(actual, expected, name) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

/* 1. build → parse round-trip */
const post = {
  date: "2026-09-25T12:30:00+08:00",
  tags: ["日常", "夜宵", " coding "],
  image: "/shuoshuo/images/abc.png",
  content: "第一行\n\n第二行 **加粗**",
};
const md = buildMarkdown(post);
const back = parseFrontmatter(md);
eq(back.data.date, post.date, "round-trip date");
eq(back.data.image, post.image, "round-trip image");
eq(back.data.tags, ["日常", "夜宵", "coding"], "round-trip tags (trimmed)");
eq(back.content, post.content, "round-trip content");
eq(md.includes("---\n"), true, "md starts with ---");

/* 2. telegram 风格的旧格式（无时区 date、tags 块）也能解析 */
const oldMd = `---\ndate: 2026-09-25 12:00:00\ntags:\n  - 测试\n  - Bot\n---\n\n旧格式内容\n`;
const oldBack = parseFrontmatter(oldMd);
eq(oldBack.data.date, "2026-09-25 12:00:00", "legacy naive date");
eq(oldBack.data.tags, ["测试", "Bot"], "legacy tags");
eq(oldBack.content, "旧格式内容", "legacy content");

/* 3. 无 frontmatter 的文件 */
eq(parseFrontmatter("纯文本").content, "纯文本", "no frontmatter");

/* 4. normalizePost：datetime-local 补时区 */
const n1 = normalizePost({ content: " hi ", tags: [" a ", "b", "a"], date: "2026-09-25T09:05" });
eq(n1.date, "2026-09-25T09:05:00+08:00", "normalize minute precision");
eq(n1.tags, ["a", "b", "a"], "normalize tags keep dupes");
eq(n1.filename, "20260925090500.md", "normalize filename");
const n2 = normalizePost({ content: "x", date: "2026-09-25T09:05:30" });
eq(n2.date, "2026-09-25T09:05:30+08:00", "normalize second precision");
const n3 = normalizePost({ content: "x", date: "" });
eq(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(n3.date), true, "fallback now +08:00");
eq(/^\d{14}\.md$/.test(n3.filename), true, "fallback filename");

/* 5. base64 UTF-8 round-trip */
const s = "中文🎉emoji + English + \n换行";
eq(b64ToUtf8(utf8ToB64(s)), s, "b64 utf8 round-trip");

/* 6. HMAC 鉴权 round-trip */
const env = { ACCESS_PASSWORD: "test-pass-123", GITHUB_TOKEN: "t", GITHUB_OWNER: "o", GITHUB_REPO: "r" };
const token = await issueToken(env);
const fakeReq = new Request("https://x/api/posts", { headers: { Authorization: `Bearer ${token}` } });
eq((await requireAuth(fakeReq, env)) !== null, true, "auth valid token");
const badReq = new Request("https://x/api/posts", { headers: { Authorization: "Bearer a.b" } });
eq(await requireAuth(badReq, env), null, "auth invalid token");
const noReq = new Request("https://x/api/posts");
eq(await requireAuth(noReq, env), null, "auth missing header");
eq(checkEnv(env), null, "checkEnv ok");
eq(checkEnv({}).includes("ACCESS_PASSWORD"), true, "checkEnv missing");

/* 7. 篡改令牌（换密码后） */
const otherEnv = { ...env, ACCESS_PASSWORD: "changed" };
eq(await requireAuth(fakeReq, otherEnv), null, "auth rejects after password change");

/* 8. 友链：解析真实 friendsConfig.ts → 序列化 → 替换 → round-trip */
import { readFileSync } from "node:fs";
import { locateArray, splitObjects, parseLink, serializeLinks } from "./functions/api/links.js";

const friendsSrc = readFileSync(new URL("../Firefly/src/config/friendsConfig.ts", import.meta.url), "utf-8");
const seg = locateArray(friendsSrc);
eq(seg !== null, true, "friends array located");
const parsed = splitObjects(seg.body).map(parseLink);
eq(parsed.length, 7, "friends parsed count");
eq(parsed[0].title, "xane", "friends[0] title");
eq(parsed[0].enabled, false, "friends[0] enabled=false");
eq(parsed[2].tags, ["Framework"], "friends[2] tags");
eq(parsed[2].weight, 100, "friends[2] weight");
eq(parsed[3].siteurl, "https://blog.olinl.com", "friends[3] siteurl");
eq(parsed[4].desc, "坐而言不如起而行.", "friends[4] desc (indent noise)");

// round-trip：序列化后替换回文件，再次解析应完全一致
const updated = friendsSrc.slice(0, seg.segStart) + serializeLinks(parsed) + friendsSrc.slice(seg.segEnd);
const seg2 = locateArray(updated);
const reparsed = splitObjects(seg2.body).map(parseLink);
eq(reparsed, parsed, "friends round-trip identical");

// 文件其余部分未被改动（friendsPageConfig 与 getEnabledFriends 原样保留）
eq(updated.slice(0, seg.segStart), friendsSrc.slice(0, seg.segStart), "prefix untouched");
eq(updated.slice(seg2.segEnd), friendsSrc.slice(seg.segEnd), "suffix untouched");
eq(updated.includes("export const getEnabledFriends"), true, "getter preserved");

// 特殊字符转义 round-trip
const tricky = [
  { title: '带"引号"的站点', imgurl: "https://a.b/c.png", desc: "反斜杠\\与\"引号\"", siteurl: "https://t.co", tags: ["A", "B"], weight: 1, enabled: true },
];
const segT = locateArray(updated);
const updatedT = updated.slice(0, segT.segStart) + serializeLinks(tricky) + updated.slice(segT.segEnd);
const rtT = splitObjects(locateArray(updatedT).body).map(parseLink);
eq(rtT, tricky, "tricky quotes round-trip");

// 空数组序列化
eq(serializeLinks([]).trim(), "", "empty serialize");

/* 9. 文章：normalizeArticle → buildPostMarkdown → parseFrontmatter round-trip */
import { buildPostMarkdown, normalizeArticle } from "./functions/api/_gh.js";

const art = normalizeArticle({
  title: '测试"文章": 标题',
  slug: "test-post",
  published: "2026-09-26",
  updated: "2026-09-27",
  description: '描述 with "quotes"',
  tags: ["Astro", "博客"],
  category: "技术",
  draft: true,
  content: "正文第一段\n\n## 二级标题",
});
eq(art.file, "test-post.md", "article filename");
const artMd = buildPostMarkdown(art);
const artBack = parseFrontmatter(artMd);
eq(artBack.data.title, '测试"文章": 标题', "article title round-trip");
eq(artBack.data.published, "2026-09-26", "article published");
eq(artBack.data.updated, "2026-09-27", "article updated");
eq(artBack.data.draft, "true", "article draft bare true");
eq(artBack.data.pinned, "false", "article pinned bare false");
eq(artBack.data.tags, ["Astro", "博客"], "article tags");
eq(artBack.data.category, "技术", "article category");
eq(artBack.data.description, '描述 with "quotes"', "article description");
eq(artBack.content, "正文第一段\n\n## 二级标题", "article content");
eq(artMd.includes("comment:"), false, "comment field omitted by default");
eq(artMd.includes("image:"), false, "image field omitted when empty");

/* 10. 文章：slug 兜底 / comment:false / published 兜底 */
const art2 = normalizeArticle({ title: "t", content: "c", slug: "bad slug!" });
eq(/^post-\d{14}\.md$/.test(art2.file), true, "invalid slug falls back");
const art3 = normalizeArticle({ title: "t", content: "c", slug: "  my-post  " });
eq(art3.file, "my-post.md", "slug trimmed");
const art4 = normalizeArticle({ title: "t", content: "c", comment: false });
eq(buildPostMarkdown(art4).includes("comment: false"), true, "comment false written");
const art5 = normalizeArticle({ title: "t", content: "c", published: "" });
eq(/^\d{4}-\d{2}-\d{2}$/.test(art5.published), true, "published falls back to today");
const art6 = normalizeArticle({ title: "t", content: "c", draft: true, pinned: true });
eq(art6.draft === true && art6.pinned === true, true, "draft/pinned strict boolean");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
