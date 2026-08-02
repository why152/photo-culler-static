# Apple HIG research — photo-review redesign

**Purpose.** This note translates Apple’s official Human Interface Guidelines
(HIG) into testable constraints for the static Photo Culler. It is design
evidence, not an instruction to mimic native Apple controls or claim macOS
native behavior. Findings were checked on 2026-08-02.

## Terminology and visual direction

The frequently cited `clarity`, `deference`, and `depth` formulation comes from
Apple’s archived iOS 7 transition guide: the interface should be legible and
functional, support content instead of competing with it, and use layers and
motion to aid understanding. It is useful design vocabulary, but it is not
presented as a current HIG standard. Current HIG expresses the same intent via
visual hierarchy, materials, layout, and motion.

Sources: [archived iOS 7 UI Transition Guide — Before You Start](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/TransitionGuide/), [Layout — Visual hierarchy](https://developer.apple.com/design/human-interface-guidelines/layout), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

### Constraints for this app

1. **Photos are the content layer.** In the grid, imagery and its review state
   take visual priority. Do not put decorative glass, heavy shadows, gradients,
   or permanent text panels on every thumbnail.
2. **Controls form one quiet functional layer.** Keep scan/filter/navigation in
   a compact, consistently positioned toolbar; use clear grouping and space
   rather than many boxed regions. A translucent or solid control surface may
   sit over images only when it preserves contrast and legibility.
3. **One primary action per context.** The photo viewer is for deciding one
   photo group; a destructive/recoverable batch action stays in the explicitly
   selected grid context. Its label and selected count must state the outcome
   before the action begins.
4. **Hierarchy must be readable without color.** A review decision, action
   selection, keyboard focus, current viewer item, and disabled action must
   each have an explicit text/icon/state treatment in addition to color.

## Collections and the photo-to-viewer transition

Apple describes collections as appropriate for image-based content, advises
adequate padding for choosing items, and says collection layout changes should
be purposeful and easy to track. It also identifies full screen as appropriate
for photo slideshows and focused in-depth work; hidden controls must have a
reliable way to reappear. Toolbars should contain deliberately chosen,
understandable controls that support the view’s main tasks.

Sources: [Collections](https://developer.apple.com/design/human-interface-guidelines/collections), [Going full screen](https://developer.apple.com/design/human-interface-guidelines/going-full-screen), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons).

### Constraints for this app

1. **Grid is the browsing home.** Use a stable, responsive thumbnail grid with
   reserved image aspect ratios, consistent gutters, and a clear review-state
   badge. Scrolling, loading more groups, or filtering must not arbitrarily
   reshuffle already visible groups.
2. **Clicking the image opens the viewer.** A thumbnail is a real button and
   opens the same photo group in an immersive viewer. A distinct selection
   affordance is used for batch action selection; changing selection must never
   open the viewer merely because focus changed.
3. **Viewer centers the analysis source.** The viewer shows a single large
   image, meaningful group name and `n / total` position, previous/next
   navigation, review decisions, and a readable filmstrip. Close/back is
   always visible or recoverable with `Esc`; closing returns focus and scroll
   position to the originating thumbnail.
4. **Controls may fade, never disappear mysteriously.** In the immersive view,
   secondary chrome can fade after inactivity to protect the image, but pointer
   movement, keyboard input, focus, and an always-available shortcut must
   restore it. Do not auto-advance the viewer.
5. **Compact, obvious touch targets.** Icon-only controls need accessible names
   and visible press/focus states. Target areas are at least 44 CSS px in both
   dimensions, with enough separation to avoid accidental actions.

## Perceived performance, loading, and failure feedback

Apple says to show something promptly instead of a blank screen, keep people
able to do other work while content loads, and clearly communicate loading and
estimated duration when it lasts more than a moment. Progress indicators are
transient; choose determinate progress when work can be quantified, keep it
moving, and give an actionable explanation if work stalls. Status feedback
should appear near the item it describes, whereas high-impact warnings may
interrupt the flow.

Sources: [Loading](https://developer.apple.com/design/human-interface-guidelines/loading), [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators), [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback).

### Constraints for this app

1. **Scan state is visible before scanning starts.** Selecting a directory
   immediately changes the primary scan control to a busy state and shows a
   concise stage label (for example, “Reading folders…”), rather than leaving
   the screen apparently frozen.
2. **Use two honest progress modes.** While the total is unknown, use one local
   indeterminate indicator plus the current stage. Once photo groups to process
   are known, show a stable determinate bar and exact `processed / total` count;
   do not fake a percentage before a denominator exists.
3. **Keep the grid usable while work continues.** Render completed groups in
   stable order and reserve thumbnail card dimensions with quiet placeholders
   for undecoded previews. The user can open already ready groups while later
   thumbnails load.
4. **Make waiting attributable and recoverable.** The scan bar stays in one
   consistent toolbar/status area. If progress stalls or an item cannot be read,
   state which stage/group failed, retain completed results, and offer the
   safest useful next step (retry scan or choose another directory).
5. **Give batch movement its own determinate status.** Before movement, show
   the selected photo-group count and destination. During it, show completed
   groups over total in the action area; after it, announce success or failure
   near that action and preserve recovery/journal information.
6. **Avoid a global spinner for thumbnail decode.** Decode feedback belongs on
   individual reserved cards or in the viewer’s image area, so already usable
   content is never blocked by a generic page overlay.

## Accessibility and motion

Apple’s accessibility guidance requires information and interaction to be
perceivable through more than one channel, sufficiently sized/space-separated
controls, and alternatives to gestures. Its motion guidance says animation
should serve the task, not be the sole source of meaning; Reduce Motion should
reduce automatic/repetitive zoom, scaling, and peripheral animation, favoring
fades where appropriate.

Sources: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection).

### Constraints for this app

1. **Equivalent input paths.** All viewer, decision, selection, filter, retry,
   and movement actions work with a pointer and keyboard; keyboard shortcuts
   supplement labeled buttons, not replace them.
2. **Accessible asynchronous status.** Scan, thumbnail failure, movement, and
   completion status use a concise `aria-live="polite"` region. Errors that need
   a decision receive focus only when doing so will not interrupt a safe
   background operation.
3. **Focus is an explicit state.** The viewer traps focus while open; `Esc` or
   Close restores focus to the thumbnail that opened it. Grid focus and action
   selection remain visibly distinct.
4. **Respect `prefers-reduced-motion`.** Default transitions are short opacity
   changes only. Under reduced motion, remove scale, slide, spring, shimmer,
   parallax, and filmstrip travel; progress remains understandable as text and
   count even with all animation removed.

## Acceptance checklist for the redesign

- A slow directory scan exposes its stage immediately, then an accurate count
  once total work is known; no blank or unchanging busy state remains.
- A slow thumbnail or large image leaves a correctly sized local placeholder
  while the rest of the grid/viewer remains usable.
- The grid stays the uncluttered browsing surface, and a single click opens a
  focused viewer without changing action selection or moving any files.
- The viewer has a reliable close path, preserves return context, uses only
  purposeful and optional motion, and remains fully keyboard accessible.
- Batch movement has an explicit before/during/after status separate from
  browsing and review decisions.
