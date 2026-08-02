# Apple 式照片审核反馈与视觉重设计规格

**Status:** ready-for-agent

## Problem Statement

摄影者在打开一个照片目录时，会看到页面表面上几乎没有变化，直到目录扫描和 JPEG 分析产生可见内容；即使 JPEG 分析已经在后台顺序执行，状态也只是一行会被覆盖的文字。缩略图在没有生成分析缩略图时直接解码完整 analysis source，造成视觉上忽明忽暗、排版和等待都难以理解。移动和恢复也只替换同一行文字，摄影者无法区分“正在读取目录”“正在处理已知数量的 JPEG”“正在执行文件动作”以及“操作已结束”。

现有深色荧光配色、衬线巨型标题、多层描边面板和虚线空状态也把视觉注意力从 photo group 和 Photo viewer 中夺走。这与用户要的简洁、高效、现代、Apple 风格相反；用户会把无反馈的正常本地处理理解为卡顿。

## Solution

交付一个遵循 Apple HIG 的、内容优先的静态本地工作台：网格界面跟随系统浅色或深色，Photo viewer 始终使用深色画布；控制项在紧凑的工具栏、底部 action selection 和 Viewer 浮层中形成安静、可读的功能层。照片和状态，而不是装饰性面板，构成视觉层级。

交付一个单一的 operation feedback seam，诚实表达本地目录扫描、可量化 JPEG 分析、可量化 photo group 文件移动/恢复及其失败。总量未知时只显示一个就地活动指示和阶段文案；总量已知时显示同一个位置的确定性进度条和精确数量。操作完成后给出短暂成功反馈，已可用的 photo group 不被全局加载层阻断。没有分析缩略图的 grid/filmstrip 卡片保留稳定尺寸的本地占位；已准备好的 analysis source 仍可打开 Photo viewer，而 Viewer 会明确显示正在呈现该图像。

## User Stories

1. 作为摄影者，我想在选择照片文件夹后立刻看到“正在读取照片文件夹”的反馈，以便知道浏览器没有卡住。
2. 作为摄影者，我想在扫描尚不知道总量时只看到轻量活动指示和阶段文案，以便不会被伪造的百分比误导。
3. 作为摄影者，我想在得到 photo group 总量后看到“已分析 N / M”的确定性进度，以便估计剩余等待。
4. 作为摄影者，我想让进度条和文字在同一稳定位置切换阶段，以便不必在页面上寻找状态。
5. 作为摄影者，我想在 JPEG 分析继续时浏览已准备好的 photo group，以便后台工作不阻断人工审核。
6. 作为摄影者，我想让没有生成缩略图的 photo group 保留与完成卡片相同的空间，以便网格不跳动。
7. 作为摄影者，我想在 Photo viewer 载入新的 analysis source 时得到就地反馈，以便知道大图正在呈现而不是失效。
8. 作为摄影者，我想让单击缩略图、连续浏览、review decision、action selection 和文件动作保持现有行为，以便视觉升级不破坏高效审核习惯。
9. 作为摄影者，我想让扫描、分析、移动、恢复和失败状态具有不同且简洁的文案，以便知道该等待什么以及能做什么。
10. 作为摄影者，我想在移动前看到完整 photo group 数量与可恢复目的地的含义，以便确认批量文件动作范围。
11. 作为摄影者，我想在移动或恢复时看到已完成 photo group / 总 photo group 及文件进度，以便不将长文件操作误认为卡死。
12. 作为摄影者，我想在成功或失败后看到就地结果且保留已完成内容，以便继续审核或安全恢复。
13. 作为摄影者，我想让网格以照片为主、工具栏简洁分组、单个上下文只有一个主要动作，以便快速定位工作重点。
14. 作为摄影者，我想让网格界面跟随 macOS 的浅色或深色外观，以便它与我的系统环境一致。
15. 作为摄影者，我想让 Photo viewer 保持暗色且控件只在照片周围形成低干扰层，以便照片细节始终是焦点。
16. 作为摄影者，我想让 review decision、action selection、键盘焦点、当前 Viewer 项和禁用状态不只依赖颜色区分，以便在各种显示和辅助模式下理解状态。
17. 作为摄影者，我想让所有图标式控件具备可访问名称、至少 44 CSS px 的命中区和清晰焦点，以便鼠标与键盘都可靠。
18. 作为摄影者，我想在减少动态效果时仍能读懂进度和状态，以便动效不是信息唯一来源。
19. 作为维护者，我想在真实 Chrome 中用隔离测试目录观察扫描、分析、Viewer 呈现和批量文件操作反馈，以便视觉设计有行为证据而非静态截图。
20. 作为维护者，我想继续审计本地文件边界、网络请求、JPEG-first 和 movement journal，以便改版不会突破已有的安全承诺。

## Implementation Decisions

- Operation feedback 是本改版唯一新增的界面状态 seam。它以 operation kind、阶段、已完成数量、总数、简短说明和结果组成；未知总数表现为 indeterminate，已知总数表现为 determinate。它只表示当前一次后台操作，完成、失败或取消后不保留为 review decision。
- 目录扫描开始时立即进入 indeterminate feedback；只有扫描返回 photo group 后才进入 determinate JPEG-analysis feedback。不得在不知道总数时假装百分比。
- Review Workspace 仍是文件与 JPEG 分析的唯一协议边界。现有 scan、analysis、move、restore 回调提供 operation feedback 输入；界面层不得重写 movement journal 或改变任何 photo group 文件算法。
- 网格只为具备分析缩略图的 group 创建缩略图 image。尚在分析的 group 使用同尺寸、带文件名和“正在准备预览”文本的占位卡片；顺序不变、尺寸预留不变，准备完成后原地变成可浏览缩略图。
- Photo viewer 的 analysis source 继续来自已授权本地文件。切换 Viewer 项时，图片区域进入明确的本地 loading 状态，图片 load/error 后结束该状态；不使用远程图片、全屏遮罩或伪进度。
- 外层界面用系统字体、语义化系统色、圆角分组、有限边框和少量 translucency；不复制 Apple 专有控件或宣称原生 macOS。默认跟随 `prefers-color-scheme`，Viewer 固定深色以保证照片对比。
- Toolbar 只放目录、筛选、密度和当前 operation feedback；action selection 与移动反馈留在显式选择上下文；Viewer 只保留关闭、导航、单项 review decision 和 filmstrip。
- 短淡入可以说明内容出现；`prefers-reduced-motion: reduce` 下移除不必要动画，进度仍以文字与数字完整可读。
- 既有 Photo viewer、GalleryInteraction、review decision、action selection、完整 photo group、movement journal、确认弹窗和网络边界保持语义不变。本改版不引入自动移动、云上传、自动拒绝或照片重排。

## Testing Decisions

- 外部 seam 是真实 Chrome 中的静态工作台：用浏览器本地隔离照片目录触发选择目录、渐进分析、Viewer 图像呈现、action selection、移动和恢复，不以私有 DOM 构造或计时实现作为断言对象。
- Operation feedback 的小型公开状态接口测试阶段、未知/已知总数、完成和错误文案，确保不显示虚假百分比或错误的数值范围。
- 浏览器测试必须断言：选择目录立即出现 indeterminate 反馈；一旦总量已知即显示精确进度；完成缩略图保持同尺寸；Viewer 图像 busy 状态会结束；移动/恢复显示独立的确定性反馈；减少动态效果不会隐藏信息。
- 回归测试继续覆盖缩略图打开 Photo viewer、焦点/滚动归还、`1/2/X/0` 与 `Space/J` 语义、Shift action selection、空筛选、控制台错误和无图片网络上传。
- 运行常规 Node 测试、完整 Playwright 测试、语法检查、`git diff --check`，并通过有照片的 Chrome 截图人工检查浅色 grid、深色 Viewer、进度/占位/移动反馈与窄屏布局。

## Out of Scope

- 改变 JPEG 分析算法、并行度、评分阈值、RAW 解码、自动决定或自动移动。
- 原生 macOS 打包、Apple 专有设计资产或对 Apple Photos 像素级复刻。
- 云同步、账户、远程分析、上传、永久删除和移动端。
- 为未知工作量显示猜测性的耗时、百分比或剩余时间。

## Further Notes

- 研究依据保存在 `docs/research/apple-hig-photo-culler-redesign.md`；它只引用 Apple 官方 HIG，区分了归档的 clarity/deference/depth 术语和现行 HIG。
- 这个改版改善的是可感知性能与渲染负担，不对摄像机原始 JPEG 的实际解码时间作未经测量的性能承诺。
