/* ============================================================
 * PortfoTax · CSV 导入模块 V2（原生 JS，零外部依赖）
 * - parseCSV：兼容 UTF-8 BOM、引号包裹字段（内嵌逗号 / 换行 /
 *   "" 双引号转义）、CRLF / LF 行尾。
 * - 两类 CSV（按表头自动识别）：
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

  global.Importer = {
    FINANCE_HEADERS: FINANCE_HEADERS,
    FILING_HEADERS: FILING_HEADERS,
    parseCSV: parseCSV,
    detectType: detectType,
    isValidDate: isValidDate,
    parseFinanceCSV: parseFinanceCSV,
    parseFilingsCSV: parseFilingsCSV,
    templateFinanceCSV: function () { return FINANCE_TEMPLATE; },
    templateFilingCSV: function () { return FILING_TEMPLATE; }
  };
})(window);
