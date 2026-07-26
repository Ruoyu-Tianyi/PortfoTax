/* ============================================================
 * PortfoTax · 规则引擎（纯函数，可单测）V2
 * 输入：企业数据（DEMO.companies[i]）+ 基准日 + 可选 config
 * 输出：每条规则的命中状态 / 差异金额 / 差异率 / 严重度，
 *       以及企业级健康分与风险等级。
 * 不依赖 DOM，不读写全局状态（DEMO 仅作类型参考）。
 *
 * V2 变更：全部阈值 / 严重度分档边界 / 健康分扣分权重抽为
 * DEFAULT_CONFIG；evaluateCompany(company, baseDate, config?)
 * 第三参数可选且支持部分覆盖（深合并）。缺省 = 默认配置，
 * 评估结果与 V1 硬编码版本完全一致（向后兼容）。
 * ============================================================ */
(function (global) {
  "use strict";

  var DAY_MS = 86400000;

  /* ---------- 默认配置（取值与 V1 硬编码完全一致） ----------
   * r1.absTol：R1 绝对容忍额（万元），默认 0 = 不启用绝对额容忍，
   *            命中条件为 差异率 > rate 且 |差异额| > absTol。
   * r*.rate  ：命中差异率阈值（严格 >）。
   * r*.sevMid / sevHigh：严重度分档边界（>sevHigh→高，>sevMid→中，否则低）。
   * r5.low / high：收现比正常区间（严格 <low 或 >high 命中）；
   * r5.sevLow / sevHigh：收现比高档严重度边界（<sevLow 或 >sevHigh → 高）。
   * scoreDeduct：健康分扣分权重。 */
  var DEFAULT_CONFIG = {
    r1: { absTol: 0, rate: 0.03, sevMid: 0.05, sevHigh: 0.20 },
    r2: { rate: 0.05, sevMid: 0.05, sevHigh: 0.15 },
    r3: { rate: 0.10, sevMid: 0.10, sevHigh: 0.25 },
    r4: { rate: 0.05, sevMid: 0.05, sevHigh: 0.15 },
    r5: { low: 0.7, high: 1.3, sevLow: 0.5, sevHigh: 1.5 },
    r6: { rate: 0.10, sevMid: 0.10, sevHigh: 0.25 },
    scoreDeduct: { "高": 30, "中": 20, "低": 10, "逾期": 12, "临期": 4 }
  };

  /* ---------- 配置工具 ---------- */
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  /** 深合并：over 中的值覆盖 base；缺省字段回落到 base。 */
  function mergeDeep(base, over) {
    var out = {}, k;
    over = isObj(over) ? over : {};
    for (k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      if (isObj(base[k])) out[k] = mergeDeep(base[k], over[k]);
      else out[k] = (over[k] !== undefined) ? over[k] : base[k];
    }
    return out;
  }
  /** 解析用户配置：null/部分对象 → 与默认配置深合并后的完整配置 */
  function resolveConfig(config) { return mergeDeep(DEFAULT_CONFIG, config); }

  /* ---------- 工具 ---------- */
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function diffRate(a, b) {
    var base = Math.max(Math.abs(num(a)), 1e-9);
    return Math.abs(num(a) - num(b)) / base;
  }
  function round(v, d) {
    var p = Math.pow(10, d == null ? 2 : d);
    return Math.round(v * p) / p;
  }
  /** 差异率 → 严重度：>high→高，>mid→中，其余→低 */
  function severityByRate(rate, mid, high) {
    if (rate > high) return "高";
    if (rate > mid) return "中";
    return "低";
  }
  /** 0.05 → "5%"（避免浮点长尾） */
  function pctText(x) { return (Math.round(x * 10000) / 100) + "%"; }

  /* ---------- 规则定义（check(finance, ruleCfg)） ---------- */
  var RULES = [
    {
      id: "R1",
      name: "三表勾稽",
      formula: function (cfg) {
        return "净利润 ≈ 未分配利润变动 + 分红（容忍度：差异率 ≤ " + pctText(cfg.rate) +
          (cfg.absTol > 0 ? " 且绝对额 ≤ " + cfg.absTol + " 万" : "") + "）";
      },
      check: function (f, cfg) {
        var expect = (num(f.retainedEnd) - num(f.retainedBegin)) + num(f.dividend);
        var diff = num(f.netProfit) - expect;
        var rate = diffRate(f.netProfit, expect);
        return {
          hit: rate > cfg.rate && Math.abs(diff) > cfg.absTol,
          diffAmount: round(diff),
          diffRate: round(rate, 4),
          severity: severityByRate(rate, cfg.sevMid, cfg.sevHigh),
          detail: "净利润 " + f.netProfit + " 万 vs 未分配利润变动+分红 " + round(expect) + " 万"
        };
      }
    },
    {
      id: "R2",
      name: "账税一致性",
      formula: function (cfg) { return "账面营业收入 vs 增值税申报销售额（阈值 " + pctText(cfg.rate) + "）"; },
      check: function (f, cfg) {
        var diff = num(f.revenue) - num(f.vatDeclaredSales);
        var rate = diffRate(f.revenue, f.vatDeclaredSales);
        return {
          hit: rate > cfg.rate,
          diffAmount: round(diff),
          diffRate: round(rate, 4),
          severity: severityByRate(rate, cfg.sevMid, cfg.sevHigh),
          detail: "账面收入 " + f.revenue + " 万 vs 增值税申报销售额 " + f.vatDeclaredSales + " 万"
        };
      }
    },
    {
      id: "R3",
      name: "所得税匹配",
      formula: function (cfg) { return "利润总额 vs 企业所得税申报应纳税所得额（阈值 " + pctText(cfg.rate) + "）"; },
      check: function (f, cfg) {
        var diff = num(f.totalProfit) - num(f.citTaxableIncome);
        var rate = diffRate(f.totalProfit, f.citTaxableIncome);
        return {
          hit: rate > cfg.rate,
          diffAmount: round(diff),
          diffRate: round(rate, 4),
          severity: severityByRate(rate, cfg.sevMid, cfg.sevHigh),
          detail: "利润总额 " + f.totalProfit + " 万 vs 企税应纳税所得额 " + f.citTaxableIncome + " 万"
        };
      }
    },
    {
      id: "R4",
      name: "发票-申报比对",
      formula: function (cfg) { return "开票金额 vs 增值税申报收入（阈值 " + pctText(cfg.rate) + "）"; },
      check: function (f, cfg) {
        var diff = num(f.invoicedAmount) - num(f.vatDeclaredSales);
        var rate = diffRate(f.invoicedAmount, f.vatDeclaredSales);
        return {
          hit: rate > cfg.rate,
          diffAmount: round(diff),
          diffRate: round(rate, 4),
          severity: severityByRate(rate, cfg.sevMid, cfg.sevHigh),
          detail: "开票金额 " + f.invoicedAmount + " 万 vs 申报销售额 " + f.vatDeclaredSales + " 万"
        };
      }
    },
    {
      id: "R5",
      name: "现金流勾稽",
      formula: function (cfg) {
        return "销售商品收到现金 / 营业收入（收现比正常区间 " + cfg.low + "–" + cfg.high + "）";
      },
      check: function (f, cfg) {
        var ratio = num(f.cashFromSales) / Math.max(num(f.revenue), 1e-9);
        var hit = ratio < cfg.low || ratio > cfg.high;
        var sev = (ratio < cfg.sevLow || ratio > cfg.sevHigh) ? "高" : (hit ? "中" : "低");
        return {
          hit: hit,
          diffAmount: round(num(f.cashFromSales) - num(f.revenue)),
          diffRate: round(Math.abs(ratio - 1), 4),
          severity: sev,
          detail: "收现比 " + round(ratio, 2) + "（销售收现 " + f.cashFromSales + " 万 / 营业收入 " + f.revenue + " 万）"
        };
      }
    },
    {
      id: "R6",
      name: "社保个税匹配",
      formula: function (cfg) { return "工资总额 vs 社保/个税申报基数（阈值 " + pctText(cfg.rate) + "）"; },
      check: function (f, cfg) {
        var diff = num(f.payrollTotal) - num(f.socialBase);
        var rate = diffRate(f.payrollTotal, f.socialBase);
        return {
          hit: rate > cfg.rate,
          diffAmount: round(diff),
          diffRate: round(rate, 4),
          severity: severityByRate(rate, cfg.sevMid, cfg.sevHigh),
          detail: "工资总额 " + f.payrollTotal + " 万 vs 社保/个税申报基数 " + f.socialBase + " 万"
        };
      }
    }
  ];

  /* ---------- 申报状态机 ---------- */
  /** 返回 { status, overdueDays, daysToDue, lateFee } */
  function filingStatus(filing, baseDate) {
    var base = new Date(baseDate + "T00:00:00");
    var due = new Date(filing.due + "T00:00:00");
    var daysToDue = Math.round((due - base) / DAY_MS);
    if (filing.filed) {
      return { status: "已申报", overdueDays: 0, daysToDue: daysToDue, lateFee: 0 };
    }
    if (daysToDue < 0) {
      var od = -daysToDue;
      // 滞纳金 = 税额 × 0.05% × 逾期天数（税收征管法第三十二条）
      return {
        status: "逾期",
        overdueDays: od,
        daysToDue: daysToDue,
        lateFee: round(num(filing.taxAmount) * 0.0005 * od, 4)
      };
    }
    if (daysToDue <= 3) {
      return { status: "临期", overdueDays: 0, daysToDue: daysToDue, lateFee: 0 };
    }
    return { status: "未到期", overdueDays: 0, daysToDue: daysToDue, lateFee: 0 };
  }

  /* ---------- 企业级评估 ---------- */
  function evaluateCompany(company, baseDate, config) {
    var cfg = resolveConfig(config);
    var deduct = cfg.scoreDeduct;

    var ruleResults = RULES.map(function (r) {
      var rcfg = cfg[r.id.toLowerCase()];
      var res = r.check(company.finance, rcfg);
      return {
        id: r.id, name: r.name,
        formula: typeof r.formula === "function" ? r.formula(rcfg) : r.formula,
        hit: res.hit, diffAmount: res.diffAmount, diffRate: res.diffRate,
        severity: res.hit ? res.severity : null,
        detail: res.detail
      };
    });

    var filingResults = company.filings.map(function (fl) {
      var st = filingStatus(fl, baseDate);
      return {
        tax: fl.tax, period: fl.period, due: fl.due, filed: fl.filed,
        taxAmount: fl.taxAmount,
        status: st.status, overdueDays: st.overdueDays,
        daysToDue: st.daysToDue, lateFee: st.lateFee
      };
    });

    var score = 100;
    ruleResults.forEach(function (r) {
      if (r.hit) score -= deduct[r.severity];
    });
    filingResults.forEach(function (f) {
      if (f.status === "逾期") score -= deduct["逾期"];
      else if (f.status === "临期") score -= deduct["临期"];
    });
    score = Math.max(0, score);

    var level = score >= 90 ? "绿" : (score >= 60 ? "黄" : "红");
    var hitCount = ruleResults.filter(function (r) { return r.hit; }).length;
    var overdueCount = filingResults.filter(function (f) { return f.status === "逾期"; }).length;

    return {
      company: company,
      rules: ruleResults,
      filings: filingResults,
      score: score,
      level: level,
      hitCount: hitCount,
      overdueCount: overdueCount
    };
  }

  /* ---------- 模板化 AI 风险解读（模拟 AI 输出） ---------- */
  var AI_TEMPLATES = {
    R1: function (c, r) {
      return {
        title: "三表勾稽关系断裂",
        interpretation: c.name + "本期净利润与未分配利润变动（加分红）存在 " + Math.abs(r.diffAmount) +
          " 万元缺口（差异率 " + (r.diffRate * 100).toFixed(1) + "%）。利润表与资产负债表的勾稽关系断裂，" +
          "常见原因包括：以前年度损益调整未披露、权益类科目错记、或存在未入账的利润分配/亏损弥补。",
        suggestions: [
          "要求企业财务提供本期所有者权益变动表及以前年度损益调整明细；",
          "核对是否存在未通过利润表直接调整未分配利润的分录；",
          "若下期仍无法解释缺口，建议纳入投后专项核查并暂缓估值上调。"
        ]
      };
    },
    R2: function (c, r) {
      return {
        title: "账面收入与增值税申报口径不一致",
        interpretation: c.name + "账面营业收入较增值税申报销售额高 " + Math.abs(r.diffAmount) +
          " 万元（差异率 " + (r.diffRate * 100).toFixed(1) + "%），超过阈值。" +
          "可能为未开票收入挂账、收入确认时点差异，或存在少申报销售额的涉税风险。",
        suggestions: [
          "索取未开票收入台账，核实差异是否集中在特定客户或月份；",
          "比对收入确认政策与增值税纳税义务发生时间是否匹配；",
          "如确认为少申报，督促企业补申报并测算补税与滞纳金敞口。"
        ]
      };
    },
    R3: function (c, r) {
      return {
        title: "利润总额与企税应纳税所得额偏离",
        interpretation: c.name + "利润总额与企业所得税申报应纳税所得额差异 " + Math.abs(r.diffAmount) +
          " 万元（差异率 " + (r.diffRate * 100).toFixed(1) + "%）。" +
          "合理的纳税调整（加计扣除、免税收入）之外，需关注是否存在少列所得或费用凭证不足。",
        suggestions: [
          "获取最近一期企税预缴申报表与纳税调整明细表；",
          "核对研发费用加计扣除等优惠政策的适用依据；",
          "关注稽查补税对净利润的潜在影响。"
        ]
      };
    },
    R4: function (c, r) {
      return {
        title: "开票金额与申报收入不匹配",
        interpretation: c.name + "开票金额较增值税申报收入高 " + Math.abs(r.diffAmount) +
          " 万元（差异率 " + (r.diffRate * 100).toFixed(1) + "%）。" +
          "开票数据来自税控系统、难以调节，该差异通常直接指向申报收入少计，属于高敏感度稽查触发点。",
        suggestions: [
          "立即核对开票清单与申报表，定位未申报发票的归属期间；",
          "评估补申报、补税及滞纳金金额，并关注纳税信用评级下调风险；",
          "建议投后团队约谈 CFO，将申报整改纳入月度督办。"
        ]
      };
    },
    R5: function (c, r) {
      return {
        title: "收现比异常，收入含金量存疑",
        interpretation: c.name + "本期销售收现与营业收入差异 " + Math.abs(r.diffAmount) +
          " 万元，收现比明显偏离正常区间。" +
          "收现比过低常见于应收账款激进确认、渠道压货或回款恶化，需验证收入真实性。",
        suggestions: [
          "索取应收账款账龄表与前五大客户回款流水；",
          "核查是否存在期末突击确认收入、次月冲回的情况；",
          "将经营性现金流纳入下月投后跟踪的核心指标。"
        ]
      };
    },
    R6: function (c, r) {
      return {
        title: "工资总额与社保/个税申报基数不匹配",
        interpretation: c.name + "账面工资总额较社保/个税申报基数高 " + Math.abs(r.diffAmount) +
          " 万元（差异率 " + (r.diffRate * 100).toFixed(1) + "%）。" +
          "常见情形为按最低基数缴纳社保或现金发放薪酬未申报个税，存在补缴、罚款及劳动合规风险。",
        suggestions: [
          "核对企业员工花名册、工资表与社保申报人数及基数；",
          "测算按实际工资足额缴纳的补缴敞口（通常可追溯 2 年）；",
          "结合社保入税监管趋势，评估整改对人力成本的影响。"
        ]
      };
    }
  };

  /* ---------- 导出 ---------- */
  global.Rules = {
    RULES: RULES,
    filingStatus: filingStatus,
    evaluateCompany: evaluateCompany,
    /** 针对命中规则生成 AI 解读 */
    interpret: function (company, ruleResult) {
      var tpl = AI_TEMPLATES[ruleResult.id];
      return tpl ? tpl(company, ruleResult) : null;
    },
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    resolveConfig: resolveConfig,
    SCORE_DEDUCT: DEFAULT_CONFIG.scoreDeduct
  };
})(window);
