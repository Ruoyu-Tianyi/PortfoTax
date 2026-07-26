/* ============================================================
 * PortfoTax · V2 DOM 桩冒烟测试（Node，无浏览器依赖）
 * 用法：node test/v2_dom_smoke.js
 * 用最小 DOM 桩加载全部前端脚本，逐路由渲染并断言关键标记：
 *   #/dashboard  #/company/:id  #/calendar  #/report/:id  #/settings
 * 另模拟：CSV 导入 → 卡片出现「导入」徽章；自定义配置 → 设置页
 * 显示「自定义」；恢复默认 → 显示「默认」。
 * ============================================================ */
"use strict";
const path = require("path");
const APP = path.join(__dirname, "..", "app");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? " | " + String(extra).slice(0, 120) : "")); }
}

/* ---------- 最小 DOM 桩（window = node global，模拟浏览器全局） ---------- */
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

function go(hash) {
  global.location.hash = hash;
  handlers.hashchange();
  return els.app.innerHTML;
}

/* ---------- 路由渲染 ---------- */
console.log("== 路由渲染（DOM 桩）==");
let html = els.app.innerHTML; // 首次加载 #/dashboard
check("#/dashboard 渲染（含标题/企业/KPI）",
  /组合总览/.test(html) && /云启智造/.test(html) && /组合平均健康分/.test(html));
check("#/dashboard 含「导入数据」入口", /导入数据/.test(html) && /下载财务科目模板/.test(html));
check("#/dashboard 标注基准日", new RegExp("演示基准日 " + window.DEMO.meta.baseDate).test(html));

html = go("#/company/yunqi");
check("#/company/:id 渲染", /云启智造/.test(html) && /一致性校验结果/.test(html) && /三表及申报关键数据/.test(html));

html = go("#/calendar");
check("#/calendar 渲染", /申报监测日历/.test(html) && /风险提醒/.test(html));

html = go("#/report/yunqi");
check("#/report/:id 渲染", /月度财税体检报告/.test(html) && /评估基准日：2026-06-20/.test(html));

html = go("#/settings");
check("#/settings 渲染", /系统设置/.test(html) && /健康分扣分权重/.test(html) && /规则阈值与严重度分档/.test(html));
check("#/settings 标注配置来源=默认", /当前配置来源：默认/.test(html));
check("#/settings 含基准日开关", /用真实当前日期评估演示数据/.test(html));

html = go("#/company/not_exist");
check("未知企业 ID → 空态提示", /未找到该企业/.test(html));

html = go("#/whatever");
check("未知路由回落 Dashboard", /组合总览/.test(html));

/* ---------- 模拟 CSV 导入 → Dashboard 同屏 + 徽章 + 持久化 ---------- */
console.log("== 导入企业渲染 ==");
const fin = window.Importer.parseFinanceCSV(window.Importer.templateFinanceCSV(), {
  yunqi: 1, hemu: 1, xinglian: 1, chengguang: 1, lixin: 1, shiwei: 1
});
// 模板中的 yunqi/xinglian 与演示 ID 冲突 → 报错；改用新 ID 构造一家
const custom = window.Importer.parseFinanceCSV(
  window.Importer.FINANCE_HEADERS.join(",") + "\n" +
  "imp01,远山科技,硬科技,A轮,北京·海淀,2024-05,900,900,900,120,500,610,10,150,150,950,120,120\n",
  { yunqi: 1, hemu: 1, xinglian: 1, chengguang: 1, lixin: 1, shiwei: 1 });
check("新企业解析成功", custom.companies.length === 1 && custom.errors.length === 0, JSON.stringify(custom.errors));
window.Store.set("imported", custom.companies);

html = go("#/dashboard");
check("导入企业与演示企业同屏展示", /远山科技/.test(html) && /云启智造/.test(html));
check("导入企业带「导入」徽章", /<span class="badge gray">导入<\/span>/.test(html));
check("导入企业卡片带删除按钮", /cc-del/.test(html));
check("KPI 覆盖数变为 7", /覆盖 7 家被投企业/.test(html));
check("导入企业基准日标注为实时", /（导入·实时）/.test(html));

// 刷新模拟：直接从 Store 读回（持久化层）
check("导入数据可持久化读回", (window.Store.get("imported", []) || []).length === 1);

// 单个删除（绕过 confirm，直接操作存储后重渲染）
window.Store.set("imported", []);
html = go("#/dashboard");
check("删除后恢复 6 家", /覆盖 6 家被投企业/.test(html) && !/远山科技/.test(html));

/* ---------- 自定义配置 → 设置页来源标识 → 恢复默认 ---------- */
console.log("== 配置来源标识 ==");
window.Store.set("config", { r2: { rate: 0.10 } });
html = go("#/settings");
check("自定义配置 → 设置页显示「自定义」", /当前配置来源：自定义/.test(html));
html = go("#/dashboard");
check("Dashboard 标注「规则参数：自定义」", /规则参数：自定义/.test(html));
// 强断言：排行区星链物流得分 100
const m = html.match(/星链物流<\/a><\/span>[\s\S]{0,120}?rank-score[^>]*>(\d+)</);
check("排行区星链得分=100（自定义 R2 阈值）", m && Number(m[1]) === 100, m && m[1]);

window.Store.remove("config"); // 恢复默认
html = go("#/settings");
check("恢复默认 → 设置页显示「默认」", /当前配置来源：默认/.test(html));
html = go("#/dashboard");
const m2 = html.match(/星链物流<\/a><\/span>[\s\S]{0,120}?rank-score[^>]*>(\d+)</);
check("恢复默认后星链得分回到 80", m2 && Number(m2[1]) === 80, m2 && m2[1]);

/* ---------- 汇总 ---------- */
console.log("=".repeat(60));
console.log("结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail === 0 ? 0 : 1);
