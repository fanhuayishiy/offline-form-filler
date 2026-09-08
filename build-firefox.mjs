// 构建 Firefox 版扩展:复制共享文件并生成 Firefox 专用 manifest
// 用法:npm run build:firefox → 产物在 firefox/ 目录
// Firefox 与 Chrome 的差异:
//   1. MV3 后台须用事件页(background.scripts),不支持 service_worker;
//   2. 永久安装需要 browser_specific_settings.gecko.id(未签名扩展仅可临时加载)。
// 其余代码(chrome.* 命名空间在 Firefox 中可用)无需改动。
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, cpSync } from "node:fs";

mkdirSync("firefox", { recursive: true });
for (const f of [
  "content.js",
  "background.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "xlsx.js",
]) {
  copyFileSync(f, "firefox/" + f);
}
cpSync("vendor", "firefox/vendor", { recursive: true });

const m = JSON.parse(readFileSync("manifest.json", "utf8"));
m.background = { scripts: ["background.js"] };
m.browser_specific_settings = {
  gecko: { id: "offline-form-filler@fanhuayishiy", strict_min_version: "113.0" },
};
writeFileSync("firefox/manifest.json", JSON.stringify(m, null, 2));
console.log("✅ firefox/ 构建完成(代码 7 个文件 + vendor/)");
