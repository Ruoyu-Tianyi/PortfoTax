/* ============================================================
 * PortfoTax · 扩展测试数据自动校验
 * 用法：node verify.js
 * 加载 extra_companies.js + ../app/js/rules.js，
 * 对每家企业运行 Rules.evaluateCompany，与预期逐项比对。
 * ============================================================ */
"use strict";
const path = require("path");

global.window = {};
require(path.join(__dirname, "extra_companies.js"));
require(path.join(__dirname, "..", "app", "js", "rules.js"));

const DEMO = window.DEMO;
const Rules = window.Rules;
const BASE = DEMO.meta.baseDate; // 2026-06-20

/* ---------- 预期定义 ---------- */
const EXPECTED = [
  {
    id: "bianjie",
    hits: {},                       // 无规则命中
    score: 100, level: "绿",
    overdueCount: 0, linqiCount: 0,
    lateFeeTotal: 0
  },
  {
    id: "linjie",
    hits: {},
    score: 96, level: "绿",
    overdueCount: 0, linqiCount: 1,
    lateFeeTotal: 0
  },
  {
    id: "hengxun",
    hits: { R3: "中" },
    score: 80, level: "黄",
    overdueCount: 0, linqiCount: 0,
    lateFeeTotal: 0
  },
  {
    id: "yaoshi",
    hits: { R1: "高", R2: "高", R4: "高", R5: "高", R6: "高" },
    score: 0, level: "红",
    overdueCount: 2, linqiCount: 1,
    lateFeeTotal: 0.9125          // 0.8 + 0.1125
  },
  {
    id: "anlan",
    hits: {},
    score: 100, level: "绿",
    overdueCount: 0, linqiCount: 0,
    lateFeeTotal: 0
  },
  {
    id: "hongyu",
    hits: {},
    score: 76, level: "黄",
    overdueCount: 2, linqiCount: 0,
    lateFeeTotal: 61.025          // 41.225 + 19.8
  }
];

/* ---------- 辅助 ---------- */
function fmtHits(res) {
  const m = {};
  res.rules.forEach(r => { if (r.hit) m[r.id] = r.severity; });
  return m;
}
function eq(a, b) { return Math.abs(a - b) < 1e-6; }
function sameHits(exp, act) {
  const ek = Object.keys(exp).sort(), ak = Object.keys(act).sort();
  if (ek.length !== ak.length) return false;
  return ek.every((k, i) => k === ak[i] && exp[k] === act[k]);
}

/* ---------- 执行 ---------- */
let pass = 0, fail = 0;
console.log("基准日:", BASE, "| 企业数:", DEMO.companies.length);
console.log("=".repeat(86));

DEMO.companies.forEach(c => {
  const exp = EXPECTED.find(e => e.id === c.id);
  const res = Rules.evaluateCompany(c, BASE);
  const actHits = fmtHits(res);
  const linqi = res.filings.filter(f => f.status === "临期").length;
  const lateFeeTotal = Math.round(res.filings.reduce((s, f) => s + f.lateFee, 0) * 1e4) / 1e4;

  const checks = [
    ["命中规则+严重度", sameHits(exp.hits, actHits), JSON.stringify(exp.hits), JSON.stringify(actHits)],
    ["健康分", res.score === exp.score, exp.score, res.score],
    ["等级", res.level === exp.level, exp.level, res.level],
    ["逾期数", res.overdueCount === exp.overdueCount, exp.overdueCount, res.overdueCount],
    ["临期数", linqi === exp.linqiCount, exp.linqiCount, linqi],
    ["滞纳金合计", eq(lateFeeTotal, exp.lateFeeTotal), exp.lateFeeTotal, lateFeeTotal]
  ];

  const bad = checks.filter(ch => !ch[1]);
  const tag = bad.length === 0 ? "PASS" : "FAIL";
  if (bad.length === 0) pass++; else fail++;

  console.log(`[${tag}] ${c.name}（${c.id}） score=${res.score} level=${res.level} hitCount=${res.hitCount} overdue=${res.overdueCount} 滞纳金=${lateFeeTotal}万`);

  // 打印规则差异率明细（便于审计边界值）
  res.rules.forEach(r => {
    console.log(`      ${r.id} ${r.name}: hit=${r.hit} diffRate=${r.diffRate} sev=${r.severity || "-"}`);
  });
  res.filings.forEach(f => {
    console.log(`      申报 ${f.tax}(${f.period}): ${f.status} overdueDays=${f.overdueDays} lateFee=${f.lateFee}`);
  });

  bad.forEach(ch => {
    console.log(`      ✗ ${ch[0]}: 预期=${ch[2]} 实测=${ch[3]}`);
  });
  console.log("-".repeat(86));
});

console.log(`结果：${pass} 通过 / ${fail} 失败 / 共 ${EXPECTED.length} 用例`);
process.exit(fail === 0 ? 0 : 1);
