/* ============================================================
 * PortfoTax · 投后财税雷达 —— 扩展测试数据（虚构）
 * 单位：万元（除特别注明）
 * 数据基准日：2026-06-20，报表期间：2026 年 5 月
 * 用途：边界与压力场景测试，结构与导出方式与 app/data/demo.js
 *       完全一致（window.DEMO），可作为 demo.js 的替换文件使用。
 * 配套：expected_results.md（预期用例表）、verify.js（自动校验）
 *
 * 用例总览：
 *   边界精密   绿：R2/R4 差异率恰好 = 5% 阈值 → 不命中（验证严格 > 口径）
 *   临界智造   绿：R2 差异率 4.9% 不命中 + R6 恰好 = 10% 不命中 + 1 项临期
 *   恒迅科技   黄：R5 收现比恰好 = 0.70 不命中 + R3 差异 12% 命中（中）
 *   曜石集团   红：同时命中 5 条规则（R1/R2/R4/R5/R6 全高）+ 2 逾期 + 1 临期
 *   安澜医药   绿：全部合规、无任何临期/逾期的完美绿色案例
 *   宏宇建设   黄：规则全通过，但高税额 × 长逾期 → 大额滞纳金
 * ============================================================ */
window.DEMO = {
  meta: {
    appName: "PortfoTax · 投后财税雷达",
    fundName: "智汇创投二期基金（扩展测试组合）",
    baseDate: "2026-06-20",
    period: "2026-05",
    periodLabel: "2026 年 5 月",
    unit: "万元"
  },

  companies: [
    /* ----------------------------------------------------------
     * 用例 1 · 边界精密 —— 差异率恰好等于 5% 阈值
     * 预期命中：无规则命中（R2、R4 差异率均恰好 0.05，
     *           引擎为严格 > 口径，等于阈值不命中）
     * 预期：健康分 100，绿，hitCount 0，逾期 0
     * 验证点：R2/R4 阈值为 > 而非 >=
     * ---------------------------------------------------------- */
    {
      id: "bianjie",
      name: "边界精密",
      industry: "精密仪器",
      round: "B轮",
      region: "江苏 · 无锡",
      investDate: "2024-05",
      finance: {
        revenue: 2000,
        vatDeclaredSales: 1900,   // R2：|2000-1900|/2000 = 5.0% 恰好等于阈值 → 不命中
        invoicedAmount: 2000,     // R4：|2000-1900|/2000 = 5.0% 恰好等于阈值 → 不命中
        netProfit: 150,
        retainedBegin: 500,
        retainedEnd: 650,         // R1：150 = (650-500) + 0，勾稽一致
        dividend: 0,
        totalProfit: 200,
        citTaxableIncome: 200,    // R3 一致
        cashFromSales: 2100,      // R5：收现比 1.05，正常
        payrollTotal: 400,
        socialBase: 400           // R6 一致
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-12", taxAmount: 95 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-13", taxAmount: 20 },
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }  // 未到期
      ]
    },

    /* ----------------------------------------------------------
     * 用例 2 · 临界智造 —— 差异率 4.9% 不命中（近失案例）
     * 预期命中：无规则命中（R2 = 4.9% < 5%；R6 恰好 = 10%，
     *           严格 > 口径不命中）
     * 预期：健康分 96，绿，hitCount 0，1 项临期（印花税）
     * 验证点：阈值下方近失不命中；R6 阈值同为严格 > 口径
     * ---------------------------------------------------------- */
    {
      id: "linjie",
      name: "临界智造",
      industry: "智能装备",
      round: "A轮",
      region: "广东 · 佛山",
      investDate: "2025-01",
      finance: {
        revenue: 1000,
        vatDeclaredSales: 951,    // R2：|1000-951|/1000 = 4.9% < 5% → 不命中
        invoicedAmount: 951,      // R4：与申报一致 → 不命中
        netProfit: 60,
        retainedBegin: 200,
        retainedEnd: 260,         // R1 勾稽一致
        dividend: 0,
        totalProfit: 80,
        citTaxableIncome: 80,     // R3 一致
        cashFromSales: 1000,      // R5：收现比 1.00，正常
        payrollTotal: 500,
        socialBase: 450           // R6：|500-450|/500 = 10.0% 恰好等于阈值 → 不命中
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-11", taxAmount: 40 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-14", taxAmount: 15 },
        { tax: "印花税",             period: "2026-Q2",  due: "2026-06-23", filed: null,        taxAmount: 0.6 }, // 临期（3 天）
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    /* ----------------------------------------------------------
     * 用例 3 · 恒迅科技 —— 收现比临界（恰好 0.70 不命中）
     * 预期命中：R3（差异 12%，中）；R5 收现比恰好 = 0.70 → 不命中
     * 预期：健康分 80，黄，hitCount 1，逾期 0
     * 验证点：R5 下界为严格 < 口径（0.70 不命中，0.69 才命中）；
     *         R3 阈值 10% 上方命中、严重度分档（10%<12%<25% → 中）
     * ---------------------------------------------------------- */
    {
      id: "hengxun",
      name: "恒迅科技",
      industry: "企业服务 SaaS",
      round: "C轮",
      region: "北京 · 海淀",
      investDate: "2023-09",
      finance: {
        revenue: 1500,
        vatDeclaredSales: 1500,   // R2 一致
        invoicedAmount: 1500,     // R4 一致
        netProfit: 70,
        retainedBegin: 300,
        retainedEnd: 370,         // R1 勾稽一致
        dividend: 0,
        totalProfit: 100,
        citTaxableIncome: 88,     // R3：|100-88|/100 = 12% > 10% → 命中（中）
        cashFromSales: 1050,      // R5：收现比恰好 0.70 → 不命中（严格 < 口径）
        payrollTotal: 300,
        socialBase: 300           // R6 一致
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-13", taxAmount: 60 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-14", taxAmount: 18 },
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    /* ----------------------------------------------------------
     * 用例 4 · 曜石集团 —— 极端红色：单家同时命中 5 条规则
     * 预期命中：R1（50%，高）、R2（20%，高）、R4（20%，高）、
     *           R5（收现比 0.40，高）、R6（33.3%，高）；仅 R3 不命中
     * 预期：健康分 0（100 − 30×5 截断至 0），红，hitCount 5，
     *       2 项逾期（增值税/个税各 5 天）+ 1 项临期（印花税）
     * 验证点：多规则同时命中的扣分叠加与 0 分下限截断；
     *         引擎能区分唯一不命中的 R3
     * ---------------------------------------------------------- */
    {
      id: "yaoshi",
      name: "曜石集团",
      industry: "大宗贸易",
      round: "Pre-IPO",
      region: "上海 · 虹口",
      investDate: "2022-11",
      finance: {
        revenue: 3000,
        vatDeclaredSales: 2400,   // R2：|3000-2400|/3000 = 20% > 15% → 命中（高）
        invoicedAmount: 3000,     // R4：|3000-2400|/3000 = 20% > 15% → 命中（高）
        netProfit: 200,
        retainedBegin: 800,
        retainedEnd: 1100,        // R1：200 vs (1100-800)+0=300，|200-300|/200 = 50% → 命中（高）
        dividend: 0,
        totalProfit: 260,
        citTaxableIncome: 260,    // R3 一致（故意保留唯一不命中规则）
        cashFromSales: 1200,      // R5：收现比 0.40 < 0.5 → 命中（高）
        payrollTotal: 600,
        socialBase: 400           // R6：|600-400|/600 = 33.3% > 25% → 命中（高）
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 320 }, // 逾期 5 天，滞纳金 0.8
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: null,        taxAmount: 45 },  // 逾期 5 天，滞纳金 0.1125
        { tax: "印花税",             period: "2026-Q2",  due: "2026-06-22", filed: null,        taxAmount: 3 },   // 临期（2 天）
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }
      ]
    },

    /* ----------------------------------------------------------
     * 用例 5 · 安澜医药 —— 完美绿色：全部合规、无临期无逾期
     * 预期命中：无规则命中；申报全部已申报或未到期（无临期）
     * 预期：健康分 100，绿，hitCount 0，逾期 0，临期 0
     * 验证点：零扣分基准案例；含分红的三表勾稽（600 = 540 + 60）
     * ---------------------------------------------------------- */
    {
      id: "anlan",
      name: "安澜医药",
      industry: "医疗器械",
      round: "D轮",
      region: "浙江 · 杭州",
      investDate: "2022-06",
      finance: {
        revenue: 5000,
        vatDeclaredSales: 5000,   // R2 一致
        invoicedAmount: 5000,     // R4 一致
        netProfit: 600,
        retainedBegin: 2000,
        retainedEnd: 2540,        // R1：600 = (2540-2000) + 60，含分红勾稽一致
        dividend: 60,
        totalProfit: 800,
        citTaxableIncome: 800,    // R3 一致
        cashFromSales: 5200,      // R5：收现比 1.04，正常
        payrollTotal: 900,
        socialBase: 900           // R6 一致
      },
      filings: [
        { tax: "增值税",             period: "2026-05", due: "2026-06-15", filed: "2026-06-10", taxAmount: 260 },
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-11", taxAmount: 72 },
        { tax: "印花税",             period: "2026-Q2",  due: "2026-06-25", filed: "2026-06-18", taxAmount: 2.5 },
        { tax: "企业所得税（季报）",    period: "2026-Q2",  due: "2026-07-15", filed: null,        taxAmount: 0 }  // 未到期
      ]
    },

    /* ----------------------------------------------------------
     * 用例 6 · 宏宇建设 —— 大额滞纳金：高税额 × 长逾期
     * 预期命中：无规则命中（财务面全部一致），但 2 项长逾期：
     *   增值税 850 万，逾期 97 天 → 滞纳金 850×0.0005×97 = 41.225 万
     *   企税汇算 600 万，逾期 66 天 → 滞纳金 600×0.0005×66 = 19.8 万
     *   合计滞纳金 61.025 万
     * 预期：健康分 76（100 − 12×2），黄，hitCount 0，逾期 2
     * 验证点：滞纳金公式（0.05%/日）与大额长逾期计算；
     *         仅申报维度扣分时的等级落点（黄而非红）
     * ---------------------------------------------------------- */
    {
      id: "hongyu",
      name: "宏宇建设",
      industry: "绿色建筑",
      round: "B轮",
      region: "湖北 · 武汉",
      investDate: "2023-12",
      finance: {
        revenue: 6000,
        vatDeclaredSales: 6000,   // R2 一致
        invoicedAmount: 6000,     // R4 一致
        netProfit: 500,
        retainedBegin: 1500,
        retainedEnd: 1950,        // R1：500 = (1950-1500) + 50，含分红勾稽一致
        dividend: 50,
        totalProfit: 660,
        citTaxableIncome: 660,    // R3 一致
        cashFromSales: 6300,      // R5：收现比 1.05，正常
        payrollTotal: 1000,
        socialBase: 1000          // R6 一致
      },
      filings: [
        { tax: "增值税",             period: "2026-02", due: "2026-03-15", filed: null,        taxAmount: 850 }, // 逾期 97 天，滞纳金 41.225
        { tax: "企业所得税（汇算清缴）", period: "2025-FY", due: "2026-04-15", filed: null,        taxAmount: 600 }, // 逾期 66 天，滞纳金 19.8
        { tax: "个人所得税（代扣代缴）", period: "2026-05", due: "2026-06-15", filed: "2026-06-14", taxAmount: 55 }
      ]
    }
  ]
};
