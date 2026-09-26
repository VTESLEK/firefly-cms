// Firefly CMS 前端逻辑（无框架、无构建）
// 页面：工作台 / 文章管理 / 说说管理 / 友链管理

const $ = (id) => document.getElementById(id);

const PAGE_NAMES = { dashboard: "工作台", posts: "文章管理", shuoshuo: "说说管理", links: "友链管理" };

const state = {
  token: localStorage.getItem("cms_token") || "",
  page: "dashboard",
  postsLoaded: false,
  posts: [],
  linksLoaded: false,
  links: [],
  linksDirty: false,
  editingLinkIndex: null,
  // 说说编辑器
  tags: [],
  image: "",
  editingFile: null,
  // 文章编辑器
  pTags: [],
  editingPost: null,
  cover: "",
};

/* ---------- API ---------- */

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") {
    logout();
    throw new Error(data.error || "登录已过期，请重新登录");
  }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

/* ---------- 登录 ---------- */

function showMain() {
  $("view-login").classList.add("hidden");
  $("view-main").classList.remove("hidden");
  switchPage("dashboard");
}
function showLogin() {
  $("view-main").classList.add("hidden");
  $("view-login").classList.remove("hidden");
  $("login-password").value = "";
  setTimeout(() => $("login-password").focus(), 50);
}
function logout(clear = true) {
  if (clear) localStorage.removeItem("cms_token");
  state.token = "";
  showLogin();
}

async function login() {
  const btn = $("login-btn");
  const msg = $("login-msg");
  const password = $("login-password").value;
  if (!password) return;
  btn.disabled = true;
  msg.textContent = "";
  try {
    const { token } = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    state.token = token;
    localStorage.setItem("cms_token", token);
    showMain();
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 主题 ---------- */

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("cms_theme", dark ? "dark" : "light");
}

/* ---------- 侧边栏导航 ---------- */

function switchPage(page) {
  state.page = page;
  document.querySelectorAll(".menu-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach((s) => s.classList.toggle("hidden", s.id !== `page-${page}`));
  $("breadcrumb").textContent = `后台 / ${PAGE_NAMES[page]}`;
  closeSidebar();
  if (page === "dashboard") loadDashboard();
  else if (page === "posts") loadArticles();
  else if (page === "shuoshuo") loadShuoshuo();
  else if (page === "links") loadLinks();
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-mask").classList.add("hidden");
}

/* ---------- 小工具 ---------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// 今天（东八区），用于 date 输入默认值
function today() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 当前时间，供 datetime-local 默认值（浏览器本地时区）
function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// 后端日期（ISO 带时区）→ datetime-local 值，按东八区展示
function toDatetimeLocal(dateStr) {
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return localNow();
  const d = new Date(ms + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

// 列表展示：直接显示存储的东八区墙上时间，不做二次换算
function displayDate(dateStr) {
  return String(dateStr).replace("T", " ").slice(0, 16);
}

function insertAtCursor(textarea, text) {
  const s = textarea.selectionStart;
  const e = textarea.selectionEnd;
  textarea.setRangeText(text, s, e, "end");
  textarea.focus();
}

/* ---------- 工作台 ---------- */

async function loadDashboard() {
  try {
    const [p, s, l] = await Promise.all([api("/api/posts"), api("/api/shuoshuo"), api("/api/links")]);
    state.posts = p.posts;
    state.postsLoaded = true;
    state.shuoshuo = s.posts;
    state.links = l.links;
    if (!state.linksDirty) {
      state.linksLoaded = true;
    }
    $("stat-posts").textContent = state.posts.length;
    $("stat-drafts").textContent = state.posts.filter((x) => x.draft).length;
    $("stat-shuoshuo").textContent = s.posts.length;
    $("stat-links").textContent = l.links.filter((x) => x.enabled).length;
    renderRecent();
  } catch (e) {
    $("recent-msg").textContent = e.message;
  }
}

function renderRecent() {
  const list = $("recent-list");
  const msg = $("recent-msg");
  msg.textContent = "";
  list.innerHTML = "";
  if (!state.posts.length) {
    msg.textContent = "还没有文章，去「文章管理」写第一篇吧";
    return;
  }
  for (const a of state.posts.slice(0, 5)) {
    const row = el("div", "recent-row");
    const left = el("div", "recent-main");
    const title = el("span", "recent-title", a.title);
    if (a.draft) title.appendChild(el("span", "badge gray", "草稿"));
    if (a.pinned) title.appendChild(el("span", "badge accent", "置顶"));
    left.appendChild(title);
    left.appendChild(el("div", "recent-meta", [String(a.published).slice(0, 10), a.category].filter(Boolean).join(" · ")));
    const date = el("span", "recent-date", String(a.published).slice(0, 10));
    row.append(left, date);
    row.onclick = () => openPostEditor(a.file);
    list.appendChild(row);
  }
}

/* ---------- 文章管理：列表 ---------- */

async function loadArticles() {
  const table = $("posts-table");
  const msg = $("posts-msg");
  msg.textContent = "";
  table.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const { posts } = await api("/api/posts");
    state.posts = posts;
    state.postsLoaded = true;
    table.innerHTML = "";
    if (!posts.length) {
      msg.textContent = "还没有文章，点右上角「写新文章」开始创作吧";
      return;
    }
    for (const a of posts) table.appendChild(renderArticleRow(a));
  } catch (e) {
    table.innerHTML = "";
    msg.textContent = e.message;
  }
}

function renderArticleRow(a) {
  const row = el("div", "article-row");
  const main = el("div", "article-main");

  const titleLine = el("div", "article-title-line");
  const title = el("span", "article-title", a.title);
  titleLine.appendChild(title);
  if (a.draft) titleLine.appendChild(el("span", "badge gray", "草稿"));
  if (a.pinned) titleLine.appendChild(el("span", "badge accent", "置顶"));
  main.appendChild(titleLine);

  const meta = [
    String(a.published).slice(0, 10),
    a.category || "",
    (a.tags || []).map((t) => `#${t}`).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  main.appendChild(el("div", "article-meta", meta));

  const actions = el("div", "row-actions");
  const editBtn = el("button", "btn ghost small", "编辑");
  editBtn.onclick = (ev) => {
    ev.stopPropagation();
    openPostEditor(a.file);
  };
  const delBtn = el("button", "btn danger ghost small", "删除");
  delBtn.onclick = async (ev) => {
    ev.stopPropagation();
    if (!confirm(`确定删除文章「${a.title}」？（${a.file}）此操作不可恢复`)) return;
    delBtn.disabled = true;
    try {
      await api(`/api/posts/${encodeURIComponent(a.file)}`, { method: "DELETE" });
      await loadArticles();
    } catch (e) {
      alert(e.message);
      delBtn.disabled = false;
    }
  };
  actions.append(editBtn, delBtn);

  row.append(main, actions);
  return row;
}

/* ---------- 文章管理：编辑器 ---------- */

function resetPostEditor() {
  state.pTags = [];
  state.editingPost = null;
  state.cover = "";
  $("p-title").value = "";
  $("p-slug").value = "";
  $("p-slug").disabled = false;
  $("p-published").value = today();
  $("p-updated").value = "";
  $("p-category").value = "";
  $("p-description").value = "";
  $("p-content").value = "";
  $("p-draft").checked = false;
  $("p-pinned").checked = false;
  $("p-comment").checked = true;
  $("p-tag").value = "";
  renderPTags();
  showCoverPreview();
  updateWordcount();
  updateSaveLabel();
  $("p-editor-title").textContent = "写新文章";
  $("p-msg").textContent = "";
  $("p-msg").className = "msg";
}

async function openPostEditor(file) {
  resetPostEditor();
  if (file) {
    $("p-msg").textContent = "正在加载文章…";
    try {
      const a = await api(`/api/posts/${encodeURIComponent(file)}`);
      state.editingPost = a;
      $("p-title").value = a.title || "";
      $("p-slug").value = a.file.replace(/\.md$/, "");
      $("p-slug").disabled = true;
      $("p-published").value = String(a.published || today()).slice(0, 10);
      $("p-updated").value = today();
      $("p-category").value = a.category || "";
      state.pTags = [...(a.tags || [])];
      $("p-description").value = a.description || "";
      state.cover = a.image || "";
      $("p-draft").checked = !!a.draft;
      $("p-pinned").checked = !!a.pinned;
      $("p-comment").checked = a.comment !== false;
      $("p-content").value = a.content || "";
      $("p-editor-title").textContent = `编辑：${a.title || a.file}`;
      $("p-save").textContent = "保存修改";
      renderPTags();
      showCoverPreview();
      updateWordcount();
      updateSaveLabel();
    } catch (e) {
      $("p-msg").textContent = e.message;
      return;
    }
  }
  $("posts-list-view").classList.add("hidden");
  $("post-editor-view").classList.remove("hidden");
  $("p-msg").textContent = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => $("p-title").focus(), 60);
}

function backToPostList() {
  $("post-editor-view").classList.add("hidden");
  $("posts-list-view").classList.remove("hidden");
  loadArticles();
}

function updateSaveLabel() {
  if (state.editingPost) {
    $("p-save").textContent = "保存修改";
  } else {
    $("p-save").textContent = $("p-draft").checked ? "存为草稿" : "发布文章";
  }
}

function updateWordcount() {
  const n = $("p-content").value.replace(/\s/g, "").length;
  $("p-wordcount").textContent = `${n} 字`;
}

/* 文章标签 */
function renderPTags() {
  const box = $("p-tags-box");
  box.querySelectorAll(".tag-chip").forEach((elx) => elx.remove());
  for (const tag of state.pTags) {
    const chip = el("span", "tag-chip", tag);
    const x = el("button", null, "×");
    x.onclick = () => {
      state.pTags = state.pTags.filter((t) => t !== tag);
      renderPTags();
    };
    chip.appendChild(x);
    box.insertBefore(chip, $("p-tag"));
  }
}
function addPTag() {
  const input = $("p-tag");
  const t = input.value.trim().replace(/\s+/g, "");
  if (t && !state.pTags.includes(t)) {
    state.pTags.push(t);
    renderPTags();
  }
  input.value = "";
}

/* 封面图 */
function showCoverPreview() {
  const box = $("p-cover-preview");
  if (!state.cover) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.querySelector("img").src = state.cover.startsWith("./") ? (state.cover.replace("./", "/posts/")) : state.cover;
  box.querySelector(".img-path").textContent = state.cover;
}

async function uploadImageFile(file, dir) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
  return api("/api/upload", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, data, dir }),
  });
}

/* Markdown 工具栏 */
function mdWrap(before, after, placeholder) {
  const ta = $("p-content");
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || placeholder;
  ta.setRangeText(before + sel + after, s, e, "select");
  ta.focus();
  updateWordcount();
}
function mdLinePrefix(prefix) {
  const ta = $("p-content");
  const s = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
  ta.setRangeText(prefix, lineStart, lineStart, "end");
  ta.focus();
}

async function savePost() {
  const btn = $("p-save");
  const msg = $("p-msg");
  const title = $("p-title").value.trim();
  const content = $("p-content").value.trim();
  const setMsg = (t, ok) => {
    msg.textContent = t;
    msg.className = ok ? "msg ok" : "msg";
  };
  if (!title) return setMsg("标题不能为空");
  if (!content) return setMsg("正文不能为空");

  const payload = {
    title,
    slug: $("p-slug").value.trim(),
    published: $("p-published").value,
    updated: $("p-updated").value,
    category: $("p-category").value.trim(),
    tags: state.pTags,
    description: $("p-description").value.trim(),
    image: state.cover,
    draft: $("p-draft").checked,
    pinned: $("p-pinned").checked,
    comment: $("p-comment").checked,
    content,
  };
  btn.disabled = true;
  setMsg("正在保存…");
  try {
    if (state.editingPost) {
      await api(`/api/posts/${encodeURIComponent(state.editingPost.file)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      const { file } = await api("/api/posts", { method: "POST", body: JSON.stringify(payload) });
      state.editingPost = { file };
    }
    setMsg("已保存，博客将在 1-3 分钟内自动更新", true);
    setTimeout(backToPostList, 800);
  } catch (e) {
    setMsg(e.message);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 说说管理 ---------- */

function renderTags() {
  const box = $("tags-box");
  box.querySelectorAll(".tag-chip").forEach((elx) => elx.remove());
  for (const tag of state.tags) {
    const chip = el("span", "tag-chip", tag);
    const x = el("button", null, "×");
    x.onclick = () => {
      state.tags = state.tags.filter((t) => t !== tag);
      renderTags();
    };
    chip.appendChild(x);
    box.insertBefore(chip, $("f-tag"));
  }
}
function addTag() {
  const input = $("f-tag");
  const t = input.value.trim().replace(/\s+/g, "");
  if (t && !state.tags.includes(t)) {
    state.tags.push(t);
    renderTags();
  }
  input.value = "";
}

function showImagePreview() {
  const box = $("image-preview");
  if (!state.image) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.querySelector("img").src = state.image;
  box.querySelector(".img-path").textContent = state.image;
}

async function uploadShuoshuoImage(file) {
  const msg = $("editor-msg");
  msg.textContent = `正在上传 ${file.name}…`;
  msg.className = "msg";
  const { path } = await uploadImageFile(file, "shuoshuo");
  state.image = path;
  showImagePreview();
  msg.textContent = "配图已上传";
  msg.className = "msg ok";
}

function resetEditor() {
  state.tags = [];
  state.image = "";
  state.editingFile = null;
  $("f-content").value = "";
  $("f-date").value = localNow();
  $("f-tag").value = "";
  renderTags();
  showImagePreview();
  $("publish-btn").textContent = "发布";
  $("cancel-btn").classList.add("hidden");
  $("editor-title").textContent = "发布说说";
  $("editor-msg").textContent = "";
  $("editor-msg").className = "msg";
  document.querySelectorAll(".post-card.editing").forEach((elx) => elx.classList.remove("editing"));
}

function fillEditor(post) {
  resetEditor();
  state.editingFile = post.file;
  state.tags = [...(post.tags || [])];
  state.image = post.image || "";
  $("f-content").value = post.content || "";
  $("f-date").value = toDatetimeLocal(post.date);
  renderTags();
  showImagePreview();
  $("publish-btn").textContent = "保存修改";
  $("cancel-btn").classList.remove("hidden");
  $("editor-title").textContent = `编辑：${post.file}`;
  const card = document.querySelector(`[data-file="${post.file}"]`);
  if (card) {
    card.classList.add("editing");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function publish() {
  const btn = $("publish-btn");
  const msg = $("editor-msg");
  const content = $("f-content").value.trim();
  if (!content) {
    msg.textContent = "内容不能为空";
    msg.className = "msg";
    return;
  }
  const date = $("f-date").value || localNow();
  btn.disabled = true;
  msg.textContent = state.editingFile ? "正在保存…" : "正在发布…";
  msg.className = "msg";
  try {
    const payload = JSON.stringify({ content, tags: state.tags, image: state.image, date });
    if (state.editingFile) {
      await api(`/api/shuoshuo/${encodeURIComponent(state.editingFile)}`, {
        method: "PUT",
        body: payload,
      });
      msg.textContent = "已保存，博客将在 1-3 分钟内自动更新";
    } else {
      await api("/api/shuoshuo", { method: "POST", body: payload });
      msg.textContent = "发布成功，博客将在 1-3 分钟内自动更新";
    }
    msg.className = "msg ok";
    resetEditor();
    await loadShuoshuo();
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "msg";
  } finally {
    btn.disabled = false;
  }
}

async function loadShuoshuo() {
  const list = $("posts-list");
  const msg = $("list-msg");
  msg.textContent = "";
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const { posts } = await api("/api/shuoshuo");
    list.innerHTML = "";
    if (!posts.length) {
      msg.textContent = "还没有说说，发布第一条吧";
      return;
    }
    for (const post of posts) list.appendChild(renderShuoshuoCard(post));
  } catch (e) {
    list.innerHTML = "";
    msg.textContent = e.message;
  }
}

function renderShuoshuoCard(post) {
  const card = el("div", "card post-card");
  card.dataset.file = post.file;

  const head = el("div", "post-head");
  const date = el("span", "post-date", `${displayDate(post.date)} · ${post.file}`);
  const tags = el("div", "post-tags");
  for (const t of post.tags || []) tags.appendChild(el("span", "post-tag", t));
  head.append(date, tags);

  const content = el("p", "post-content", post.content || "");
  card.append(head, content);

  if (post.image) {
    const img = document.createElement("img");
    img.className = "post-image";
    img.loading = "lazy";
    img.src = post.image;
    img.alt = "配图";
    card.appendChild(img);
  }

  const actions = el("div", "post-actions");
  const editBtn = el("button", "btn ghost small", "编辑");
  editBtn.onclick = () => fillEditor(post);
  const delBtn = el("button", "btn danger ghost small", "删除");
  delBtn.onclick = async () => {
    if (!confirm(`确定删除这条说说？（${post.file}）`)) return;
    delBtn.disabled = true;
    try {
      await api(`/api/shuoshuo/${encodeURIComponent(post.file)}`, { method: "DELETE" });
      await loadShuoshuo();
    } catch (e) {
      alert(e.message);
      delBtn.disabled = false;
    }
  };
  actions.append(editBtn, delBtn);
  card.appendChild(actions);
  return card;
}

/* ---------- 友链管理 ---------- */

async function loadLinks() {
  const list = $("links-list");
  const msg = $("links-msg");
  msg.textContent = "";
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const { links } = await api("/api/links");
    state.links = links;
    state.linksLoaded = true;
    state.linksDirty = false;
    list.innerHTML = "";
    renderLinks();
  } catch (e) {
    list.innerHTML = "";
    msg.textContent = e.message;
  }
}

function renderLinks() {
  const list = $("links-list");
  list.innerHTML = "";
  const enabledCount = state.links.filter((l) => l.enabled).length;
  $("links-count").textContent = `共 ${state.links.length} 条 · 启用 ${enabledCount} 条${state.linksDirty ? " · 有未保存修改" : ""}`;
  $("links-save").classList.toggle("attention", state.linksDirty);
  if (!state.links.length) {
    $("links-msg").textContent = "还没有友链，在上方添加吧";
    return;
  }
  $("links-msg").textContent = "";
  state.links.forEach((link, i) => list.appendChild(renderLink(link, i)));
}

function renderLink(link, index) {
  const card = el("div", "card link-card" + (link.enabled ? "" : " link-disabled"));

  const img = document.createElement("img");
  img.className = "link-avatar";
  img.loading = "lazy";
  img.src = link.imgurl || "";
  img.alt = link.title;
  img.onerror = () => img.remove();

  const info = el("div", "link-info");
  const head = el("div", "link-head");
  head.append(el("span", "link-title", link.title));
  head.appendChild(el("span", "link-badge " + (link.enabled ? "on" : "off"), link.enabled ? "启用" : "停用"));
  const desc = el("p", "link-desc", link.desc || "");
  const meta = el("div", "link-meta");
  for (const t of link.tags || []) meta.appendChild(el("span", "post-tag", t));
  meta.appendChild(el("span", "link-url", link.siteurl));
  info.append(head, desc, meta);

  const actions = el("div", "post-actions link-actions");
  const editBtn = el("button", "btn ghost small", "编辑");
  editBtn.onclick = () => fillLinkForm(link, index);
  const toggleBtn = el("button", "btn ghost small", link.enabled ? "停用" : "启用");
  toggleBtn.onclick = () => {
    state.links[index].enabled = !link.enabled;
    state.linksDirty = true;
    renderLinks();
  };
  const delBtn = el("button", "btn danger ghost small", "删除");
  delBtn.onclick = () => {
    if (!confirm(`确定删除友链「${link.title}」？保存后才会提交到 GitHub。`)) return;
    state.links.splice(index, 1);
    state.linksDirty = true;
    if (state.editingLinkIndex === index) resetLinkForm();
    renderLinks();
  };
  actions.append(editBtn, toggleBtn, delBtn);

  card.append(img, info, actions);
  return card;
}

function resetLinkForm() {
  state.editingLinkIndex = null;
  $("lf-title").value = "";
  $("lf-siteurl").value = "";
  $("lf-imgurl").value = "";
  $("lf-tags").value = "";
  $("lf-desc").value = "";
  $("lf-weight").value = "0";
  $("lf-enabled").checked = true;
  $("lf-add").textContent = "添加到列表";
  $("lf-cancel").classList.add("hidden");
  $("link-editor-title").textContent = "添加友链";
  $("lf-editor-msg").textContent = "";
  $("lf-editor-msg").className = "msg";
}

function fillLinkForm(link, index) {
  resetLinkForm();
  state.editingLinkIndex = index;
  $("lf-title").value = link.title;
  $("lf-siteurl").value = link.siteurl;
  $("lf-imgurl").value = link.imgurl || "";
  $("lf-tags").value = (link.tags || []).join(", ");
  $("lf-desc").value = link.desc || "";
  $("lf-weight").value = String(link.weight ?? 0);
  $("lf-enabled").checked = link.enabled;
  $("lf-add").textContent = "更新到列表";
  $("lf-cancel").classList.remove("hidden");
  $("link-editor-title").textContent = `编辑：${link.title}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function readLinkForm() {
  const msg = $("lf-editor-msg");
  const title = $("lf-title").value.trim();
  const siteurl = $("lf-siteurl").value.trim();
  if (!title) {
    msg.textContent = "友链名称不能为空";
    return null;
  }
  if (!/^https?:\/\/.+/.test(siteurl)) {
    msg.textContent = "站点地址必须以 http:// 或 https:// 开头";
    return null;
  }
  return {
    title,
    siteurl,
    imgurl: $("lf-imgurl").value.trim(),
    tags: $("lf-tags").value
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    desc: $("lf-desc").value.trim(),
    weight: Math.trunc(Number($("lf-weight").value) || 0),
    enabled: $("lf-enabled").checked,
  };
}

async function saveLinks() {
  const btn = $("links-save");
  const msg = $("links-msg");
  btn.disabled = true;
  msg.textContent = "正在保存…";
  try {
    await api("/api/links", { method: "PUT", body: JSON.stringify({ links: state.links }) });
    state.linksDirty = false;
    msg.textContent = "已保存，博客将在 1-3 分钟内自动更新";
    msg.className = "msg ok center-text";
    await loadLinks();
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "msg center-text";
  } finally {
    btn.disabled = false;
  }
}

function submitLinkForm() {
  const link = readLinkForm();
  if (!link) return;
  if (state.editingLinkIndex === null) {
    state.links.push(link);
  } else {
    state.links[state.editingLinkIndex] = link;
  }
  state.linksDirty = true;
  resetLinkForm();
  renderLinks();
  $("lf-editor-msg").textContent = "已加入列表，点击下方「保存全部更改」提交到 GitHub";
  $("lf-editor-msg").className = "msg ok";
}

/* ---------- 事件绑定 ---------- */

$("login-btn").onclick = login;
$("login-password").addEventListener("keydown", (e) => e.key === "Enter" && login());
$("logout-btn").onclick = () => logout();
$("theme-toggle").onclick = () => applyTheme(!document.documentElement.classList.contains("dark"));

/* 侧边栏 */
document.querySelectorAll(".menu-item").forEach((btn) => {
  btn.onclick = () => switchPage(btn.dataset.page);
});
$("menu-toggle").onclick = () => {
  const open = $("sidebar").classList.toggle("open");
  $("sidebar-mask").classList.toggle("hidden", !open);
};
$("sidebar-mask").onclick = closeSidebar;
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.onclick = () => switchPage(btn.dataset.goto);
});

/* 文章 */
$("new-post-btn").onclick = () => openPostEditor(null);
$("p-back").onclick = backToPostList;
$("p-save").onclick = savePost;
$("p-tag").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addPTag();
  }
});
$("p-content").addEventListener("input", updateWordcount);
$("p-draft").addEventListener("change", updateSaveLabel);
$("p-image").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const msg = $("p-msg");
  msg.textContent = `正在上传 ${file.name}…`;
  msg.className = "msg";
  try {
    const { path } = await uploadImageFile(file, "post");
    insertAtCursor($("p-content"), `![](${path})`);
    msg.textContent = "图片已上传并插入正文";
    msg.className = "msg ok";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "msg";
  }
});
$("p-cover").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const msg = $("p-msg");
  msg.textContent = `正在上传 ${file.name}…`;
  msg.className = "msg";
  try {
    const { path } = await uploadImageFile(file, "post");
    state.cover = path;
    showCoverPreview();
    msg.textContent = "封面已上传";
    msg.className = "msg ok";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "msg";
  }
});
$("p-cover-remove").onclick = () => {
  state.cover = "";
  showCoverPreview();
};
document.querySelectorAll(".md-toolbar [data-md]").forEach((btn) => {
  btn.onclick = () => {
    const type = btn.dataset.md;
    if (type === "bold") mdWrap("**", "**", "加粗文字");
    else if (type === "italic") mdWrap("*", "*", "斜体文字");
    else if (type === "h2") mdLinePrefix("## ");
    else if (type === "h3") mdLinePrefix("### ");
    else if (type === "quote") mdLinePrefix("> ");
    else if (type === "code") mdWrap("`", "`", "code");
    else if (type === "link") mdWrap("[", "](https://)", "链接文字");
  };
});

/* 说说 */
$("f-tag").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addTag();
  }
});
$("f-image").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    await uploadShuoshuoImage(file);
  } catch (err) {
    const msg = $("editor-msg");
    msg.textContent = err.message;
    msg.className = "msg";
  }
});
$("img-remove").onclick = () => {
  state.image = "";
  showImagePreview();
};
$("publish-btn").onclick = publish;
$("cancel-btn").onclick = resetEditor;

/* 友链 */
$("lf-add").onclick = submitLinkForm;
$("lf-cancel").onclick = resetLinkForm;
$("links-save").onclick = saveLinks;

/* ---------- 启动 ---------- */

if (state.token) {
  // 有令牌先尝试进入主界面，401 会自动退回登录
  showMain();
} else {
  showLogin();
}
