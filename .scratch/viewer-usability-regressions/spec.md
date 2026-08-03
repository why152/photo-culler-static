# 大图与建议移出可用性修复规格

**Status:** in_progress

## Problem Statement

当前 Photo Viewer 的 analysis source 在桌面与窄屏均被过低的高度上限压缩。进入“建议移出”筛选后，action selection 和可恢复 review batch 文件动作缺少可发现入口；摄影者必须发现默认隐藏的缩略图选择控件。长目录的 filmstrip 在内容溢出时整体居中，导致开头的一段当前 photo group 与相邻下一项落在不可访问的左侧区域。每次选择或 JPEG analysis 进度更新还会重建所有预览对象 URL，造成已显示图片闪烁。

## Solution

在不改变 JPEG-first、完整 photo group、review decision 与 review batch 文件协议的前提下，扩大 Photo Viewer 的 analysis source 可视区域；在“建议移出”筛选中明确提供把候选 photo group 加入 action selection 的入口；让溢出的 filmstrip 从可滚动起点布局，并始终让当前项和其下一项可见；只在分析 source 或缩略图实际改变时更新对应图片，避免选择和分析进度导致闪烁。

## User Stories

1. 作为摄影者，我想在大图中让 analysis source 占用大部分可用屏幕，以便充分判断画面。
2. 作为摄影者，我想进入“建议移出”后立即看到如何把候选项加入本次移动，以便不必寻找隐藏控件。
3. 作为摄影者，我想在明确选择候选项后才看到“移动已选项”并确认创建 review batch，以便不会把审核决定误作文件移动。
4. 作为摄影者，我想在长目录中始终看到当前缩略图与下一张，以便底部 filmstrip 与大图保持一致。
5. 作为摄影者，我想在加载分析或选择 photo group 时保留已经呈现的图片，以便不会出现无意义的闪烁。

## Decisions

- `建议移出` 仍是 review decision，不自动移动任何文件。
- “选择全部建议移出”只把当前可见候选项加入 action selection；实际移动继续走既有确认和 movement journal。
- filmstrip 继续代表当前筛选结果，保留任意缩略图直接跳转；仅修正溢出起点与当前项可见性。
- 图片节点和对象 URL 只有在其所属 analysis source 或缩略图变化时才更新；纯 selection、filter 或进度反馈渲染不得重新加载既有图片。
- 浏览器隔离目录是唯一测试来源；真实照片库不被读取、写入或移动。

## Testing

- 真实 Chrome 测量桌面与窄屏大图的可见高度。
- 真实 Chrome 验证“建议移出”筛选可见的全选入口、显式 action selection 与未选择时不显示移动动作。
- 真实 Chrome 用 60 个 photo group 验证长 filmstrip 的当前项与下一项可见。
- 真实 Chrome 验证选择和后续分析进度不替换已呈现缩略图或当前大图 source。
- 完整 Node、Chrome、语法检查与两轴审查必须通过。
