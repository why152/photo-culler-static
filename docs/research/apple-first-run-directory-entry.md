# Apple HIG research — first-run directory entry

**Purpose.** This note evaluates the initial, empty Photo Culler content area:
before a local directory has been granted, the person needs one obvious,
reversible way to choose it. It translates current official Apple Human
Interface Guidelines (HIG) into constraints for this web app; it does not claim
that a web page is a native macOS app. Findings were checked on 2026-08-03.

## What the official guidance supports

Apple’s current design principles call for a clear, direct experience: remove
elements that do not earn their place, use concise wording, and establish a
hierarchy that makes both the desired outcome and the next step apparent.
Its layout guidance similarly says that controls and content need distinct
roles, and that placement should communicate importance. Apple’s writing
guidance is explicit for blank screens: guide people to an action and provide a
button or link when possible. In a first-run Photo Culler view, the important
outcome is not “an empty photo grid”; it is **choosing the first photo
folder**.

Apple describes a button as the component that initiates an instantaneous
action. A button should communicate its function through label, content, and
visual style; the most likely action in a view should use a prominent style,
have a sufficiently large hit target, and show a press state. The HIG does not
prescribe one geometric empty-state layout for this situation, so the compact
panel recommendation below is an application of those principles, not a
claimed Apple rule.

Sources: [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons).

## First-run flow and permission copy

Apple advises that onboarding be fast, optional where possible, and taught
through safe interaction rather than an explanatory screen. Contextual
instructions should appear next to the control they explain. When a feature
needs permission to access private resources, request it when the person first
uses that feature (or as part of a brief prerequisite flow), and use short,
specific copy explaining why access is needed.

For Photo Culler, the directory picker is both the first useful interaction and
the browser’s permission boundary. The entry should therefore lead with the
picker action and keep one short reassurance nearby, such as: “照片仅在这台
设备上读取和处理。” Detailed browser/HTTPS compatibility advice belongs behind
a small “了解兼容性” disclosure or only appears if capability detection fails;
it should not be the central first-run message.

Sources: [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [Requesting permission](https://developer.apple.com/design/human-interface-guidelines/privacy/).

## Choice of interaction model

| Option | What it gets right | Risk in this screen | Recommendation |
| --- | --- | --- | --- |
| **A whole large card is the button** | It can provide a forgiving target if it is one real button, clearly styled as interactive, with visible hover/press/focus states. | The current large white panel reads as a passive empty grid, not a control. If it also contains a separate button, there are two overlapping actions and ambiguous keyboard/focus semantics. Its size visually exaggerates an absence of content. | Do not use as the default. Use only if the entire card becomes the *single* semantic button and the visible label is its action. |
| **A compact entry panel with a clear primary button** | Gives one discoverable, familiar, keyboard-operable action; lets supporting privacy text stay close without competing with it; preserves the future grid area as content rather than a giant control. | Must avoid duplicating the same prominent action in the header while first-run entry is visible. | **Use this model.** It best matches the user’s stated confusion and the HIG’s hierarchy/button/onboarding guidance. |

The preference for the compact panel is a design inference from the cited HIG,
not an Apple prohibition on clickable cards. If a broad surface is kept as a
convenience shortcut, it must forward to the same one button action and must
not create a second nested interactive element.

## Recommended composition for Photo Culler

1. **Replace the 290px empty-grid card with a compact entry panel.** Keep it
   centered in the initial work area and narrow enough to scan quickly (roughly
   the width of a few thumbnail columns), rather than filling the content
   canvas. A quiet photo-folder/SF-symbol-like icon is decorative; it must not
   be the only cue that the panel does something.
2. **Give the panel one task-focused heading and one primary button.** Suggested
   copy: heading “开始筛选照片”; primary action “选择照片文件夹”. The verb-led label
   says exactly what clicking does. Use the existing system-blue primary style,
   a visible press state, and at least a 44 x 44 CSS-pixel hit region.
3. **Keep only task-relevant supporting copy.** Place “照片仅在这台设备上读取和
   处理。” directly below the button. Do not make the initial panel teach HTTPS,
   browsers, analysis mechanics, or keyboard shortcuts; surface those only at
   the point they become useful.
4. **Avoid duplicate primaries on first run.** While this panel is visible,
   either hide the header’s identical “选择照片文件夹” button or demote it from
   the visual hierarchy. After a folder is open, the header control can return
   as “选择其他文件夹”, because it then has a distinct context and purpose.
5. **Make the transition honest.** On activation, immediately put the primary
   button in its busy state and expose the existing operation-feedback status.
   Replace the entry panel only when the directory has actually been accepted;
   then show the stable photo grid or a scoped “该目录没有可筛选的照片” result.

## Accessibility and keyboard constraints

Use a native `<button type="button">` for the directory action, not a `div`
with click handling. That gives the expected Tab, Enter, and Space behavior.
Keep a visible `:focus-visible` indicator, an explicit accessible name, and
associate the local-processing reassurance with the button using
`aria-describedby` when helpful. Do not move focus merely because background
capability checks or scan feedback change. Existing `aria-live="polite"`
operation feedback should announce the post-click scan stage without making the
static entry explanation itself a live region.

Apple advises interfaces to support alternative input methods, including Full
Keyboard Access, and to label controls appropriately. It also recommends
sufficiently sized controls and avoidance of auto-dismissing time-boxed UI for
people who need longer to process it. Therefore, no invisible full-card
shortcut, tooltip-only instruction, timer, or animation may be required to
discover or activate the directory picker.

Sources: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards), [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection).

## Acceptance checks for the implementation

- Before any folder is selected, a sighted or keyboard-only person can identify
  “选择照片文件夹” as the next action without reading technical compatibility
  text.
- Tab reaches one obvious folder-selection control; Enter and Space both open
  the picker; focus and press states are visible.
- The initial page contains one visually prominent folder-selection action, not
  competing header and content primaries.
- The local-only reassurance is visible beside the action, while compatibility
  detail is contextual and nonblocking.
- On click, operation feedback changes immediately; the compact entry is not
  replaced with an apparently interactive but inert blank grid.
