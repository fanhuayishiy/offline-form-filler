# 离线表单秒填(Offline Form Filler)

- **English**: A pure-offline browser extension (Manifest V3) that auto-fills web forms from locally stored profiles. Zero network requests, zero network permissions. Works on Chromium-based browsers (Chrome / Edge / Brave / Opera / Vivaldi / 360 / QQ).

纯本地运行的网页表单自动填充浏览器扩展。**零网络请求、零网络权限**,所有资料只存在浏览器本机,断网可用。

适合需要反复填写固定信息的场景:电商/ERP 后台、报名系统、报销单、招聘网站等。

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Release](https://img.shields.io/github/v/release/fanhuayishiy/offline-form-filler?color=blue&label=release)
![Chrome](https://img.shields.io/badge/Chromium-MV3-4a7dff.svg)
![Test](https://img.shields.io/badge/tests-16%20passed-2e7d32.svg)

## 截图

<!-- 截图待补充:建议放 1 张"我的资料"面板 + 1 张页面自动填充前后对比,或一段录制 GIF。
     格式:![截图](assets/screenshot-profile.png) -->

## 隐私承诺

- 代码中不包含任何 `fetch` / `XMLHttpRequest` / 统计 / 遥测;
- `manifest.json` 不申请任何 `host_permissions`,数据仅存 `chrome.storage.local`;
- 全部逻辑开源可审计,核心填充引擎约 400 行,欢迎审查;
- 关闭扩展即等于清空内存,卸载即删除本机数据。

## 特性

- 🔍 **自动识别字段**:扫描 `input / textarea / select`,按 `name`/`id`/`placeholder`/`aria-label`/`label` 等线索与内置别名字典匹配(**中/英/日**),支持 React/Vue 受控组件(原生 setter + 事件派发,不会出现"填了又消失");
- ✅ **勾选框/单选组**:参数值写布尔语义("是/否"、true/false)即可自动勾选;单选组按选项文本匹配;
- 🗂 **多套资料**:如"本人 / 家长 / 工作",一键切换,填充实时使用当前套,切套即重扫;
- 📊 **CSV / Excel 导入**:一行一套资料批量建套,支持 .xlsx 直接解析(纯本机解压,不联网);
- ↩ **填充历史与撤销**:记录最近 50 次填充改动,一键把页面字段回滚到填充前;
- ➕ **自定义参数**:参数名即识别词——添加"家长姓名"后,页面出现该字样即可命中;
- 🎯 **手动映射兜底**:识别不了的字段右键「设置此字段」,可**绑定资料参数**(跟随资料/资料套自动变化)或存固定值;
- ⚡ **自动填充开关 + 网站白名单**:开启后页面加载、SPA 动态表单自动扫描;可限定只在白名单网站自动填充(选项页配置);**已有值的字段一律跳过**,绝不覆盖;
- ⚙️ **选项页**:白名单管理、数据备份;
- 💾 **数据导出/导入**:一个 JSON 文件带走全部资料套、映射与设置,换浏览器/电脑无缝迁移;
- 🦊 **Firefox 支持**:内置构建脚本 `npm run build:firefox`;
- 🧪 **可测试**:填充引擎带 25 项断言(jsdom)。

## 安装

适用于所有 Chromium 内核浏览器(Chrome、Edge、Brave、Opera、Vivaldi、360、QQ 等),系统不限(Windows / macOS / Linux,随浏览器):

1. 下载 **[最新 Release](https://github.com/fanhuayishiy/offline-form-filler/releases/latest)** 中的 `Source code (zip)` 并解压(或 `git clone` 本仓库);
2. 打开扩展页(`chrome://extensions`、`edge://extensions`…),开启「开发者模式」;
3. 「加载已解压的扩展程序」→ 选择解压得到的文件夹(如 `offline-form-filler-0.1.0`,它就是扩展本体);
4. 更新代码后,在扩展页点该扩展的「刷新(↻)」并刷新已打开的网页。

> Firefox:运行 `npm run build:firefox`,加载生成的 `firefox/` 目录(未签名扩展只能临时加载,重启后需重装;永久安装需在 addons.mozilla.org 签名)。移动端浏览器不支持加载解压扩展。

## 使用

1. 点扩展图标 →「我的资料」录入姓名、手机、地址等 → 保存;
2. 打开表单页面:自动填充开关开着即自动填;或点「⚡ 填充当前页面」/ 输入框右键「⚡ 一键填充表单」;
3. 识别不了的字段:右键 →「🎯 设置此字段」→ 下拉绑定资料参数或填固定值;
4. 换环境:「⬇ 导出数据」→ 新浏览器里「⬆ 导入数据」。

## 常见问题(FAQ)

**Q:数据存在哪里?怎么确认它不联网?**
A:`chrome.storage.local`,即浏览器本机文件。可在扩展页"检查视图 → Service Worker"里看 DevTools Network 面板,本扩展无任何网络请求。

**Q:字段"填了又消失"是怎么回事?**
A:多半是自定义控件(日期选择器、级联下拉、富文本)。对其背后的真实输入框右键「设置此字段」映射一次即可;勾选框/单选按钮目前不自动处理,建议手动勾选。

**Q:自动填充会覆盖我已填的内容吗?**
A:不会。已有值的字段一律跳过,你正在输入的字段也不会被碰;固定值映射仅在该值与原值不一致时纠正。

**Q:能把资料发给别人吗?**
A:导出 JSON 是明文,包含你的姓名/电话/身份证等,请通过可信渠道传输。

**Q:点「填充当前页面」提示无法注入?**
A:分两种:`chrome://` 设置页、新标签页、应用商店等浏览器内部页面受安全规则限制,永远无法注入,属正常现象;普通网页在扩展安装/刷新(↻)之前就打开的话,扩展会自动补注入(利用点击授予的 activeTab 权限),个别情况仍失败时刷新一次页面即可。

## 已知限制

- `chrome://`、扩展商店等浏览器内部页面无法注入脚本;
- 勾选框/单选按钮不自动处理(规则歧义大);
- 自定义日期/级联控件需手动映射;
- 自动填充开关是全局的,所有网站都会扫;只用在固定几个系统的话,建议用时再开(「按网站白名单」在路线图中)。

## 项目结构

```
manifest.json       扩展清单(MV3,无网络权限)
content.js          注入页面的识别+填充引擎(核心)
background.js       service worker:右键菜单注册与命令转发
popup.html/js       管理界面:资料套、参数、映射、开关、导入导出、历史撤销
options.html/js     选项页:自动填充白名单、数据备份
xlsx.js             .xlsx 解析器(依赖 vendor/fflate.js,纯本机)
build-firefox.mjs   Firefox 版构建脚本(生成 firefox/ 目录)
test.js             jsdom 断言测试(与扩展共用同一份 content.js)
```

## 开发

环境:Node.js 18+。扩展运行时零网络依赖(`vendor/fflate.js` 已随仓库分发,仅用于 xlsx 解压)。

```bash
npm install           # 安装测试依赖(jsdom、fflate)
npm test              # 25 项断言
npm run build:firefox # 构建 Firefox 版到 firefox/
```

- 改识别词:编辑 `content.js` 顶部 `DICT`(中英文别名);
- 改界面:`popup.html` / `popup.js`;
- 其余入口见「项目结构」。加载方式见「安装」,改完刷新扩展即可。

## 贡献

欢迎 Issue 和 PR:

1. Fork 本仓库 → 新建分支 → 改代码 → 提 PR;
2. 提交前请保证 `npm test` 通过;
3. 有价值的贡献方向:更多语言/行业的别名字典、React/Vue 之外框架的兼容性、Firefox 支持、按网站白名单、Excel/CSV 批量导入、设置界面(选项页)。

代码风格:与现有代码保持一致(中文注释、简单函数、不引入构建工具)。

## 路线图(Roadmap)

- [x] 按网站启用开关(白名单)· v0.2.0
- [x] Excel / CSV 批量导入资料 · v0.3.0(.xlsx 直接解析)
- [x] 选项页(Options Page)管理设置 · v0.2.0
- [x] Firefox 兼容适配(构建脚本)· v0.2.0
- [x] 更多字段类型支持(勾选框、单选组)· v0.2.0
- [x] 中英日多语言字典 · v0.2.0
- [x] 填充历史与撤销 · v0.3.0

## 免责声明

本工具按"现状"提供,自动填充结果请在提交前自行核对;请勿用于任何违反目标网站条款或法律法规的用途。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE)
