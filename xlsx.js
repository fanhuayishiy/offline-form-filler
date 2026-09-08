// 离线表单秒填 - xlsx 解析(纯本机,基于 vendor/fflate.js 解压)
// 最小 .xlsx 读取器:只处理 sharedStrings + sheet1 的内联单元格,足够覆盖"导出表格批量导入"场景。
// 依赖:全局 fflate(vendor/fflate.js 提供 window.fflate)
// 输出:二维字符串数组 rows[行][列](与 popup.js 的 parseCSV 输出同构)

/**
 * @param {ArrayBuffer} buffer - xlsx 文件内容
 * @returns {string[][]}
 */
async function parseXLSX(buffer) {
  const lib =
    (typeof window !== "undefined" && window.fflate) ||
    (typeof globalThis !== "undefined" && globalThis.fflate);
  if (!lib) throw new Error("缺少 fflate 解压库");
  const entries = lib.unzipSync(new Uint8Array(buffer));
  const files = {};
  for (const [name, data] of Object.entries(entries)) files[name] = data;

  // 1) 共享字符串表(可选)
  const shared = [];
  if (files["xl/sharedStrings.xml"]) {
    const xml = new TextDecoder("utf-8").decode(files["xl/sharedStrings.xml"]);
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) {
      // 一个 si 可含多个 <r><t>,全部拼接;忽略 rPh(拼音)块
      const seg = m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "");
      const texts = seg.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      shared.push(
        texts.map((t) => t.replace(/<t[^>]*>|<\/t>/g, "")).join("")
      );
    }
  }

  // 2) 取第一个 sheet(xl/worksheets/sheet1.xml)
  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!sheetName) throw new Error("xlsx 中没有工作表");
  const xml = new TextDecoder("utf-8").decode(files[sheetName]);

  // 3) 逐行解析 <row>,逐格 <c r="A1" t="s"><v>..</v></c>
  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c([^>]*)\/?>(?:<v>([\s\S]*?)<\/v>)?(?:<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t><\/is>)?(?:<\/c>)?/g;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] || "";
      const refM = attrs.match(/r="([A-Z]+)\d+"/);
      if (!refM) continue;
      const colLetters = refM[1];
      const col = colLetters.split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const type = (attrs.match(/t="(\w+)"/) || [])[1] || "n";
      let value = "";
      if (cm[3] !== undefined) value = cm[3]; // 内联字符串
      else if (cm[2] !== undefined) {
        value = type === "s" ? shared[Number(cm[2])] || "" : cm[2];
      }
      cells[col] = value == null ? "" : String(value).trim();
    }
    // 压实稀疏数组,保持与 CSV 行同构
    const dense = [];
    for (let i = 0; i < cells.length; i++) dense.push(cells[i] == null ? "" : cells[i]);
    rows.push(dense);
  }
  if (!rows.length) throw new Error("xlsx 中没有数据行");
  return rows;
}
