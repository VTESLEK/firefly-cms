// POST /api/login  { password }  →  { token }

import { json } from "./_gh.js";
import { checkEnv, issueToken } from "./_auth.js";

export async function onRequestPost({ request, env }) {
  const envError = checkEnv(env);
  if (envError) return json({ error: `服务端未配置完成：${envError}` }, 500);

  let password = "";
  try {
    ({ password } = await request.json());
  } catch {
    /* ignore */
  }
  if (!password || password !== env.ACCESS_PASSWORD) {
    return json({ error: "访问密码错误" }, 401);
  }
  return json({ token: await issueToken(env) });
}
