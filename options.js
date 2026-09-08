// 离线表单秒填 - 选项页逻辑(仅读写本机 chrome.storage,无网络调用)
// 存储:siteWhitelist: ["domain", ...] 且 wlMode: "all" | "whitelist"

const $ = (s) => document.querySelector(s);
const DATA_KEYS = ["profiles", "activeProfileId", "mappings", "autofill", "siteWhitelist", "wlMode"];

// ---------- 白名单 ----------
let whitelist = [];

async function loadWL() {
  const { siteWhitelist = [], wlMode = "all" } = await chrome.storage.local.get(["siteWhitelist", "wlMode"]);
  whitelist = Array.isArray(siteWhitelist) ? siteWhitelist : [];
  document.querySelectorAll('input[name=wlmode]').forEach((r) => {
    r.checked = r.value === (whitelist.length ? wlMode : "all") || (r.value === "all" && !whitelist.length);
  });
  renderWL();
}

function renderWL() {
  const list = $("#wl-list");
  if (!whitelist.length) {
    list.innerHTML = '<div class="empty">白名单为空。添加域名后,选择「仅白名单网站」即可只在名单内自动填充。</div>';
    return;
  }
  list.innerHTML = "";
  whitelist.forEach((d, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    const t = document.createElement("span");
    t.textContent = d;
    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = "删除";
    x.onclick = async () => {
      whitelist.splice(i, 1);
      await saveWL();
    };
    chip.append(t, x);
    list.append(chip);
  });
}

async function saveWL() {
  await chrome.storage.local.set({ siteWhitelist: whitelist });
  renderWL();
}

$("#wl-add").onclick = async () => {
  const raw = $("#wl-input").value.trim().toLowerCase();
  if (!raw) return;
  // 容错:去掉协议、路径、端口,只留域名
  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!domain || !domain.includes(".")) return setStatus("请输入有效域名,如 zoho.com.cn");
  if (whitelist.includes(domain)) return setStatus("该域名已在白名单");
  whitelist.push(domain);
  $("#wl-input").value = "";
  await saveWL();
  setStatus(`已添加 ${domain} ✓`);
};

$("#wl-input").onkeydown = (e) => {
  if (e.key === "Enter") $("#wl-add").click();
};

document.querySelectorAll('input[name=wlmode]').forEach((r) => {
  r.onchange = async () => {
    if (r.checked) {
      if (r.value === "whitelist" && !whitelist.length) {
        r.checked = false;
        document.querySelector('input[name=wlmode][value=all]').checked = true;
        return setStatus("白名单为空,先添加域名");
      }
      await chrome.storage.local.set({ wlMode: r.value });
      // 白名单模式保存名单快照;全站模式清空名单使 content.js 的"非空才生效"逻辑成立
      await chrome.storage.local.set({ siteWhitelist: r.value === "whitelist" ? whitelist : [] });
      setStatus(r.value === "whitelist" ? "已切换:仅白名单网站自动填充" : "已切换:所有网站自动填充");
    }
  };
});

// ---------- 数据导出/导入(与 popup.js 相同格式) ----------
$("#export").onclick = async () => {
  const data = await chrome.storage.local.get(DATA_KEYS);
  const payload = JSON.stringify({ app: "offline-form-filler", version: 1, ...data }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `离线表单秒填-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setStatus("已导出 ✓");
};

$("#import").onclick = () => $("#import-file").click();
$("#import-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.profiles) || !obj.profiles.length) throw new Error("不是本扩展导出的文件");
    const patch = {};
    for (const k of DATA_KEYS) if (obj[k] !== undefined) patch[k] = obj[k];
    await chrome.storage.local.set(patch);
    await loadWL();
    setStatus("导入成功 ✓");
  } catch (err) {
    setStatus("导入失败:" + err.message);
  }
};

function setStatus(text) {
  $("#status").textContent = text;
  setTimeout(() => ($("#status").textContent = ""), 2500);
}

loadWL();
