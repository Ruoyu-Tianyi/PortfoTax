/* ============================================================
 * PortfoTax · 本地存储模块 V2
 * localStorage 持久化（导入企业 / 规则配置 / 应用设置），
 * file:// 或隐私模式下 localStorage 不可用时自动回落到
 * 会话级内存存储（刷新丢失，但不报错）。
 * key 统一前缀 portfotax.v2.
 * ============================================================ */
(function (global) {
  "use strict";

  var PREFIX = "portfotax.v2.";
  var mem = {}; // 内存回落

  function ls() {
    try {
      if (global.localStorage) {
        var t = "__pt_probe__";
        global.localStorage.setItem(t, "1");
        global.localStorage.removeItem(t);
        return global.localStorage;
      }
    } catch (e) { /* localStorage 不可用 */ }
    return null;
  }

  global.Store = {
    get: function (key, fallback) {
      var raw = null;
      var store = ls();
      if (store) {
        try { raw = store.getItem(PREFIX + key); } catch (e) { raw = null; }
      } else {
        raw = (mem[key] !== undefined) ? mem[key] : null;
      }
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set: function (key, val) {
      var raw = JSON.stringify(val);
      var store = ls();
      if (store) {
        try { store.setItem(PREFIX + key, raw); return; } catch (e) { /* fall through */ }
      }
      mem[key] = raw;
    },
    remove: function (key) {
      var store = ls();
      if (store) {
        try { store.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
      }
      delete mem[key];
    }
  };
})(window);
