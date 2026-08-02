# Issue tracker: Local Markdown

Issues and specifications for this repository live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The feature specification is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file each at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order.
- Every issue has a `Status:` line near the top and an explicit `Blocked by:` line.
- Conversation and implementation history append under a `## Comments` heading.

When an engineering skill says to publish or fetch a ticket, it reads or writes these local files.
