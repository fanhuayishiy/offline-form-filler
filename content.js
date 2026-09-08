// 离线表单秒填 - content script
// 全部逻辑在本机运行:字段识别靠规则字典 + 自定义参数名,数据存 chrome.storage.local。
// 本文件不包含任何 fetch / XMLHttpRequest / 网络调用。
//
// 数据模型(chrome.storage.local):
//   profiles: [ { id, title, fields: [ { key, label, value } ] } ]  // 多套资料
//   activeProfileId: "..."                                          // 当前使用哪套
//   mappings: [ { selector, host, key?, value? } ]                  // 手动映射:key=绑定资料参数,value=固定值
//   autofill: true/false                                            // 自动填充开关
//   siteWhitelist: ["example.com", ...]                             // 自动填充白名单(空=全部网站)
//
// 整个文件包在 IIFE 里:补注入时页面里可能已驻留旧版脚本(重载扩展前打开的页面),
// 顶层 const 重名会让注入直接失败;闭包隔离后重复注入互不影响。

(() => {
// ---------- 内置字段别名字典(中/英/日,可自行增删) ----------
const DICT = {
  name:     ["姓名", "真实姓名", "名字", "联系人", "收件人", "name", "fullname", "full_name", "realname", "real_name", "contact", "氏名", "お名前", "名前"],
  phone:    ["手机号", "手机", "联系电话", "电话", "联系方式", "tel", "phone", "mobile", "telephone", "電話番号", "携帯", "けいたいでんわ"],
  email:    ["邮箱", "电子邮件", "邮件地址", "email", "e-mail", "mail", "邮箱地址", "メールアドレス", "Ｅメール"],
  idcard:   ["身份证", "证件号码", "证件号", "身份证号", "idcard", "id_card", "idno", "identity", "ssn"],
  company:  ["公司名称", "企业名称", "单位", "公司", "单位全称", "company", "corp", "organization", "org", "会社名", "企業名", "社名"],
  province: ["省份", "所在省", "省", "province", "state", "都道府県"],
  city:     ["城市", "所在市", "市", "city", "市区町村"],
  district: ["区县", "区/县", "地区", "district", "county", "area"],
  address:  ["详细地址", "通讯地址", "收货地址", "住址", "地址", "address", "addr", "住所", "ご住所"],
  zip:      ["邮政编码", "邮编", "zip", "postcode", "postal", "郵便番号", " postal_code"],
  gender:   ["性别", "gender", "sex", "性別"],
  birthday: ["出生日期", "出生年月", "生日", "birthday", "birth_date", "birthdate", "dob", "生年月日"],
  qq:       ["qq号", "qq"],
  wechat:   ["微信号", "微信", "wechat", "wxid"],
  bankcard: ["银行卡号", "银行卡", "卡号", "bankcard", "bank_card", "cardno", "card_no"],
  department: ["部门", "所在部门", "科室", "department", "dept", "部署"],
  position:   ["职位", "职务", "岗位", "position", "title", "job", "役職"],
  remark:   ["备注", "说明", "留言", "remark", "note", "memo", "comment", "備考", "コメント"],
};

// 内置参数的中文名(新建资料套时预置这些字段)
const KEY_LABEL = {
  name: "姓名", phone: "手机", email: "邮箱", idcard: "身份证",
  company: "公司", province: "省份", city: "城市", district: "区县",
  address: "详细地址", zip: "邮编", gender: "性别", birthday: "出生日期",
  qq: "QQ", wechat: "微信", bankcard: "银行卡", department: "部门",
  position: "职位", remark: "备注",
};

// ---------- 当前激活资料套(内存缓存) ----------
let activeFields = {}; // key -> { key, label, value }

async function loadProfiles() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId", "profile"]);
  let profiles = data.profiles;
  if (!Array.isArray(profiles) || !profiles.length) {
    // 兼容旧版:把单套 profile 迁移成"默认"资料套
    const legacy = data.profile || {};
    profiles = [{
      id: "default",
      title: "默认",
      fields: Object.entries(legacy).map(([k, v]) => ({ key: k, label: KEY_LABEL[k] || k, value: String(v) })),
    }];
    await chrome.storage.local.set({ profiles, activeProfileId: "default" });
  }
  const active = profiles.find((p) => p.id === data.activeProfileId) || profiles[0];
  activeFields = {};
  (active.fields || []).forEach((f) => (activeFields[f.key] = f));
}

function fieldValue(key) {
  const f = activeFields[key];
  return f == null ? "" : String(f.value == null ? "" : f.value);
}

// ---------- 扩展上下文失效保护 ----------
// 扩展更新/重载(↻)后,已打开页面里驻留的旧脚本会失去 chrome.* 访问权。
// 不同内核表现不同:Chrome 抛 "Extension context invalidated",
// 部分内核则是 chrome.storage/runtime 直接变 undefined。
// 统一兜底:提示一次,然后休眠。
let ctxDead = false;
function ctxValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
  } catch (e) {
    return false;
  }
}
function isCtxError(e) {
  const s = String((e && e.message) || e);
  return (
    s.includes("Extension context invalidated") ||
    s.includes("reading 'local'") ||
    s.includes("reading 'runtime'")
  );
}
function guard(fn) {
  if (ctxDead) return Promise.resolve();
  return Promise.resolve()
    .then(() => {
      if (!ctxValid()) throw new Error("Extension context invalidated");
      return fn();
    })
    .catch((e) => {
      if (isCtxError(e)) {
        ctxDead = true;
        try {
          toast("表单秒填已更新,请刷新本页一次");
        } catch (_) {}
        return;
      }
      console.error("[form-filler]", e);
    });
}

// 动态字典 = 内置别名 + 当前资料套里每个参数的名称
// 这样你自定义的"家长姓名""车牌号"等参数,也能被自动识别命中
function buildDict() {
  const dict = {};
  for (const [k, aliases] of Object.entries(DICT)) dict[k] = aliases.slice();
  for (const [k, f] of Object.entries(activeFields)) {
    const label = String(f.label || "").toLowerCase();
    if (!label) continue;
    (dict[k] = dict[k] || []).push(label);
  }
  return dict;
}

// ---------- 工具函数 ----------

// 收集一个字段的所有"线索"文本,拼成小写字符串用于匹配
function clueOf(el) {
  const parts = [
    el.name, el.id, el.placeholder,
    el.getAttribute("aria-label"), el.getAttribute("title"), el.type,
  ];
  if (el.labels && el.labels.length) {
    parts.push(...Array.from(el.labels).map((l) => l.textContent));
  }
  const labelTag = el.closest("label");
  if (labelTag) parts.push(labelTag.textContent);
  const prev = el.previousElementSibling;
  if (prev) parts.push(prev.textContent);
  if (el.parentElement) parts.push(el.parentElement.textContent);
  return parts.filter(Boolean).join(" ").toLowerCase().slice(0, 300);
}

// 用字典给线索找候选参数键,按可信度(命中别名长度)从高到低排序。
// 返回排序后的键列表:填充时取第一个"在当前资料套里有值"的候选。
// (为什么不只取最优:字段 id 含 "mobile" 会命中内置 phone,但若资料套里没填 phone,
//  应回退到次优的自定义参数"电话号码",而不是直接放弃。)
function matchKeys(clue, dict = DICT) {
  const scored = [];
  for (const [key, aliases] of Object.entries(dict)) {
    let best = 0;
    for (const a of aliases) {
      const al = a.toLowerCase();
      if (clue.includes(al) && al.length > best) best = al.length;
    }
    if (best) scored.push({ key, score: best });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.map((s) => s.key);
}

// 找出页面上所有可见的可填字段
function getFields(root = document) {
  return Array.from(
    root.querySelectorAll(
      'input:not([type=hidden]):not([type=button]):not([type=submit]):' +
      'not([type=reset]):not([type=image]):not([type=file]), textarea, select'
    )
  ).filter((el) => el.getClientRects().length > 0 && !el.disabled && !el.readOnly);
}

// 关键:绕过 React/Vue 对 value 的劫持,用原生 setter 赋值并派发事件,
// 否则框架状态不更新,看起来"填了又消失"。
function setNativeValue(el, value) {
  try {
    if (el instanceof HTMLSelectElement) {
      const opt =
        Array.from(el.options).find(
          (o) => o.value === value || o.textContent.trim() === value ||
                 o.textContent.includes(value) || value.includes(o.textContent.trim())
        );
      if (!opt) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, opt.value);
    } else if (el instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, value);
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    return true;
  } catch (e) {
    return false;
  }
}

// 生成稳定的 CSS 选择器(用于手动映射)
function cssPath(el) {
  if (el.id) return "#" + CSS.escape(el.id);
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName !== "BODY") {
    if (node.id) {
      parts.unshift("#" + CSS.escape(node.id));
      break;
    }
    let part = node.tagName.toLowerCase();
    if (node.name) {
      part += `[name="${CSS.escape(node.name)}"]`;
    } else {
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

// ---------- 填充主流程 ----------
function doFill(opts = {}) {
  const auto = !!opts.auto;
  return guard(async () => {
    await loadProfiles();
    const { mappings = [] } = await chrome.storage.local.get("mappings");
    const dict = buildDict();

    let filled = 0;
    let skipped = 0;
    const handled = new Set();

    // 1) 手动映射优先:绑定资料参数的取当前套最新值;固定值的按选择器精确填
    for (const m of mappings) {
      if (m.host && !location.hostname.endsWith(m.host)) continue;
      const value = m.key ? fieldValue(m.key) : m.value;
      if (value == null || value === "") continue; // 当前资料套没有该参数或还没填,跳过
      let nodes = [];
      try {
        nodes = document.querySelectorAll(m.selector);
      } catch (e) {
        continue;
      }
      nodes.forEach((el) => {
        handled.add(el);
        if (el.value === value) return; // 已是目标值,不重复填
        if (setNativeValue(el, value)) {
          filled++;
          flash(el);
        }
      });
    }

    // 2) 字典自动识别(含自定义参数名):只填空字段;已有值的一律跳过,正在输入的也不动
    for (const el of getFields()) {
      if (handled.has(el)) continue;
      if (el.value) {
        skipped++;
        continue;
      }
      if (el === document.activeElement) continue;
      const candidates = matchKeys(clueOf(el), dict);
      let value = "";
      for (const key of candidates) {
        const v = fieldValue(key);
        if (v !== "") { value = v; break; } // 取第一个有值的候选
      }
      if (value !== "") {
        if (setNativeValue(el, value)) {
          filled++;
          flash(el);
        }
      } else {
        skipped++;
      }
    }

    // 自动模式下没填到东西就不打扰,手动触发始终给反馈
    if (filled || !auto) {
      toast(`已填充 ${filled} 个字段${skipped ? `,${skipped} 个跳过(已填写/未识别)` : ""}`);
    }

    fillCheckable(dict, handled);
  });
}

// ---------- 勾选框/单选组 ----------
// 识别 type=checkbox/radio:线索命中参数,且参数值为布尔语义
// (true/false、是/否、对/错、on/off、1/0、同意/不同意)时自动勾选。
// 单选组:值与选项文本/value 匹配的那个被选中。已勾选的不动。
function truthy(v) {
  const s = String(v).trim().toLowerCase();
  return ["true", "是", "对", "同意", "on", "1", "yes", "y", "勾选", "选中"].includes(s);
}
function falsy(v) {
  const s = String(v).trim().toLowerCase();
  return ["false", "否", "不对", "不同意", "off", "0", "no", "n", "不勾选", "不选中"].includes(s);
}

function setCheck(el, want) {
  if (el.checked === want) return false; // 已是目标状态,不动
  el.click(); // 走原生点击,让页面框架(React/Vue)收到完整交互事件
  return true;
}

function fillCheckable(dict, handled) {
  const boxes = Array.from(
    document.querySelectorAll('input[type=checkbox], input[type=radio]')
  ).filter((el) => el.getClientRects().length > 0 && !el.disabled);
  for (const el of boxes) {
    if (handled.has(el)) continue;
    const key = matchKeys(clueOf(el), dict)[0];
    if (!key) continue;
    const val = fieldValue(key);
    if (val === "") continue;
    if (el.type === "checkbox") {
      let want = null;
      if (truthy(val)) want = true;
      else if (falsy(val)) want = false;
      if (want !== null && setCheck(el, want)) flash(el);
    } else {
      // radio:按选项文本/value 与参数值匹配
      const opt = String(val).trim().toLowerCase();
      const label = (clueOf(el).includes(opt) ||
        String(el.value).toLowerCase() === opt ||
        (el.labels && Array.from(el.labels).some((l) => l.textContent.trim().toLowerCase() === opt)));
      if (label && !el.checked && setCheck(el, true)) flash(el);
    }
  }
}

// ---------- 手动设置字段(右键菜单触发) ----------
let lastRightClicked = null;
document.addEventListener(
  "contextmenu",
  (e) => {
    const el = e.target.closest("input, textarea, select");
    if (el) lastRightClicked = el;
  },
  true
);

function captureField() {
  const el = lastRightClicked;
  if (!el || !getFields(document).includes(el)) {
    toast("请先在输入框上点右键");
    return;
  }
  const clue = clueOf(el);
  // 预选:取第一个"有值"的候选参数;都没有值则用最优候选
  const candidates = matchKeys(clue, buildDict());
  const guess = candidates.find((k) => fieldValue(k) !== "") || candidates[0] || null;
  const selector = cssPath(el);

  // 下拉列出当前资料套的全部参数(内置 + 自定义),选中即"绑定",值跟随资料
  const keyOptions = ['<option value="">固定值(不跟随资料)</option>'].concat(
    Object.values(activeFields).map(
      (f) =>
        `<option value="${escapeHtml(f.key)}"${f.key === guess ? " selected" : ""}>绑定资料:${escapeHtml(f.label || f.key)}</option>`
    )
  ).join("");

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;z-index:2147483647;top:20px;right:20px;width:320px;" +
    "background:#1e1e2e;color:#eee;padding:14px;border-radius:10px;" +
    "font:13px/1.6 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.4)";
  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">设置此字段</div>
    <div style="opacity:.7;margin-bottom:8px">识别线索:${clue.slice(0, 60) || "(无)"}</div>
    <select id="ff-key" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;
      border:1px solid #555;background:#2a2a3a;color:#eee;margin-bottom:8px">${keyOptions}</select>
    <input id="ff-val" placeholder="要填入的值" style="width:100%;box-sizing:border-box;
      padding:6px 8px;border-radius:6px;border:1px solid #555;background:#2a2a3a;color:#eee"
      value="${guess ? escapeHtml(fieldValue(guess)) : escapeHtml(el.value)}">
    <div id="ff-hint" style="opacity:.6;margin-top:6px;display:none">值将实时取自当前资料套,切换资料套/改资料都会自动跟着变</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="ff-save" style="flex:1;padding:6px;border:0;border-radius:6px;background:#4a7dff;color:#fff;cursor:pointer">保存映射</button>
      <button id="ff-cancel" style="flex:1;padding:6px;border:1px solid #555;border-radius:6px;background:transparent;color:#ccc;cursor:pointer">取消</button>
    </div>`;
  document.documentElement.appendChild(panel);

  const keySel = panel.querySelector("#ff-key");
  const valInp = panel.querySelector("#ff-val");
  const hint = panel.querySelector("#ff-hint");
  function syncMode() {
    const bound = !!keySel.value;
    valInp.style.display = bound ? "none" : "";
    hint.style.display = bound ? "" : "none";
  }
  keySel.onchange = syncMode;
  syncMode();

  panel.querySelector("#ff-cancel").onclick = () => panel.remove();
  valInp.focus();
  panel.querySelector("#ff-save").onclick = () => {
    guard(async () => {
      const key = keySel.value;
      const value = valInp.value;
      const { mappings = [] } = await chrome.storage.local.get("mappings");
      const host = location.hostname;
      const next = mappings.filter((m) => !(m.selector === selector && m.host === host));
      next.push(key ? { selector, key, host } : { selector, value, host });
      await chrome.storage.local.set({ mappings: next });
      const fillVal = key ? fieldValue(key) : value;
      if (fillVal) {
        setNativeValue(el, fillVal);
        flash(el);
      }
      panel.remove();
      toast(
        key
          ? `已绑定资料「${activeFields[key] ? activeFields[key].label : key}」,资料改了自动跟着变`
          : `已记住该字段,以后自动填"${value}"`
      );
    });
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ---------- 轻提示 ----------
function flash(el) {
  el.style.outline = "2px solid #4a7dff";
  setTimeout(() => (el.style.outline = ""), 800);
}

let toastTimer = null;
function toast(text) {
  let t = document.getElementById("ff-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "ff-toast";
    t.style.cssText =
      "position:fixed;z-index:2147483647;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:#1e1e2e;color:#fff;padding:8px 16px;border-radius:8px;font:13px system-ui;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.35)";
    document.documentElement.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.opacity = "0"), 2500);
}

// ---------- 自动填充开关 ----------
// 开启后:页面加载完自动扫一遍;之后 DOM 里新出现的表单字段(异步加载、SPA 切页)
// 也会防抖触发扫描。已填写的字段在 doFill 里统一跳过,不会重复填。
let autoOn = false;
let autoTimer = null;
let whitelist = [];

// 白名单非空时,自动填充只对名单内域名生效;手动触发不受限
function siteAllowed() {
  if (!whitelist.length) return true;
  const host = location.hostname;
  return whitelist.some((d) => host === d || host.endsWith("." + d));
}

function scheduleAutoFill(delay = 800) {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (autoOn && siteAllowed()) doFill({ auto: true });
  }, delay);
}

(async () => {
  guard(async () => {
    await loadProfiles();
    const settings = await chrome.storage.local.get(["autofill", "siteWhitelist"]);
    whitelist = Array.isArray(settings.siteWhitelist) ? settings.siteWhitelist : [];
    autoOn = !!settings.autofill;
    if (autoOn && siteAllowed()) doFill({ auto: true });
  });
})();

const domObserver = new MutationObserver((muts) => {
  if (!autoOn || !siteAllowed()) return;
  const hasNewField = muts.some((m) =>
    Array.from(m.addedNodes).some(
      (n) =>
        n.nodeType === 1 &&
        (n.matches?.("input, textarea, select") ||
          n.querySelector?.("input, textarea, select"))
    )
  );
  if (hasNewField) scheduleAutoFill();
});
domObserver.observe(document.documentElement, { childList: true, subtree: true });

// ---------- 存储变化:改资料/切资料套/开关/白名单,实时生效 ----------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.siteWhitelist) {
    whitelist = Array.isArray(changes.siteWhitelist.newValue)
      ? changes.siteWhitelist.newValue
      : [];
  }
  if (changes.profiles || changes.activeProfileId || changes.profile) {
    guard(() =>
      loadProfiles().then(() => {
        if (autoOn && siteAllowed()) doFill({ auto: true }); // 自动模式下,切了资料套立刻按新套重扫
      })
    );
  }
  if (changes.autofill) {
    autoOn = !!changes.autofill.newValue;
    if (autoOn && siteAllowed()) doFill({ auto: true });
  }
});

// ---------- 消息入口 ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "fill") doFill();
  if (msg.action === "capture") captureField();
});

// 补注入路径的备用触发通道:注入脚本后直接派发 DOM 事件,不依赖消息端口
window.addEventListener("ff-fill", () => doFill());
window.addEventListener("ff-capture", () => captureField());

// 供 test.js 获取内部函数(生产环境无副作用)
if (typeof globalThis.__FF_TEST_HOOK__ === "function") {
  globalThis.__FF_TEST_HOOK__({ doFill });
}
})();
