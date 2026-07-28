/* ============================================================
 * PortfoTax · 路由与渲染 V2.2（原生 JS，零构建，兼容 file://）
 * 路由：#/dashboard  #/company/:id  #/calendar  #/report/:id  #/settings
 * V2：CSV 导入（localStorage 持久化）/ 基准日动态化 / 规则参数化
 * V2.2：xlsx 直接导入（本地 vendored SheetJS）+ Excel 模板下载，CSV 双文件方式保留
 * ============================================================ */
(function () {
  "use strict";

  var META = DEMO.meta;
  var DEMO_BASE = META.baseDate; // 演示模式固定基准日 2026-06-20

  /* ============================================================
   * V2 状态：设置 / 规则配置 / 导入企业 / 基准日
   * ============================================================ */
  function p2(n) { return n < 10 ? "0" + n : "" + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }
  function getSettings() {
    var s = Store.get("settings", null);
    return { useRealDateForDemo: !!(s && s.useRealDateForDemo) };
  }
  /** 自定义规则配置；null = 默认配置 */
  function getConfig() { return Store.get("config", null); }
  function getImported() { return Store.get("imported", []) || []; }
  function allCompanies() { return DEMO.companies.concat(getImported()); }
  /** 每家企业的评估基准日：导入企业恒为真实当天；演示企业默认 2026-06-20，可被设置开关切换为真实当天 */
  function baseFor(c) {
    if (c.imported) return todayStr();
    return getSettings().useRealDateForDemo ? todayStr() : DEMO_BASE;
  }
  function baseLabel(c) {
    if (c.imported) return todayStr() + "（导入·实时）";
    return getSettings().useRealDateForDemo ? todayStr() + "（演示·实时日期）" : DEMO_BASE + "（演示）";
  }

  /* ---------- 评估（每次路由重算，配置/日期/导入即时生效） ---------- */
  var EVALS = [];
  function computeEvals() {
    var cfg = getConfig();
    EVALS = allCompanies().map(function (c) { return Rules.evaluateCompany(c, baseFor(c), cfg); });
  }
  function evalOf(id) {
    for (var i = 0; i < EVALS.length; i++) if (EVALS[i].company.id === id) return EVALS[i];
    return null;
  }

  /* ---------- 页面级暂存（导入面板 / 设置页消息） ---------- */
  var importOpen = false;
  var lastImportMsg = "";
  var settingsMsg = "";

  /* ---------- 格式化 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function fmtNum(v, d) {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toLocaleString("zh-CN", { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 2 : d });
  }
  function fmtWan(v) { return fmtNum(v) + " 万"; }
  function fmtPct(rate) { return (rate * 100).toFixed(1) + "%"; }
  function fmtYuanFromWan(wan) { return fmtNum(Math.round(wan * 10000)) + " 元"; }
  function levelClass(lv) { return lv === "绿" ? "green" : (lv === "黄" ? "amber" : "red"); }
  function levelColor(lv) { return lv === "绿" ? "#1f4d3f" : (lv === "黄" ? "#c98a2d" : "#b4443c"); }
  function statusBadge(st) {
    var cls = st === "已申报" ? "green" : st === "临期" ? "amber" : st === "逾期" ? "red" : "gray";
    return '<span class="badge ' + cls + '"><span class="dot"></span>' + st + "</span>";
  }
  function levelBadge(lv, score) {
    return '<span class="badge ' + levelClass(lv) + '"><span class="dot"></span>' + lv + "色 · " + score + " 分</span>";
  }
  function sevBadge(sev) {
    if (!sev) return "";
    var cls = sev === "高" ? "red" : sev === "中" ? "amber" : "gray";
    return '<span class="badge ' + cls + '">严重度 ' + sev + "</span>";
  }

  /* ============================================================
   * M1 组合总览 Dashboard
   * ============================================================ */
  function renderDashboard() {
    var setg = getSettings();
    var importedCount = getImported().length;
    var avg = Math.round(EVALS.reduce(function (s, e) { return s + e.score; }, 0) / EVALS.length);
    var redCount = EVALS.filter(function (e) { return e.level === "红"; }).length;
    var pending = 0, overdueTotal = 0, lateFeeTotal = 0;
    EVALS.forEach(function (e) {
      e.filings.forEach(function (f) {
        if (f.status === "临期" || f.status === "逾期") {
          pending++;
          if (f.status === "逾期") { overdueTotal++; lateFeeTotal += f.lateFee; }
        }
      });
    });

    /* 基准日说明 */
    var baseNote = "演示基准日 " + (setg.useRealDateForDemo ? todayStr() + "（实时日期）" : DEMO_BASE);
    if (importedCount) baseNote += " · 导入企业基准日 " + todayStr() + "（实时）";
    if (getConfig()) baseNote += " · 规则参数：自定义";

    var kpi =
      '<div class="kpi-grid">' +
        '<div class="card kpi"><div class="label">组合平均健康分</div>' +
          '<div class="value ' + (avg >= 90 ? "green" : avg >= 60 ? "amber" : "red") + '">' + avg + '</div>' +
          '<div class="hint">覆盖 ' + EVALS.length + ' 家被投企业' + (importedCount ? "（含 " + importedCount + " 家导入）" : "") + " · " + esc(baseNote) + '</div></div>' +
        '<div class="card kpi"><div class="label">红色预警企业</div>' +
          '<div class="value red">' + redCount + ' <span style="font-size:14px;color:var(--ink-3)">/ ' + EVALS.length + ' 家</span></div>' +
          '<div class="hint">' + EVALS.filter(function(e){return e.level==="黄";}).length + ' 家黄色关注 · 需投后介入</div></div>' +
        '<div class="card kpi"><div class="label">待申报事项（临期+逾期）</div>' +
          '<div class="value amber">' + pending + '</div>' +
          '<div class="hint">其中逾期 ' + overdueTotal + ' 项，滞纳金估算合计 ' + fmtYuanFromWan(lateFeeTotal) + '</div></div>' +
        '<div class="card kpi"><div class="label">规则命中次数</div>' +
          '<div class="value">' + EVALS.reduce(function(s,e){return s+e.hitCount;},0) + '</div>' +
          '<div class="hint">R1–R6 一致性校验 · 期间 ' + META.periodLabel + '</div></div>' +
      '</div>';

    /* V2.2 导入面板（CSV 双文件 + xlsx 单文件，可混选） */
    var importPanel =
      '<div class="card card-pad import-panel" id="importPanel" style="display:' + (importOpen ? "block" : "none") + '">' +
        '<div class="section-title">导入被投企业数据（CSV / Excel）</div>' +
        '<div style="font-size:13px;color:var(--ink-2);margin-bottom:12px;line-height:1.8">' +
          '<b>方式一（推荐）</b>：直接选择「下载 Excel 模板」生成的 .xlsx 文件（含「填报说明 / 三表关键科目 / 申报记录」三个工作表，按表名识别）；' +
          '<b>方式二</b>：选择「三表关键科目」CSV（必选）与「申报记录」CSV（可选）两个文件。' +
          '两种方式可按住 Ctrl / Shift 一次多选混选；申报记录缺失时视为暂无申报记录。<br>' +
          '导入企业以真实当天日期（' + todayStr() + '）为基准日评估，数据保存在本机浏览器（localStorage），刷新不丢失。' +
          (window.XLSX ? "" : '<br><span style="color:var(--amber);font-weight:600">提示：Excel 解析组件（SheetJS vendor）未加载，当前仅支持 CSV 导入；CSV 功能不受影响。</span>') +
        '</div>' +
        '<div class="import-actions">' +
          '<input type="file" id="importFile" accept=".csv,.xlsx,text/csv" multiple onchange="PortfoTaxApp.handleFiles(this.files)">' +
          '<button class="btn-ghost" onclick="PortfoTaxApp.downloadExcelTemplate()">下载 Excel 模板</button>' +
          '<button class="btn-ghost" onclick="PortfoTaxApp.downloadTemplate(\'finance\')">下载财务科目模板</button>' +
          '<button class="btn-ghost" onclick="PortfoTaxApp.downloadTemplate(\'filings\')">下载申报记录模板</button>' +
          '<button class="btn-danger" onclick="PortfoTaxApp.clearImported()">清除全部导入数据</button>' +
        '</div>' +
        '<div class="import-msg" id="importMsg">' + lastImportMsg + '</div>' +
      '</div>';

    /* 企业卡片墙 */
    var cards = EVALS.map(function (e) {
      var c = e.company;
      var hits = e.rules.filter(function (r) { return r.hit; });
      var latest = c.filings.filter(function (f) { return f.filed; }).sort(function (a, b) { return a.filed < b.filed ? 1 : -1; })[0];
      var chips = hits.length
        ? hits.map(function (r) { return '<span class="rule-chip">' + r.id + " " + r.name + "</span>"; }).join("")
        : '<span class="rule-chip ok">6 项规则全部通过</span>';
      var recentTxt;
      if (e.overdueCount > 0) recentTxt = '<span style="color:var(--red);font-weight:600">' + e.overdueCount + " 项申报逾期</span>";
      else if (e.filings.some(function (f) { return f.status === "临期"; })) recentTxt = '<span style="color:var(--amber);font-weight:600">有临期申报事项</span>';
      else if (latest) recentTxt = "最近申报：" + latest.tax + "（" + latest.filed + "）";
      else recentTxt = "暂无申报记录";
      var importedBadge = c.imported ? ' <span class="badge gray">导入</span>' : "";
      var delBtn = c.imported
        ? '<span class="cc-del" title="删除该导入企业" onclick="PortfoTaxApp.removeCompany(event, \'' + esc(c.id) + '\')">×</span>'
        : "";
      return '<a class="card company-card" href="#/company/' + c.id + '">' +
        '<div class="cc-head"><div><h3>' + esc(c.name) + importedBadge + '</h3>' +
          '<div class="meta">' + esc(c.industry) + " · " + esc(c.round) + " · " + esc(c.region) + '</div></div>' +
          '<div style="display:flex;align-items:center;flex-shrink:0">' +
            '<span class="badge ' + levelClass(e.level) + '"><span class="dot"></span>' + e.level + '</span>' + delBtn + '</div></div>' +
        '<div class="cc-score"><span class="score-num" style="color:' + levelColor(e.level) + '">' + e.score + '</span>' +
          '<span style="color:var(--ink-3);font-size:12px">/ 100 财税健康分</span></div>' +
        '<div class="score-bar"><div style="width:' + e.score + '%;background:' + levelColor(e.level) + '"></div></div>' +
        '<div class="cc-foot"><div class="rule-chips">' + chips + '</div></div>' +
        '<div class="cc-foot" style="margin-top:8px">' + recentTxt +
          '<span style="color:var(--ink-3)">基准日 ' + esc(baseLabel(c)) + '</span></div>' +
      '</a>';
    }).join("");

    /* 健康分排行 */
    var ranked = EVALS.slice().sort(function (a, b) { return b.score - a.score; });
    var rankRows = ranked.map(function (e, i) {
      return '<div class="rank-row"><span class="rank-no">' + (i + 1) + '</span>' +
        '<span class="rank-name"><a href="#/company/' + e.company.id + '">' + esc(e.company.name) + "</a></span>" +
        '<span class="badge ' + levelClass(e.level) + '" style="font-size:11px">' + e.level + "</span>" +
        '<span class="rank-score" style="color:' + levelColor(e.level) + '">' + e.score + "</span></div>";
    }).join("");

    /* 风险分布（按规则类型统计命中数，含逾期/临期） */
    var dist = Rules.RULES.map(function (r) {
      var n = EVALS.filter(function (e) {
        return e.rules.some(function (rr) { return rr.id === r.id && rr.hit; });
      }).length;
      return { label: r.id + " " + r.name, count: n, color: "#b4443c" };
    });
    var od = EVALS.reduce(function (s, e) { return s + e.filings.filter(function (f) { return f.status === "逾期"; }).length; }, 0);
    var dq = EVALS.reduce(function (s, e) { return s + e.filings.filter(function (f) { return f.status === "临期"; }).length; }, 0);
    dist.push({ label: "申报逾期（项）", count: od, color: "#c98a2d" });
    dist.push({ label: "申报临期（项）", count: dq, color: "#c98a2d" });
    var maxN = Math.max.apply(null, dist.map(function (d) { return d.count; }).concat([1]));
    var distRows = dist.map(function (d) {
      return '<div class="bar-row"><span>' + esc(d.label) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(d.count / maxN * 100) + '%;background:' + d.color + ';opacity:' + (d.count ? 1 : .25) + '"></div></div>' +
        '<span class="bar-num">' + d.count + "</span></div>";
    }).join("");

    return '<div class="page-head"><div><h1>组合总览</h1>' +
      '<div class="sub">' + esc(META.fundName) + " · 数据期间 " + META.periodLabel + " · " + esc(baseNote) + '</div></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="print-btn" onclick="PortfoTaxApp.toggleImport()">导入数据</button>' +
        '<a class="btn-ghost" href="#/settings">系统设置</a>' +
        '<a class="btn-ghost" href="#/calendar">查看申报监测 →</a></div></div>' +
      importPanel +
      kpi +
      '<div class="section-title">被投企业卡片墙</div>' +
      '<div class="company-grid" style="margin-bottom:24px">' + cards + '</div>' +
      '<div class="two-col">' +
        '<div class="card card-pad"><div class="section-title">企业健康分排行</div>' + rankRows + '</div>' +
        '<div class="card card-pad"><div class="section-title">风险分布（按风险类型）</div>' + distRows + '</div>' +
      '</div>';
  }

  /* ============================================================
   * M2 企业详情
   * ============================================================ */
  function renderCompany(id) {
    var e = evalOf(id);
    if (!e) return '<div class="empty">未找到该企业。<a href="#/dashboard">返回组合总览</a></div>';
    var c = e.company, f = c.finance;

    /* 三表关键数据 */
    var finRows = [
      ["营业收入（账面）", f.revenue, "利润表"],
      ["增值税申报销售额", f.vatDeclaredSales, "纳税申报"],
      ["开票金额", f.invoicedAmount, "税控发票"],
      ["利润总额", f.totalProfit, "利润表"],
      ["企税应纳税所得额", f.citTaxableIncome, "纳税申报"],
      ["净利润", f.netProfit, "利润表"],
      ["未分配利润（期初 → 期末）", fmtNum(f.retainedBegin) + " → " + fmtNum(f.retainedEnd), "资产负债表"],
      ["本期分红", f.dividend, "权益变动"],
      ["销售商品收到现金", f.cashFromSales, "现金流量表"],
      ["工资总额", f.payrollTotal, "薪酬账"],
      ["社保/个税申报基数", f.socialBase, "纳税申报"]
    ].map(function (r) {
      var v = typeof r[1] === "number" ? fmtNum(r[1]) : r[1];
      return "<tr><td>" + r[0] + '</td><td class="num">' + v + '</td><td style="color:var(--ink-3);font-size:12px">' + r[2] + "</td></tr>";
    }).join("");

    /* 规则结果 + AI 解读 */
    var ruleBlocks = e.rules.map(function (r) {
      var head =
        '<div class="rule-head"><span class="rule-id">' + r.id + '</span>' +
        '<span class="rule-name">' + r.name + '</span>' +
        '<span class="rule-formula">' + esc(r.formula) + "</span>" +
        (r.hit ? '<span class="badge red"><span class="dot"></span>命中</span>' + sevBadge(r.severity)
               : '<span class="badge green"><span class="dot"></span>通过</span>') +
        "</div>";
      var figs = '<div class="rule-figs"><span>' + esc(r.detail) + "</span>" +
        "<span>差异金额 <b>" + fmtWan(r.diffAmount) + "</b></span>" +
        "<span>差异率 <b>" + fmtPct(r.diffRate) + "</b></span></div>";
      var ai = "";
      if (r.hit) {
        var it = Rules.interpret(c, r);
        if (it) {
          ai = '<div class="ai-box"><span class="ai-tag">✦ AI 风险解读 · ' + esc(it.title) + "</span>" +
            "<p>" + esc(it.interpretation) + "</p>" +
            "<ul>" + it.suggestions.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>";
        }
      }
      return '<div class="rule-block' + (r.hit ? " hit" : "") + '">' + head + figs + ai + "</div>";
    }).join("");

    /* 申报状态表 */
    var filingRows = e.filings.length ? e.filings.map(function (fl) {
      return "<tr><td>" + esc(fl.tax) + "</td><td>" + fl.period + '</td><td class="num">' + fl.due + "</td>" +
        '<td class="num">' + (fl.filed || "—") + "</td><td>" + statusBadge(fl.status) + "</td>" +
        '<td class="num">' + (fl.status === "逾期" ? fl.overdueDays + " 天" : "—") + "</td>" +
        '<td class="num">' + (fl.lateFee > 0 ? fmtYuanFromWan(fl.lateFee) : "—") + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty">未导入申报记录</td></tr>';

    return '<div class="crumbs no-print"><a href="#/dashboard">组合总览</a> / ' + esc(c.name) + "</div>" +
      '<div class="page-head"><div><h1>' + esc(c.name) + " " + levelBadge(e.level, e.score) +
        (c.imported ? ' <span class="badge gray">导入</span>' : "") + '</h1>' +
        '<div class="sub">' + esc(c.industry) + " · " + esc(c.round) + " · " + esc(c.region) + " · 投资时点 " + esc(c.investDate) +
        " · 数据期间 " + META.periodLabel + " · 评估基准日 " + esc(baseLabel(c)) + '</div></div>' +
        '<a class="print-btn" style="display:inline-block;text-decoration:none" href="#/report/' + c.id + '">生成体检报告 →</a></div>' +
      '<div class="two-col">' +
        '<div class="card card-pad"><div class="section-title">三表及申报关键数据（' + META.unit + '）</div>' +
          '<table class="tbl"><tr><th>科目</th><th class="num">金额</th><th>口径来源</th></tr>' + finRows + '</table></div>' +
        '<div class="card card-pad"><div class="section-title">本期申报状态</div>' +
          '<table class="tbl"><tr><th>税种</th><th>所属期</th><th class="num">截止日</th><th class="num">申报日</th><th>状态</th><th class="num">逾期</th><th class="num">滞纳金估算</th></tr>' + filingRows + "</table>" +
          '<div style="font-size:12px;color:var(--ink-3);margin-top:10px">滞纳金按《税收征管法》万分之五/日估算，仅供演示。</div></div>' +
      "</div>" +
      '<div class="section-title" style="margin-top:8px">一致性校验结果（R1–R6，命中 ' + e.hitCount + " 项）</div>" +
      ruleBlocks;
  }

  /* ============================================================
   * M3 申报监测日历
   * V2.1：日历网格动态化——月份导航（‹ 上一月 / 下一月 ›）、
   * 「回到默认月」；默认月 = 最早未申报截止日所在月份，
   * 无未申报事项时回退为真实当前月份。
   * ============================================================ */
  var calView = null; // 当前浏览月份 { y, m }；null = 默认月

  function monthOf(dateStr) {
    return { y: Number(dateStr.slice(0, 4)), m: Number(dateStr.slice(5, 7)) };
  }
  /** 月份平移（跨年安全）：shiftMonth(2026, 12, +1) → { y: 2027, m: 1 } */
  function shiftMonth(y, m, delta) {
    var t = y * 12 + (m - 1) + delta;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  }
  function sameMonth(a, b) { return a.y === b.y && a.m === b.m; }
  /** 默认月（纯函数，供单测）：最早「未申报」截止日所在月份；全部已申报/无事项 → 真实当前月 */
  function pickDefaultMonth(items, today) {
    var best = null;
    items.forEach(function (it) {
      if (it.filed) return; // 已申报不参与
      var mo = monthOf(it.due);
      if (!best || mo.y * 12 + mo.m < best.y * 12 + best.m) best = mo;
    });
    return best || monthOf(today);
  }
  function calNav(delta) {
    var base = calView || lastDefaultMonth;
    calView = shiftMonth(base.y, base.m, delta);
    route();
  }
  function calReset() { calView = null; route(); }
  var lastDefaultMonth = null; // 最近一次渲染时的默认月（供导航基准）

  function renderCalendar() {
    /* 展开全部申报事项 */
    var items = [];
    EVALS.forEach(function (e) {
      e.filings.forEach(function (fl) {
        items.push({ company: e.company, level: e.level, tax: fl.tax, period: fl.period, due: fl.due, filed: fl.filed, taxAmount: fl.taxAmount, status: fl.status, overdueDays: fl.overdueDays, daysToDue: fl.daysToDue, lateFee: fl.lateFee });
      });
    });

    /* 提醒列表：逾期在前按逾期天数降序，再临期按剩余天数升序 */
    var alerts = items.filter(function (it) { return it.status === "逾期" || it.status === "临期"; })
      .sort(function (a, b) {
        if (a.status !== b.status) return a.status === "逾期" ? -1 : 1;
        return a.status === "逾期" ? b.overdueDays - a.overdueDays : a.daysToDue - b.daysToDue;
      });
    var alertRows = alerts.length ? alerts.map(function (it) {
      var desc = it.status === "逾期"
        ? '已逾期 <b style="color:var(--red)">' + it.overdueDays + '</b> 天，税额 ' + fmtWan(it.taxAmount) + "，滞纳金估算 <b style='color:var(--red)'>" + fmtYuanFromWan(it.lateFee) + "</b>（万分之五/日）"
        : '距截止 <b style="color:var(--amber)">' + it.daysToDue + "</b> 天，请及时催报";
      return "<tr><td><a href='#/company/" + it.company.id + "'>" + esc(it.company.name) + "</a></td>" +
        "<td>" + esc(it.tax) + "</td><td>" + it.period + '</td><td class="num">' + it.due + "</td>" +
        "<td>" + statusBadge(it.status) + '</td><td style="font-size:12.5px">' + desc + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="empty">暂无临期或逾期事项</td></tr>';

    /* V2.1 日历网格：浏览月份 = 用户选择 || 默认月（最早未申报截止日所在月） */
    var defaultMonth = pickDefaultMonth(items, todayStr());
    lastDefaultMonth = defaultMonth;
    var view = calView || defaultMonth;
    var y = view.y, m = view.m;
    var first = new Date(y, m - 1, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(y, m, 0).getDate();
    var byDay = {};
    items.forEach(function (it) {
      var d = new Date(it.due + "T00:00:00");
      if (d.getFullYear() === y && d.getMonth() === m - 1) {
        var k = d.getDate();
        (byDay[k] = byDay[k] || []).push(it);
      }
    });
    var calBase = getSettings().useRealDateForDemo ? todayStr() : DEMO_BASE;
    var cells = "";
    ["日", "一", "二", "三", "四", "五", "六"].forEach(function (w) { cells += '<div class="cal-dow">' + w + "</div>"; });
    for (var i = 0; i < startDow; i++) cells += '<div class="cal-day out"></div>';
    for (var d2 = 1; d2 <= daysInMonth; d2++) {
      var ds = y + "-" + (m < 10 ? "0" + m : m) + "-" + (d2 < 10 ? "0" + d2 : d2);
      var isToday = ds === calBase;
      var inner = (byDay[d2] || []).map(function (it) {
        return '<div class="cal-item s-' + it.status + '" title="' + esc(it.company.name + " · " + it.tax + " · " + it.status) + '">' +
          esc(it.company.name) + " · " + esc(it.tax.replace("（代扣代缴）", "").replace("（季报）", "")) + "</div>";
      }).join("");
      cells += '<div class="cal-day' + (isToday ? " today" : "") + '"><span class="d">' + d2 + (isToday ? ' <span style="color:var(--amber);font-size:11px">今天</span>' : "") + "</span>" + inner + "</div>";
    }

    /* 状态统计 */
    var stat = { "已申报": 0, "临期": 0, "逾期": 0, "未到期": 0 };
    items.forEach(function (it) { stat[it.status]++; });

    /* V2.1 月份导航条 + 非默认月轻提示 */
    var browsing = calView && !sameMonth(view, defaultMonth);
    var calNavBar =
      '<div class="cal-nav">' +
        '<button class="btn-ghost cal-nav-btn" onclick="PortfoTaxApp.calNav(-1)">‹ 上一月</button>' +
        '<span class="cal-nav-title">' + y + ' 年 ' + m + ' 月</span>' +
        '<button class="btn-ghost cal-nav-btn" onclick="PortfoTaxApp.calNav(1)">下一月 ›</button>' +
        '<button class="btn-ghost cal-nav-btn" onclick="PortfoTaxApp.calReset()">回到默认月</button>' +
        (browsing
          ? '<span class="badge amber"><span class="dot"></span>当前浏览：' + y + ' 年 ' + m + ' 月（默认月：' + defaultMonth.y + ' 年 ' + defaultMonth.m + ' 月）</span>'
          : "") +
      '</div>';

    return '<div class="page-head"><div><h1>申报监测日历</h1>' +
      '<div class="sub">企业 × 税种申报期限 · 演示基准日 ' + calBase + (getImported().length ? " · 导入企业按真实当天 " + todayStr() + " 评估" : "") + " · 状态机：已申报 / 临期（≤3 天）/ 逾期</div></div>" +
      '<div class="legend">' +
        '<span><i style="background:var(--green)"></i>已申报 ' + stat["已申报"] + '</span>' +
        '<span><i style="background:var(--amber)"></i>临期 ' + stat["临期"] + '</span>' +
        '<span><i style="background:var(--red)"></i>逾期 ' + stat["逾期"] + '</span>' +
        '<span><i style="background:#a39a8c"></i>未到期 ' + stat["未到期"] + '</span></div></div>' +
      '<div class="card card-pad" style="margin-bottom:20px"><div class="section-title">风险提醒（按逾期天数排序）</div>' +
        '<table class="tbl"><tr><th>企业</th><th>税种</th><th>所属期</th><th class="num">截止日</th><th>状态</th><th>说明</th></tr>' + alertRows + "</table></div>" +
      '<div class="card card-pad"><div class="section-title">' + y + ' 年 ' + m + ' 月申报日历</div>' +
        calNavBar +
        '<div class="cal-grid">' + cells + "</div></div>";
  }

  /* ============================================================
   * M4 企业月度体检报告（可打印）
   * ============================================================ */
  function renderReport(id) {
    var e = evalOf(id);
    if (!e) return '<div class="empty">未找到该企业。<a href="#/dashboard">返回组合总览</a></div>';
    var c = e.company, f = c.finance;
    var hits = e.rules.filter(function (r) { return r.hit; });
    var overdue = e.filings.filter(function (fl) { return fl.status === "逾期"; });
    var lateFeeTotal = overdue.reduce(function (s, fl) { return s + fl.lateFee; }, 0);

    var conclusion;
    if (e.level === "绿") {
      conclusion = esc(c.name) + "本期财税数据一致性良好，R1–R6 校验全部通过，申报及时。建议维持现有月度报送节奏，下期持续关注。";
    } else if (e.level === "黄") {
      conclusion = esc(c.name) + "本期命中 " + hits.length + " 项一致性规则（" + hits.map(function (r) { return r.id; }).join("、") + "）" +
        (overdue.length ? "，并存在 " + overdue.length + " 项申报逾期" : "") +
        "。建议投后经理在 5 个工作日内与企业 CFO 核对差异原因，并在下期复查整改结果。";
    } else {
      conclusion = esc(c.name) + "本期财税风险显著：命中 " + hits.length + " 项规则（" + hits.map(function (r) { return r.id; }).join("、") + "），" +
        "申报逾期 " + overdue.length + " 项，滞纳金估算合计 " + fmtYuanFromWan(lateFeeTotal) +
        "。建议立即启动投后专项核查，要求企业提交书面说明与整改时间表，并评估对本轮估值的影响。";
    }

    var finRows = [
      ["营业收入（账面）", f.revenue], ["增值税申报销售额", f.vatDeclaredSales], ["开票金额", f.invoicedAmount],
      ["利润总额", f.totalProfit], ["企税应纳税所得额", f.citTaxableIncome], ["净利润", f.netProfit],
      ["未分配利润（期末）", f.retainedEnd], ["本期分红", f.dividend],
      ["销售商品收到现金", f.cashFromSales], ["工资总额", f.payrollTotal], ["社保/个税申报基数", f.socialBase]
    ].map(function (r) { return "<tr><td>" + r[0] + '</td><td class="num">' + fmtNum(r[1]) + "</td></tr>"; }).join("");

    var ruleRows = e.rules.map(function (r) {
      return '<tr' + (r.hit ? ' class="hit-row"' : "") + "><td>" + r.id + "</td><td>" + r.name + "</td><td>" +
        (r.hit ? '<b style="color:var(--red)">命中</b>' : "通过") + "</td>" +
        '<td class="num">' + (r.hit ? fmtWan(r.diffAmount) : "—") + "</td>" +
        '<td class="num">' + (r.hit ? fmtPct(r.diffRate) : "—") + "</td>" +
        "<td>" + (r.hit ? r.severity : "—") + "</td></tr>";
    }).join("");

    var aiSections = hits.map(function (r) {
      var it = Rules.interpret(c, r);
      if (!it) return "";
      return '<div class="rule-block hit" style="margin-bottom:12px"><div class="rule-head"><span class="rule-id">' + r.id + "</span>" +
        '<span class="rule-name">' + esc(it.title) + "</span>" + sevBadge(r.severity) + "</div>" +
        '<div style="padding:0 18px 14px 64px;font-size:13px;color:#5c5344"><p style="margin-bottom:8px">' + esc(it.interpretation) + "</p><ul style='padding-left:18px'>" +
        it.suggestions.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div></div>";
    }).join("") || '<div style="color:var(--ink-3);font-size:13px">本期无命中规则，无需生成风险解读。</div>';

    var filingRows = e.filings.length ? e.filings.map(function (fl) {
      return "<tr><td>" + esc(fl.tax) + "</td><td>" + fl.period + '</td><td class="num">' + fl.due + "</td>" +
        "<td>" + statusBadge(fl.status) + '</td><td class="num">' + (fl.lateFee > 0 ? fmtYuanFromWan(fl.lateFee) : "—") + "</td></tr>";
    }).join("") : '<tr><td colspan="5" class="empty">未导入申报记录</td></tr>';

    return '<div class="crumbs no-print"><a href="#/dashboard">组合总览</a> / <a href="#/company/' + c.id + '">' + esc(c.name) + "</a> / 体检报告</div>" +
      '<div class="no-print" style="text-align:right;margin-bottom:14px"><button class="print-btn" onclick="window.print()">打印 / 导出 PDF</button></div>' +
      '<div class="report">' +
        '<div class="r-head"><h1>' + esc(c.name) + " · 月度财税体检报告</h1>" +
          '<div class="r-meta"><span>报告期间：' + META.periodLabel + '</span><span>出具机构：' + esc(META.fundName) + ' 投后管理部</span>' +
          '<span>评估基准日：' + baseFor(c) + '</span><span>行业 / 轮次：' + esc(c.industry) + " / " + esc(c.round) + "</span></div></div>" +
        '<div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">' +
          '<div style="font-size:44px;font-weight:700;color:' + levelColor(e.level) + ';font-variant-numeric:tabular-nums">' + e.score + '</div>' +
          "<div>" + levelBadge(e.level, e.score) +
          '<div style="font-size:12.5px;color:var(--ink-2);margin-top:6px">规则命中 ' + e.hitCount + " 项 · 申报逾期 " + overdue.length + " 项 · 滞纳金估算 " + fmtYuanFromWan(lateFeeTotal) + "</div></div></div>" +
        '<h2>一、总体结论</h2><div class="conclusion">' + conclusion + "</div>" +
        '<h2>二、关键财务与申报数据（' + META.unit + '）</h2><table class="tbl"><tr><th>科目</th><th class="num">金额</th></tr>' + finRows + "</table>" +
        '<h2>三、一致性校验结果（R1–R6）</h2><table class="tbl"><tr><th>编号</th><th>规则</th><th>结果</th><th class="num">差异金额</th><th class="num">差异率</th><th>严重度</th></tr>' + ruleRows + "</table>" +
        '<h2>四、AI 风险解读与处置建议</h2>' + aiSections +
        '<h2>五、申报合规情况</h2><table class="tbl"><tr><th>税种</th><th>所属期</th><th class="num">截止日</th><th>状态</th><th class="num">滞纳金估算</th></tr>' + filingRows + "</table>" +
        '<div style="margin-top:28px;font-size:11.5px;color:var(--ink-3);border-top:1px solid var(--line);padding-top:12px">' +
          "本报告由 PortfoTax 原型自动生成，演示数据为虚构；滞纳金按万分之五/日估算。AI 解读为模板化模拟输出，正式环境将接入大模型生成。</div>" +
      "</div>";
  }

  /* ============================================================
   * M5 系统设置（V2 新增）：规则参数化 + 基准日开关
   * ============================================================ */
  function renderSettings() {
    var custom = getConfig();
    var cfg = Rules.resolveConfig(custom);
    var setg = getSettings();

    function pct(x) { return Math.round(x * 10000) / 100; } // 0.05 → 5
    function numIn(id, val) {
      return '<input type="number" id="' + id + '" value="' + val + '" step="any" min="0">';
    }
    function rateRow(rid, label) {
      var c = cfg[rid];
      return "<tr><td><b>" + rid.toUpperCase() + "</b>　" + label + "</td>" +
        '<td class="num">' + numIn("cfg_" + rid + "_rate", pct(c.rate)) + " %</td>" +
        '<td class="num">' + numIn("cfg_" + rid + "_sevMid", pct(c.sevMid)) + " %</td>" +
        '<td class="num">' + numIn("cfg_" + rid + "_sevHigh", pct(c.sevHigh)) + " %</td></tr>";
    }

    var srcBadge = custom
      ? '<span class="badge amber"><span class="dot"></span>当前配置来源：自定义</span>'
      : '<span class="badge green"><span class="dot"></span>当前配置来源：默认</span>';

    var deductRows = [
      ["high", "高", "规则命中·严重度高"],
      ["mid", "中", "规则命中·严重度中"],
      ["low", "低", "规则命中·严重度低"],
      ["overdue", "逾期", "申报逾期（每项）"],
      ["linqi", "临期", "申报临期（每项）"]
    ].map(function (r) {
      return "<tr><td>" + r[2] + "</td><td class='num'>" + numIn("cfg_w_" + r[0], cfg.scoreDeduct[r[1]]) + " 分</td></tr>";
    }).join("");

    return '<div class="page-head"><div><h1>系统设置</h1>' +
      '<div class="sub">规则引擎参数化 · 基准日模式 · ' +
      '修改保存后全部页面即时按新参数重新评估，配置保存在本机浏览器（localStorage）。</div></div>' +
      '<div class="src-line">' + srcBadge + "</div></div>" +

      /* 评估基准 */
      '<div class="card card-pad set-card"><div class="section-title">评估基准</div>' +
        '<label class="chk-row"><input type="checkbox" id="set_realDate"' + (setg.useRealDateForDemo ? " checked" : "") + '>' +
        '<span>用真实当前日期评估演示数据（今天：' + todayStr() + '）</span></label>' +
        '<div class="set-note">默认关闭：演示企业固定按演示基准日 ' + DEMO_BASE + ' 评估，保证演示结果稳定可复现；' +
        '开启后演示企业改按真实当天日期评估，逾期 / 临期状态会随日期变化，属预期行为。' +
        '<b>导入的企业始终按真实当天日期评估，不受此开关影响。</b>随「保存设置」一并生效。</div></div>' +

      /* 规则阈值与严重度分档 */
      '<div class="card card-pad set-card"><div class="section-title">规则阈值与严重度分档（差异率为百分比）</div>' +
        '<table class="tbl set-table"><tr><th>规则</th><th class="num">命中阈值（差异率 &gt; ）</th><th class="num">严重度「中」边界（&gt; ）</th><th class="num">严重度「高」边界（&gt; ）</th></tr>' +
        rateRow("r1", "三表勾稽") + rateRow("r2", "账税一致性") + rateRow("r3", "所得税匹配") +
        rateRow("r4", "发票-申报比对") + rateRow("r6", "社保个税匹配") +
        "</table>" +
        '<table class="tbl set-table" style="margin-top:14px"><tr><th>规则</th><th class="num">参数</th><th class="num">取值</th></tr>' +
        "<tr><td rowspan='2'><b>R1</b>　三表勾稽补充</td><td>绝对容忍额（万元，|差异额| ≤ 该值则不命中）</td>" +
          '<td class="num">' + numIn("cfg_r1_absTol", cfg.r1.absTol) + " 万元</td></tr>" +
        "<tr><td colspan='2' style='color:var(--ink-3);font-size:12.5px'>R1 命中条件：差异率 &gt; 阈值 <b>且</b> |差异额| &gt; 绝对容忍额；默认 0 表示不启用绝对额容忍。</td></tr>" +
        "<tr><td rowspan='2'><b>R5</b>　现金流勾稽</td><td>收现比正常区间（超出即命中）</td>" +
          '<td class="num">' + numIn("cfg_r5_low", cfg.r5.low) + " ～ " + numIn("cfg_r5_high", cfg.r5.high) + "</td></tr>" +
        "<tr><td>严重度「高」边界（收现比超出该范围判高）</td>" +
          '<td class="num">&lt; ' + numIn("cfg_r5_sevLow", cfg.r5.sevLow) + " 或 &gt; " + numIn("cfg_r5_sevHigh", cfg.r5.sevHigh) + "</td></tr>" +
        "</table></div>" +

      /* 健康分扣分权重 */
      '<div class="card card-pad set-card"><div class="section-title">健康分扣分权重（满分 100，逐级扣减，下限 0）</div>' +
        '<table class="tbl set-table"><tr><th>扣分项</th><th class="num">扣分</th></tr>' + deductRows + "</table>" +
        '<div class="set-note">等级划分固定：绿 ≥ 90，黄 60–89，红 &lt; 60。临期窗口固定为距截止 ≤ 3 天，滞纳金率固定为万分之五/日。</div></div>' +

      /* 操作区 */
      '<div class="card card-pad set-card"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<button class="print-btn" onclick="PortfoTaxApp.saveSettings()">保存设置</button>' +
        '<button class="btn-ghost" onclick="PortfoTaxApp.resetConfig()">恢复默认参数</button>' +
        '<span style="font-size:12.5px;color:var(--ink-3)">「恢复默认参数」仅还原规则阈值与扣分权重，不影响基准日开关与已导入数据。</span></div>' +
        '<div class="form-msg" id="settingsMsg">' + settingsMsg + "</div></div>";
  }

  /* ============================================================
   * V2 交互动作（供内联事件调用）
   * ============================================================ */
  function toggleImport() { importOpen = !importOpen; route(); }

  function isXlsxName(name) { return /\.xlsx$/i.test(String(name || "")); }

  /* V2.2：CSV 用 readAsText；xlsx 用 readAsArrayBuffer（XLSX.read 在 processImports 容错解析） */
  function handleFiles(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
    if (!files.length) return;
    var payloads = [], done = 0;
    files.forEach(function (f, idx) {
      var reader = new FileReader();
      var finish = function (val) { payloads[idx] = val; if (++done === files.length) processImports(files, payloads); };
      reader.onload = function () { finish(reader.result); };
      reader.onerror = function () { finish(null); };
      if (isXlsxName(f.name)) reader.readAsArrayBuffer(f);
      else reader.readAsText(f, "UTF-8");
    });
  }

  function processImports(files, payloads) {
    var errors = [], finText = null, filText = null;
    files.forEach(function (f, i) {
      var data = payloads[i];
      if (data == null) { errors.push("文件「" + f.name + "」读取失败"); return; }

      if (isXlsxName(f.name)) {
        /* V2.2 xlsx 分支：vendor 缺失或解析失败时友好提示，不影响同批 CSV */
        if (!window.XLSX) {
          errors.push("文件「" + f.name + "」：Excel 解析组件（SheetJS vendor）未加载或文件缺失，无法导入 xlsx；请改用 CSV 导入（CSV 功能不受影响）");
          return;
        }
        var wb;
        try {
          wb = window.XLSX.read(new Uint8Array(data), { type: "array", cellDates: true });
        } catch (ex) {
          errors.push("文件「" + f.name + "」xlsx 解析失败：" + (ex && ex.message ? ex.message : "文件损坏或不是有效的 Excel 文件"));
          return;
        }
        var parts = Importer.xlsxToParts(wb, window.XLSX);
        errors = errors.concat(parts.errors);
        if (parts.finText != null) {
          if (finText != null) errors.push("文件「" + f.name + "」：检测到多个「三表关键科目」数据源，已忽略该文件的财务科目表");
          else finText = parts.finText;
        }
        if (parts.filText != null) {
          if (filText != null) errors.push("文件「" + f.name + "」：检测到多个「申报记录」数据源，已忽略该文件的申报记录表");
          else filText = parts.filText;
        }
        return;
      }

      var text = String(data);
      var type = Importer.detectType(text);
      if (type === "finance") {
        if (finText != null) errors.push("文件「" + f.name + "」：检测到多个「三表关键科目」数据源，已忽略该文件");
        else finText = text;
      } else if (type === "filings") {
        if (filText != null) errors.push("文件「" + f.name + "」：检测到多个「申报记录」数据源，已忽略该文件");
        else filText = text;
      } else {
        errors.push("文件「" + f.name + "」表头无法识别：既不是「三表关键科目」也不是「申报记录」模板，请下载模板核对");
      }
    });

    if (!finText) {
      errors.push("缺少有效的「三表关键科目」数据（财务科目为必选；申报记录需与之一同导入）");
      showImportResult(0, [], errors);
      return;
    }

    var existing = {};
    DEMO.companies.forEach(function (c) { existing[c.id] = 1; });
    getImported().forEach(function (c) { existing[c.id] = 1; });

    var fin = Importer.parseFinanceCSV(finText, existing);
    errors = errors.concat(fin.errors);

    var byId = {};
    if (filText) {
      var validIds = {};
      fin.companies.forEach(function (c) { validIds[c.id] = 1; });
      var fil = Importer.parseFilingsCSV(filText, validIds);
      errors = errors.concat(fil.errors);
      byId = fil.byId;
    }
    fin.companies.forEach(function (c) { c.filings = byId[c.id] || []; });

    if (fin.companies.length) {
      Store.set("imported", getImported().concat(fin.companies));
    }
    showImportResult(fin.companies.length, fin.companies.map(function (c) { return c.name; }), errors);
  }

  function showImportResult(added, names, errors) {
    importOpen = true;
    var html = "";
    if (added > 0) {
      html += '<div class="ok">✓ 成功导入 ' + added + ' 家企业：' + esc(names.join("、")) +
        "（已按真实当天日期评估，卡片带「导入」徽章，可单独删除）</div>";
    }
    if (errors && errors.length) {
      html += "<ul>" + errors.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>";
    }
    if (!html) html = '<div class="ok">未导入新数据。</div>';
    lastImportMsg = html;
    route();
  }

  function removeCompany(ev, id) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    var list = getImported();
    var target = null;
    list.forEach(function (c) { if (c.id === id) target = c; });
    if (!target) return;
    if (!confirm("确定从组合中删除导入企业「" + target.name + "」？仅删除本地导入数据，不影响演示企业。")) return;
    Store.set("imported", list.filter(function (c) { return c.id !== id; }));
    lastImportMsg = '<div class="ok">✓ 已删除导入企业「' + esc(target.name) + "」。</div>";
    route();
  }

  function clearImported() {
    var list = getImported();
    importOpen = true;
    if (!list.length) { lastImportMsg = "<ul><li>当前没有导入数据。</li></ul>"; route(); return; }
    if (!confirm("确定清除全部 " + list.length + " 家导入企业？演示数据不受影响。")) { route(); return; }
    Store.remove("imported");
    lastImportMsg = '<div class="ok">✓ 已清除全部导入数据。</div>';
    route();
  }

  function downloadTemplate(kind) {
    var content = kind === "filings" ? Importer.templateFilingCSV() : Importer.templateFinanceCSV();
    var name = kind === "filings" ? "申报记录模板.csv" : "三表关键科目模板.csv";
    var blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }); // 带 BOM，Excel 直开不乱码
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  /* V2.2：用本地 vendored SheetJS 直接生成三工作表 xlsx 模板供下载 */
  function downloadExcelTemplate() {
    if (!window.XLSX) {
      importOpen = true;
      lastImportMsg = "<ul><li>Excel 模板生成组件（SheetJS vendor）未加载或文件缺失，暂时无法生成 xlsx 模板；请使用 CSV 模板（功能不受影响）。</li></ul>";
      route();
      return;
    }
    try {
      var XLSX = window.XLSX;
      var wb = XLSX.utils.book_new();
      Importer.buildTemplateSheets().forEach(function (s) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.name);
      });
      var out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      var blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "PortfoTax导入模板.xlsx";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    } catch (ex) {
      importOpen = true;
      lastImportMsg = "<ul><li>Excel 模板生成失败：" + esc(ex && ex.message ? ex.message : String(ex)) + "；请改用 CSV 模板。</li></ul>";
      route();
    }
  }

  /* ---------- 设置保存 / 恢复默认 ---------- */
  function saveSettings() {
    function gv(id) {
      var el = document.getElementById(id);
      return el ? String(el.value).replace(/^\s+|\s+$/g, "") : "";
    }
    var errs = [];
    function pctv(id, label) {
      var raw = gv(id), v = Number(raw);
      if (raw === "" || !isFinite(v) || v < 0 || v > 100) errs.push(label + " 必须是 0–100 的数字（当前：「" + raw + "」）");
      return v / 100;
    }
    function numv(id, label) {
      var raw = gv(id), v = Number(raw);
      if (raw === "" || !isFinite(v) || v < 0) errs.push(label + " 必须是非负数字（当前：「" + raw + "」）");
      return v;
    }

    var cfg = { r1: {}, r2: {}, r3: {}, r4: {}, r5: {}, r6: {}, scoreDeduct: {} };
    ["r1", "r2", "r3", "r4", "r6"].forEach(function (rid) {
      var R = rid.toUpperCase();
      cfg[rid].rate = pctv("cfg_" + rid + "_rate", R + " 命中差异率阈值");
      cfg[rid].sevMid = pctv("cfg_" + rid + "_sevMid", R + " 严重度「中」边界");
      cfg[rid].sevHigh = pctv("cfg_" + rid + "_sevHigh", R + " 严重度「高」边界");
    });
    cfg.r1.absTol = numv("cfg_r1_absTol", "R1 绝对容忍额");
    cfg.r5.low = numv("cfg_r5_low", "R5 收现比正常区间下界");
    cfg.r5.high = numv("cfg_r5_high", "R5 收现比正常区间上界");
    cfg.r5.sevLow = numv("cfg_r5_sevLow", "R5 严重度「高」下界");
    cfg.r5.sevHigh = numv("cfg_r5_sevHigh", "R5 严重度「高」上界");
    cfg.scoreDeduct["高"] = numv("cfg_w_high", "扣分权重·高");
    cfg.scoreDeduct["中"] = numv("cfg_w_mid", "扣分权重·中");
    cfg.scoreDeduct["低"] = numv("cfg_w_low", "扣分权重·低");
    cfg.scoreDeduct["逾期"] = numv("cfg_w_overdue", "扣分权重·逾期");
    cfg.scoreDeduct["临期"] = numv("cfg_w_linqi", "扣分权重·临期");

    if (!errs.length) {
      ["r1", "r2", "r3", "r4", "r6"].forEach(function (rid) {
        if (cfg[rid].sevMid > cfg[rid].sevHigh) errs.push(rid.toUpperCase() + " 严重度「中」边界不能大于「高」边界");
      });
      if (cfg.r5.low > cfg.r5.high) errs.push("R5 收现比正常区间下界不能大于上界");
      if (cfg.r5.sevLow > cfg.r5.sevHigh) errs.push("R5 严重度「高」边界下界不能大于上界");
    }

    /* 基准日开关独立保存（即使参数校验失败也生效） */
    var chk = document.getElementById("set_realDate");
    Store.set("settings", { useRealDateForDemo: !!(chk && chk.checked) });

    if (errs.length) {
      settingsMsg = "<ul>" + errs.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>";
      route();
      return;
    }
    Store.set("config", cfg);
    settingsMsg = '<div class="ok">✓ 设置已保存，全部页面已按新参数重新评估（当前为自定义配置）。</div>';
    route();
  }

  function resetConfig() {
    Store.remove("config");
    settingsMsg = '<div class="ok">✓ 已恢复默认规则参数（阈值与扣分权重），当前配置来源：默认。</div>';
    route();
  }

  /* ============================================================
   * 路由
   * ============================================================ */
  function route() {
    var hash = location.hash || "#/dashboard";
    var app = document.getElementById("app");
    var parts = hash.replace(/^#\//, "").split("/");
    var page = parts[0];

    computeEvals();

    /* V2.1：离开日历页后，下次进入时回到默认月 */
    if (page !== "calendar") calView = null;

    document.querySelectorAll("#nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === page);
    });

    if (page === "company" && parts[1]) app.innerHTML = renderCompany(parts[1]);
    else if (page === "calendar") app.innerHTML = renderCalendar();
    else if (page === "report" && parts[1]) app.innerHTML = renderReport(parts[1]);
    else if (page === "settings") app.innerHTML = renderSettings();
    else app.innerHTML = renderDashboard();

    window.scrollTo(0, 0);
  }

  /* 暴露给内联事件 */
  window.PortfoTaxApp = {
    toggleImport: toggleImport,
    handleFiles: handleFiles,
    removeCompany: removeCompany,
    clearImported: clearImported,
    downloadTemplate: downloadTemplate,
    downloadExcelTemplate: downloadExcelTemplate,
    saveSettings: saveSettings,
    resetConfig: resetConfig,
    calNav: calNav,
    calReset: calReset,
    /* 纯函数导出（供 Node 单测） */
    _pickDefaultMonth: pickDefaultMonth,
    _shiftMonth: shiftMonth,
    rerender: route
  };

  window.addEventListener("hashchange", route);
  route();
})();
