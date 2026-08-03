# 首次目录入口规格

**Status:** completed

## Problem Statement

摄影者首次打开 Photo Culler 时，中央区域看起来像一个大而被动的空白网格；它既不能启动目录选择，也不能说明下一步。顶部同时出现同名目录按钮和无意义的“已移动 0”状态，空闲的 operation feedback 也占据页面，让首次任务缺少清晰层级。

## Solution

交付一个 Apple HIG 研究支持的紧凑首次目录入口：在初始工作区只保留一个真实、可见、可键盘操作的“选择照片文件夹”主按钮和一条本机处理说明。选择成功后入口让位给 photo group 网格，顶部出现语义不同的“选择其他文件夹”，既有 operation feedback 在实际扫描开始时才出现。

## User Stories

1. 作为摄影者，我想在首次页面立刻知道下一步是选择照片文件夹，以便不用猜测中央区域的用途。
2. 作为摄影者，我想通过一个明显的按钮启动目录选择，以便鼠标点击有明确反馈。
3. 作为键盘使用者，我想通过 Tab、Enter 或 Space 操作同一个目录选择按钮，以便不依赖指针。
4. 作为摄影者，我想在授权前看到照片仅在本机读取和处理，以便理解目录权限边界。
5. 作为摄影者，我想在尚未扫描时不看到伪装成状态的空闲进度条，以便注意力只落在下一步动作上。
6. 作为摄影者，我想在目录选定后看到 photo group 工作区和“选择其他文件夹”，以便继续或更换来源。
7. 作为摄影者，我想只在真的有 recoverable review batch 时看到“已移动”，以便顶部不出现无效控制。
8. 作为维护者，我想在真实 Chrome 中验证这一完整流程，以便目录权限和本机文件安全边界不被视觉调整破坏。

## Implementation Decisions

- 首次目录入口是界面状态，不是新的 photo group、review decision、action selection 或 operation feedback 领域概念。
- 使用一个原生按钮来启动已有的目录选择路径；不把面板本身伪装成第二个可点击控件。
- 初始状态隐藏重复的顶部目录按钮、空闲 operation feedback、无 recoverable review batch 的按钮和无内容的 review rail。
- 目录被接受后，保持既有目录扫描、JPEG analysis、photo group 和 movement journal 协议；仅切换可见的控制层级。
- 浏览器不具备安全本地目录能力时，保留上下文错误说明并禁用目录选择入口。

## Testing Decisions

- 外部测试 seam 是真实 Chrome 的静态首屏，不测试内部状态或私有函数。
- 浏览器测试验证一个可访问的目录按钮、隐藏的重复首屏控制、可见焦点、Space 与 Enter 启动、即时 operation feedback，以及目录接受后的 photo group 网格和“选择其他文件夹”。
- 保留现有完整 Node、Chrome、无图片网络上传、可恢复文件操作和键盘审核回归。
- 通过桌面和窄屏截图人工确认紧凑入口的层级、留白与可读性。

## Out of Scope

- 修改 directory picker、JPEG analysis、photo group、review decision、movement journal、自动移动或上传行为。
- 创建原生 macOS 应用、复制 Apple 专有资产或把整个说明面板做成隐藏按钮。

## Further Notes

- 设计依据见 `docs/research/apple-first-run-directory-entry.md`，仅引用 Apple 官方 HIG。
