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

Phase 2: comments, reviewer suggestions confirmed by the author (FR-023), chapter-wise editing and locking (FR-012/019),
per-Baustein instructions (FR-018), preview of work and chapter (FR-024). Phase 3: styles per work and team (FR-015..017),
per-chapter preselection (FR-014).
