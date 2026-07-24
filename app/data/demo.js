/* ============================================================
 * PortfoTax · 投后财税雷达 —— 演示数据（虚构）
 * 单位：万元（除特别注明）
 * 数据基准日：2026-06-20，报表期间：2026 年 5 月
 * 数据设定（与 spec.md 第 7 节一致）：
 *   云启智造   绿：全部规则通过
 *   禾沐生物   绿：规则通过，1 项临期申报（印花税）
 *   星链物流   黄：R2 账税差异 8%
 *   澄光新能源 黄：R5 收现比 0.55 异常 + 1 项逾期（个税）
 *   砺芯半导体 红：R1 三表勾稽断裂 33% + R6 社保基数差异 30% + 2 项逾期
 *   拾味餐饮   红：R4 发票-申报差异 14.3% + 3 项逾期
 * ============================================================ */
window.DEMO = {
  meta: {
    appName: "PortfoTax · 投后财税雷达",
    fundName: "智汇创投二期基金",
    baseDate: "2026-06-20",
    period: "2026-05",
    periodLabel: "2026 年 5 月",
    unit: "万元"
  },

  companies: [
    {
      id: "yunqi",
      name: "云启智造",
      industry: "工业软件",
      round: "B轮",
      region: "上海 · 浦东",
      investDate: "2024-03",
      finance: {
        revenue: 1200,            // 账面营业收入
        vatDeclaredSales: 1200,   // 增值税申报销售额
        invoicedAmount: 1200,     // 开票金额
        netProfit: 180,           // 净利润
        retainedBegin: 850,       // 未分配利润（期初）
        retainedEnd: 1010,        // 未分配利润（期末）
        dividend: 20,             // 本期分红
        totalProfit: 240,         // 利润总额
        citTaxableIncome: 240,    // 企税申报应纳税所得额
        cashFromSales: 1260,      // 销售商品、提供劳务收到的现金
        payrollTotal: 200,        // 工资总额
        socialBase: 200           // 社保/个税申报基数
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-12", taxAmount: 78 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-13", taxAmount: 26 },
        { tax: "印花税",             period: "2026-Q2",  due: "2026-06-25", filed: null,        taxAmount: 1.2 },
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    {
      id: "hemu",
      name: "禾沐生物",
      industry: "创新药",
      round: "A轮",
      region: "江苏 · 苏州",
      investDate: "2024-09",
      finance: {
        revenue: 300,
        vatDeclaredSales: 300,
        invoicedAmount: 305,
        netProfit: 18,
        retainedBegin: -120,
        retainedEnd: -102,
        dividend: 0,
        totalProfit: 25,
        citTaxableIncome: 25,
        cashFromSales: 310,
        payrollTotal: 150,
        socialBase: 150
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-11", taxAmount: 12 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-14", taxAmount: 9 },
        { tax: "印花税",             period: "2026-Q2",  due: "2026-06-22", filed: null,        taxAmount: 0.8 },  // 临期（2 天）
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    {
      id: "xinglian",
      name: "星链物流",
      industry: "智慧物流",
      round: "C轮",
      region: "浙江 · 杭州",
      investDate: "2023-06",
      finance: {
        revenue: 5000,
        vatDeclaredSales: 4600,   // R2：账面 vs 申报差 400 万，差异率 8%（>5%）
        invoicedAmount: 4620,     // 与申报口径一致，R4 不命中（差异指向未开票收入）
        netProfit: 250,
        retainedBegin: 2000,
        retainedEnd: 2230,
        dividend: 20,
        totalProfit: 330,
        citTaxableIncome: 330,
        cashFromSales: 5100,
        payrollTotal: 800,
        socialBase: 800
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-14", taxAmount: 210 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-15", taxAmount: 58 },
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    {
      id: "chengguang",
      name: "澄光新能源",
      industry: "光伏组件",
      round: "B轮",
      region: "安徽 · 合肥",
      investDate: "2024-01",
      finance: {
        revenue: 8000,
        vatDeclaredSales: 8000,
        invoicedAmount: 8100,
        netProfit: 400,
        retainedBegin: 3000,
        retainedEnd: 3400,
        dividend: 0,
        totalProfit: 520,
        citTaxableIncome: 520,
        cashFromSales: 4400,      // R5：收现比 0.55（<0.7），差异 3600 万
        payrollTotal: 600,
        socialBase: 600
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-13", taxAmount: 420 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 18 },  // 逾期 5 天
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    {
      id: "lixin",
      name: "砺芯半导体",
      industry: "芯片设计",
      round: "A轮",
      region: "广东 · 深圳",
      investDate: "2025-02",
      finance: {
        revenue: 2000,
        vatDeclaredSales: 2000,
        invoicedAmount: 2000,
        netProfit: 150,
        retainedBegin: 900,
        retainedEnd: 1100,        // R1：净利润 150 ≠ 未分配利润变动 200 + 分红 0，差异 50 万（33%）
        dividend: 0,
        totalProfit: 200,
        citTaxableIncome: 200,
        cashFromSales: 2100,
        payrollTotal: 500,
        socialBase: 350           // R6：社保基数低于工资总额 150 万（30%）
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 130 }, // 逾期 5 天
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 25 },  // 逾期 5 天
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    {
      id: "shiwei",
      name: "拾味餐饮",
      industry: "连锁餐饮",
      round: "天使轮",
      region: "四川 · 成都",
      investDate: "2025-08",
      finance: {
        revenue: 600,
        vatDeclaredSales: 600,
        invoicedAmount: 700,      // R4：开票 700 vs 申报 600，差异 100 万（14.3%）
        netProfit: 30,
        retainedBegin: 100,
        retainedEnd: 130,
        dividend: 0,
        totalProfit: 40,
        citTaxableIncome: 40,
        cashFromSales: 630,
        payrollTotal: 180,
        socialBase: 180
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 36 },  // 逾期 5 天
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 9 },   // 逾期 5 天
        { tax: "印花税",             period: "2026-Q2",  due: "2026-06-12", filed: null,        taxAmount: 2 }    // 逾期 8 天
      ]
    }
  ]
};
