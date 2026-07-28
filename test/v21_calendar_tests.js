/* ============================================================
 * PortfoTax · V2.1 申报日历动态化测试（Node，无浏览器依赖）
 * 用法：node test/v21_calendar_tests.js
 * 覆盖：
 *   A. 默认月选择纯函数 pickDefaultMonth
 *      —— 演示数据 → 2026 年 6 月；全部已申报/无事项 → 真实当前月；
 *         导入企业更早未申报截止日 → 该月
 *   B. 月份平移 shiftMonth（跨年边界 12 月 → 1 月、1 月 → 12 月）
 *   C. DOM 桩渲染：默认月标题、条目按真实截止日落格、状态着色
 *   D. 月份导航：切换后渲染正确月份、非默认月轻提示、回到默认月、
 *      跨年导航（2026-06 +7 → 2027-01）
 *   E. 导入企业场景：默认月随导入企业最早未申报截止日变化，
 *      清除导入后回到 2026 年 6 月
 * ============================================================ */
"use strict";
const path = require("path");
const APP = path.join(__dirname, "..", "app");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? " | " + String(extra).slice(0, 140) : "")); }
}

/* ---------- 最小 DOM 桩（与 v2_dom_smoke 同构） ---------- */
function makeEl() {
  return {
    innerHTML: "", value: "", checked: false, style: {},
    classList: { toggle: function () {} },
    getAttribute: function () { return null; },
    setAttribute: function () {}, appendChild: function () {},
    removeChild: function () {}, click: function () {}
  };
}
const els = { app: makeEl() };
const handlers = {};

global.window = global;
global.document = {
  getElementById: function (id) { return els[id] || (els[id] = makeEl()); },
  querySelectorAll: function () { return []; },
  createElement: function () { return makeEl(); },
  body: makeEl()
};
global.location = { hash: "#/dashboard" };
global.addEventListener = function (ev, fn) { handlers[ev] = fn; };
global.scrollTo = function () {};
// localStorage 故意不提供 → store.js 回落到内存存储

require(path.join(APP, "data", "demo.js"));
require(path.join(APP, "js", "rules.js"));
require(path.join(APP, "js", "store.js"));
require(path.join(APP, "js", "importer.js"));
require(path.join(APP, "js", "app.js")); // 加载即执行首次 route()

const DEMO = window.DEMO, Rules = window.Rules, Importer = window.Importer;
const App = window.PortfoTaxApp;
const pickDefaultMonth = App._pickDefaultMonth;
const shiftMonth = App._shiftMonth;

function p2(n) { return n < 10 ? "0" + n : "" + n; }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}
function go(hash) {
  global.location.hash = hash;
  handlers.hashchange();
  return els.app.innerHTML;
}
/** 由演示企业在演示基准日下展开日历 items（与 renderCalendar 同口径） */
function demoItems() {
  const items = [];
  DEMO.companies.forEach(function (c) {
    const ev = Rules.evaluateCompany(c, DEMO.meta.baseDate);
    ev.filings.forEach(function (fl) { items.push(fl); });
  });
  return items;
}

/* ---------- A. 默认月选择纯函数 ---------- */
console.log("== A. 默认月选择 pickDefaultMonth ==");
let dm = pickDefaultMonth(demoItems(), todayStr());
check("演示数据默认月 = 2026 年 6 月（最早未申报截止日 2026-06-12）",
  dm.y === 2026 && dm.m === 6, JSON.stringify(dm));

const allFiled = [
  { due: "2026-06-15", filed: "2026-06-12" },
  { due: "2026-07-15", filed: "2026-07-10" }
];
dm = pickDefaultMonth(allFiled, todayStr());
const realNow = new Date();
check("全部已申报 → 回退真实当前月（" + realNow.getFullYear() + "-" + p2(realNow.getMonth() + 1) + "）",
  dm.y === realNow.getFullYear() && dm.m === realNow.getMonth() + 1, JSON.stringify(dm));

dm = pickDefaultMonth([], todayStr());
check("无申报事项 → 同样回退真实当前月",
  dm.y === realNow.getFullYear() && dm.m === realNow.getMonth() + 1, JSON.stringify(dm));

const mixed = demoItems().concat([{ due: "2025-01-15", filed: null }]); // 模拟导入企业更早未申报
dm = pickDefaultMonth(mixed, todayStr());
check("含更早未申报截止日（2025-01-15）→ 默认月 2025 年 1 月",
  dm.y === 2025 && dm.m === 1, JSON.stringify(dm));

const onlyJuly = [
  { due: "2026-06-15", filed: "2026-06-14" }, // 已申报，不参与
  { due: "2026-07-15", filed: null }
];
dm = pickDefaultMonth(onlyJuly, todayStr());
check("6 月事项全部已申报、7 月未申报 → 默认月 2026 年 7 月",
  dm.y === 2026 && dm.m === 7, JSON.stringify(dm));

/* ---------- B. 月份平移（跨年边界） ---------- */
console.log("== B. shiftMonth 跨年边界 ==");
let sm = shiftMonth(2026, 12, 1);
check("2026-12 +1 → 2027-01", sm.y === 2027 && sm.m === 1, JSON.stringify(sm));
sm = shiftMonth(2026, 1, -1);
check("2026-01 -1 → 2025-12", sm.y === 2025 && sm.m === 12, JSON.stringify(sm));
sm = shiftMonth(2026, 6, -6);
check("2026-06 -6 → 2025-12", sm.y === 2025 && sm.m === 12, JSON.stringify(sm));
sm = shiftMonth(2026, 6, 12);
check("2026-06 +12 → 2027-06", sm.y === 2027 && sm.m === 6, JSON.stringify(sm));

/* ---------- C. DOM 渲染：默认月与落格 ---------- */
console.log("== C. 日历网格渲染（演示模式）==");
let html = go("#/calendar");
check("默认展示 2026 年 6 月（最早未申报截止日所在月）",
  /2026 年 6 月申报日历/.test(html) && /<span class="cal-nav-title">2026 年 6 月<\/span>/.test(html));
check("含月份导航控件（上一月/下一月/回到默认月）",
  /上一月/.test(html) && /下一月/.test(html) && /回到默认月/.test(html));
check("默认月不出现「当前浏览」轻提示", !/当前浏览：/.test(html));
check("条目按真实截止日落格：15 日格含 云启智造·增值税",
  /<span class="d">15[\s\S]{0,400}?云启智造 · 增值税/.test(html));
check("12 日格含 拾味餐饮·印花税（逾期着色 s-逾期）",
  /<span class="d">12[\s\S]{0,300}?cal-item s-逾期[^>]*title="拾味餐饮/.test(html));
check("25 日格含 云启智造·印花税（未到期着色 s-未到期）",
  /<span class="d">25[\s\S]{0,300}?cal-item s-未到期[^>]*title="云启智造/.test(html));
check("7 月到期的企业所得税不在 6 月网格中", !/企业所得税<\/div>/.test(html));
check("「今天」标记落在基准日 2026-06-20", /<span class="d">20 <span[^>]*>今天/.test(html));

/* ---------- D. 月份导航 ---------- */
console.log("== D. 月份导航 ==");
App.calNav(1);
html = els.app.innerHTML;
check("下一月 → 渲染 2026 年 7 月", /<span class="cal-nav-title">2026 年 7 月<\/span>/.test(html));
check("7 月网格含 云启智造·企业所得税（季报，截止 07-15）",
  /<span class="d">15[\s\S]{0,400}?云启智造 · 企业所得税/.test(html));
check("非默认月出现轻提示「当前浏览：2026 年 7 月」", /当前浏览：2026 年 7 月/.test(html));
check("轻提示标注默认月（2026 年 6 月）", /默认月：2026 年 6 月/.test(html));
check("6 月的增值税条目不再出现", !/云启智造 · 增值税/.test(html));

App.calNav(-1);
html = els.app.innerHTML;
check("回到 6 月后轻提示消失",
  /<span class="cal-nav-title">2026 年 6 月<\/span>/.test(html) && !/当前浏览：/.test(html));

for (let i = 0; i < 7; i++) App.calNav(1); // 2026-06 +7 → 2027-01
html = els.app.innerHTML;
check("跨年导航：2026-06 连续 +7 → 2027 年 1 月",
  /<span class="cal-nav-title">2027 年 1 月<\/span>/.test(html) && /当前浏览：2027 年 1 月/.test(html));
App.calNav(-1);
html = els.app.innerHTML;
check("跨年回退：2027-01 -1 → 2026 年 12 月",
  /<span class="cal-nav-title">2026 年 12 月<\/span>/.test(html));

App.calReset();
html = els.app.innerHTML;
check("「回到默认月」→ 恢复 2026 年 6 月且轻提示消失",
  /<span class="cal-nav-title">2026 年 6 月<\/span>/.test(html) && !/当前浏览：/.test(html));

App.calNav(1);
go("#/dashboard");
html = go("#/calendar");
check("离开日历页再进入 → 自动回到默认月（2026 年 6 月）",
  /<span class="cal-nav-title">2026 年 6 月<\/span>/.test(html) && !/当前浏览：/.test(html));

/* ---------- E. 导入企业场景 ---------- */
console.log("== E. 导入企业影响默认月 ==");
const impFin = Importer.parseFinanceCSV(
  Importer.FINANCE_HEADERS.join(",") + "\n" +
  "imp01,远山科技,硬科技,A轮,北京·海淀,2024-05,900,900,900,120,500,610,10,150,150,950,120,120\n",
  { yunqi: 1, hemu: 1, xinglian: 1, chengguang: 1, lixin: 1, shiwei: 1 });
const impFil = Importer.parseFilingsCSV(
  '"企业ID","税种","所属期间","申报截止日(YYYY-MM-DD)","申报完成日(YYYY-MM-DD,未申报留空)","税额(万元)"\n' +
  "imp01,增值税,2024-12,2025-01-15,,30\n",
  { imp01: 1 });
check("导入企业（含 2025-01-15 未申报截止日）解析成功",
  impFin.companies.length === 1 && impFil.byId.imp01.length === 1,
  JSON.stringify(impFin.errors).slice(0, 80));
impFin.companies[0].filings = impFil.byId.imp01;
window.Store.set("imported", impFin.companies);

html = go("#/calendar");
check("导入企业更早未申报 → 默认月变为 2025 年 1 月",
  /<span class="cal-nav-title">2025 年 1 月<\/span>/.test(html));
check("2025-01-15 格内出现 远山科技·增值税（导入企业按真实当天评估 → 逾期）",
  /<span class="d">15[\s\S]{0,300}?cal-item s-逾期[^>]*title="远山科技/.test(html));

window.Store.set("imported", []);
html = go("#/calendar");
check("清除导入后默认月回到 2026 年 6 月",
  /<span class="cal-nav-title">2026 年 6 月<\/span>/.test(html));

/* ---------- F. 风险提醒与状态统计保持全量动态 ---------- */
console.log("== F. 全量动态计算不受浏览月份影响 ==");
App.calNav(1); // 浏览 7 月
html = els.app.innerHTML;
check("浏览 7 月时风险提醒列表仍含 6 月逾期事项（拾味餐饮）",
  /风险提醒/.test(html) && /拾味餐饮/.test(html));
check("浏览 7 月时状态统计仍为全量（逾期 6 项）", />逾期 6</.test(html));
App.calReset();

/* ---------- 汇总 ---------- */
console.log("=".repeat(60));
console.log("结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
