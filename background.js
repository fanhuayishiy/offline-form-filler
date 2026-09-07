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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const action = info.menuItemId === "ff-capture" ? "capture" : "fill";
  chrome.tabs.sendMessage(tab.id, { action }).catch(() => {
    // 页面没有 content script(如 chrome:// 页),忽略
  });
});
