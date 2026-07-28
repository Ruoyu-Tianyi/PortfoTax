/* ============================================================
 * PortfoTax · CSV / xlsx 导入模块 V2.2（CSV 解析原生零依赖；xlsx 经本地 vendored SheetJS）
 * - parseCSV：兼容 UTF-8 BOM、引号包裹字段（内嵌逗号 / 换行 /
 *   "" 双引号转义）、CRLF / LF 行尾。
 * - 两类数据（CSV 按表头自动识别；xlsx 按工作表名识别）：
 *   ① 三表关键科目（每企业一行，18 列，口径同 test-data/import_template.csv）
 *   ② 申报记录（每企业每税种一行，6 列，口径同 import_template.xlsx「申报记录」表）
 * - 行级校验：逐行报错，合法行正常导入，表头错误整文件拒绝。
 * ============================================================ */
(function (global) {
  "use strict";

  var FINANCE_HEADERS = [
    "企业ID", "企业名称", "行业", "轮次", "地区", "投资时间(YYYY-MM)",
    "账面营业收入(万元)", "增值税申报销售额(万元)", "开票金额(万元)", "净利润(万元)",
    "未分配利润_期初(万元)", "未分配利润_期末(万元)", "本期分红(万元)", "利润总额(万元)",
    "企税申报应纳税所得额(万元)", "销售商品收到现金(万元)", "工资总额(万元)", "社保个税申报基数(万元)"
  ];
  var FILING_HEADERS = [
    "企业ID", "税种", "所属期间", "申报截止日(YYYY-MM-DD)", "申报完成日(YYYY-MM-DD,未申报留空)", "税额(万元)"
  ];
  /** 财务 CSV 第 7–18 列 → finance 字段 */
  var FIN_KEYS = [
    "revenue", "vatDeclaredSales", "invoicedAmount", "netProfit",
    "retainedBegin", "retainedEnd", "dividend", "totalProfit",
    "citTaxableIncome", "cashFromSales", "payrollTotal", "socialBase"
  ];

  /* ---------- CSV 解析（状态机，兼容 BOM / 引号 / CRLF） ---------- */
  function parseCSV(text) {
    text = String(text == null ? "" : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去 UTF-8 BOM
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i++; } // "" → "
          else inQ = false;
        } else field += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (ch === "\r") { /* 忽略，兼容 CRLF */ }
        else field += ch;
      }
    }
    if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

  function sameHeaders(actual, expected) {
    if (!actual || actual.length !== expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (trim(actual[i]) !== expected[i]) return false;
    }
    return true;
  }

  /** 按表头识别 CSV 类型："finance" / "filings" / null */
  function detectType(text) {
    var rows = parseCSV(text);
    if (!rows.length) return null;
    if (sameHeaders(rows[0], FINANCE_HEADERS)) return "finance";
    if (sameHeaders(rows[0], FILING_HEADERS)) return "filings";
    return null;
  }

  function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T00:00:00");
    return !isNaN(d.getTime()) &&
      d.getFullYear() === Number(s.slice(0, 4)) &&
      d.getMonth() + 1 === Number(s.slice(5, 7)) &&
      d.getDate() === Number(s.slice(8, 10));
  }

  /** 过滤完全空白行 */
  function dataRows(rows) {
    return rows.filter(function (r) {
      return r.some(function (cell) { return trim(cell) !== ""; });
    });
  }

  /* ---------- 财务科目 CSV → 企业对象数组 ----------
   * existingIds：已存在的企业ID表（演示企业 + 已导入），用于重复校验。
   * 返回 { companies, errors }，errors 为行级错误信息数组。 */
  function parseFinanceCSV(text, existingIds) {
    var errors = [], companies = [];
    var rows = dataRows(parseCSV(text));
    if (!rows.length) {
      errors.push("财务科目 CSV 为空，没有可导入的数据");
      return { companies: companies, errors: errors };
    }
    if (!sameHeaders(rows[0], FINANCE_HEADERS)) {
      errors.push("财务科目 CSV 表头与「三表关键科目」模板不一致（第 1 行），请下载模板核对列名与列顺序");
      return { companies: companies, errors: errors };
    }
    var seen = {};
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i], ln = i + 1, rowErr = [];
      var id = trim(row[0]), name = trim(row[1]);
      if (!id) rowErr.push("企业ID 为空");
      else if (seen[id]) rowErr.push("企业ID「" + id + "」在文件内重复");
      else if (existingIds && existingIds[id]) rowErr.push("企业ID「" + id + "」与组合中已有企业重复，请更换 ID");
      if (!name) rowErr.push("企业名称为空");

      var fin = {};
      for (var j = 0; j < FIN_KEYS.length; j++) {
        var colIdx = 6 + j;
        var raw = trim(row[colIdx]);
        var n = Number(raw);
        if (raw === "" || !isFinite(n)) {
          rowErr.push("「" + FINANCE_HEADERS[colIdx] + "」不是有效数字（值：「" + raw + "」）");
        } else {
          fin[FIN_KEYS[j]] = n;
        }
      }

      if (rowErr.length) {
        rowErr.forEach(function (m) { errors.push("财务科目 第 " + ln + " 行：" + m); });
      } else {
        seen[id] = 1;
        companies.push({
          id: id,
          name: name,
          industry: trim(row[2]) || "未填写",
          round: trim(row[3]) || "未填写",
          region: trim(row[4]) || "未填写",
          investDate: trim(row[5]) || "—",
          finance: fin,
          filings: [],
          imported: true
        });
      }
    }
    return { companies: companies, errors: errors };
  }

  /* ---------- 申报记录 CSV → { 企业ID: [filings] } ----------
   * validIds：本次导入财务科目表中的企业ID集合（外键校验）。
   * 返回 { byId, errors }。 */
  function parseFilingsCSV(text, validIds) {
    var errors = [], byId = {};
    var rows = dataRows(parseCSV(text));
    if (!rows.length) {
      errors.push("申报记录 CSV 为空，没有可导入的数据");
      return { byId: byId, errors: errors };
    }
    if (!sameHeaders(rows[0], FILING_HEADERS)) {
      errors.push("申报记录 CSV 表头与「申报记录」模板不一致（第 1 行），请下载模板核对列名与列顺序");
      return { byId: byId, errors: errors };
    }
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i], ln = i + 1, rowErr = [];
      var id = trim(row[0]), tax = trim(row[1]), period = trim(row[2]);
      var due = trim(row[3]), filed = trim(row[4]), taxRaw = trim(row[5]);

      if (!id) rowErr.push("企业ID 为空");
      else if (!validIds || !validIds[id]) rowErr.push("企业ID「" + id + "」不在本次导入的财务科目表中");
      if (!tax) rowErr.push("税种为空");
      if (!period) rowErr.push("所属期间为空");
      if (!isValidDate(due)) rowErr.push("申报截止日「" + due + "」不是有效的 YYYY-MM-DD 日期");
      if (filed && !isValidDate(filed)) rowErr.push("申报完成日「" + filed + "」不是有效的 YYYY-MM-DD 日期（未申报请留空）");
      var taxAmount = 0;
      if (taxRaw === "" || !isFinite(Number(taxRaw))) rowErr.push("税额「" + taxRaw + "」不是有效数字");
      else taxAmount = Number(taxRaw);

      if (rowErr.length) {
        rowErr.forEach(function (m) { errors.push("申报记录 第 " + ln + " 行：" + m); });
      } else {
        (byId[id] = byId[id] || []).push({
          tax: tax, period: period, due: due,
          filed: filed || null, taxAmount: taxAmount
        });
      }
    }
    return { byId: byId, errors: errors };
  }

  /* ---------- CSV 模板（与 test-data/import_template.* 同口径，内嵌生成下载） ---------- */
  /** 单元格含逗号/引号/换行时按 RFC4180 加引号 */
  function csvCell(s) {
    s = String(s);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRow(cells) { return cells.map(csvCell).join(","); }

  var FINANCE_TEMPLATE = csvRow(FINANCE_HEADERS) + "\n" +
    "yunqi,云启智造,工业软件,B轮,上海·浦东,2024-03,1200,1200,1200,180,850,1010,20,240,240,1260,200,200\n" +
    "xinglian,星链物流,智慧物流,C轮,浙江·杭州,2023-06,5000,4600,4620,250,2000,2230,20,330,330,5100,800,800\n";
  var FILING_TEMPLATE = csvRow(FILING_HEADERS) + "\n" +
    "yunqi,增值税,2026-05,2026-06-15,2026-06-12,78\n" +
    "yunqi,个人所得税（代扣代缴）,2026-05,2026-06-15,2026-06-13,26\n" +
    "yunqi,印花税,2026-Q2,2026-06-25,,1.2\n" +
    "yunqi,企业所得税（季报）,2026-Q2,2026-07-15,,0\n" +
    "xinglian,增值税,2026-05,2026-06-15,2026-06-14,210\n" +
    "xinglian,个人所得税（代扣代缴）,2026-05,2026-06-15,2026-06-15,58\n" +
    "xinglian,企业所得税（季报）,2026-Q2,2026-07-15,,0\n";

  /* ============================================================
   * V2.2：xlsx 直接导入（SheetJS 本地化 vendor）
   * 工作簿的二进制解析（XLSX.read）在 app.js 完成并做容错；
   * 以下函数只依赖已解析的 workbook 对象，输出与 CSV 同构的文本，
   * 统一走既有 parseFinanceCSV / parseFilingsCSV 校验与入库逻辑，
   * 行级错误提示口径与 CSV 完全一致。
   * ============================================================ */
  var SHEET_FINANCE = "三表关键科目";
  var SHEET_FILINGS = "申报记录";
  var SHEET_GUIDE = "填报说明";

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  /** 单元格值归一化为字符串：Date → YYYY-MM-DD；其余 → 常规字符串 */
  function cellText(v) {
    if (v == null) return "";
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return "";
      return v.getFullYear() + "-" + pad2(v.getMonth() + 1) + "-" + pad2(v.getDate());
    }
    return String(v);
  }

  /** 二维数组 → CSV 文本（复用 csvCell 引号口径） */
  function rowsToCSV(rows) {
    return rows.map(function (r) { return csvRow(r.map(cellText)); }).join("\n");
  }

  /** 按表名（容忍首尾空白）查找工作表名，找不到返回 null */
  function findSheetName(workbook, want) {
    var names = (workbook && workbook.SheetNames) || [];
    for (var i = 0; i < names.length; i++) {
      if (trim(names[i]) === want) return names[i];
    }
    return null;
  }

  /**
   * 从已解析的 workbook 提取「三表关键科目」与「申报记录」工作表。
   * XLSX 参数为 SheetJS 全局对象（用于 sheet_to_json），由调用方注入。
   * 返回 { finText, filText, errors }：
   *  - 缺「三表关键科目」→ finText = null 并报错（整文件拒绝，与 CSV 表头错误同级）
   *  - 缺「申报记录」→ filText = null，视为无申报记录（与 CSV 口径一致，不报错）
   */
  function xlsxToParts(workbook, XLSX) {
    var errors = [], finText = null, filText = null;
    var names = (workbook && workbook.SheetNames) || [];
    function sheetRows(name) {
      return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
    }
    var finName = findSheetName(workbook, SHEET_FINANCE);
    if (!finName) {
      errors.push("xlsx 中未找到「" + SHEET_FINANCE + "」工作表（当前工作表：" +
        (names.join("、") || "无") + "），请下载 Excel 模板核对工作表名称");
    } else {
      finText = rowsToCSV(sheetRows(finName));
    }
    var filName = findSheetName(workbook, SHEET_FILINGS);
    if (filName) filText = rowsToCSV(sheetRows(filName));
    return { finText: finText, filText: filText, errors: errors };
  }

  /** V2.2 Excel 模板内容（三工作表 AOA 数据，供 app.js 用 SheetJS 生成 xlsx） */
  function buildTemplateSheets() {
    return [
      { name: SHEET_GUIDE, aoa: [
        ["PortfoTax · 被投企业月度财税数据填报模板（V2.2 Excel 直接导入）"],
        [],
        ["1. 本模板含两个数据表：「三表关键科目」（每企业每月一行）、「申报记录」（每企业每税种一行）。"],
        ["2. 金额单位：万元；日期格式：YYYY-MM-DD；所属期间格式：YYYY-MM / YYYY-Qn / YYYY-FY。"],
        ["3. 「申报完成日」留空表示尚未申报，系统将按基准日自动判定 临期(≤3天)/逾期 并估算滞纳金。"],
        ["4. 字段口径与 app/data/demo.js 的 finance / filings 结构一一对应，导入后可直接喂给规则引擎 R1–R6。"],
        ["5. 示例数据为虚构（yunqi / xinglian 与演示企业 ID 相同），导入前请替换为实际 ID，否则触发「重复 ID」校验。"]
      ] },
      { name: SHEET_FINANCE, aoa: [
        FINANCE_HEADERS.slice(),
        ["yunqi", "云启智造", "工业软件", "B轮", "上海·浦东", "2024-03", 1200, 1200, 1200, 180, 850, 1010, 20, 240, 240, 1260, 200, 200],
        ["xinglian", "星链物流", "智慧物流", "C轮", "浙江·杭州", "2023-06", 5000, 4600, 4620, 250, 2000, 2230, 20, 330, 330, 5100, 800, 800]
      ] },
      { name: SHEET_FILINGS, aoa: [
        FILING_HEADERS.slice(),
        ["yunqi", "增值税", "2026-05", "2026-06-15", "2026-06-12", 78],
        ["yunqi", "个人所得税（代扣代缴）", "2026-05", "2026-06-15", "2026-06-13", 26],
        ["yunqi", "印花税", "2026-Q2", "2026-06-25", "", 1.2],
        ["yunqi", "企业所得税（季报）", "2026-Q2", "2026-07-15", "", 0],
        ["xinglian", "增值税", "2026-05", "2026-06-15", "2026-06-14", 210],
        ["xinglian", "个人所得税（代扣代缴）", "2026-05", "2026-06-15", "2026-06-15", 58],
        ["xinglian", "企业所得税（季报）", "2026-Q2", "2026-07-15", "", 0]
      ] }
    ];
  }

  global.Importer = {
    FINANCE_HEADERS: FINANCE_HEADERS,
    FILING_HEADERS: FILING_HEADERS,
    SHEET_FINANCE: SHEET_FINANCE,
    SHEET_FILINGS: SHEET_FILINGS,
    SHEET_GUIDE: SHEET_GUIDE,
    parseCSV: parseCSV,
    detectType: detectType,
    isValidDate: isValidDate,
    parseFinanceCSV: parseFinanceCSV,
    parseFilingsCSV: parseFilingsCSV,
    xlsxToParts: xlsxToParts,
    buildTemplateSheets: buildTemplateSheets,
    templateFinanceCSV: function () { return FINANCE_TEMPLATE; },
    templateFilingCSV: function () { return FILING_TEMPLATE; }
  };
})(window);
