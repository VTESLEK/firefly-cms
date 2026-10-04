// Firefly CMS — Vue 3 + Element Plus（Art Design Pro 风格，无构建）
// 页面：工作台 / 文章管理 / 页面内容 / 站点配置 / 静态资源 / 友链管理

const PAGE_NAMES = {
	dashboard: "工作台",
	posts: "文章管理",
	spec: "页面内容",
	config: "站点配置",
	assets: "静态资源",
	links: "友链管理",
};
const PRIMARY_COLORS = ["#5D87FF", "#B48DF3", "#1D84FF", "#60C041", "#38C0FC", "#F9901F", "#FF80C8"];
const BLOG_URL = "https://xane.eu.cc";

const { createApp } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

/* ---------- 主题工具 ---------- */

function applyPrimaryVar(color) {
  const s = document.documentElement.style;
  const mix = (c1, c2, w) => `color-mix(in srgb, ${c1} ${w}%, ${c2})`;
  s.setProperty("--el-color-primary", color);
  s.setProperty("--el-color-primary-dark-2", mix(color, "#000000", 80));
  s.setProperty("--el-color-primary-light-3", mix(color, "#ffffff", 70));
  s.setProperty("--el-color-primary-light-5", mix(color, "#ffffff", 50));
  s.setProperty("--el-color-primary-light-7", mix(color, "#ffffff", 30));
  s.setProperty("--el-color-primary-light-8", mix(color, "#ffffff", 20));
  s.setProperty("--el-color-primary-light-9", mix(color, "#ffffff", 10));
  s.setProperty("--primary", color);
}

function applyRadiusVar(r) {
  document.documentElement.style.setProperty("--radius", r + "px");
}

function applyDarkVar(dark) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("cms_theme", dark ? "dark" : "light");
}

/* ---------- 小工具 ---------- */

// 今天（东八区），用于 date 输入默认值
function today() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const App = {
  data() {
    return {
      token: localStorage.getItem("cms_token") || "",
      loggedIn: false,
      password: "",
      loginLoading: false,

      // 布局
      page: "dashboard",
      tabs: [{ key: "dashboard", title: PAGE_NAMES.dashboard }],
      collapsed: false,
      mobileOpen: false,
      isMobile: false,

      // 主题
      dark: document.documentElement.classList.contains("dark"),
      primary: localStorage.getItem("cms_primary") || PRIMARY_COLORS[0],
      radius: Number(localStorage.getItem("cms_radius")) || 12,
      settingsOpen: false,
      primaryColors: PRIMARY_COLORS,

      // 工作台
      dashboardLoading: false,
      recentError: "",
      stats: { posts: 0, drafts: 0, spec: 0, links: 0 },
      recentPosts: [],

      // 文章
      posts: [],
      postsLoading: false,
      editorView: false,
      editingPostFile: null,
      savingPost: false,
      dragDepth: 0,
      dragActive: false,
      imgUploading: false,
      imgDone: 0,
      imgTotal: 0,
      pf: {
        title: "", slug: "", published: "", updated: "", category: "",
        description: "", image: "", draft: false, pinned: false, comment: true, content: "",
      },
      pTags: [],
      pTagInput: "",

      // 页面内容（spec）
      specFiles: [],
      specLoading: false,
      specError: "",
      specEditorView: false,
      editingSpecFile: null,
      editingSpecLabel: "",
      savingSpec: false,
      specContent: "",

      // 站点配置
      configFiles: [],
      configFilesLoaded: false,
      cfgMode: "form",
      cfgTab: "siteConfig.ts",
      cfgError: "",
      cfgLoading: false,
      cfgSaving: false,
      cfgLoadedFiles: [],
      cfgValues: {},
      cfgLists: {},
      cfgRawFile: "siteConfig.ts",
      cfgRawContent: "",
      cfgRawOriginal: "",
      cfgRawLoading: false,
      cfgRawSaving: false,

      // 静态资源
      assetDir: "",
      assetEntries: [],
      assetLoading: false,
      assetError: "",
      assetUploading: false,
      assetDragDepth: 0,
      assetDragActive: false,
      assetPreviewOpen: false,
      assetPreview: null,

      // 友链
      links: [],
      linksLoading: false,
      linksError: "",
      linksDirty: false,
      savingLinks: false,
      editingLinkIndex: null,
      lf: { title: "", siteurl: "", imgurl: "", tags: "", desc: "", weight: 0, enabled: true },
    };
  },

  computed: {
    menuCollapsed() {
      return this.collapsed && !this.isMobile;
    },
    isDesktopCollapsed() {
      return this.collapsed && !this.isMobile;
    },
    sidebarToggleIcon() {
      const hidden = this.isMobile ? !this.mobileOpen : this.collapsed;
      return hidden ? "EpiExpand" : "EpiFold";
    },
    breadcrumbItems() {
      if (this.page === "posts" && this.editorView) {
        return ["文章管理", this.editingPostFile ? "编辑文章" : "写新文章"];
      }
      if (this.page === "dashboard") return [];
      return [PAGE_NAMES[this.page]];
    },
    statCards() {
      return [
        { label: "文章总数", value: this.stats.posts, icon: "EpiDocument", color: "#5D87FF", bg: "rgba(93,135,255,.14)" },
        { label: "草稿箱", value: this.stats.drafts, icon: "EpiEditPen", color: "#F9901F", bg: "rgba(249,144,31,.14)" },
        { label: "页面内容", value: this.stats.spec, icon: "EpiNotebook", color: "#38C0FC", bg: "rgba(56,192,252,.14)" },
        { label: "友链（启用）", value: this.stats.links, icon: "EpiLink", color: "#B48DF3", bg: "rgba(180,141,243,.16)" },
      ];
    },
    wordcount() {
      return this.pf.content.replace(/\s/g, "").length;
    },
    saveLabel() {
      return this.editingPostFile ? "保存修改" : this.pf.draft ? "存为草稿" : "发布文章";
    },
    coverSrc() {
      if (!this.pf.image) return "";
      return this.pf.image.startsWith("./") ? this.pf.image.replace("./", "/posts/") : this.pf.image;
    },
    linksCountText() {
      const enabled = this.links.filter((l) => l.enabled).length;
      return `共 ${this.links.length} 条 · 启用 ${enabled} 条${this.linksDirty ? " · 有未保存修改" : ""}`;
    },
    cfgDef() {
      return (window.ConfigForms || {}).FORMS?.[this.cfgTab] || null;
    },
    cfgFormFiles() {
      const FORMS = (window.ConfigForms || {}).FORMS || {};
      return Object.keys(FORMS).map((k) => ({ value: k, label: `${FORMS[k].label}（${k}）` }));
    },
    cfgRawFiles() {
      return this.configFiles.map((f) => ({ value: f.name, label: `${f.label || f.name}（${f.name}）` }));
    },
    cfgRawDirty() {
      return this.cfgRawContent !== this.cfgRawOriginal;
    },
    assetCrumbs() {
      const crumbs = [{ name: "public/", path: "" }];
      if (!this.assetDir) return crumbs;
      const parts = this.assetDir.split("/");
      let acc = "";
      for (const p of parts) {
        acc = acc ? `${acc}/${p}` : p;
        crumbs.push({ name: p, path: acc });
      }
      return crumbs;
    },
  },

  methods: {
    /* ---------- API ---------- */
    async api(path, options = {}) {
      // 超时保护：手机弱网/网络切换时 fetch 可能永远挂起，导致 loading 遮罩卡死
      const { timeout = 25000, ...rest } = options;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let res;
      try {
        res = await fetch(path, {
          ...rest,
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
            ...(rest.headers || {}),
          },
        });
      } catch (e) {
        if (e.name === "AbortError") throw new Error("请求超时，请检查网络后重试");
        throw new Error("网络连接失败，请检查网络后重试");
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && path !== "/api/login") {
        this.forceLogout();
        throw new Error(data.error || "登录已过期，请重新登录");
      }
      if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
      return data;
    },

    /* ---------- 登录 / 退出 ---------- */
    async login() {
      if (!this.password) return;
      this.loginLoading = true;
      try {
        const { token } = await this.api("/api/login", {
          method: "POST",
          body: JSON.stringify({ password: this.password }),
        });
        this.token = token;
        localStorage.setItem("cms_token", token);
        this.loggedIn = true;
        this.tabs = [{ key: "dashboard", title: PAGE_NAMES.dashboard }];
        this.handleMenuSelect("dashboard");
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.loginLoading = false;
      }
    },
    forceLogout() {
      localStorage.removeItem("cms_token");
      this.token = "";
      this.loggedIn = false;
      this.password = "";
    },
    logout() {
      ElMessageBox.confirm("确定退出登录？", "提示", {
        type: "warning",
        confirmButtonText: "退出",
        cancelButtonText: "取消",
      })
        .then(() => this.forceLogout())
        .catch(() => {});
    },
    onUserCommand(cmd) {
      if (cmd === "blog") window.open(BLOG_URL);
      else if (cmd === "logout") this.logout();
    },

    /* ---------- 主题 ---------- */
    setDark(v) {
      this.dark = v;
      applyDarkVar(v);
    },
    setPrimary(c) {
      this.primary = c;
      applyPrimaryVar(c);
      localStorage.setItem("cms_primary", c);
    },
    setRadius(r) {
      applyRadiusVar(r);
      localStorage.setItem("cms_radius", String(r));
    },

    /* ---------- 导航 / 多标签 ---------- */
    toggleSidebar() {
      if (this.isMobile) this.mobileOpen = !this.mobileOpen;
      else this.collapsed = !this.collapsed;
    },
    handleMenuSelect(key) {
      if (!this.tabs.find((t) => t.key === key)) {
        this.tabs.push({ key, title: PAGE_NAMES[key] });
      }
      this.page = key;
      this.mobileOpen = false;
      this.doLoad(key);
    },
    closeTab(key) {
      if (key === "dashboard") return;
      const idx = this.tabs.findIndex((t) => t.key === key);
      if (idx === -1) return;
      this.tabs.splice(idx, 1);
      if (this.page === key) {
        const next = this.tabs[Math.max(0, idx - 1)];
        this.page = next.key;
        this.doLoad(next.key);
      }
    },
    doLoad(page) {
      if (page === "dashboard") this.loadDashboard();
      else if (page === "posts") {
        if (!this.editorView) this.loadArticles();
      } else if (page === "spec") this.loadSpecList();
      else if (page === "config") this.loadConfigPage();
      else if (page === "assets") this.loadAssets(this.assetDir);
      else if (page === "links") this.loadLinks();
    },

    /* ---------- 工作台 ---------- */
    async loadDashboard() {
      this.dashboardLoading = true;
      this.recentError = "";
      try {
        const [p, sp, l] = await Promise.all([this.api("/api/posts"), this.api("/api/spec"), this.api("/api/links")]);
        this.stats = {
          posts: p.posts.length,
          drafts: p.posts.filter((x) => x.draft).length,
          spec: sp.files.length,
          links: l.links.filter((x) => x.enabled).length,
        };
        this.recentPosts = p.posts.slice(0, 5);
        if (!this.linksDirty) this.links = l.links;
      } catch (e) {
        this.recentError = e.message;
      } finally {
        this.dashboardLoading = false;
      }
    },
    postRowMeta(row) {
      return [
        row.published && String(row.published).slice(0, 10),
        row.category || "",
        (row.tags || []).map((t) => `#${t}`).join(" "),
      ]
        .filter(Boolean)
        .join(" · ");
    },

    /* ---------- 文章：列表 ---------- */
    async loadArticles() {
      this.postsLoading = true;
      try {
        const { posts } = await this.api("/api/posts");
        this.posts = posts;
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.postsLoading = false;
      }
    },
    async deletePost(row) {
      try {
        await ElMessageBox.confirm(
          `确定删除文章「${row.title}」？（${row.file}）此操作不可恢复`,
          "删除确认",
          { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消", confirmButtonClass: "el-button--danger" }
        );
      } catch {
        return;
      }
      try {
        await this.api(`/api/posts/${encodeURIComponent(row.file)}`, { method: "DELETE" });
        ElMessage.success("已删除");
        await this.loadArticles();
      } catch (e) {
        ElMessage.error(e.message);
      }
    },

    /* ---------- 文章：编辑器 ---------- */
    resetPostEditor() {
      this.resetEditorDrag();
      this.editingPostFile = null;
      Object.assign(this.pf, {
        title: "", slug: "", published: today(), updated: "", category: "",
        description: "", image: "", draft: false, pinned: false, comment: true, content: "",
      });
      this.pTags = [];
      this.pTagInput = "";
    },
    async openPostEditor(file) {
      this.handleMenuSelect("posts");
      this.resetPostEditor();
      if (file) {
        try {
          const a = await this.api(`/api/posts/${encodeURIComponent(file)}`);
          this.editingPostFile = a.file;
          Object.assign(this.pf, {
            title: a.title || "",
            slug: a.file.replace(/\.md$/, ""),
            published: String(a.published || today()).slice(0, 10),
            updated: today(),
            category: a.category || "",
            description: a.description || "",
            image: a.image || "",
            draft: !!a.draft,
            pinned: !!a.pinned,
            comment: a.comment !== false,
            content: a.content || "",
          });
          this.pTags = [...(a.tags || [])];
        } catch (e) {
          ElMessage.error(e.message);
          return;
        }
      }
      this.editorView = true;
      this.$nextTick(() => window.scrollTo({ top: 0 }));
    },
    backToPostList() {
      this.editorView = false;
      this.loadArticles();
    },
    removePTag(t) {
      this.pTags = this.pTags.filter((x) => x !== t);
    },
    addPTag() {
      const t = this.pTagInput.trim().replace(/\s+/g, "");
      if (t && !this.pTags.includes(t)) this.pTags.push(t);
      this.pTagInput = "";
    },

    /* Markdown 编辑辅助 */
    getTextarea() {
      const ref = this.$refs.pContent;
      if (!ref) return null;
      return ref.textarea || (ref.$el ? ref.$el.querySelector("textarea") : null);
    },
    async mdWrap(before, after, placeholder) {
      const ta = this.getTextarea();
      if (!ta) return;
      const s = ta.selectionStart ?? this.pf.content.length;
      const e = ta.selectionEnd ?? s;
      const sel = this.pf.content.slice(s, e) || placeholder;
      this.pf.content = this.pf.content.slice(0, s) + before + sel + after + this.pf.content.slice(e);
      await this.$nextTick();
      ta.focus();
      const ns = s + before.length;
      ta.setSelectionRange(ns, ns + sel.length);
    },
    async mdLinePrefix(prefix) {
      const ta = this.getTextarea();
      if (!ta) return;
      const s = ta.selectionStart ?? 0;
      const lineStart = this.pf.content.lastIndexOf("\n", s - 1) + 1;
      this.pf.content = this.pf.content.slice(0, lineStart) + prefix + this.pf.content.slice(lineStart);
      await this.$nextTick();
      ta.focus();
      ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
    },
    async insertAtCursor(text) {
      const ta = this.getTextarea();
      if (!ta) {
        this.pf.content += text;
        return;
      }
      const s = ta.selectionStart ?? this.pf.content.length;
      const e = ta.selectionEnd ?? s;
      this.pf.content = this.pf.content.slice(0, s) + text + this.pf.content.slice(e);
      await this.$nextTick();
      const p = s + text.length;
      ta.focus();
      ta.setSelectionRange(p, p);
    },

    /* ---------- 图片上传（Sanyue 图床，经 /api/imgbed/upload 代理） ---------- */
    readFileB64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
    },
    async uploadImageFile(file, dir) {
      const data = await this.readFileB64(file);
      return this.api("/api/imgbed/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, data, dir }),
        timeout: 90000, // 大图经代理转图床较慢，放宽到 90 秒
      });
    },
    // 批量上传图片到图床，返回外链数组
    async uploadImageFiles(files, dir) {
      const urls = [];
      this.imgTotal = files.length;
      this.imgDone = 0;
      this.imgUploading = true;
      try {
        for (const f of files) {
          try {
            const { path } = await this.uploadImageFile(f, dir);
            urls.push(path);
          } catch (e) {
            ElMessage.error(`${f.name} 上传失败：${e.message}`);
          }
          this.imgDone += 1;
        }
      } finally {
        this.imgUploading = false;
      }
      return urls;
    },
    pickImageFiles(dataTransfer) {
      if (!dataTransfer) return [];
      const files = dataTransfer.files?.length ? [...dataTransfer.files] : [];
      return files.filter((f) => f.type.startsWith("image/"));
    },
    pasteImageFiles(e) {
      const items = e.clipboardData?.items;
      if (!items) return [];
      return [...items]
        .filter((it) => it.kind === "file" && String(it.type).startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter(Boolean);
    },
    hasDragFiles(e) {
      return e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
    },
    async insertTextAt(pos, text) {
      const at = Math.max(0, Math.min(pos, this.pf.content.length));
      this.pf.content = this.pf.content.slice(0, at) + text + this.pf.content.slice(at);
      await this.$nextTick();
      const ta = this.getTextarea();
      if (ta) {
        const p = at + text.length;
        ta.focus();
        ta.setSelectionRange(p, p);
      }
    },

    /* 文章编辑器：拖拽 / 粘贴图片 */
    onEditorDragEnter(e) {
      if (!this.hasDragFiles(e)) return;
      e.preventDefault();
      this.dragDepth += 1;
      this.dragActive = true;
    },
    onEditorDragOver(e) {
      if (this.hasDragFiles(e)) e.preventDefault();
    },
    onEditorDragLeave() {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) this.dragActive = false;
    },
    resetEditorDrag() {
      this.dragDepth = 0;
      this.dragActive = false;
    },
    async onEditorDrop(e) {
      if (!this.hasDragFiles(e)) return;
      e.preventDefault();
      this.resetEditorDrag();
      const files = this.pickImageFiles(e.dataTransfer);
      if (!files.length) return;
      const ta = this.getTextarea();
      const pos = ta ? ta.selectionStart ?? this.pf.content.length : this.pf.content.length;
      ElMessage.info(`开始上传 ${files.length} 张图片到图床…`);
      const urls = await this.uploadImageFiles(files, "post");
      if (urls.length) {
        const block = urls.map((u) => `![](${u})`).join("\n") + "\n";
        await this.insertTextAt(pos, block);
        ElMessage.success(`已插入 ${urls.length} 张图片链接`);
      }
    },
    onEditorPaste(e) {
      const files = this.pasteImageFiles(e);
      if (!files.length) return;
      e.preventDefault();
      const ta = this.getTextarea();
      const pos = ta ? ta.selectionStart ?? this.pf.content.length : this.pf.content.length;
      ElMessage.info(`正在上传粘贴的图片到图床…`);
      this.uploadImageFiles(files, "post").then((urls) => {
        if (urls.length) {
          this.insertTextAt(pos, urls.map((u) => `![](${u})`).join("\n") + "\n");
          ElMessage.success("图片已插入正文");
        }
      });
    },

    async onInsertImage(e) {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const { path } = await this.uploadImageFile(file, "post");
        await this.insertAtCursor(`![](${path})`);
        ElMessage.success("图片已上传并插入正文");
      } catch (err) {
        ElMessage.error(err.message);
      }
    },
    async onCoverUpload(e) {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const { path } = await this.uploadImageFile(file, "post");
        this.pf.image = path;
        ElMessage.success("封面已上传");
      } catch (err) {
        ElMessage.error(err.message);
      }
    },

    /* ---------- 文章：保存 ---------- */
    async savePost() {
      const title = this.pf.title.trim();
      const content = this.pf.content.trim();
      if (!title) return ElMessage.warning("标题不能为空");
      if (!content) return ElMessage.warning("正文不能为空");
      const payload = {
        title,
        slug: this.pf.slug.trim(),
        published: this.pf.published || today(),
        updated: this.pf.updated || "",
        category: this.pf.category.trim(),
        tags: this.pTags,
        description: this.pf.description.trim(),
        image: this.pf.image,
        draft: this.pf.draft,
        pinned: this.pf.pinned,
        comment: this.pf.comment,
        content,
      };
      this.savingPost = true;
      try {
        if (this.editingPostFile) {
          await this.api(`/api/posts/${encodeURIComponent(this.editingPostFile)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          const { file } = await this.api("/api/posts", { method: "POST", body: JSON.stringify(payload) });
          this.editingPostFile = file;
        }
        ElMessage.success("已保存，博客将在 1-3 分钟内自动更新");
        setTimeout(() => this.backToPostList(), 800);
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.savingPost = false;
      }
    },

    /* ---------- 页面内容（spec） ---------- */
    async loadSpecList() {
      this.specLoading = true;
      this.specError = "";
      try {
        const { files } = await this.api("/api/spec");
        this.specFiles = files;
      } catch (e) {
        this.specError = e.message;
      } finally {
        this.specLoading = false;
      }
    },
    async openSpecEditor(name) {
      this.handleMenuSelect("spec");
      this.specLoading = true;
      try {
        const { content, label } = await this.api(`/api/spec?file=${encodeURIComponent(name)}`);
        this.editingSpecFile = name;
        this.editingSpecLabel = label || name;
        this.specContent = content;
        this.specEditorView = true;
        this.$nextTick(() => window.scrollTo({ top: 0 }));
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.specLoading = false;
      }
    },
    backToSpecList() {
      this.specEditorView = false;
      this.loadSpecList();
    },
    async saveSpec() {
      if (!this.specContent.trim()) return ElMessage.warning("内容不能为空");
      this.savingSpec = true;
      try {
        await this.api("/api/spec", {
          method: "PUT",
          body: JSON.stringify({ file: this.editingSpecFile, content: this.specContent }),
        });
        ElMessage.success("已保存，博客将在 1-3 分钟内自动更新");
        setTimeout(() => this.backToSpecList(), 800);
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.savingSpec = false;
      }
    },

    /* ---------- 站点配置 ---------- */
    async loadConfigPage() {
      if (!this.configFilesLoaded) {
        try {
          const { files } = await this.api("/api/config");
          this.configFiles = files;
          this.configFilesLoaded = true;
        } catch (e) {
          ElMessage.error(e.message);
        }
      }
      this.loadCfgForm(this.cfgTab);
      if (!this.cfgRawOriginal) this.loadCfgRaw(this.cfgRawFile);
    },
    async loadCfgForm(file) {
      const CF = window.ConfigForms || {};
      if (!CF.FORMS?.[file]) return;
      if (this.cfgLoadedFiles.includes(file)) return;
      this.cfgLoading = true;
      this.cfgError = "";
      try {
        const { content } = await this.api(`/api/config?file=${encodeURIComponent(file)}`);
        const { values, lists } = CF.extract(content, file);
        // stringArray 以多行文本编辑
        for (const f of CF.flatFields(file)) {
          if (f.type === "stringArray" && Array.isArray(values[f.id])) values[f.id] = values[f.id].join("\n");
        }
        this.cfgValues = { ...this.cfgValues, [file]: values };
        this.cfgLists = { ...this.cfgLists, [file]: lists };
        this.cfgLoadedFiles.push(file);
      } catch (e) {
        this.cfgError = e.message;
      } finally {
        this.cfgLoading = false;
      }
    },
    cfgListItems(fid) {
      const l = this.cfgLists[this.cfgTab];
      return (l && l[fid]) || [];
    },
    addCfgItem(field) {
      const item = {};
      for (const col of field.columns) item[col.key] = col.type === "boolean" ? false : "";
      this.cfgListItems(field.id).push(item);
    },
    removeCfgItem(fid, idx) {
      this.cfgListItems(fid).splice(idx, 1);
    },
    async saveCfgForm() {
      const file = this.cfgTab;
      const CF = window.ConfigForms;
      if (!CF.FORMS[file]) return;
      try {
        await ElMessageBox.confirm("保存将直接提交到 GitHub 并触发博客重建，确定保存？", "保存确认", {
          type: "warning",
          confirmButtonText: "保存",
          cancelButtonText: "取消",
        });
      } catch {
        return;
      }
      this.cfgSaving = true;
      try {
        // 基于远端最新内容打补丁，只触碰表单字段
        const { content } = await this.api(`/api/config?file=${encodeURIComponent(file)}`);
        const values = JSON.parse(JSON.stringify(this.cfgValues[file] || {}));
        const lists = JSON.parse(JSON.stringify(this.cfgLists[file] || {}));
        for (const f of CF.flatFields(file)) {
          if (f.type === "stringArray") {
            values[f.id] = String(values[f.id] ?? "")
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
        const next = CF.apply(content, file, values, lists);
        await this.api("/api/config", { method: "PUT", body: JSON.stringify({ file, content: next }) });
        ElMessage.success("已保存，博客将在 1-3 分钟内自动更新");
      } catch (e) {
        ElMessage.error(/未找到/.test(e.message) ? `${e.message}（配置结构可能已变化，请改用源码编辑）` : e.message);
      } finally {
        this.cfgSaving = false;
      }
    },
    async loadCfgRaw(file) {
      this.cfgRawLoading = true;
      this.cfgError = "";
      try {
        const { content } = await this.api(`/api/config?file=${encodeURIComponent(file)}`);
        this.cfgRawContent = content;
        this.cfgRawOriginal = content;
      } catch (e) {
        this.cfgError = e.message;
      } finally {
        this.cfgRawLoading = false;
      }
    },
    async saveCfgRaw() {
      if (!this.cfgRawContent.trim()) return ElMessage.warning("内容不能为空");
      try {
        await ElMessageBox.confirm(
          "保存将覆盖整个配置文件并触发博客重建，格式错误会导致构建失败，确定保存？",
          "保存确认",
          { type: "warning", confirmButtonText: "保存", cancelButtonText: "取消" },
        );
      } catch {
        return;
      }
      this.cfgRawSaving = true;
      try {
        await this.api("/api/config", {
          method: "PUT",
          body: JSON.stringify({ file: this.cfgRawFile, content: this.cfgRawContent }),
        });
        this.cfgRawOriginal = this.cfgRawContent;
        ElMessage.success("已保存，博客将在 1-3 分钟内自动更新");
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.cfgRawSaving = false;
      }
    },
    resetCfgRaw() {
      this.cfgRawContent = this.cfgRawOriginal;
    },

    /* ---------- 静态资源 ---------- */
    formatSize(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return "";
      if (v < 1024) return `${v} B`;
      if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
      return `${(v / 1024 / 1024).toFixed(2)} MB`;
    },
    isImage(name) {
      return /\.(png|jpe?g|webp|avif|gif|svg|bmp|ico)$/i.test(String(name));
    },
    assetJoin(name) {
      return this.assetDir ? `${this.assetDir}/${name}` : name;
    },
    async loadAssets(dir) {
      this.assetLoading = true;
      this.assetError = "";
      this.assetDir = dir || "";
      try {
        const { entries } = await this.api(`/api/assets?dir=${encodeURIComponent(this.assetDir)}`);
        this.assetEntries = entries;
      } catch (e) {
        this.assetError = e.message;
        this.assetEntries = [];
      } finally {
        this.assetLoading = false;
      }
    },
    enterAssetDir(path) {
      this.loadAssets(path);
    },
    clickAsset(e) {
      if (e.type === "dir") this.enterAssetDir(this.assetJoin(e.name));
    },
    previewAsset(e) {
      this.assetPreview = { name: e.name, url: "/" + this.assetJoin(e.name) };
      this.assetPreviewOpen = true;
    },
    async copyAssetPath(e) {
      const path = "/" + this.assetJoin(e.name);
      try {
        await navigator.clipboard.writeText(path);
        ElMessage.success(`已复制 ${path}`);
      } catch {
        ElMessage.info(`路径：${path}`);
      }
    },
    async uploadAssetFiles(files) {
      if (!files || !files.length) return;
      this.assetUploading = true;
      try {
        for (const f of files) {
          try {
            const data = await this.readFileB64(f);
            await this.api("/api/assets", {
              method: "POST",
              body: JSON.stringify({ path: this.assetJoin(f.name), data }),
              timeout: 90000,
            });
            ElMessage.success(`${f.name} 已上传`);
          } catch (err) {
            ElMessage.error(`${f.name} 上传失败：${err.message}`);
          }
        }
        await this.loadAssets(this.assetDir);
      } finally {
        this.assetUploading = false;
      }
    },
    async onAssetPick(e) {
      const files = [...(e.target.files || [])];
      e.target.value = "";
      await this.uploadAssetFiles(files);
    },
    onAssetDragEnter(e) {
      if (!this.hasDragFiles(e)) return;
      e.preventDefault();
      this.assetDragDepth += 1;
      this.assetDragActive = true;
    },
    onAssetDragOver(e) {
      if (this.hasDragFiles(e)) e.preventDefault();
    },
    onAssetDragLeave() {
      this.assetDragDepth = Math.max(0, this.assetDragDepth - 1);
      if (this.assetDragDepth === 0) this.assetDragActive = false;
    },
    async onAssetDrop(e) {
      if (!this.hasDragFiles(e)) return;
      e.preventDefault();
      this.assetDragDepth = 0;
      this.assetDragActive = false;
      const files = [...(e.dataTransfer.files || [])];
      await this.uploadAssetFiles(files);
    },
    async deleteAsset(entry) {
      const path = this.assetJoin(entry.name);
      try {
        await ElMessageBox.confirm(`确定删除 public/${path}？此操作不可恢复`, "删除确认", {
          type: "warning",
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          confirmButtonClass: "el-button--danger",
        });
      } catch {
        return;
      }
      try {
        await this.api("/api/assets", { method: "DELETE", body: JSON.stringify({ path }) });
        ElMessage.success("已删除");
        await this.loadAssets(this.assetDir);
      } catch (e) {
        ElMessage.error(e.message);
      }
    },

    /* ---------- 友链 ---------- */
    async loadLinks() {
      this.linksLoading = true;
      this.linksError = "";
      try {
        const { links } = await this.api("/api/links");
        this.links = links;
        this.linksDirty = false;
      } catch (e) {
        this.linksError = e.message;
      } finally {
        this.linksLoading = false;
      }
    },
    resetLinkForm() {
      this.editingLinkIndex = null;
      Object.assign(this.lf, { title: "", siteurl: "", imgurl: "", tags: "", desc: "", weight: 0, enabled: true });
    },
    fillLinkForm(link, index) {
      this.resetLinkForm();
      this.editingLinkIndex = index;
      Object.assign(this.lf, {
        title: link.title,
        siteurl: link.siteurl,
        imgurl: link.imgurl || "",
        tags: (link.tags || []).join(", "),
        desc: link.desc || "",
        weight: link.weight ?? 0,
        enabled: link.enabled,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    submitLinkForm() {
      const title = this.lf.title.trim();
      const siteurl = this.lf.siteurl.trim();
      if (!title) return ElMessage.warning("友链名称不能为空");
      if (!/^https?:\/\/.+/.test(siteurl)) return ElMessage.warning("站点地址必须以 http:// 或 https:// 开头");
      const link = {
        title,
        siteurl,
        imgurl: this.lf.imgurl.trim(),
        tags: this.lf.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        desc: this.lf.desc.trim(),
        weight: Math.trunc(Number(this.lf.weight) || 0),
        enabled: this.lf.enabled,
      };
      if (this.editingLinkIndex === null) this.links.push(link);
      else this.links[this.editingLinkIndex] = link;
      this.linksDirty = true;
      this.resetLinkForm();
      ElMessage.success("已加入列表，点击下方「保存全部更改」提交到 GitHub");
    },
    toggleLink(i) {
      this.links[i].enabled = !this.links[i].enabled;
      this.linksDirty = true;
    },
    async deleteLink(link, i) {
      try {
        await ElMessageBox.confirm(`确定删除友链「${link.title}」？保存后才会提交到 GitHub。`, "删除确认", {
          type: "warning",
          confirmButtonText: "删除",
          cancelButtonText: "取消",
          confirmButtonClass: "el-button--danger",
        });
      } catch {
        return;
      }
      this.links.splice(i, 1);
      this.linksDirty = true;
      if (this.editingLinkIndex === i) this.resetLinkForm();
    },
    async saveLinks() {
      this.savingLinks = true;
      try {
        await this.api("/api/links", { method: "PUT", body: JSON.stringify({ links: this.links }) });
        this.linksDirty = false;
        ElMessage.success("已保存，博客将在 1-3 分钟内自动更新");
        await this.loadLinks();
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        this.savingLinks = false;
      }
    },

    onResize() {
      this.isMobile = window.innerWidth < 768;
      if (!this.isMobile) this.mobileOpen = false;
    },
  },

  mounted() {
    this.onResize();
    window.addEventListener("resize", this.onResize);
    if (this.token) {
      // 有令牌先进入主界面，401 会自动退回登录
      this.loggedIn = true;
      this.handleMenuSelect("dashboard");
    }
  },
};

const app = createApp(App);
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
// 图标以 Epi 前缀注册：DOM 模板里用 <epi-xxx> 引用，避免与原生标签冲突
for (const [name, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component("Epi" + name, comp);
}
app.mount("#app");
