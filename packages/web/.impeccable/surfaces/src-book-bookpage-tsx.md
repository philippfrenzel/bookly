---
version: 1
slug: "src-book-bookpage-tsx"
primary_target: "src/book/BookPage.tsx"
related_targets: ["src/books/BookListPage.tsx","src/auth/LoginPage.tsx"]
---

# Bookly app surfaces (book list, book map, auth)

Mode: Operate. Hobby authors and writing-course students plotting a book at a desktop browser. The job is to see the story at a glance and arrange storylines, sections, connections and hints. The user wants joy at work; anything that looks technical or admin-like, or dark and heavy, is wrong.

## Direction contract

THESIS: The book's story is a transit network plan. Storylines are lines, time points are stations, connections are interchanges. Bookly refuses the category default: a grey timeline grid with rounded bars and a blue accent.

OWN-WORLD: White ground. Near-black #1A1A1A frame rules, with a 4px rule under the header. Each line is drawn in its own colour; main lines are thick and side lines thin. Line signets are coloured rounded squares with white or black bold labels (H1, H2 … N1, N2 …). Interchanges are white discs with a black ring. Status shows as a station-style disc at the start of the line, carrying ✎ ✓ ○ in its status colour. Signal red #E3000F is reserved for contradictions only. Hanken Grotesk is self-hosted. Hairline station grid.

STORY: The author opens a book and reads the whole network at once: which lines run where, where they meet, and where the red warning sits. They click a line or a signet to edit it, add an interchange, and acknowledge a hint.

FIRST VIEWPORT: A white header with the Bookly wordmark, the book title and a black „+ Neue Storyline“ button, closed by a 4px black rule. Below it, a row of line signets that act as the legend and the filter chips (main only, open only, time range, characters). The network map fills the left part, with station names along the top. The right panel (380px) is white with a hairline, holding hints first and then the selected line's fields.

FORM: Liniennetzplan, number 1 on my ordered list (my pick over the dealt Partitur). seed:509d787af87cde3e

Signature interaction: hovering or selecting a line or signet highlights that line and its interchanges while the rest of the network recedes. Selecting a hint does the same for its connection.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
