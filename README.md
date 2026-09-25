# Firefly 说说 CMS

独立部署在 Cloudflare Pages 上的说说管理后台。密码登录，服务端持有 GitHub Token，浏览器全程不接触 Token。发布 / 编辑 / 删除说说、上传配图，提交后自动触发博客的 GitHub Actions 部署。

## 部署

### 方式一：Wrangler CLI（推荐）

```bash
npm install
npx wrangler login
npx wrangler pages project create firefly-cms --production-branch main
npx wrangler pages deploy        # 部署 public/ + functions/
```

设置环境变量（第一次全部执行，之后改值可单独重设）：

```bash
npx wrangler pages secret put ACCESS_PASSWORD   # 你的访问密码（建议长随机串）
npx wrangler pages secret put GITHUB_TOKEN      # GitHub Fine-grained PAT（见下）
npx wrangler pages secret put GITHUB_OWNER      # GitHub 用户名
npx wrangler pages secret put GITHUB_REPO       # 仓库名，如 Firefly
npx wrangler pages secret put GITHUB_BRANCH     # 分支，默认 master，可跳过
```

### 方式二：GitHub 连接

把本目录推到一个新 GitHub 仓库，CF Dashboard → Workers & Pages → Create → Pages → Connect to Git，构建命令留空、输出目录 `public`，再在 Settings → Environment variables 里添加上表变量。

## GitHub Token 要求

Fine-grained PAT，Repository access 只勾选博客仓库，Permissions：Contents → Read and write。创建入口：GitHub → Settings → Developer settings → Fine-grained tokens。

## 使用

- 打开 `https://firefly-cms.pages.dev`（或你的自定义域名），输入访问密码
- 发布：内容（支持 Markdown）+ 标签（回车添加）+ 可选配图（自动上传到博客仓库 `public/shuoshuo/images/`）+ 时间（默认当前，东八区）
- 编辑 / 删除：列表卡片上的按钮
- 保存后博客仓库收到提交，自动部署，约 1-3 分钟生效

## 结构

```
public/            纯静态前端（无框架、无构建）
functions/api/     CF Pages Functions 后端
  login.js         POST /api/login     密码 → 签名令牌
  posts.js         GET/POST /api/posts 列表 / 新建
  posts/[file].js  PUT/DELETE          编辑 / 删除
  upload.js        POST /api/upload    配图上传
  _auth.js         HMAC 无状态鉴权
  _gh.js           GitHub Contents API 封装
```

## 安全说明

- 令牌 = HMAC-SHA256(密码, 有效期)，有效期 30 天，改密码即全部失效
- Token 只存在于 CF 服务端环境变量，前端不可见
- 页面已设 noindex；建议访问密码使用 16 位以上随机串
- 本地调试：新建 `.dev.vars` 文件写入上述变量后运行 `npm run dev`
