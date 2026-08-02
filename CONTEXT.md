# Photo Culler

Photo Culler is a conservative, local-first review workflow for camera-imported photos. It identifies obvious JPEG technical issues while keeping the human in control of every selection and file action.

## Language

**Photo group**:
A same-stem JPEG or JPEG pair together with any matching RW2 and XMP members. It is the smallest unit that can be moved or restored.
_Avoid_: Photo, file pair

**Analysis source**:
The JPEG member of a photo group used for visual analysis and preview. RAW and XMP members are bound to the group but are not analysed.
_Avoid_: Original, RAW preview

**Review decision**:
A person’s `pick`, `keep`, or `reject` label for a photo group. It is advisory until that group is explicitly marked for a file action.
_Avoid_: Delete, final cull

**Review batch**:
The recoverable destination directory containing one or more selected photo groups and its movement journal.
_Avoid_: Trash, deletion batch

**Movement journal**:
The on-disk record of every member in a review batch and its restoration state. It makes interrupted operations discoverable and reversible.
_Avoid_: Cache, browser history

**Photo viewer**:
The transient, immersive view of one analysis source and its surrounding visible photo groups. It is for browsing and making one photo group's review decision; it is not a review batch or a file-action confirmation.
_Avoid_: Right-side inspector, selected photo

**Action selection**:
The temporary set of photo groups chosen from the photo grid for one explicit batch action. It is separate from the photo group currently shown in the photo viewer, every review decision, and every persisted review batch.
_Avoid_: Marked photos, move list

**Operation feedback**:
The transient, local status for one background scan, JPEG analysis, movement, or restoration. It states the current stage and shows a determinate count only when the operation has a known total; it does not replace a review decision, action selection, or movement journal.
_Avoid_: Global loading state, generic spinner
