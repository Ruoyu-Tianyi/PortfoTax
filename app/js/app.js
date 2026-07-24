/* ============================================================
 * PortfoTax · 路由与渲染（原生 JS，零构建，兼容 file://）
 * 路由：#/dashboard  #/company/:id  #/calendar  #/report/:id
 * ============================================================ */
(function () {
  "use strict";

  var META = DEMO.meta;
  var BASE = META.baseDate;

  /* ---------- 评估缓存 ---------- */
  var EVALS = DEMO.companies.map(function (c) { return Rules.evaluateCompany(c, BASE); });
  function evalOf(id) {
    for (var i = 0; i < EVALS.length; i++) if (EVALS[i].company.id === id) return EVALS[i];
    return null;
  }

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

    var kpi =
      '<div class="kpi-grid">' +
        '<div class="card kpi"><div class="label">组合平均健康分</div>' +
          '<div class="value ' + (avg >= 90 ? "green" : avg >= 60 ? "amber" : "red") + '">' + avg + '</div>' +
          '<div class="hint">覆盖 ' + EVALS.length + ' 家被投企业 · 基准日 ' + BASE + '</div></div>' +
        '<div class="card kpi"><div class="label">红色预警企业</div>' +
          '<div class="value red">' + redCount + ' <span style="font-size:14px;color:var(--ink-3)">/ ' + EVALS.length + ' 家</span></div>' +
          '<div class="hint">' + EVALS.filter(function(e){return e.level==="黄";}).length + ' 家黄色关注 · 需投后介入</div></div>' +
        '<div class="card kpi"><div class="label">本月待申报事项</div>' +
          '<div class="value amber">' + pending + '</div>' +
          '<div class="hint">其中逾期 ' + overdueTotal + ' 项，滞纳金估算合计 ' + fmtYuanFromWan(lateFeeTotal) + '</div></div>' +
        '<div class="card kpi"><div class="label">规则命中次数</div>' +
          '<div class="value">' + EVALS.reduce(function(s,e){return s+e.hitCount;},0) + '</div>' +
          '<div class="hint">R1–R6 一致性校验 · 期间 ' + META.periodLabel + '</div></div>' +
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
      return '<a class="card company-card" href="#/company/' + c.id + '">' +
        '<div class="cc-head"><div><h3>' + esc(c.name) + '</h3>' +
          '<div class="meta">' + esc(c.industry) + " · " + esc(c.round) + " · " + esc(c.region) + '</div></div>' +
          '<span class="badge ' + levelClass(e.level) + '"><span class="dot"></span>' + e.level + '</span></div>' +
        '<div class="cc-score"><span class="score-num" style="color:' + levelColor(e.level) + '">' + e.score + '</span>' +
          '<span style="color:var(--ink-3);font-size:12px">/ 100 财税健康分</span></div>' +
        '<div class="score-bar"><div style="width:' + e.score + '%;background:' + levelColor(e.level) + '"></div></div>' +
        '<div class="cc-foot"><div class="rule-chips">' + chips + '</div></div>' +
        '<div class="cc-foot" style="margin-top:8px">' + recentTxt + '</div>' +
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
      '<div class="sub">' + esc(META.fundName) + " · 数据期间 " + META.periodLabel + " · 基准日 " + BASE + '</div></div>' +
      '<a class="btn-ghost" href="#/calendar">查看申报监测 →</a></div>' +
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
    var filingRows = e.filings.map(function (fl) {
      return "<tr><td>" + esc(fl.tax) + "</td><td>" + fl.period + '</td><td class="num">' + fl.due + "</td>" +
        '<td class="num">' + (fl.filed || "—") + "</td><td>" + statusBadge(fl.status) + "</td>" +
        '<td class="num">' + (fl.status === "逾期" ? fl.overdueDays + " 天" : "—") + "</td>" +
        '<td class="num">' + (fl.lateFee > 0 ? fmtYuanFromWan(fl.lateFee) : "—") + "</td></tr>";
    }).join("");

    return '<div class="crumbs no-print"><a href="#/dashboard">组合总览</a> / ' + esc(c.name) + "</div>" +
      '<div class="page-head"><div><h1>' + esc(c.name) + " " + levelBadge(e.level, e.score) + '</h1>' +
        '<div class="sub">' + esc(c.industry) + " · " + esc(c.round) + " · " + esc(c.region) + " · 投资时点 " + esc(c.investDate) + " · 数据期间 " + META.periodLabel + '</div></div>' +
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
   * ============================================================ */
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

    /* 6 月日历网格 */
    var y = 2026, m = 6;
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
    var cells = "";
    ["日", "一", "二", "三", "四", "五", "六"].forEach(function (w) { cells += '<div class="cal-dow">' + w + "</div>"; });
    for (var i = 0; i < startDow; i++) cells += '<div class="cal-day out"></div>';
    for (var d2 = 1; d2 <= daysInMonth; d2++) {
      var ds = y + "-" + (m < 10 ? "0" + m : m) + "-" + (d2 < 10 ? "0" + d2 : d2);
      var isToday = ds === BASE;
      var inner = (byDay[d2] || []).map(function (it) {
        return '<div class="cal-item s-' + it.status + '" title="' + esc(it.company.name + " · " + it.tax + " · " + it.status) + '">' +
          esc(it.company.name) + " · " + esc(it.tax.replace("（代扣代缴）", "").replace("（季报）", "")) + "</div>";
      }).join("");
      cells += '<div class="cal-day' + (isToday ? " today" : "") + '"><span class="d">' + d2 + (isToday ? ' <span style="color:var(--amber);font-size:11px">今天</span>' : "") + "</span>" + inner + "</div>";
    }

    /* 状态统计 */
    var stat = { "已申报": 0, "临期": 0, "逾期": 0, "未到期": 0 };
    items.forEach(function (it) { stat[it.status]++; });

    return '<div class="page-head"><div><h1>申报监测日历</h1>' +
      '<div class="sub">企业 × 税种申报期限 · 基准日 ' + BASE + " · 状态机：已申报 / 临期（≤3 天）/ 逾期</div></div>" +
      '<div class="legend">' +
        '<span><i style="background:var(--green)"></i>已申报 ' + stat["已申报"] + '</span>' +
        '<span><i style="background:var(--amber)"></i>临期 ' + stat["临期"] + '</span>' +
        '<span><i style="background:var(--red)"></i>逾期 ' + stat["逾期"] + '</span>' +
        '<span><i style="background:#a39a8c"></i>未到期 ' + stat["未到期"] + '</span></div></div>' +
      '<div class="card card-pad" style="margin-bottom:20px"><div class="section-title">风险提醒（按逾期天数排序）</div>' +
        '<table class="tbl"><tr><th>企业</th><th>税种</th><th>所属期</th><th class="num">截止日</th><th>状态</th><th>说明</th></tr>' + alertRows + "</table></div>" +
      '<div class="card card-pad"><div class="section-title">2026 年 6 月申报日历</div>' +
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

    var filingRows = e.filings.map(function (fl) {
      return "<tr><td>" + esc(fl.tax) + "</td><td>" + fl.period + '</td><td class="num">' + fl.due + "</td>" +
        "<td>" + statusBadge(fl.status) + '</td><td class="num">' + (fl.lateFee > 0 ? fmtYuanFromWan(fl.lateFee) : "—") + "</td></tr>";
    }).join("");

    return '<div class="crumbs no-print"><a href="#/dashboard">组合总览</a> / <a href="#/company/' + c.id + '">' + esc(c.name) + "</a> / 体检报告</div>" +
      '<div class="no-print" style="text-align:right;margin-bottom:14px"><button class="print-btn" onclick="window.print()">打印 / 导出 PDF</button></div>' +
      '<div class="report">' +
        '<div class="r-head"><h1>' + esc(c.name) + " · 月度财税体检报告</h1>" +
          '<div class="r-meta"><span>报告期间：' + META.periodLabel + '</span><span>出具机构：' + esc(META.fundName) + ' 投后管理部</span>' +
          '<span>生成日期：' + BASE + '</span><span>行业 / 轮次：' + esc(c.industry) + " / " + esc(c.round) + "</span></div></div>" +
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
          "本报告由 PortfoTax 原型自动生成，数据为虚构演示数据；滞纳金按万分之五/日估算。AI 解读为模板化模拟输出，正式环境将接入大模型生成。</div>" +
      "</div>";
  }

  /* ============================================================
   * 路由
   * ============================================================ */
  function route() {
    var hash = location.hash || "#/dashboard";
    var app = document.getElementById("app");
    var parts = hash.replace(/^#\//, "").split("/");
    var page = parts[0];

    document.querySelectorAll("#nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === page);
    });

    if (page === "company" && parts[1]) app.innerHTML = renderCompany(parts[1]);
    else if (page === "calendar") app.innerHTML = renderCalendar();
    else if (page === "report" && parts[1]) app.innerHTML = renderReport(parts[1]);
    else app.innerHTML = renderDashboard();

    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);
  route();
})();
