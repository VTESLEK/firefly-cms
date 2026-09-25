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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
