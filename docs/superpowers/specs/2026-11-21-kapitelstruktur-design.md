# Kapitelstruktur und Romanbearbeitung – Phase 1 (MUST)

Covers FR-001..FR-007, FR-009, FR-010, FR-022, BR-001 of the spec "Vorschlag und Bearbeitung von Kapiteln und Romanstruktur",
plus the cheap SHOULD/COULD items that fall out of the same model: FR-008/FR-011/FR-013 (lock badge and message),
FR-020 (AI only on request), FR-021 (delete comment), FR-025 (trash with restore).

## Assumptions

- **Q-002 Baustein**: the smallest editable text unit of the manuscript, one scene-level passage inside a chapter.
  It may point at the section or storyline it tells and at scenes, and has a title, a plan (synopsis) and the prose.
  Chapters are ordered lists of Bausteine; scene transitions are the boundaries between Bausteine.
- **Lektoren**: the existing e-mail/password accounts are reused. The author adds a reviewer by the e-mail of a
  registered account (no invite mails). Reviewers find shared books on their book list under „Als Lektor“ and only see
  the manuscript, not the storyline map.
- **Rights (BR-001)**: read (always), comment, suggest, edit, delete, structure. Comment and suggest are stored now and
  get their features in phase 2.
- **Locks**: taken when editing starts, released after 30 minutes from the moment taken regardless of activity (EC-001),
  never extended by re-taking. Others see only „Gesperrt“. Saving needs no foreign lock and the current version as base;
  if the author lifts a reviewer's lock, the reviewer's open editor saves right away if nobody else took the lock,
  otherwise it warns and keeps the text (EC-002). The page refreshes every 20 s.
- **Versions**: every content save writes a new row in `block_versions`; restoring an old version adds a new version.
  Moves are structure, not content, and create no version.
- **AI proposals**: author only, on request. One format for both a first structure and adjustments: chapters with existing
  or new ids and Bausteine with existing or new ids. Accepting applies it; unlisted chapters and Bausteine stay after the listed ones.

## Later phases

Phase 2: see below.
Phase 3: styles per work and team (FR-015..017),
per-chapter preselection (FR-014).

## Phase 2 (done)

- **Comments**: per Baustein, written with the comment right, deletable by their writer or the author.
- **Suggestions (FR-023)**: a reviewer with the suggest right proposes title, plan and text (plus a note). Nothing changes until the
  author accepts; accepting writes the next version (reason `suggestion`, credited to the reviewer). The author can reject, the
  proposer can withdraw. A suggestion made on an older version shows a hint.
- **Instructions (FR-018)**: one free-text instruction per Baustein, edited with the edit right, not versioned, sent to the AI draft.
- **Chapter-wise editing (FR-012/019)**: „Kapitel bearbeiten“ locks every live Baustein of the chapter at once (all or none, 423 when
  one is taken) and opens all editors; „Kapitel freigeben“ releases the caller's locks.
- **Preview (FR-024)**: `/books/:id/manuskript/vorschau` (whole work) and `?kapitel=<id>` (one chapter), reading layout only.

## Phase 3 (done)

- **Styles per work (FR-015, FR-016)**: predefined styles (`STYLE_PRESETS`) and an own addition, stored per book in `book_styles`;
  only the author changes them, reviewers see them read-only.
- **Team base styles (FR-017)**: there are no teams or organisations in Bookly, so the "team" is the author's account: base styles
  in `team_styles` belong to the author, are managed in the style tab and can be picked in every work of that author.
- The style text goes into the AI draft and into structure proposals.
- **Per-chapter preselection (FR-014)**: the AI tab can limit a proposal to one chapter (`kind: chapter`); accepting it only
  reorders/extends that chapter and keeps the chapter order.
