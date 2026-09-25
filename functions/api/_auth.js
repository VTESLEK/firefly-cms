// 无状态鉴权：HMAC(password, payload) 签名令牌
// 令牌格式：<payloadBase64>.<hmacBase64>，payload 内含过期时间

import { json, utf8ToB64 } from "./_gh.js";

export async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 校验通过返回 payload，失败返回 null
export async function requireAuth(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = await hmacSign(parts[0], env.ACCESS_PASSWORD || "");
  if (!safeEqual(expected, parts[1])) return null;
  try {
    const payload = JSON.parse(atob(parts[0]));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const unauthorized = () => json({ error: "未登录或登录已过期" }, 401);

// 校验服务端环境变量是否齐全
export function checkEnv(env) {
  const missing = ["ACCESS_PASSWORD", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"].filter(
    (k) => !env[k],
  );
  return missing.length ? `缺少环境变量: ${missing.join(", ")}` : null;
}

export const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

export async function issueToken(env) {
  const payloadB64 = utf8ToB64(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  const sig = await hmacSign(payloadB64, env.ACCESS_PASSWORD);
  return `${payloadB64}.${sig}`;
}
