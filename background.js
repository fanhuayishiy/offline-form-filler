// 离线表单秒填 - service worker
// 负责注册右键菜单、转发命令、点击图标打开管理窗口。无任何网络调用。

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "ff-fill",
      title: "⚡ 一键填充表单",
      contexts: ["editable", "page"],
    });
    chrome.contextMenus.create({
      id: "ff-capture",
      title: "🎯 设置此字段(记住要填的值)",
      contexts: ["editable"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id == null) return;
  const action = info.menuItemId === "ff-capture" ? "capture" : "fill";
  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch (e) {
    // 页面在扩展安装/刷新前打开,没有脚本:右键菜单点击已授予 activeTab,现场补注入。
    // 同 popup:先只注入顶层 frame,避免 allFrames 在跨域 iframe 页整体失败。
    if (!/^https?:/i.test(tab.url || "")) return; // 内部页面无法注入
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch (err) {
      await chrome.scripting
        .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] })
        .catch(() => {});
    }
    await chrome.tabs.sendMessage(tab.id, { action }).catch(() => {});
  }
});
