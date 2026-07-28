/* ============================================================
 * PortfoTax · V2.2 xlsx 直接导入测试（Node，无浏览器依赖）
 * 用法：node test/v22_xlsx_tests.js
 * 覆盖：
 *   A. vendor SheetJS 可加载（版本 / 全局导出）
 *   B. node 端加载 vendor SheetJS 解析 test-data/import_template.xlsx：
 *      工作表识别、两家示例企业数据结构、字段口径与数值类型、
 *      申报记录行数（云启 4 条 / 星链 3 条）、未申报 filed=null
 *   C. xlsx 容错分支：缺「三表关键科目」表 → 整文件拒绝；
 *      缺「申报记录」表 → 视为无申报记录（与 CSV 口径一致）；
 *      坏文件（非 xlsx 二进制）→ XLSX.read 抛错可被捕获
 *   D. Excel 模板生成回路：buildTemplateSheets → SheetJS 写出 →
 *      重新解析，数据结构与原模板一致（企业ID/数值/申报行数）
 *   E. xlsx 解析结果统一走 Importer 行级校验（行号口径与 CSV 一致）
 * ============================================================ */
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? " | " + String(extra).slice(0, 160) : "")); }
}

/* ---------- A. vendor SheetJS 加载 ---------- */
console.log("== A. vendor SheetJS 加载 ==");
const VENDOR = path.join(APP, "js", "vendor", "xlsx.full.min.js");
check("vendor 文件存在", fs.existsSync(VENDOR));
const XLSX = require(VENDOR);
check("SheetJS 版本为 0.20.x", /^0\.20\./.test(XLSX.version), XLSX.version);

global.window = {};
require(path.join(APP, "js", "importer.js"));
const Importer = window.Importer;
check("Importer 导出 xlsxToParts / buildTemplateSheets",
  typeof Importer.xlsxToParts === "function" && typeof Importer.buildTemplateSheets === "function");

const TEMPLATE = path.join(ROOT, "test-data", "import_template.xlsx");

/* ---------- B. 解析官方 xlsx 模板 ---------- */
console.log("== B. import_template.xlsx 解析与字段口径 ==");
const buf = fs.readFileSync(TEMPLATE);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
check("工作表齐全（填报说明/三表关键科目/申报记录）",
  wb.SheetNames.indexOf("填报说明") >= 0 &&
  wb.SheetNames.indexOf(Importer.SHEET_FINANCE) >= 0 &&
  wb.SheetNames.indexOf(Importer.SHEET_FILINGS) >= 0,
  wb.SheetNames.join(","));

const parts = Importer.xlsxToParts(wb, XLSX);
check("xlsxToParts 无错误且两个数据表均提取", parts.errors.length === 0 && parts.finText && parts.filText,
  JSON.stringify(parts.errors));
check("提取文本表头识别为 finance / filings",
  Importer.detectType(parts.finText) === "finance" && Importer.detectType(parts.filText) === "filings");

/* 统一走既有 Importer 校验与入库逻辑 */
const existing = {}; // 空组合：不与演示 ID 冲突
const fin = Importer.parseFinanceCSV(parts.finText, existing);
check("财务科目：解析出 2 家企业、0 错误",
  fin.companies.length === 2 && fin.errors.length === 0, JSON.stringify(fin.errors));
check("企业ID 口径正确（yunqi / xinglian）",
  fin.companies[0].id === "yunqi" && fin.companies[1].id === "xinglian");
const yq = fin.companies[0], xl = fin.companies[1];
check("数值类型为 number（云启 revenue=1200）",
  typeof yq.finance.revenue === "number" && yq.finance.revenue === 1200, typeof yq.finance.revenue);
check("云启全科目数值口径正确",
  yq.finance.netProfit === 180 && yq.finance.retainedBegin === 850 && yq.finance.retainedEnd === 1010 &&
  yq.finance.dividend === 20 && yq.finance.totalProfit === 240 && yq.finance.citTaxableIncome === 240 &&
  yq.finance.cashFromSales === 1260 && yq.finance.payrollTotal === 200 && yq.finance.socialBase === 200);
check("星链账税差异口径正确（revenue=5000 / vatDeclaredSales=4600）",
  xl.finance.revenue === 5000 && xl.finance.vatDeclaredSales === 4600 && xl.finance.invoicedAmount === 4620);
check("元信息口径正确（云启：工业软件/B轮/上海·浦东/2024-03）",
  yq.industry === "工业软件" && yq.round === "B轮" && yq.region === "上海·浦东" && yq.investDate === "2024-03");
check("导入企业带 imported 标记", fin.companies.every(c => c.imported === true));

const validIds = {}; fin.companies.forEach(c => { validIds[c.id] = 1; });
const fil = Importer.parseFilingsCSV(parts.filText, validIds);
check("申报记录：0 错误", fil.errors.length === 0, JSON.stringify(fil.errors));
check("申报记录行数：云启 4 条 / 星链 3 条",
  fil.byId.yunqi.length === 4 && fil.byId.xinglian.length === 3,
  "yunqi=" + fil.byId.yunqi.length + " xinglian=" + fil.byId.xinglian.length);
check("未申报留空 → filed=null（云启印花税，税额 1.2）",
  fil.byId.yunqi[2].filed === null && fil.byId.yunqi[2].tax === "印花税" && fil.byId.yunqi[2].taxAmount === 1.2);
check("已申报日期保留（云启增值税 2026-06-12，税额 78）",
  fil.byId.yunqi[0].filed === "2026-06-12" && fil.byId.yunqi[0].taxAmount === 78);
check("星链企税季报：未申报、税额 0、截止 2026-07-15",
  fil.byId.xinglian[2].filed === null && fil.byId.xinglian[2].taxAmount === 0 && fil.byId.xinglian[2].due === "2026-07-15");

/* ---------- C. 容错分支 ---------- */
console.log("== C. xlsx 容错分支 ==");
/* C-1 缺「申报记录」表 → 视为无申报记录，不报错 */
const wbNoFil = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbNoFil, XLSX.utils.aoa_to_sheet(Importer.buildTemplateSheets()[1].aoa), "三表关键科目");
const p1 = Importer.xlsxToParts(wbNoFil, XLSX);
check("缺「申报记录」表：finText 有效、filText=null、无错误",
  p1.finText != null && p1.filText === null && p1.errors.length === 0, JSON.stringify(p1.errors));
const fin1 = Importer.parseFinanceCSV(p1.finText, {});
check("缺「申报记录」表：企业正常导入且 filings 为空数组（与 CSV 口径一致）",
  fin1.companies.length === 2 && fin1.companies.every(c => c.filings.length === 0));

/* C-2 缺「三表关键科目」表 → 整文件拒绝 */
const wbNoFin = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbNoFin, XLSX.utils.aoa_to_sheet(Importer.buildTemplateSheets()[2].aoa), "申报记录");
const p2 = Importer.xlsxToParts(wbNoFin, XLSX);
check("缺「三表关键科目」表：finText=null 并报错（含工作表名提示）",
  p2.finText === null && p2.errors.length === 1 && /三表关键科目/.test(p2.errors[0]) && /申报记录/.test(p2.errors[0]),
  JSON.stringify(p2.errors));

/* C-3 坏文件（真实 xlsx 截断的损坏 ZIP）→ XLSX.read 抛错可被捕获（app.js 的 try/catch 口径） */
let threw = false;
try { XLSX.read(new Uint8Array(buf.slice(0, Math.floor(buf.length / 2))), { type: "array" }); }
catch (ex) { threw = true; }
check("坏文件（截断的 xlsx）：XLSX.read 抛出异常（上层可捕获并友好提示）", threw);
/* C-3b 伪装 xlsx（随机字节）：SheetJS 回退按文本解析 → 无目标工作表 → 走缺表容错 */
const wbFake = XLSX.read(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), { type: "array" });
const pFake = Importer.xlsxToParts(wbFake, XLSX);
check("伪装 xlsx（随机字节）：不崩溃，落入「缺三表关键科目表」容错分支",
  pFake.finText === null && pFake.errors.length === 1 && /三表关键科目/.test(pFake.errors[0]),
  JSON.stringify(pFake.errors));

/* C-4 空工作簿（无任何工作表）→ 整文件拒绝 */
const p4 = Importer.xlsxToParts(XLSX.utils.book_new(), XLSX);
check("空工作簿：finText=null 且报错提示「无」工作表",
  p4.finText === null && p4.errors.length === 1 && /无/.test(p4.errors[0]), JSON.stringify(p4.errors));

/* ---------- D. Excel 模板生成回路 ---------- */
console.log("== D. 模板生成 → 重新解析回路 ==");
const sheets = Importer.buildTemplateSheets();
check("模板含 3 个工作表（填报说明/三表关键科目/申报记录）",
  sheets.length === 3 && sheets[0].name === "填报说明" &&
  sheets[1].name === Importer.SHEET_FINANCE && sheets[2].name === Importer.SHEET_FILINGS);
const wbGen = XLSX.utils.book_new();
sheets.forEach(s => { XLSX.utils.book_append_sheet(wbGen, XLSX.utils.aoa_to_sheet(s.aoa), s.name); });
const outBuf = XLSX.write(wbGen, { type: "buffer", bookType: "xlsx" });
check("SheetJS 可写出 xlsx 二进制", outBuf && outBuf.length > 1000, "len=" + (outBuf && outBuf.length));
const wbBack = XLSX.read(outBuf, { type: "buffer", cellDates: true });
const pb = Importer.xlsxToParts(wbBack, XLSX);
const finB = Importer.parseFinanceCSV(pb.finText, {});
const filB = Importer.parseFilingsCSV(pb.filText, { yunqi: 1, xinglian: 1 });
check("回路：生成模板重新解析 → 2 家企业 0 错误",
  finB.companies.length === 2 && finB.errors.length === 0, JSON.stringify(finB.errors));
check("回路：企业ID 与数值类型保持（星链 socialBase=800, number）",
  finB.companies[1].id === "xinglian" && typeof finB.companies[1].finance.socialBase === "number" &&
  finB.companies[1].finance.socialBase === 800);
check("回路：申报记录 云启 4 条 / 星链 3 条、0 错误",
  filB.byId.yunqi.length === 4 && filB.byId.xinglian.length === 3 && filB.errors.length === 0,
  JSON.stringify(filB.errors));
check("回路：日期以文本口径保留（2026-06-25 未申报 → filed=null）",
  filB.byId.yunqi[2].due === "2026-06-25" && filB.byId.yunqi[2].filed === null);

/* ---------- E. 行级校验口径与 CSV 一致 ---------- */
console.log("== E. 行级校验口径（xlsx 来源）==");
const badAoa = [Importer.FINANCE_HEADERS.slice(),
  ["t1", "测试企业", "行业", "轮次", "地区", "2024-01", "abc", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]];
const wbBad = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbBad, XLSX.utils.aoa_to_sheet(badAoa), "三表关键科目");
const pBad = Importer.xlsxToParts(wbBad, XLSX);
const finBad = Importer.parseFinanceCSV(pBad.finText, {});
check("xlsx 来源非数字科目 → 行级报错（行号与字段名口径同 CSV）",
  finBad.companies.length === 0 &&
  finBad.errors.some(m => /第 2 行.*账面营业收入.*不是有效数字/.test(m)),
  JSON.stringify(finBad.errors));

const dupBad = Importer.parseFinanceCSV(parts.finText, { yunqi: 1 });
check("xlsx 来源企业ID 与组合重复 → 行级报错且该行不导入",
  dupBad.companies.length === 1 && dupBad.errors.some(m => /第 2 行.*重复/.test(m)),
  JSON.stringify(dupBad.errors));

/* ---------- 汇总 ---------- */
console.log("=".repeat(60));
console.log("结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
