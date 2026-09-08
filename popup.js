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

// 本窗口是独立弹窗,要填的是"普通浏览器窗口"里的活动标签页
$("#fill").onclick = async () => {
  try {
    const wins = await chrome.windows.query({ normal: true });
    const win = wins.find((w) => w.focused) || wins[0];
    if (!win) return setStatus("无法获取当前标签页");
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    if (!tab || !tab.id) return setStatus("当前窗口没有活动标签页");

    // 浏览器内部页面(chrome:// 设置页、新标签页、商店等)禁止注入,提前给出明确提示
    if (!/^https?:/i.test(tab.url || "")) {
      return setStatus("浏览器内部页面无法注入,请切换到普通网页");
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "fill" });
    } catch (e) {
      // 页面是在扩展安装/刷新(↻)之前打开的,里面还没有脚本。
      // 点击弹窗已授予 activeTab 权限,这里现场补注入,无需手动刷新。
      // 注意:必须先只注入顶层 frame —— allFrames:true 要求对每个子 frame 都有
      // host 权限,遇到跨域 iframe(在线客服等)会让整个调用失败。
      let injErr = "";
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      } catch (err) {
        injErr = String((err && err.message) || err);
        await chrome.scripting
          .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] })
          .catch(() => {});
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "fill" });
      } catch (err) {
        console.error("[form-filler] 注入失败:", injErr || err);
        return setStatus(
          "注入失败" + (injErr ? `:${injErr.slice(0, 60)}` : "") + ",请刷新页面后重试"
        );
      }
    }
    setStatus(`已填充:${(tab.title || tab.url).slice(0, 24)}`);
  } catch (e) {
    setStatus("注入失败,请刷新页面后重试");
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
    for (const k of DATA_KEYS) if (obj[k] !== undefined) patch[k] = obj[k];
    await chrome.storage.local.set(patch);
    await loadAll();
    await loadMappings();
    await loadAuto();
    setStatus("导入成功 ✓ 资料与映射已覆盖为本机数据");
  } catch (err) {
    setStatus("导入失败:" + err.message);
  }
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
