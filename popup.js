// 离线表单秒填 - 管理窗口逻辑(仅读写本机 chrome.storage,无网络调用)

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ---------- Tab 切换:我的资料 / 手动映射 ----------
$$(".tabs button").forEach((btn) => {
  btn.onclick = () => {
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    $$("section").forEach((sec) =>
      sec.classList.toggle("active", sec.id === "tab-" + btn.dataset.tab)
    );
  };
});

// 内置参数中文名(与 content.js 的 KEY_LABEL 保持一致)
const KEY_LABEL = {
  name: "姓名", phone: "手机", email: "邮箱", idcard: "身份证",
  company: "公司", province: "省份", city: "城市", district: "区县",
  address: "详细地址", zip: "邮编", gender: "性别", birthday: "出生日期",
  qq: "QQ", wechat: "微信", bankcard: "银行卡", department: "部门",
  position: "职位", remark: "备注",
};

// ---------- 多套资料状态 ----------
let profiles = [];
let activeId = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const activeProfile = () => profiles.find((p) => p.id === activeId);
const builtinFields = () =>
  Object.entries(KEY_LABEL).map(([key, label]) => ({ key, label, value: "" }));

async function saveAll() {
  await chrome.storage.local.set({ profiles, activeProfileId: activeId });
}

async function loadAll() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId", "profile"]);
  profiles = Array.isArray(data.profiles) ? data.profiles : [];
  if (!profiles.length) {
    // 兼容旧版单套 profile
    const legacy = data.profile || {};
    const fields = Object.keys(legacy).length
      ? Object.entries(legacy).map(([k, v]) => ({ key: k, label: KEY_LABEL[k] || k, value: String(v) }))
      : builtinFields();
    profiles = [{ id: "default", title: "默认", fields }];
    activeId = "default";
    await saveAll();
  } else {
    activeId =
      data.activeProfileId && profiles.some((p) => p.id === data.activeProfileId)
        ? data.activeProfileId
        : profiles[0].id;
  }
  renderProfileSelect();
  renderFields();
}

function renderProfileSelect() {
  $("#profile-select").innerHTML = profiles
    .map((p) => `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.title)}</option>`)
    .join("");
}

// ---------- 参数列表(内置 + 自定义,可增删) ----------
function renderFields() {
  const list = $("#field-list");
  list.innerHTML = "";
  const p = activeProfile();
  p.fields.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "row";

    const lab = document.createElement("label");
    lab.textContent = f.label;
    lab.title = KEY_LABEL[f.key] == null ? `自定义参数:${f.label}` : `内置参数:${f.key}`;

    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = f.value || "";
    inp.oninput = () => (f.value = inp.value); // 暂存内存,点"保存资料"写入本机

    row.append(lab, inp);

    // 自定义参数可删除,内置参数不可删(避免误删)
    if (KEY_LABEL[f.key] == null) {
      const del = document.createElement("button");
      del.textContent = "✕";
      del.className = "xdel";
      del.title = "删除该自定义参数";
      del.onclick = () => {
        p.fields.splice(i, 1);
        renderFields();
      };
      row.append(del);
    }
    list.append(row);
  });
}

$("#field-add").onclick = () => {
  const label = $("#new-field-label").value.trim();
  if (!label) return setStatus("请先输入参数名");
  const p = activeProfile();
  if (p.fields.some((f) => f.key === label)) return setStatus("该参数名已存在");
  p.fields.push({ key: label, label, value: "" }); // 自定义参数:key 即名称,跨资料套可同名绑定
  $("#new-field-label").value = "";
  renderFields();
  setStatus(`已添加参数「${label}」,记得点保存`);
};

// ---------- 资料套:切换 / 新建 / 改名 / 删除 ----------
$("#profile-select").onchange = async (e) => {
  activeId = e.target.value;
  await saveAll();
  renderFields();
  setStatus(`已切换到「${activeProfile().title}」,填充将使用这套资料`);
};

$("#prof-add").onclick = async () => {
  const p = { id: uid(), title: `资料${profiles.length + 1}`, fields: builtinFields() };
  profiles.push(p);
  activeId = p.id;
  await saveAll();
  renderProfileSelect();
  renderFields();
  setStatus("已新建资料套,点「改名」起个名字");
};

$("#prof-rename").onclick = () => {
  const p = activeProfile();
  const sel = $("#profile-select");
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = p.title;
  inp.style.cssText = "flex:1;min-width:0;padding:7px 8px;border:1px solid #2b6cf0;border-radius:8px;font-size:14px";
  sel.replaceWith(inp);
  inp.focus();
  inp.select();
  const finish = async (ok) => {
    if (ok && inp.value.trim()) p.title = inp.value.trim();
    await saveAll();
    inp.replaceWith(sel);
    renderProfileSelect();
  };
  inp.onkeydown = (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  };
  inp.onblur = () => finish(true);
};

$("#prof-del").onclick = async () => {
  if (profiles.length <= 1) return setStatus("至少保留一套资料");
  const p = activeProfile();
  if (!confirm(`确定删除资料套「${p.title}」?该套资料内容将一并删除。`)) return;
  profiles = profiles.filter((x) => x.id !== activeId);
  activeId = profiles[0].id;
  await saveAll();
  renderProfileSelect();
  renderFields();
  setStatus("已删除");
};

// ---------- 保存 / 填充 ----------
$("#save").onclick = async () => {
  await saveAll();
  setStatus("已保存到本机 ✓");
};

function setStatus(text) {
  $("#status").textContent = text;
  setTimeout(() => ($("#status").textContent = ""), 2500);
}

// action 弹窗附着在当前浏览器窗口上,currentWindow 即浏览器窗口。
// 不用 chrome.windows.query——部分 Chromium 内核不提供完整 windows API。
$("#fill").onclick = async () => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }
    if (!tab || !tab.id) return setStatus("无法获取当前标签页");

    // 浏览器内部页面(chrome:// 设置页、新标签页、商店等)禁止注入,提前给出明确提示
    if (!/^https?:/i.test(tab.url || "")) {
      return setStatus("浏览器内部页面无法注入,请切换到普通网页");
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "fill" });
    } catch (e) {
      // 页面在扩展安装/刷新(↻)前打开,没有脚本:点击弹窗已授予 activeTab,现场补注入。
      // 1) 注入脚本文件(顶层 frame 优先——allFrames 需要子 frame 权限,跨域 iframe 会让调用整体失败);
      // 2) 再注入一个小函数派发 DOM 事件触发填充——不依赖消息端口,内核兼容性最好。
      let injErr = "";
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      } catch (err) {
        injErr = String((err && err.message) || err); // 页面可能已驻留旧脚本:重名报错属预期,走事件通道即可
        await chrome.scripting
          .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] })
          .catch(() => {});
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (name) => window.dispatchEvent(new Event(name)),
          args: ["ff-fill"],
        });
      } catch (err) {
        console.error("[form-filler] 注入失败:", injErr, err);
        return setStatus("注入失败:" + String((err && err.message) || injErr || err).slice(0, 70));
      }
    }
    setStatus(`已填充:${(tab.title || tab.url).slice(0, 24)}`);
  } catch (e) {
    console.error("[form-filler]", e);
    setStatus("注入失败:" + String((e && e.message) || e).slice(0, 70));
  }
};

// ---------- 数据导出 / 导入(换浏览器、换电脑时带走资料和映射) ----------
const DATA_KEYS = ["profiles", "activeProfileId", "mappings", "autofill"];

$("#export").onclick = async () => {
  const data = await chrome.storage.local.get(DATA_KEYS);
  const payload = JSON.stringify({ app: "offline-form-filler", version: 1, ...data }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `离线表单秒填-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setStatus("已导出 JSON 文件 ✓");
};

$("#import").onclick = () => $("#import-file").click();

$("#import-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.profiles) || !obj.profiles.length) {
      throw new Error("不是本扩展导出的文件");
    }
    const patch = {};
    for (const k of ["profiles", "activeProfileId", "mappings", "autofill", "siteWhitelist", "wlMode"]) {
      if (obj[k] !== undefined) patch[k] = obj[k];
    }
    await chrome.storage.local.set(patch);
    await loadAll();
    await loadMappings();
    await loadAuto();
    setStatus("导入成功 ✓ 资料与映射已覆盖为本机数据");
  } catch (err) {
    setStatus("导入失败:" + err.message);
  }
};

// ---------- CSV 批量导入资料套 ----------
// 格式:首行为表头(列名=参数名,内置参数可用中文名如"姓名"),每行=一套资料。
// 例:姓名,手机,邮箱,公司 / 张三,138...,a@b.c,某公司
function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = false;
      } else cell += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

// ---------- 表格行 → 资料套(CSV 与 xlsx 共用) ----------
function rowsToProfiles(rows) {
  if (rows.length < 2) throw new Error("表格至少要有表头和一行数据");
  const headers = rows[0].map((h) => String(h).trim()).filter(Boolean);
  if (!headers.length) throw new Error("表头为空");
  const next = profiles.slice();
  let count = 0;
  for (const line of rows.slice(1)) {
    const fields = headers.map((h, j) => {
      // 内置参数按 KEY_LABEL 反查 key;自定义参数 key=label
      const builtin = Object.entries(KEY_LABEL).find(([, label]) => label === h);
      const key = builtin ? builtin[0] : h;
      return { key, label: h, value: (line[j] == null ? "" : String(line[j])).trim() };
    });
    const p = { id: uid(), title: fields[0].value || `资料${next.length + 1}`, fields };
    next.push(p);
    count++;
  }
  profiles = next;
  activeId = next[next.length - 1].id;
  return count;
}

async function afterImport(count, label) {
  await saveAll();
  renderProfileSelect();
  renderFields();
  setStatus(`已从 ${label} 导入 ${count} 套资料 ✓`);
}

$("#import-csv-btn").onclick = () => $("#import-csv").click();
$("#import-csv").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const rows = parseCSV(new TextDecoder("utf-8").decode(await file.arrayBuffer()));
    await afterImport(rowsToProfiles(rows), "CSV");
  } catch (err) {
    setStatus("CSV 导入失败:" + err.message);
  }
};

// ---------- Excel .xlsx 导入 ----------
$("#import-xlsx-btn").onclick = () => $("#import-xlsx").click();
$("#import-xlsx").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const rows = await parseXLSX(await file.arrayBuffer());
    await afterImport(rowsToProfiles(rows), "Excel");
  } catch (err) {
    setStatus("Excel 导入失败:" + err.message);
  }
};

// ---------- 高级设置 ----------
$("#open-options").onclick = () => {
  chrome.runtime.openOptionsPage();
};

// ---------- 自动填充开关 ----------
async function loadAuto() {
  const { autofill = false } = await chrome.storage.local.get("autofill");
  $("#autofill").checked = autofill;
  $("#autofill-text").textContent = autofill ? "已开启" : "已关闭";
}

$("#autofill").onchange = async (e) => {
  await chrome.storage.local.set({ autofill: e.target.checked });
  $("#autofill-text").textContent = e.target.checked ? "已开启" : "已关闭";
};

// ---------- 手动映射列表 ----------
async function loadMappings() {
  const { mappings = [] } = await chrome.storage.local.get("mappings");
  const list = $("#map-list");
  if (!mappings.length) {
    list.innerHTML = '<div class="empty">暂无映射<br>在网页输入框上右键「设置此字段」添加</div>';
    return;
  }
  list.innerHTML = "";
  mappings.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "map";
    const target = m.key
      ? `<b>资料·${esc(KEY_LABEL[m.key] || m.key)}</b><span style="color:#8a93a5">(跟随当前资料套)</span>`
      : `<b>${esc(m.value)}</b>`;
    div.innerHTML = `
      <div class="host">${esc(m.host || "(所有网站)")}</div>
      <div class="sel">${esc(m.selector)}</div>
      <div class="val">→ 填:${target}</div>`;
    const del = document.createElement("button");
    del.textContent = "删除";
    del.className = "btn danger mini";
    del.style.marginTop = "8px";
    del.onclick = async () => {
      const next = mappings.filter((_, j) => j !== i);
      await chrome.storage.local.set({ mappings: next });
      loadMappings();
    };
    div.appendChild(del);
    list.appendChild(div);
  });
}

$("#clear-maps").onclick = async () => {
  await chrome.storage.local.set({ mappings: [] });
  loadMappings();
};

// ---------- 填充历史 / 撤销 ----------
function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  const list = $("#history-list");
  if (!history.length) {
    list.innerHTML = '<div class="empty">暂无填充记录</div>';
    return;
  }
  list.innerHTML = "";
  history.slice(0, 10).forEach((h) => {
    const div = document.createElement("div");
    div.className = "map";
    div.innerHTML = `
      <div class="host">${esc(fmtTime(h.time))} · ${esc(h.host)}</div>
      <div class="val">${esc(h.title || "")} · 改动 ${h.changes.length} 处</div>`;
    list.appendChild(div);
  });
}

$("#undo").onclick = async () => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }
    if (!tab || !tab.id) return setStatus("无法获取当前标签页");
    if (!/^https?:/i.test(tab.url || "")) return setStatus("浏览器内部页面无法操作");
    await chrome.tabs.sendMessage(tab.id, { action: "undo" });
    setStatus("已发送撤销命令,看页面提示");
    loadHistory();
  } catch (e) {
    setStatus("撤销失败:页面里没有脚本,请刷新页面");
  }
};

$("#clear-history").onclick = async () => {
  await chrome.storage.local.set({ history: [] });
  loadHistory();
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

loadAll();
loadMappings();
loadAuto();
loadHistory();
