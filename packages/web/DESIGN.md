---
name: Bookly
description: A storyline planner drawn as a transit network plan; lines, stations, interchanges, and signal red only where the story contradicts itself.
colors:
  ground: "#ffffff"
  wash: "#f3f4f4"
  ink: "#1a1a1a"
  ink-2: "#3d3f42"
  muted: "#5d6166"
  rule: "#e2e3e5"
  rule-strong: "#c9cbcf"
  focus: "#0065ae"
  focus-wash: "#e5f0f8"
  signal: "#e3000f"
  signal-ink: "#b3000c"
  signal-wash: "#fff0f0"
  signal-rule: "#f5b5b1"
  line-main-blau: "#2B59C3"
  line-main-gruen: "#00A651"
  line-main-violett: "#9B3D97"
  line-main-orange: "#E07B00"
  line-main-petrol: "#00838F"
  line-main-braun: "#8D5524"
  line-side-hellblau: "#5AA5DC"
  line-side-hellgruen: "#7CC48B"
  line-side-sand: "#E3B54A"
  line-side-flieder: "#B794C9"
  line-side-lagune: "#7DC4C9"
  line-side-grau: "#8A94A6"
  status-in-progress: "#D98E04"
  status-completed: "#2E8B57"
  status-open: "#7B5EA7"
typography:
  display:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  wordmark:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    letterSpacing: "-0.01em"
  title-sm:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    lineHeight: 1.2
  body:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  control:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  label:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
  section-label:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 800
    letterSpacing: "0.06em"
  signet:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    letterSpacing: "0.02em"
  map-station:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.01em"
  map-annotation:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  signet-map: "3px"
  signet: "4px"
  control: "6px"
  pill: "999px"
  disc: "50%"
spacing:
  xxs: "0.25rem"
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  xxl: "1.5rem"
  column: "160px"
  lane: "76px"
  map-header: "48px"
  side-panel: "380px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.875rem"
  button-secondary:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.875rem"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  button-danger-quiet:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem"
  button-danger-quiet-hover:
    backgroundColor: "{colors.signal-wash}"
  icon-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    size: "30px"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.625rem"
  chip-toggle:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.3125rem 0.75rem"
  chip-toggle-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  line-chip:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem 0.25rem 0.25rem"
  signet-badge:
    typography: "{typography.signet}"
    rounded: "{rounded.signet}"
    height: "20px"
    width: "28px"
  count-badge:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ground}"
    typography: "{typography.signet}"
    rounded: "{rounded.pill}"
    height: "20px"
  hint:
    backgroundColor: "{colors.signal-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  hint-acknowledged:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.muted}"
  card:
    backgroundColor: "{colors.ground}"
    padding: "1.75rem"
    width: "380px"
  modal:
    backgroundColor: "{colors.ground}"
    padding: "1.5rem"
    width: "500px"
  side-panel:
    backgroundColor: "{colors.ground}"
    width: "{spacing.side-panel}"
  app-header:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    height: "60px"
    padding: "0 1.5rem"
---

# Design System: Bookly

## Overview

**Creative North Star: "The Liniennetzplan"**

A book's story is drawn as a transit network plan. Storylines are lines, time points are stations, connections are interchanges. The whole network reads at once on a white ground, framed by near-black rules, with every line in its own colour. The refusal is explicit in the build: no grey timeline grid with rounded bars and a blue accent. The map is the product; panels, chips and dialogs are signage around it.

The density is that of a station wall plan: compact, legible at a glance, quietly structured by hairlines and dotted station verticals, with heavy rules only where the plan has a frame (the 4px rule under the header, the 2px rule under the station names, the 4px top edge on cards and dialogs). Colour belongs to the lines. The chrome is ink on white, and the one alarm colour, signal red, is spent only on contradictions, so a red mark on the plan always means "look here".

The world is light, friendly and exact rather than technical. Status, connection types and every icon are drawn as small SVG glyphs in one stroke weight, never typed characters. Motion is short and functional: lines recede and return over 240ms, dialogs rise 8px in.

**Key Characteristics:**
- White ground, near-black frame rules, colour reserved for lines.
- Main lines thick (14px) in saturated colours in the centre band; side lines thin (6px) in lighter colours at the edge.
- Signets H1, H2 … and N1, N2 … name every line, on the map and in the legend.
- Octilinear connections with white interchange rings; signal red only for open contradictions.
- Hover or select recedes everything else to 15–20% opacity.
- Hanken Grotesk at 400, 600 and 800, self-hosted; tabular figures throughout.

## Colors

Ink and white carry the interface; a twelve-colour line palette carries the story; signal red carries only contradictions.

### Primary
- **Plan Ink** (ink): the frame and voice of the plan. Header rule, station-name rule, station ticks, interchange rings, connection lines, primary buttons, active chips, selected outlines, the selected tab underline, card and dialog top edges.

### Secondary
- **Line Palette, main family** (line-main-blau, -gruen, -violett, -orange, -petrol, -braun; UI names „Blau“, „Grün“, „Violett“, „Orange“, „Petrol“, „Braun“): saturated colours offered to main lines. Blau is the default main colour.
- **Line Palette, side family** (line-side-hellblau, -hellgruen, -sand, -flieder, -lagune, -grau; UI names „Hellblau“, „Hellgrün“, „Sand“, „Flieder“, „Lagune“, „Grau“): lighter colours offered to side lines. Grau is the default side colour. The swatch row shows only the family of the line's current kind; a free colour picker sits first for anything else.
- **Status colours** (status-in-progress amber, status-completed green, status-open violet): stroke and glyph colour of the status station disc for „in Bearbeitung“, „abgeschlossen“ and „bewusst offen“. Never used as fills or text.

### Tertiary
- **Signal Red** (signal): open contradictions only. The dashed connection line and its rings, the filled warning triangle, the hint count badge, and the ring disc that leads every open hint.
- **Signal Ink** (signal-ink): red text that must read on white: error messages, open-hint connection labels, the quiet „Löschen“ in the connection dialog.
- **Signal Wash / Signal Rule** (signal-wash, signal-rule): background and border of open hint cards and issue lists.

### Neutral
- **Ground** (ground): every surface. Map, panels, header, cards, dialogs.
- **Wash** (wash): the main-line band behind the centre lanes, hover fill of secondary buttons, disabled fill.
- **Ink 2** (ink-2): field labels, side-line titles, section titles under main lines, connection labels.
- **Muted** (muted): secondary text, inactive tabs, counts, placeholders, acknowledged hints.
- **Rule** (rule): hairlines: panel border, list dividers, map frame, dotted station verticals.
- **Rule Strong** (rule-strong): control borders, idle hover outline of a line, acknowledged hint rings.
- **Focus Blue** (focus, focus-wash): keyboard focus ring (2px, 2px offset), input focus border with a 3px wash halo, drag-to-create selection at 10%, text selection, caret.

### Named Rules
**The Signal Red Rule.** #E3000F is spent only on contradictions. It is never offered in the line palette, never a brand accent, never decoration. Acknowledged hints drop to grey rings.

**The Lines Own the Colour Rule.** Chrome is ink, white and grey. Hue appears only as a storyline's line colour, a status station, or signal red.

**The Legible Signet Rule.** Signet text is #1A1A1A or #FFFFFF, whichever has the higher WCAG contrast on the line colour.

## Typography

**Display Font:** Hanken Grotesk (with system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Hanken Grotesk
**Label/Mono Font:** none distinct; labels use Hanken Grotesk at 600 or 800.

**Character:** One grotesque in three weights, self-hosted via @fontsource (400, 600, 800). The 800 weight does the work of signage: wordmark, station names, line titles, signets; 600 is the voice of controls and labels; 400 is reading text. Figures are tabular everywhere.

### Hierarchy
- **Display** (800, 2rem, 1.2, -0.03em): page title „Meine Bücher“; 1.625rem below 700px.
- **Headline** (800, 1.375rem, 1.2, -0.015em): the login card's „Anmelden“.
- **Wordmark** (800, 1.25rem, -0.02em): „Bookly“ with its three-colour line mark; 1.75rem on the login page.
- **Title** (800, 1.125rem, -0.01em): dialog titles „Neue Verbindung“, „Verbindung bearbeiten“. Book title in the header and book list rows use 1.0625rem at 800.
- **Body** (400, 15px, 1.5): running text, inputs at 0.9375rem.
- **Control** (600, 0.875rem): buttons, line chips, crumbs, user name.
- **Label** (600, 0.8125rem, ink-2): field labels and legends („Titel“, „Kurzbeschreibung“, „Art“, „Status“, „Farbe“), filter chips.
- **Section label** (800, 0.8125rem, 0.06em, uppercase): panel section headings such as „Hinweise“. It names the section it heads; it never sits above another headline.
- **Map station** (800, 12px, 0.01em): station names along the top of the plan and main-line titles. Side-line titles drop to 600 in ink-2.
- **Map annotation** (600, 11px): section names under main lines, connection labels (with a 4px white halo), notes at 400 in muted.

### Named Rules
**The Signage Weight Rule.** Anything that names a line or a station is set at 800. Side lines are the one step down (600), matching their thinner stroke.

## Layout

Desktop is the target. The book page is a two-column grid: the plan fills the left (`minmax(0, 1fr)`, padded 0.75rem 1.5rem 1.5rem) and a sticky 380px side panel sits right behind a 1px hairline. Above the plan, one map bar holds the line legend (signet chips) on the first row and the filter chips on the second, with the count „x von y Storylines“ pushed right, closed by a hairline.

The plan itself is a fixed grid: 160px per station column, 76px per lane (100px when notes are shown, so two note lines never reach the next lane), a 48px station header. Main lines pack into a contiguous centre block of lanes, backed by the wash band; side lines alternate above and below it, the first ones nearest the mains. Zoom controls float in the plan's bottom-right corner.

At 1100px and below, the side panel drops under the plan with a 4px ink top rule and the crumbs hide. At 700px and below, the wordmark and page title shrink, book list rows wrap and the zoom hint hides. The book list and auth pages are single centred columns (760px and 380px).

Spacing steps in rem: 0.25, 0.375, 0.5, 0.75, 1, 1.25, 1.5. Chip rows gap at 0.375rem; form fields stack at 0.875rem.

## Elevation & Depth

The plan is flat: depth comes from rules and tonal bands (the wash band behind main lanes, white casings under connections). Shadow appears only on things that float over the plan or the page: the login card, the connection dialog, filter popovers (one shared soft shadow), and a lighter one for the floating zoom controls. Dialogs sit on a 40% ink backdrop.

### Shadow Vocabulary
- **Floating surface** (`box-shadow: 0 12px 32px -8px rgba(26, 26, 26, 0.28), 0 2px 6px rgba(26, 26, 26, 0.1)`): card, modal, filter popover.
- **Map control** (`box-shadow: 0 4px 12px -4px rgba(26, 26, 26, 0.18)`): zoom controls on the plan.

### Named Rules
**The Flat Plan Rule.** Nothing on the plan casts a shadow. Overlap is resolved by white casings and halos, as on a printed network map.

## Shapes

Lines are full-round capsules (radius = half the stroke). Stations, interchanges, status markers, hint markers and colour swatches are discs. Signets are small rounded rectangles (3px on the map, 4px in the legend). Chips and status options are pills. Controls, the map frame, hints and issue lists use a gentle 6px corner. Cards, dialogs and popovers are square-cornered and carry a heavy ink top edge (4px, 3px on popovers) like a sign panel. Connection bends are rounded at 8px. Drawn glyphs sit on a 16-unit grid with round caps and joins (1.6 to 1.8 stroke on the map, 1.75 in UI icons).

## Components

### Buttons
- **Shape:** gentle corner (6px), 1px border.
- **Primary:** ink fill, white 600 text (0.5rem 0.875rem). One per view: „Neue Storyline“, „Neues Buch“, „Anlegen“ in the book list, „Anmelden“, „Speichern“. Hover goes to pure black.
- **Secondary:** white with a rule-strong border; hover darkens the border to ink and fills with wash. Active nudges down 1px. Disabled is muted text on wash.
- **Quiet danger:** borderless signal-ink text („Löschen“ in the connection dialog); hover fills with signal wash.
- **Icon button:** 30px square, borderless until hover, a drawn 16px icon (up, down, plus, trash, minus, fit). Used in the time point station list, character list and zoom controls.
- **Focus:** a 2px focus-blue outline at 2px offset on every control.

### Chips
- **Filter chips:** pills with a rule-strong border, 0.8125rem 600: „Nur Hauptstränge“, „Nur bewusst offene“, „Notizen einblenden“. On: ink fill, white text. „Zeitraum“ and „Figuren“ are disclosure chips with a drawn chevron that open a square popover with an ink top edge; once set they read „Zeitraum: Tag 1 – Winter“ or „Figuren (2)“ and turn ink. „Filter zurücksetzen“ appears as an underlined text button only when a filter is active.
- **Line chips (legend):** a pill holding the line's signet badge and title. Hover or focus highlights that line on the plan; click opens it. Selected adds an inset ink ring. Filtered-out lines get a dashed border, muted text and a 45% signet, titled „Durch Filter ausgeblendet“.

### Cards / Containers
- **Corner Style:** square, with a 4px ink top edge.
- **Background:** ground.
- **Shadow Strategy:** floating surface shadow.
- **Border:** 1px rule on the other sides (card), none on the modal.
- **Internal Padding:** 1.75rem (card), 1.5rem (modal).

### Inputs / Fields
- **Style:** 1px rule-strong border, 6px corner, white, 0.5rem 0.625rem. Labels stack above at 0.8125rem 600 ink-2. Selects carry a drawn chevron.
- **Focus:** border turns focus blue with a 3px focus-wash halo.
- **Saving:** field edits save directly on commit; there is no save button for field edits.

### Navigation
- **App header:** 60px white bar, sticky, closed by a 4px ink rule. Wordmark with its three-segment line mark, crumbs „Meine Bücher /“ in muted 600, book title at 800, the primary action at the right.
- **Side panel tabs:** „Zeitpunkte“, „Figuren“, „Storyline“; muted text, active tab in ink with a 3px inset ink underline.

### Line (signature)
A storyline is a capsule on its lane. Main lines are 14px thick and draw sections as full-colour segments over a 35% body, with a white station dot (2.5px radius) at every time point and section names below. Side lines are 6px and carry no sections. Above the line's start sit the signet (26 by 16px) and the title. At the start sits the status station: a white disc (9px radius, 2.5px stroke) in the status colour carrying the drawn glyph: pencil for „in Bearbeitung“, check for „abgeschlossen“, open ring for „bewusst offen“. Hover shows a rule-strong outline capsule, selection an ink one, keyboard focus a focus-blue one.

### Signets
Every line is named by kind and story order: H1, H2 … for main lines (Hauptstränge), N1, N2 … for side lines (Nebenstränge), numbered by start, then end, then title. The same signet appears on the plan and in the legend chip, in the line colour with ink or white text.

### Interchange and connection routing
A connection runs from the end of line A to the start of line B as a 2.5px ink line over a 7px white casing, with white interchange rings (6px radius, 2.5px ink stroke) at both ends and an arrowhead stopping at the target ring.
- **Octilinear:** every segment is horizontal, vertical or 45 degrees; bends round at 8px. Forward connections leave and enter horizontally with one 45-degree diagonal, or a vertical drop when too steep.
- **Lane gap:** backwards connections turn off the source end into the gap 30px from the source lane, run back, and turn onto the target start; they never run along another lane.
- **Markers:** the type glyph sits in a white pill (22 by 16px) on the route's longest segment; on a segment that crosses lanes it sits 38px before the target lane, in the gap. Markers render above the lines so they are never hidden. Types: double chevrons right („Zeitsprung“), double chevrons left („Rückblende“), merging lines („Handlungsstränge vereinigen sich“), swap arrows („Figur wechselt“).
- **Contradictions:** an open hint turns the line, rings and pill signal red, dashes the line (7 5), fills the warning triangle red and sets the label in signal ink. Acknowledged hints keep a grey triangle and an ink line.
- **Hidden partner:** when the other line is filtered out, a 24px dashed muted stub leaves the visible end.

### Recede highlight (signature interaction)
Hovering or focusing a line or its legend chip keeps that line and its connections at full strength while every other line drops to 20% and every other connection to 15% opacity, over 240ms on the ease-out curve. Hovering a hint in the side panel does the same for its connection and its two lines.

### Hints
„Hinweise“ heads the side panel with a red count badge. Each open hint is a full-width button card in signal wash with a signal-rule border, led by a red ring disc, the route in 800 („Der Prozess → Der Fremde“) and the message. Acknowledged hints fold into „n bewusst so belassen“ and turn grey. With none open: „Keine offenen Widersprüche. Die Geschichte hält zusammen.“

### Station list and status options
The time point panel draws its list as a line: a 4px ink rail with a white ring station per entry. Status options in the storyline form are pills holding the 22px status disc and the label; the current one gets an ink ring. Colour swatches are 26px discs with a white inner border; the current one is ringed in ink.

### Book list route mark
Each book row starts with a small route mark: a 30 by 6px capsule with a white ring station at each end. It is drawn in neutral ink because the book list API carries no line colours; this is a deliberate adaptation, not a licence for neutral lines on the plan.

## Do's and Don'ts

### Do:
- **Do** give every storyline its own colour from its kind's family: saturated for main lines, lighter for side lines.
- **Do** keep main lines at 14px in the centre band and side lines at 6px at the edges, so kind reads by weight, colour and position.
- **Do** name every line with its signet (H1 …, N1 …) wherever the line is referenced.
- **Do** route connections octilinearly, with backwards runs in the lane gap and markers in gaps, never on a line in between.
- **Do** draw every icon and glyph as SVG on the 16-unit grid with round caps (status, connection types, warning, UI icons, chevrons).
- **Do** mark hints and status with ring discs, the plan's station form.
- **Do** close frames with heavy ink rules: 4px under the header, 4px atop cards, dialogs and the stacked side panel.
- **Do** write UI copy in German, with „…“ quotes and → in route labels.

### Don't:
- **Don't** use signal red (#E3000F) for anything but contradictions, and never offer it as a line colour.
- **Don't** use Unicode characters as icons; the status symbols ✎ ✓ ○ are always drawn glyphs.
- **Don't** put thick coloured side stripes on cards, hints or list items; mark them with a ring disc instead.
- **Don't** set small uppercase eyebrows above headings; uppercase is reserved for the section label that is itself the heading.
- **Don't** cast shadows on the plan; only surfaces that float over it get one.
- **Don't** draw lines on the plan in neutral ink; the ink route mark belongs to the book list only.
