// 用 jsdom 验证 content.js 的填充引擎(与扩展内运行的是同一份代码)
const { JSDOM } = require("jsdom");
const fs = require("fs");
const assert = require("assert");

const dom = new JSDOM(
  `<!DOCTYPE html><html><body><form>
    <div><label for="f-name">姓名</label><input id="f-name"></div>
    <div><input id="f-phone" placeholder="请输入手机号"></div>
    <div><input id="f-email" name="email" placeholder="电子邮箱"></div>
    <div><label>性别</label><select id="f-gender"><option value="">请选择</option><option value="m">男</option><option value="f">女</option></select></div>
    <div><span>公司名称</span><input id="f-company"></div>
    <div><span>收货地址</span><input id="f-addr" name="address"></div>
    <div><span>React受控姓名框</span><input id="f-react" name="realname"></div>
    <div><span>家长姓名(自定义字段)</span><input id="f-weird" name="jiazhang_xm2"></div>
    <div><span>家长单位(字典认不出的字段)</span><input id="f-bound" name="jiazhang_dw2"></div>
    <div><span>家长姓名</span><input id="f-parent" name="jz_xm3"></div>
    <div><span>学生姓名</span><input id="f-student" name="stu_xm"></div>
    <div><span>电话号码</span><input id="rmobile" placeholder="电话号码 *"></div>
    <div><span>我同意服务条款</span><input type="checkbox" id="f-agree"></div>
    <div><span>性别单选</span><label><input type="radio" name="gender_r" value="男">男</label><label><input type="radio" name="gender_r" value="女">女</label></div>
  </form></body></html>`,
  { url: "https://example.com/form" }
);
const { window } = dom;

// ---- 浏览器环境垫片 ----
global.window = window;
global.document = window.document;
global.location = window.location;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;
global.HTMLSelectElement = window.HTMLSelectElement;
global.Event = window.Event;
global.KeyboardEvent = window.KeyboardEvent;
global.MutationObserver = window.MutationObserver;
global.CSS = window.CSS && window.CSS.escape ? window.CSS : { escape: (s) => s };
window.Element.prototype.getClientRects = () => [{}]; // jsdom 无布局,让字段"可见"
global.setTimeout = setTimeout;

// ---- 模拟 React:实例级 value 劫持,直接赋值被吞,只有原生 setter + input 事件才生效 ----
const react = document.getElementById("f-react");
let frameworkState = "";
Object.defineProperty(react, "value", {
  get() { return frameworkState; },
  set() { /* 框架吞掉直接赋值,等 input 事件 */ },
});
react.addEventListener("input", () => {
  frameworkState = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  ).get.call(react);
});

// ---- 多套资料(新数据模型) ----
const profiles = [
  {
    id: "p1", title: "本人", fields: [
      { key: "name", label: "姓名", value: "张三" },
      { key: "phone", label: "手机", value: "13800001111" },
      { key: "email", label: "邮箱", value: "zhang@example.com" },
      { key: "gender", label: "性别", value: "男" },
      { key: "company", label: "公司", value: "某某科技有限公司" },
      { key: "address", label: "详细地址", value: "北京市海淀区中关村大街1号" },
      { key: "家长姓名", label: "家长姓名", value: "王五" }, // 自定义参数
      { key: "agree", label: "我同意服务条款", value: "是" }, // 勾选框布尔语义
    ],
  },
  {
    id: "p2", title: "家长", fields: [
      { key: "name", label: "姓名", value: "王五" },
      { key: "电话号码", label: "电话号码", value: "17859911022" }, // 自定义,无内置 phone
    ],
  },
];
let activeProfileId = "p1";
const mappings = [
  { selector: "#f-weird", value: "李四", host: "example.com" },          // 固定值映射
  { selector: "#f-bound", key: "company", host: "example.com" },          // 绑定资料参数
];

// ---- chrome.* 垫片(set 落库到 store,get 实时合成,支持 history 与测试中直接改变量) ----
const store = {};
global.chrome = {
  storage: {
    local: {
      get: (keys) => {
        const live = { profiles, activeProfileId, mappings, ...store };
        const arr = keys == null ? Object.keys(live) : Array.isArray(keys) ? keys : [keys];
        return Promise.resolve(
          Object.fromEntries(arr.map((k) => [k, live[k]]).filter(([, v]) => v !== undefined))
        );
      },
      set: (obj) => { Object.assign(store, obj); return Promise.resolve(); },
    },
    onChanged: { addListener: () => {} },
  },
  runtime: { id: "test-extension", onMessage: { addListener: (fn) => (globalThis.__FF_MSG__ = fn) } },
};

// ---- 加载真实的 content.js ----
// content.js 现在整体包裹在 IIFE 里(防重复注入的 const 冲突),
// 通过钩子把 doFill 暴露出来供测试调用。
const FF_SOURCE = fs.readFileSync(__dirname + "/content.js", "utf8");
globalThis.__FF_TEST_SOURCE__ = FF_SOURCE;
globalThis.__FF_TEST_HOOK__ = (api) => (globalThis.doFill = api.doFill);
eval(FF_SOURCE);

(async () => {
  await doFill();

  const val = (id) => document.getElementById(id).value;
  assert.strictEqual(val("f-name"), "张三", "姓名(字典:label)");
  assert.strictEqual(val("f-phone"), "13800001111", "手机(字典:placeholder)");
  assert.strictEqual(val("f-email"), "zhang@example.com", "邮箱(字典:name)");
  assert.strictEqual(val("f-gender"), "m", "性别(下拉按文本匹配)");
  assert.strictEqual(val("f-company"), "某某科技有限公司", "公司(字典:相邻span)");
  assert.strictEqual(val("f-addr"), "北京市海淀区中关村大街1号", "地址(字典:name)");
  assert.strictEqual(frameworkState, "张三", "React受控组件:框架状态已更新");
  assert.strictEqual(val("f-weird"), "李四", "固定值映射:字典认不出的字段按选择器精确填");
  assert.strictEqual(val("f-parent"), "王五", "自定义参数「家长姓名」按名称自动识别");

  // 验证"已填写的跳过":用户手改过的值,再扫描也不覆盖
  document.getElementById("f-phone").value = "13900002222";
  await doFill({ auto: true });
  assert.strictEqual(val("f-phone"), "13900002222", "已填写字段不被覆盖");
  assert.strictEqual(val("f-weird"), "李四", "固定值映射已正确时不重复填");

  // 绑定资料的映射:按当前资料套的值填,资料改了自动跟随
  assert.strictEqual(val("f-bound"), "某某科技有限公司", "绑定资料的映射按资料值填");
  profiles[0].fields.find((f) => f.key === "company").value = "新公司A";
  await doFill({ auto: true });
  assert.strictEqual(val("f-bound"), "新公司A", "资料更新后,绑定该参数的映射自动跟随");

  // 切换资料套:空字段按新套填;新套没有的参数,绑定映射保持不动
  activeProfileId = "p2";
  document.getElementById("f-student").value = ""; // 模拟新打开页面的空字段
  await doFill({ auto: true });
  assert.strictEqual(val("f-student"), "王五", "切换资料套后,按新套的姓名填");
  assert.strictEqual(val("f-bound"), "新公司A", "新资料套没有「公司」参数时,该字段保持不动");

  // Zoho 真实场景:字段 id 含 "mobile" 命中内置 phone,但当前套 phone 无值,
  // 应回退到次优候选——自定义参数「电话号码」(placeholder 命中)
  document.getElementById("rmobile").value = ""; // 模拟新页面空字段
  await doFill({ auto: true });
  assert.strictEqual(val("rmobile"), "17859911022", "phone 无值时回退到自定义「电话号码」参数");

  // 勾选框:布尔语义参数("是")自动勾选;单选组按选项文本匹配
  assert.strictEqual(document.getElementById("f-agree").checked, true, "勾选框按「是」语义勾选");
  assert.strictEqual(
    document.querySelector('input[name=gender_r][value="男"]').checked,
    true,
    "单选组按选项文本匹配选中"
  );
  // 单选组:clue 含"性别单选"+label 男/女 → gender 参数值"男" → 选中"男"

  // CSV 解析:引号包裹、逗号转义、多行(parseCSV 定义在 popup.js)
  const popupSrc = fs.readFileSync(__dirname + "/popup.js", "utf8");
  const parseCSV = new Function(
    popupSrc.match(/function parseCSV[\s\S]*?\n}/)[0] + "\nreturn parseCSV;"
  )();
  const parsed = parseCSV('姓名,手机,备注\n"张,三","138","含""引号"""');
  assert.deepStrictEqual(
    parsed,
    [["姓名", "手机", "备注"], ["张,三", "138", '含"引号"']],
    "CSV 解析支持引号转义"
  );

  // 填充历史与撤销:受控场景——清空历史,空字段重新填充,断言记录与回滚
  await chrome.storage.local.set({ history: [] });
  document.getElementById("f-name").value = "";
  document.getElementById("f-weird").value = "";
  await doFill({ auto: true });
  await new Promise((r) => setTimeout(r, 20)); // 历史写入是异步小任务
  let { history = [] } = await chrome.storage.local.get("history");
  assert.ok(history.length === 1 && history[0].changes.length >= 2, "填充后记录了本次所有改动");

  document.getElementById("f-name").value = "张三(用户又改过)"; // 撤销时应被写回空
  globalThis.__FF_MSG__({ action: "undo" });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(val("f-name"), "", "撤销把字段写回填充前的值");
  assert.strictEqual(val("f-weird"), "", "映射填充的字段同样回滚");
  const { history: after } = await chrome.storage.local.get("history");
  assert.strictEqual(after.length, 0, "撤销后移除该条记录");

  // xlsx 解析:用 fflate 现场压一个最小 xlsx,跑真实 parseXLSX
  global.window = window; // parseXLSX 内部通过 window.fflate 取解压库
  window.fflate = require("fflate");
  const xlsxSrc = fs.readFileSync(__dirname + "/xlsx.js", "utf8");
  const parseXLSX = new Function(xlsxSrc + "\nreturn parseXLSX;")();
  const fflate = window.fflate;
  const sheet =
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>13800001111</v></c><c r="C2" t="inlineStr"><is><t>a@b.c</t></is></c></row>' +
    "</worksheet>";
  const shared =
    '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    "<si><t>姓名</t></si><si><t>手机</t></si><si><t>邮箱</t></si><si><t>李四</t></si></sst>";
  const xlsxBytes = fflate.zipSync({
    "xl/sharedStrings.xml": fflate.strToU8(shared),
    "xl/worksheets/sheet1.xml": fflate.strToU8(sheet),
  });
  const xlsxRows = await parseXLSX(xlsxBytes.buffer.slice(xlsxBytes.byteOffset, xlsxBytes.byteOffset + xlsxBytes.byteLength));
  assert.deepStrictEqual(
    xlsxRows,
    [["姓名", "手机", "邮箱"], ["李四", "13800001111", "a@b.c"]],
    "xlsx 解析:共享字符串/数字/内联字符串"
  );

  console.log("✅ 全部 25 项断言通过:字典识别、候选回退、自定义参数识别、下拉匹配、勾选框/单选组、React 受控组件、固定值映射、资料绑定映射、多套切换、已填写跳过、CSV 解析、填充历史与撤销、xlsx 解析均生效");
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
