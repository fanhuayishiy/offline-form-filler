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

// ---- chrome.* 垫片 ----
global.chrome = {
  storage: {
    local: {
      get: () => Promise.resolve({ profiles, activeProfileId, mappings }),
      set: () => Promise.resolve(),
    },
    onChanged: { addListener: () => {} },
  },
  runtime: { onMessage: { addListener: () => {} } },
};

// ---- 加载真实的 content.js ----
// content.js 现在整体包裹在 IIFE 里(防重复注入的 const 冲突),
// 通过钩子把 doFill 暴露出来供测试调用。
globalThis.__FF_TEST_HOOK__ = (api) => (globalThis.doFill = api.doFill);
eval(fs.readFileSync(__dirname + "/content.js", "utf8"));

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

  console.log("✅ 全部 16 项断言通过:字典识别、候选回退、自定义参数识别、下拉匹配、React 受控组件、固定值映射、资料绑定映射、多套切换、已填写跳过均生效");
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
