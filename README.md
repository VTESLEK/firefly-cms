# Firefly CMS

部署在 Cloudflare Pages 上的个人博客内容管理后台。密码登录，GitHub Token 与图床 Token 全程只存在于服务端，浏览器不接触任何凭据。写完即提交到博客仓库，自动触发部署。

![工作台](https://d9f.cc.cd/file/cms-dashboard.png)

## 功能

- **工作台**：文章 / 草稿 / 说说 / 友链统计，最近文章速览
- **文章管理**：Markdown 编辑器（格式工具栏、字数统计），拖拽 / 粘贴 / 选择三种方式插图并自动上传图床，支持 Slug、日期、分类、标签、摘要、封面、草稿 / 置顶 / 评论开关
- **说说管理**：后台直接发布说说，Markdown + 配图，可编辑删除
- **友链管理**：可视化增删改、权重排序、启用停用，一次性保存提交
- **界面定制**：明暗模式、系统主色、界面圆角；Art Design Pro 风格，多标签页 + 可折叠侧边栏
- **自动部署**：保存即 commit 到博客仓库，GitHub Actions 自动构建，约 1-3 分钟生效

## 截图

| 工作台 | 文章编辑器 |
| --- | --- |
| ![工作台](https://d9f.cc.cd/file/cms-dashboard.png) | ![文章编辑器](https://d9f.cc.cd/file/cms-posts-editor.png) |

| 说说管理 | 友链管理 |
| --- | --- |
| ![说说管理](https://d9f.cc.cd/file/cms-shuoshuo.png) | ![友链管理](https://d9f.cc.cd/file/cms-links.png) |

## 原理

```text
[ 浏览器：CMS 后台 ]
        │  密码登录（HMAC 签名令牌）
        ▼
[ Cloudflare Pages Functions ] ── 图片上传 ──► [ 图床（CloudFlare-ImgBed v2）]
        │  持有 GitHub Token（仅服务端）
        ▼
[ GitHub Contents API：提交 Markdown / JSON ]
        │  commit 触发
        ▼
[ 博客 GitHub Actions 自动构建部署 ]
```

无数据库：文章是 Markdown 文件、友链是 JSON 文件，直接落在博客仓库里，仓库即备份。前端无构建步骤，Vue 3 + Element Plus 以 IIFE 形式 vendor 在 `public/vendor/`，克隆即最终产物。

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
npx wrangler pages secret put ACCESS_PASSWORD   # 访问密码（建议 16 位以上随机串）
npx wrangler pages secret put GITHUB_TOKEN      # GitHub Fine-grained PAT（见下）
npx wrangler pages secret put GITHUB_OWNER      # GitHub 用户名
npx wrangler pages secret put GITHUB_REPO       # 博客仓库名
npx wrangler pages secret put GITHUB_BRANCH     # 博客分支，默认 master，可跳过
npx wrangler pages secret put IMGHUB_BASE       # 图床地址，如 https://img.example.com（不带尾斜杠）
npx wrangler pages secret put IMGHUB_TOKEN      # 图床 API Token（需 upload 权限）
```

### 方式二：GitHub 连接

把本仓库推到一个新的 GitHub 仓库，CF Dashboard → Workers & Pages → Create → Pages → Connect to Git，构建命令留空、输出目录 `public`，再在 Settings → Environment variables 里添加上表变量。

## 环境变量说明

| 变量 | 必填 | 说明 |
| ---- | ---- | ---- |
| `ACCESS_PASSWORD` | 是 | 访问密码 |
| `GITHUB_TOKEN` | 是 | Fine-grained PAT，只授权博客仓库、Contents → Read and write |
| `GITHUB_OWNER` | 是 | GitHub 用户名 |
| `GITHUB_REPO` | 是 | 博客仓库名 |
| `GITHUB_BRANCH` | 否 | 博客分支，默认 `master` |
| `IMGHUB_BASE` | 否 | 图床实例地址，不配则图片上传不可用 |
| `IMGHUB_TOKEN` | 否 | 图床 API Token（需 upload 权限） |

GitHub Token 创建入口：GitHub → Settings → Developer settings → **Fine-grained tokens**。Repository access 只勾选博客仓库，Permissions 只需 **Contents → Read and write**。

## 使用

- 打开 `https://firefly-cms.pages.dev`（或你的自定义域名），输入访问密码
- **写文章**：文章管理 → 写新文章，正文支持 Markdown，图片可直接拖入或 Ctrl+V 粘贴
- **发说说**：说说管理，支持配图，时间默认当前（东八区）
- **管友链**：友链管理，本地编辑完成后点「保存全部更改」
- 保存后博客仓库收到提交，自动部署，约 1-3 分钟生效

## 结构

```
public/                 纯静态前端（无框架、无构建）
  vendor/               Vue 3 / Element Plus 本地 IIFE
  app.js                前端逻辑（Vue 3 组合式）
functions/api/          CF Pages Functions 后端
  login.js              POST /api/login          密码 → 签名令牌
  posts.js              GET/POST /api/posts      文章列表 / 新建
  posts/[file].js       PUT/DELETE               文章编辑 / 删除
  shuoshuo.js           GET/POST /api/shuoshuo   说说列表 / 发布
  shuoshuo/[file].js    PUT/DELETE               说说编辑 / 删除
  links.js              GET/PUT /api/links       友链读取 / 保存
  imgbed/upload.js      POST /api/imgbed/upload  图床上传代理
  upload.js             POST /api/upload         图床代理（旧版入口）
  _auth.js              HMAC 无状态鉴权
  _gh.js                GitHub Contents API 封装
test.mjs                后端单元测试（node test.mjs）
```

## 安全说明

- 令牌 = HMAC-SHA256(密码, 有效期)，有效期 30 天，改密码即全部失效
- GitHub Token 与图床 Token 只存在于 CF 服务端环境变量，前端不可见
- 图片上传经服务端代理，前端只拿到最终外链
- 页面已设 `noindex, nofollow`；建议访问密码使用 16 位以上随机串
- 本地调试：新建 `.dev.vars` 文件写入上述变量后运行 `npm run dev`

## License

[MIT](LICENSE)
