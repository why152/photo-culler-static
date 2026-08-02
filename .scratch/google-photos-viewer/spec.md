# Google Photos 式大图查看与缩略图选择规格

**Status:** ready-for-agent

## Problem Statement

摄影者在当前审核工作台中点击缩略图后，只会把同一张 analysis source 放进固定的右侧检查器。大图浏览、相邻照片切换、缩略图间跳转、连续人工审核和批量选择被拆散在不同控件中；当前查看、人工 review decision 和待移动标记也使用相近的视觉信号。摄影者不能像使用 Google Photos 一样，以缩略图作为进入沉浸式大图浏览的入口，并在不误触文件动作的前提下连续审核和选择 photo group。

## Solution

交付一个以 photo grid 为浏览入口、以 photo viewer 为主要审核表面的本地照片审核界面。单击 photo group 的缩略图打开其 analysis source 的沉浸式大图；底部 filmstrip 显示当前筛选结果，允许直接跳转并随当前项保持可见。关闭 photo viewer 后，摄影者回到原来开启的缩略图及其滚动位置。

批量操作采用独立的 action selection：缩略图悬停或获得键盘焦点时显示选择控件，选择一个或多个 photo group 后才出现批量动作。一个 photo group's review decision、机器技术提示、当前 photo viewer 项和 action selection 必须有各自的状态、文案和视觉表现。创建和恢复 review batch 继续沿用既有安全边界，但不再由查看一张大图的交互触发。

## User Stories

1. 作为摄影者，我想单击任一 photo group 的缩略图就打开大图，以便先看清照片再作出审核决定。
2. 作为摄影者，我想让 photo viewer 以 analysis source 的完整可用尺寸居中显示，以便不受固定右侧栏尺寸限制。
3. 作为摄影者，我想在 photo viewer 中通过左右箭头按钮和左右方向键查看相邻 photo group，以便连续判断照片。
4. 作为摄影者，我想在 photo viewer 底部看到当前筛选结果的 filmstrip，以便知道当前位置并直接跳至另一张缩略图。
5. 作为摄影者，我想让 filmstrip 自动滚动到当前项，以便连续切换时不会失去上下文。
6. 作为摄影者，我想在大图中通过 Escape 或关闭按钮回到我开启它的缩略图，以便继续从原网格位置浏览。
7. 作为摄影者，我想让关闭 photo viewer 后恢复原网格的滚动位置和键盘焦点，以便不会在长目录中迷失。
8. 作为摄影者，我想在 photo viewer 中看到当前 photo group 的成员数、RAW 绑定提示和保守技术提示，以便知道审核决定针对的文件组。
9. 作为摄影者，我想在 photo viewer 中设置或清除当前 photo group's review decision，以便大图审核是完整而直接的。
10. 作为摄影者，我想让 `1`、`2`、`X`、`0` 在 photo viewer 中沿用现有 review decision 语义，以便不丢失高效审核习惯。
11. 作为摄影者，我想让 `Space` 或 `J` 在 photo viewer 中跳至下一个未有 review decision 的 photo group，以便处理积压项。
12. 作为摄影者，我想让 `←` 和 `→` 只在 photo viewer 中表示当前可见队列的相邻浏览，以便它们不与页面滚动冲突。
13. 作为摄影者，我想在 photo grid 中悬停缩略图后使用独立的选择控件，以便单击图片仍然总是打开 photo viewer。
14. 作为摄影者，我想通过 Shift 连续选择一段 photo group，并通过逐项选择组成非连续 action selection，以便像 Google Photos 一样高效进行批量操作。
15. 作为摄影者，我想在进入 action selection 后看到明确的已选数量与可用批量动作，以便知道文件动作的确切范围。
16. 作为摄影者，我想按 Escape 清除 photo grid 中的 action selection，以便撤回一次批量操作准备而不改变 review decision。
17. 作为摄影者，我想在缩略图上清楚区分机器技术提示、已设置的 review decision 和 action selection，以便不会将自动建议、人工判断和批量范围混为一谈。
18. 作为摄影者，我想让改变筛选条件后，photo viewer 的相邻导航和 filmstrip 只使用新的可见 photo group，以便浏览范围与我看到的网格一致。
19. 作为摄影者，我想在当前 photo group 被筛选条件隐藏前关闭或安全地重新定位 photo viewer，以便不会浏览不可见的过期项。
20. 作为摄影者，我想在 photo viewer 中看到明确的“第 N / M 项”位置，以便判断连续审核进度。
21. 作为摄影者，我想让空筛选结果和没有相邻项时有明确反馈，以便不会误以为按钮失效。
22. 作为摄影者，我想让选择控件、photo viewer、filmstrip 和关闭按钮具有可访问名称、可见焦点和可用键盘操作，以便不依赖鼠标精确点击。
23. 作为摄影者，我想在浏览大图、修改 review decision 或调整 action selection 时不移动任何文件，以便浏览与可恢复文件动作保持隔离。
24. 作为摄影者，我想只在明确进入既有 review batch 操作时才看到移动或恢复确认，以便不会把“打开大图”误解为文件变更。
25. 作为维护者，我想有真实浏览器验证覆盖用户打开目录后的 gallery 交互，以便当前只验证底层工作区的测试缺口不再掩盖 UI 回归。
26. 作为维护者，我想保留 JPEG-first 和完整 photo group 的既有约束，以便大图交互不会导致 RAW/XMP 被单独显示、判断或操作。

## Implementation Decisions

- photo grid 是 photo group 浏览入口。默认单击缩略图打开 photo viewer；它不保存为 review decision，也不加入 action selection。
- photo viewer 是覆盖式、沉浸式审核表面，替代当前固定右侧检查器。它显示当前 analysis source、位置、技术提示、成员摘要和当前 photo group's review decision 控件。
- photo viewer 的可浏览队列由当前筛选后的 photo grid 决定。左右导航、filmstrip 和位置计数使用同一个有序队列；切换筛选条件时，若当前项不再可见则关闭 viewer 并把焦点安全归还到筛选控件。
- viewer 状态只包含当前打开的 photo group 和其返回焦点信息。它是瞬时 UI 状态，不写入 review decision 持久化记录；筛选和缩略图密度继续依照既有行为持久化。
- action selection 是独立、短暂的 photo group ID 集合。它取代现有含糊的“待移动标记”交互，默认不跨刷新保留；进入或清除它不改变任何 review decision。
- action selection 的单项和范围选择都通过缩略图的明确选择控件完成。图片本身的单击在未开启选择控件时不改变 selection，只打开 photo viewer。
- 机器技术分析状态、人工 review decision、viewer 当前项和 action selection 各用独立的标识、ARIA 文案和视觉样式。机器提示不得伪装成用户决定。
- 现有 `1`、`2`、`X`、`0` 的 review decision 语义保持不变；在 photo viewer 中作出决定后使用当前可见队列前进。`Space`/`J` 保持“整个 photo group 序列中下一个未审核项”的语义。
- review batch 的创建、movement journal、恢复、冲突拒绝和完整 photo group 文件边界不在本规格中重做。批量栏仅调用既有的明确文件操作入口，绝不由打开 viewer 或设置 review decision 自动执行。
- 在前端界面层建立一个单一的 gallery interaction seam，集中拥有可见队列、viewer、action selection、返回焦点和键盘路由；它经既有 Review Workspace 读取和保存 review decision，不将文件系统协议散落到界面渲染代码中。

## Testing Decisions

- 测试以摄影者可观察到的 gallery 行为为准，不断言内部 DOM 构建步骤、对象 URL 或私有状态字段。
- 新的 gallery interaction seam 覆盖可见队列、打开与关闭 viewer、相邻导航、filmstrip 跳转、位置、筛选后安全关闭、action selection 与 review decision 的分离，以及键盘语义。
- 浏览器端到端测试在 Chrome 中用隔离的复制照片目录或浏览器本地测试目录打开真实工作台，覆盖缩略图打开大图、关闭后焦点与滚动归还、选择一个和 Shift 范围选择、快捷键审核、筛选后的 viewer 队列及无控制台错误。
- 浏览器测试继续审计网络请求，确认大图、缩略图和 filmstrip 均来自用户授权的本地 analysis source，而不是网络上传。
- review decision 的保存和 next-unreviewed 继续复用既有 Review Workspace 测试先例；已有 movement journal 测试必须保持通过，证明本次界面改造未突破文件动作边界。
- 将 UI 浏览器测试加入常规测试入口，使首屏加载通过不足以代表 gallery 交互正确。

## Out of Scope

- 改变静态运行时、浏览器真实目录移动能力或 review batch 的文件操作算法。
- 云同步、Google 账户、照片上传、搜索、人物或地点识别，以及对 Google Photos 的视觉像素级复刻。
- RAW 解码、RAW 技术评分、审美自动筛选、自动永久删除、视频与移动端支持。
- 修改保守技术初筛的阈值或把技术提示升级为自动 file action。

## Further Notes

- 此规格借鉴 Google Photos 的“缩略图浏览进入大图、显式选择后批量操作、归档与浏览分离”的操作逻辑，而非其云端数据模型或删除语义。
- photo viewer 显示的是 analysis source；任何选择、review decision 和文件动作始终作用于完整 photo group。
- 本规格刻意不解决静态浏览器对真实目录原子移动的兼容性问题；该风险仍需在 review batch 交付前单独决策和验证。
