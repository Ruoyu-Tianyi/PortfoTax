# vendor 第三方库说明

本目录存放本地化（vendored）的第三方库，保证 PortfoTax 在 `file://` 离线环境下可用，不引用任何 CDN。

## xlsx.full.min.js

- **名称**：SheetJS Community Edition（`xlsx`）完整构建
- **版本**：0.20.3
- **来源**：https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js （SheetJS 官方 CDN）
- **许可证**：Apache License 2.0（https://sheetjs.com ；仓库 https://git.sheetjs.com/sheetjs/sheetjs）
- **用途**：V2.2 xlsx 直接导入（解析「三表关键科目 / 申报记录」工作表）与 Excel 模板下载（三工作表 xlsx 生成）
- **引入方式**：`app/index.html` 中普通 `<script src="js/vendor/xlsx.full.min.js"></script>`，暴露全局 `window.XLSX`
- **降级策略**：本文件缺失或损坏时，导入面板自动隐藏 xlsx 能力并给出提示，CSV 导入与其他页面不受影响
