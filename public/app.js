// Firefly 说说 CMS 前端逻辑（无框架、无构建）

const $ = (id) => document.getElementById(id);
const state = {
  token: localStorage.getItem("cms_token") || "",
  tags: [],
  image: "", // 上传后的博客路径，如 /shuoshuo/images/xx.png
  editingFile: null, // 编辑模式下的文件名
  links: [], // 友链列表（本地草稿，保存时全量提交）
  linksLoaded: false,
  linksDirty: false,
  editingLinkIndex: null, // 友链编辑模式下的下标
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

/* ---------- 视图切换 ---------- */

function showMain() {
  $("view-login").classList.add("hidden");
  $("view-main").classList.remove("hidden");
  loadPosts();
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

/* ---------- 登录 ---------- */

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

/* ---------- 标签 ---------- */

function renderTags() {
  const box = $("tags-box");
  box.querySelectorAll(".tag-chip").forEach((el) => el.remove());
  for (const tag of state.tags) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.append(tag);
    const x = document.createElement("button");
    x.textContent = "×";
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

/* ---------- 配图上传 ---------- */

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

async function uploadImage(file) {
  const msg = $("editor-msg");
  msg.textContent = `正在上传 ${file.name}…`;
  msg.className = "msg";
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
  const { path } = await api("/api/upload", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, data }),
  });
  state.image = path;
  showImagePreview();
  msg.textContent = "配图已上传";
  msg.className = "msg ok";
}

/* ---------- 编辑器 ---------- */

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
  document.querySelectorAll(".post-card.editing").forEach((el) => el.classList.remove("editing"));
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
      await api(`/api/posts/${encodeURIComponent(state.editingFile)}`, {
        method: "PUT",
        body: payload,
      });
      msg.textContent = "已保存，博客将在 1-3 分钟内自动更新";
    } else {
      await api("/api/posts", { method: "POST", body: payload });
      msg.textContent = "发布成功，博客将在 1-3 分钟内自动更新";
    }
    msg.className = "msg ok";
    resetEditor();
    await loadPosts();
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "msg";
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 列表 ---------- */

async function loadPosts() {
  const list = $("posts-list");
  const msg = $("list-msg");
  msg.textContent = "";
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const { posts } = await api("/api/posts");
    list.innerHTML = "";
    if (!posts.length) {
      msg.textContent = "还没有说说，发布第一条吧";
      return;
    }
    for (const post of posts) list.appendChild(renderPost(post));
  } catch (e) {
    list.innerHTML = "";
    msg.textContent = e.message;
  }
}

function renderPost(post) {
  const card = document.createElement("div");
  card.className = "card post-card";
  card.dataset.file = post.file;

  const head = document.createElement("div");
  head.className = "post-head";
  const date = document.createElement("span");
  date.className = "post-date";
  date.textContent = `${displayDate(post.date)} · ${post.file}`;
  const tags = document.createElement("div");
  tags.className = "post-tags";
  for (const t of post.tags || []) {
    const chip = document.createElement("span");
    chip.className = "post-tag";
    chip.textContent = t;
    tags.appendChild(chip);
  }
  head.append(date, tags);

  const content = document.createElement("p");
  content.className = "post-content";
  content.textContent = post.content || "";

  card.append(head, content);

  if (post.image) {
    const img = document.createElement("img");
    img.className = "post-image";
    img.loading = "lazy";
    img.src = post.image;
    img.alt = "配图";
    card.appendChild(img);
  }

  const actions = document.createElement("div");
  actions.className = "post-actions";
  const editBtn = document.createElement("button");
  editBtn.className = "btn ghost small";
  editBtn.textContent = "编辑";
  editBtn.onclick = () => fillEditor(post);
  const delBtn = document.createElement("button");
  delBtn.className = "btn danger ghost small";
  delBtn.textContent = "删除";
  delBtn.onclick = async () => {
    if (!confirm(`确定删除这条说说？（${post.file}）`)) return;
    delBtn.disabled = true;
    try {
      await api(`/api/posts/${encodeURIComponent(post.file)}`, { method: "DELETE" });
      await loadPosts();
    } catch (e) {
      alert(e.message);
      delBtn.disabled = false;
    }
  };
  actions.append(editBtn, delBtn);
  card.appendChild(actions);
  return card;
}

/* ---------- 标签页切换 ---------- */

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $("tab-posts").classList.toggle("hidden", name !== "posts");
  $("tab-links").classList.toggle("hidden", name !== "links");
  if (name === "links" && !state.linksLoaded) loadLinks();
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
  const card = document.createElement("div");
  card.className = "card link-card" + (link.enabled ? "" : " link-disabled");

  const img = document.createElement("img");
  img.className = "link-avatar";
  img.loading = "lazy";
  img.src = link.imgurl || "";
  img.alt = link.title;
  img.onerror = () => img.remove();

  const info = document.createElement("div");
  info.className = "link-info";
  const head = document.createElement("div");
  head.className = "link-head";
  const name = document.createElement("span");
  name.className = "link-title";
  name.textContent = link.title;
  const badge = document.createElement("span");
  badge.className = "link-badge " + (link.enabled ? "on" : "off");
  badge.textContent = link.enabled ? "启用" : "停用";
  head.append(name, badge);
  const desc = document.createElement("p");
  desc.className = "link-desc";
  desc.textContent = link.desc || "";
  const meta = document.createElement("div");
  meta.className = "link-meta";
  const url = document.createElement("span");
  url.textContent = link.siteurl;
  for (const t of link.tags || []) {
    const chip = document.createElement("span");
    chip.className = "post-tag";
    chip.textContent = t;
    meta.append(chip);
  }
  meta.append(url);
  info.append(head, desc, meta);

  const actions = document.createElement("div");
  actions.className = "post-actions link-actions";
  const editBtn = document.createElement("button");
  editBtn.className = "btn ghost small";
  editBtn.textContent = "编辑";
  editBtn.onclick = () => fillLinkForm(link, index);
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "btn ghost small";
  toggleBtn.textContent = link.enabled ? "停用" : "启用";
  toggleBtn.onclick = () => {
    state.links[index].enabled = !link.enabled;
    state.linksDirty = true;
    renderLinks();
  };
  const delBtn = document.createElement("button");
  delBtn.className = "btn danger ghost small";
  delBtn.textContent = "删除";
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

/* ---------- 工具 ---------- */

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

/* ---------- 主题 ---------- */

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("cms_theme", dark ? "dark" : "light");
}

/* ---------- 事件绑定 ---------- */

$("login-btn").onclick = login;
$("login-password").addEventListener("keydown", (e) => e.key === "Enter" && login());
$("logout-btn").onclick = () => logout();
$("theme-toggle").onclick = () =>
  applyTheme(!document.documentElement.classList.contains("dark"));
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
  const msg = $("editor-msg");
  try {
    await uploadImage(file);
  } catch (err) {
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
document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => switchTab(tab.dataset.tab);
});
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
