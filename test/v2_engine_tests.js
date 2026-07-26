/* ============================================================
 * PortfoTax · V2 引擎与导入功能测试（Node，无浏览器依赖）
 * 用法：node test/v2_engine_tests.js
 * 覆盖：
 *   A. 默认配置演示回归（6 家：100/96/80/68/16/44，绿2/黄2/红2）
 *   B. CSV 解析（BOM / 引号包裹字段 / "" 转义 / CRLF）
 *   C. 导入构建与行级校验（财务科目 + 申报记录）
 *   D. 动态基准日影响逾期/临期状态
 *   E. 自定义阈值/权重改变命中结果
 *   F. 恢复默认后回归 + 配置深合并
 * ============================================================ */
"use strict";
const path = require("path");
const APP = path.join(__dirname, "..", "app");

global.window = {};
require(path.join(APP, "data", "demo.js"));
require(path.join(APP, "js", "rules.js"));
require(path.join(APP, "js", "store.js"));
require(path.join(APP, "js", "importer.js"));

const DEMO = window.DEMO, Rules = window.Rules, Importer = window.Importer;
const BASE = DEMO.meta.baseDate; // 2026-06-20

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? " | " + extra : "")); }
}
function hitsOf(res) {
  const m = {};
  res.rules.forEach(r => { if (r.hit) m[r.id] = r.severity; });
  return m;
}
function sameHits(exp, act) {
  const ek = Object.keys(exp).sort(), ak = Object.keys(act).sort();
  return ek.length === ak.length && ek.every((k, i) => k === ak[i] && exp[k] === act[k]);
}
const byId = {};
DEMO.companies.forEach(c => { byId[c.id] = c; });

/* ---------- A. 默认配置演示回归 ---------- */
console.log("== A. 默认配置演示回归（基准日 " + BASE + "）==");
const EXPECT = {
  yunqi:      { score: 100, level: "绿", hits: {}, overdue: 0 },
  hemu:       { score: 96,  level: "绿", hits: {}, overdue: 0 },
  xinglian:   { score: 80,  level: "黄", hits: { R2: "中" }, overdue: 0 },
  chengguang: { score: 68,  level: "黄", hits: { R5: "中" }, overdue: 1 },
  lixin:      { score: 16,  level: "红", hits: { R1: "高", R6: "高" }, overdue: 2 },
  shiwei:     { score: 44,  level: "红", hits: { R4: "中" }, overdue: 3 }
};
const levels = { "绿": 0, "黄": 0, "红": 0 };
DEMO.companies.forEach(c => {
  const res = Rules.evaluateCompany(c, BASE); // 省略 config = 默认
  const exp = EXPECT[c.id];
  levels[res.level]++;
  check(c.name + " 健康分=" + exp.score, res.score === exp.score, "实测 " + res.score);
  check(c.name + " 等级=" + exp.level, res.level === exp.level, "实测 " + res.level);
  check(c.name + " 规则命中 " + JSON.stringify(exp.hits), sameHits(exp.hits, hitsOf(res)), JSON.stringify(hitsOf(res)));
  check(c.name + " 逾期数=" + exp.overdue, res.overdueCount === exp.overdue, "实测 " + res.overdueCount);
});
check("等级分布 绿2/黄2/红2", levels["绿"] === 2 && levels["黄"] === 2 && levels["红"] === 2, JSON.stringify(levels));

/* ---------- B. CSV 解析 ---------- */
console.log("== B. CSV 解析 ==");
let r = Importer.parseCSV("﻿企业ID,企业名称\na1,测试");
check("UTF-8 BOM 自动去除", r[0][0] === "企业ID", JSON.stringify(r[0]));
r = Importer.parseCSV('x,"y,z","q""q"');
check("引号包裹字段（内嵌逗号 + \"\" 转义）", r[0][0] === "x" && r[0][1] === "y,z" && r[0][2] === 'q"q', JSON.stringify(r[0]));
r = Importer.parseCSV("a,b\r\n1,2\r\n3,4");
check("CRLF 行尾", r.length === 3 && r[1][1] === "2" && r[2][0] === "3", JSON.stringify(r));
r = Importer.parseCSV("a,b\n\n1,2\n");
check("空行保留语义正确（解析层）", r.length === 3, JSON.stringify(r));
r = Importer.parseCSV('"多\n行",b');
check("引号内换行", r.length === 1 && r[0][0] === "多\n行", JSON.stringify(r));

/* ---------- C. 导入构建与行级校验 ---------- */
console.log("== C. 导入构建与行级校验 ==");
const finText = Importer.templateFinanceCSV();
const filText = Importer.templateFilingCSV();
check("模板财务 CSV 识别为 finance", Importer.detectType(finText) === "finance");
check("模板申报 CSV 识别为 filings", Importer.detectType(filText) === "filings");
check("乱表头返回 null", Importer.detectType("a,b,c\n1,2,3") === null);

let fin = Importer.parseFinanceCSV(finText, {});
check("模板财务 CSV 解析出 2 家企业", fin.companies.length === 2 && fin.errors.length === 0,
  "companies=" + fin.companies.length + " errors=" + JSON.stringify(fin.errors));
check("解析字段口径正确（星链 revenue=5000）",
  fin.companies[1].finance.revenue === 5000 && fin.companies[1].finance.socialBase === 800);
check("导入企业带 imported 标记", fin.companies.every(c => c.imported === true));

const dup = Importer.parseFinanceCSV(finText, { yunqi: 1 });
check("企业ID 与组合重复 → 行级报错且该行不导入",
  dup.companies.length === 1 && dup.errors.some(m => /第 2 行.*重复/.test(m)), JSON.stringify(dup.errors));

const badNum = Importer.parseFinanceCSV(
  Importer.FINANCE_HEADERS.join(",") + "\n" +
  "t1,测试企业,行业,轮次,地区,2024-01,abc,1,1,1,1,1,1,1,1,1,1,1\n", {});
check("非数字科目 → 行级报错（含行号与字段名）",
  badNum.companies.length === 0 && badNum.errors.some(m => /第 2 行.*账面营业收入.*不是有效数字/.test(m)),
  JSON.stringify(badNum.errors));

const badHead = Importer.parseFinanceCSV("企业ID,企业名称\na,b", {});
check("表头不一致 → 整文件拒绝", badHead.companies.length === 0 && /表头/.test(badHead.errors[0]));

const fil = Importer.parseFilingsCSV(filText, { yunqi: 1, xinglian: 1 });
check("申报记录解析：云启 4 条", fil.byId.yunqi.length === 4 && fil.errors.length === 0, JSON.stringify(fil.errors));
check("未申报留空 → filed=null", fil.byId.yunqi[2].filed === null && fil.byId.yunqi[2].tax === "印花税");
check("已申报日期保留", fil.byId.yunqi[0].filed === "2026-06-12");

const orphan = Importer.parseFilingsCSV(filText, {});
check("申报记录 企业ID 不在财务表 → 逐行报错",
  orphan.errors.length === 7 && orphan.errors.every(m => /不在本次导入的财务科目表中/.test(m)),
  "errors=" + orphan.errors.length);

const filHeaderLine = filText.split("\n")[0]; // 含引号包裹的规范表头
const badDate = Importer.parseFilingsCSV(
  filHeaderLine + "\nt1,增值税,2026-05,2026-13-45,,7.5\n", { t1: 1 });
check("非法截止日 → 行级报错", badDate.errors.some(m => /申报截止日/.test(m)), JSON.stringify(badDate.errors));

/* ---------- D. 动态基准日影响逾期状态 ---------- */
console.log("== D. 动态基准日 ==");
const cg = byId.chengguang; // 个税 due 2026-06-15 未申报
const at0614 = Rules.evaluateCompany(cg, "2026-06-14");
const at0620 = Rules.evaluateCompany(cg, "2026-06-20");
const at0610 = Rules.evaluateCompany(cg, "2026-06-10");
check("06-14：个税临期（距截止 1 天）", at0614.filings[1].status === "临期", at0614.filings[1].status);
check("06-20：个税逾期 5 天", at0620.filings[1].status === "逾期" && at0620.filings[1].overdueDays === 5,
  at0620.filings[1].status + "/" + at0620.filings[1].overdueDays);
check("06-10：个税未到期", at0610.filings[1].status === "未到期", at0610.filings[1].status);
check("基准日前移改变健康分（06-14=" + at0614.score + " vs 06-20=" + at0620.score + "）",
  at0614.score !== at0620.score);
check("06-14 健康分=76（R5中 −20，临期 −4）", at0614.score === 76, "实测 " + at0614.score);
// 100 − R5中20 − 临期4 = 76
const lx0614 = Rules.evaluateCompany(byId.lixin, "2026-06-14");
check("砺芯 06-14：2 项临期、健康分 32", lx0614.overdueCount === 0 && lx0614.score === 32, "score=" + lx0614.score);

/* ---------- E. 自定义阈值/权重改变命中结果 ---------- */
console.log("== E. 自定义配置 ==");
let res = Rules.evaluateCompany(byId.xinglian, BASE, { r2: { rate: 0.10 } });
check("R2 阈值 5%→10%：星链 8% 不再命中，得分 100", !res.rules[1].hit && res.score === 100,
  "hit=" + res.rules[1].hit + " score=" + res.score);
check("公式文本随配置更新（含「阈值 10%」）", /阈值 10%/.test(res.rules[1].formula), res.rules[1].formula);

res = Rules.evaluateCompany(byId.xinglian, BASE, { scoreDeduct: { "中": 5 } });
check("扣分权重 中 20→5：星链命中 R2 但得分 95", res.rules[1].hit && res.score === 95, "score=" + res.score);

res = Rules.evaluateCompany(byId.lixin, BASE, { r1: { absTol: 60 } });
check("R1 绝对容忍额 60 万：砺芯差异 50 万不再命中 R1（得分 46）",
  !res.rules[0].hit && res.score === 46, "hit=" + res.rules[0].hit + " score=" + res.score);

res = Rules.evaluateCompany(byId.chengguang, BASE, { r5: { low: 0.5 } });
check("R5 区间下界 0.7→0.5：澄光 0.55 不再命中（得分 88）", !res.rules[4].hit && res.score === 88,
  "hit=" + res.rules[4].hit + " score=" + res.score);

res = Rules.evaluateCompany(byId.shiwei, BASE, { r4: { sevHigh: 0.10 } });
check("R4 严重度高边界 15%→10%：拾味 14.3% 严重度升「高」（得分 34）",
  res.rules[3].hit && res.rules[3].severity === "高" && res.score === 34,
  "sev=" + res.rules[3].severity + " score=" + res.score);

/* ---------- F. 恢复默认 + 深合并 ---------- */
console.log("== F. 恢复默认后回归 + 配置深合并 ==");
const merged = Rules.resolveConfig({ r2: { rate: 0.10 } });
check("深合并：覆盖项生效", merged.r2.rate === 0.10);
check("深合并：同规则其余字段保持默认", merged.r2.sevMid === 0.05 && merged.r2.sevHigh === 0.15);
check("深合并：其他规则保持默认", merged.r3.rate === 0.10 && merged.r5.low === 0.7 && merged.scoreDeduct["高"] === 30);
check("深合并不污染 DEFAULT_CONFIG", Rules.DEFAULT_CONFIG.r2.rate === 0.05);

let allBack = true;
DEMO.companies.forEach(c => {
  const res = Rules.evaluateCompany(c, BASE, null); // 恢复默认（显式 null）
  const exp = EXPECT[c.id];
  if (!(res.score === exp.score && res.level === exp.level && sameHits(exp.hits, hitsOf(res)))) allBack = false;
});
check("恢复默认后 6 家得分/等级/命中与基线完全一致", allBack);
const partialBack = Rules.evaluateCompany(byId.xinglian, BASE, {});
check("空对象配置等同默认（星链 80）", partialBack.score === 80, "score=" + partialBack.score);

/* ---------- 汇总 ---------- */
console.log("=".repeat(60));
console.log("结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
