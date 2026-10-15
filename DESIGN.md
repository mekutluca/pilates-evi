---
name: Pilates Evi
description: The front desk of a pilates studio — the week is the work surface, one orange for the action.
colors:
  studio-orange: 'oklch(0.553 0.195 38.402)'
  studio-orange-deep: 'oklch(0.47 0.157 37.304)'
  on-orange: 'oklch(0.98 0.016 73.684)'
  orange-ink-dark: 'oklch(0.75 0.183 55.934)'
  meter-orange: 'oklch(0.705 0.213 47.604)'
  ink: 'oklch(0.147 0.004 49.25)'
  ink-muted: 'oklch(0.51 0.013 58.071)'
  paper: 'oklch(1 0 0)'
  paper-dark: 'oklch(0.216 0.006 56.043)'
  bench: 'oklch(0.97 0.001 106.424)'
  hairline: 'oklch(0.923 0.003 48.717)'
  ring: 'oklch(0.709 0.01 56.259)'
  quiet-grey: 'oklch(0.967 0.001 286.375)'
  quiet-grey-ink: 'oklch(0.21 0.006 285.885)'
  conflict-red: 'oklch(0.5 0.21 27.325)'
  attention-yellow: 'oklch(0.823 0.162 81.1)'
  amber-ink: 'oklch(0.48 0.11 72)'
typography:
  display:
    fontFamily: 'Nunito Sans Variable, sans-serif'
    fontSize: '1.875rem'
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: 'tnum'
  headline:
    fontFamily: 'Nunito Sans Variable, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 700
    lineHeight: 1.33
  title:
    fontFamily: 'Nunito Sans Variable, sans-serif'
    fontSize: '1rem'
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: 'Nunito Sans Variable, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: 'Nunito Sans Variable, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 600
    lineHeight: 1.33
rounded:
  cell: '2px'
  sm: '6px'
  md: '8px'
  lg: '10px'
  xl: '14px'
  2xl: '18px'
  pill: '26px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.studio-orange}'
    textColor: '{colors.on-orange}'
    typography: '{typography.body}'
    rounded: '{rounded.pill}'
    padding: '0 12px'
    height: '36px'
  button-primary-hover:
    backgroundColor: 'oklch(0.553 0.195 38.402 / 80%)'
    textColor: '{colors.on-orange}'
  button-outline:
    backgroundColor: 'oklch(0.923 0.003 48.717 / 30%)'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '0 12px'
    height: '36px'
  button-outline-hover:
    backgroundColor: 'oklch(0.923 0.003 48.717 / 50%)'
    textColor: '{colors.ink}'
  button-secondary:
    backgroundColor: '{colors.quiet-grey}'
    textColor: '{colors.quiet-grey-ink}'
    rounded: '{rounded.pill}'
    padding: '0 12px'
    height: '36px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '0 12px'
    height: '36px'
  button-ghost-hover:
    backgroundColor: '{colors.bench}'
    textColor: '{colors.ink}'
  button-destructive:
    backgroundColor: 'oklch(0.5 0.21 27.325 / 10%)'
    textColor: '{colors.conflict-red}'
    rounded: '{rounded.pill}'
    padding: '0 12px'
    height: '36px'
  input:
    backgroundColor: 'oklch(0.923 0.003 48.717 / 30%)'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.pill}'
    padding: '4px 12px'
    height: '36px'
  card:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.2xl}'
    padding: '24px'
  badge-secondary:
    backgroundColor: '{colors.quiet-grey}'
    textColor: '{colors.quiet-grey-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  badge-outline:
    backgroundColor: 'oklch(0.923 0.003 48.717 / 30%)'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  badge-warning:
    backgroundColor: 'oklch(0.823 0.162 81.1 / 15%)'
    textColor: '{colors.amber-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  badge-destructive:
    backgroundColor: 'oklch(0.5 0.21 27.325 / 10%)'
    textColor: '{colors.conflict-red}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  nav-item-active:
    backgroundColor: '{colors.studio-orange}'
    textColor: '{colors.on-orange}'
    typography: '{typography.body}'
    rounded: '{rounded.lg}'
    padding: '8px 12px'
  lesson-block:
    backgroundColor: 'oklch(0.553 0.195 38.402 / 10%)'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '6px 8px'
  pattern-chip:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '2px 6px'
---

# Design System: Pilates Evi

## Overview

**Creative North Star: "The Front Desk Week"**

A studio front desk with the week laid open on it. The coordinator has a client standing in front of them or on the phone, and the screen has to answer three things at a glance: what is happening today, who is running out of lessons, and where there is room in the week. The interface is the house style shared with the sibling apps (invest-track, dr.villa, ustama-emanet, rahmet-turizm): stone neutrals, Paper cards with a 10% ink ring on a Bench-tinted page, pill controls, Nunito Sans only, tabular numerals. Pilates Evi's own voice is one accent, **Studio Orange** (the colour of the studio's auth e-mails and the brand mark), plus two signature objects — the weekly pattern chip and the lesson meter — that turn the product's core idea (a package is a recurring weekly pattern that runs down) into things you can see.

Colour carries meaning, never decoration. Orange is solid only on the one primary action of a screen and the active nav item; everywhere else it is a tint (booked lessons on the week board, today's column) or a small mark (the filled days in a pattern chip, the meter fill). Attention Yellow means exactly one thing: this client needs a renewal. Red means a conflict or a destructive action, and it is always a tint. The world refuses the spa look (beige, sage, soft serif) and the generic grey dashboard alike.

Density is desk-first and high but scannable: the week board is the work surface, lists are two-line rows inside cards, and hierarchy comes from weight, size and numerals rather than colour blocks or shadows.

**Key Characteristics:**

- One accent (Studio Orange): solid on one primary action per screen and the active nav item, tinted everywhere else.
- Yellow = needs a renewal; red = conflict / destructive, always tinted.
- Flat Paper cards (18px, 10% ink ring) on a Bench-30% page; no shadows at rest.
- Pills for everything pressed or typed into (26px); soft rectangles for containers.
- Nunito Sans at fixed rem steps; every comparable number `tabular-nums`.
- Signature objects: the Monday-first pattern chip and the lesson meter; the week board is the main surface.
- Turkish, literal copy; Monday-first weeks; Istanbul time.

## Colors

Warm stone neutrals carrying one burnt orange, one signage yellow with a single meaning, and one tinted red.

### Primary

- **Studio Orange** (`oklch(0.553 0.195 38.402)`, `#c2410c`): the accent. Filled primary button (Panel "Yeni kayıt", the client hub's "Yeni kayıt"), the active sidebar item, the brand mark tile, the filled days in a pattern chip, the slow-navigation bar. As a tint: lesson blocks on the week board (10% fill, 25% ring), today's column (3.5%), a chosen slot's label cell (5% with a 30% ring), the "Taşınıyor" bar's ring (40%). Also the browser surfaces: `::selection` at 20%, `accent-color`, `caret-color`. In dark mode the fill deepens to **Studio Orange Deep** (`oklch(0.47 0.157 37.304)`) so On Orange text keeps contrast.
- **On Orange** (`oklch(0.98 0.016 73.684)`, `#fff7ed`): text and strokes on an orange surface, including the ring and blocks in the mark.
- **Accent** (`--accent`, equal to Studio Orange; Deep in dark mode): the shadcn interaction highlight — a keyboard-focused or hovered menu item, today in the date picker. A transient state under the pointer or focus, never a resting fill.
- **Orange Ink** (`--primary-ink`): orange used as type — today's day name in the board header, a selected-slot label, the check in the trainee picker. In light mode it equals Studio Orange; in dark mode it lifts to `oklch(0.75 0.183 55.934)` so it reads on Paper Dark. Never set orange type with `--primary` directly.

### Secondary

- **Meter Orange** (`oklch(0.705 0.213 47.604)`, `--chart-3`): the lesson meter's fill. It sits in a five-step ordered orange ramp (`--chart-1` … `--chart-5`, light → deep) defined for charts; only step 3 is in use today. Treat the ramp as reserved for ordered data (light = earlier).

### Neutral

- **Ink** (`oklch(0.147 0.004 49.25)`): body text and headings; the page background in dark mode.
- **Ink Muted** (`oklch(0.51 0.013 58.071)`): every secondary line — subtitles, row second lines, sidebar group names, "N ders kaldı" when nothing is due. Darker than the siblings' stone-500 (`oklch(0.553 …)`) so 12–14px secondary text clears 4.5:1 on Paper and on the Bench-tinted page.
- **Paper** (`oklch(1 0 0)`): cards, the top bar, the sidebar, sheets. **Paper Dark** (`oklch(0.216 0.006 56.043)`) in dark mode.
- **Bench** (`oklch(0.97 0.001 106.424)`): the muted layer — the page behind cards at 30%, row hover at 60%, meter tracks, "Dolu" taken slots on the wizard board, empty-group blocks.
- **Hairline** (`oklch(0.923 0.003 48.717)`): borders, the input and outline-button fill at 30%, the scrollbar thumb. Cards use a ring of Ink at 10% instead of a border.
- **Ring** (`oklch(0.709 0.01 56.259)`): focus ring at 50%, 3px, on every control.
- **Quiet Grey** (`oklch(0.967 0.001 286.375)`) on **Quiet Grey Ink** (`oklch(0.21 0.006 285.885)`): the secondary button and badge — "Sıradaki" on the Panel, the selected room / trainer pill on the calendar, the selected change-type in the move sheet.

### State

- **Attention Yellow** (`oklch(0.823 0.162 81.1)`, `--warning`): needs a renewal. A 15% tint behind text, the clock-alert icon at full strength. **Amber Ink** (`oklch(0.48 0.11 72)`; dark `oklch(0.87 0.14 88)`, `--warning-foreground`) is the text: "Son ders" on a lesson block, "N ders kaldı" on a renewal-due meter. The yellow itself never carries type.
- **Conflict Red** (`oklch(0.5 0.21 27.325)`; dark `oklch(0.704 0.191 22.216)`): conflicts and destructive actions, always tinted — 10% fill with red text on buttons and badges (darker and less saturated than the siblings' red-600 so that text clears 4.5:1 on its own tint), a 10% fill with a 30% ring on a conflicting lesson block ("Kapasite aşıldı" with a triangle-alert icon).

### Named Rules

**The One Orange Rule.** Studio Orange is solid on exactly two things at rest: the one primary action of the screen and the active nav item. Booked slots, today and pattern days get the tint or a small mark. Transient states may fill it (Accent on a focused menu item, the "İçeriğe geç" skip link while focused). A second resting orange fill on a screen is a bug.

**The Yellow-Is-Renewal Rule.** Yellow means a client's kayıt ends within `RENEWAL_WINDOW_DAYS` (14 days) and has not been renewed: "Son ders" on the board, the amber count on the lesson meter, renewal-due counts. It is a to-do for the desk, and it disappears when "Yenile" is done. Nothing else may be yellow.

**The Red-Is-Tinted Rule.** Red marks a conflict (double-booked room or trainer, over-full group) or a destructive action, and is always a 10% tint with red text. Never a solid red fill.

**The Orange-Ink Rule.** Orange as text uses `--primary-ink`, never `--primary`, so it passes 4.5:1 in both themes.

## Typography

**Display Font:** Nunito Sans Variable (with `sans-serif`)
**Body Font:** Nunito Sans Variable (with `sans-serif`)

**Character:** One friendly humanist sans does every job; rounded terminals keep it warm for a front desk, weight steps (400 / 500 / 600 / 700) carry all hierarchy. Numbers that can be compared are always `tabular-nums`.

### Hierarchy

- **Display** (600, 30px, 1.2, tabular): stat-strip figures only, with a 16px/400 muted "/ of" suffix.
- **Headline** (700, 24px, 1.33): the page `h1` in the page header ("Panel", "Takvim", a client's name).
- **Title** (500, 16px, 1.5): card titles; the week board's entity name at 16px/600.
- **Body** (400, 14px, 1.43): rows, descriptions, buttons (500), inputs (16px on phones, 14px from `md`). Row primary lines 14px/500, times 14px/600 tabular.
- **Label** (600, 12px, 1.33): sidebar group names, lesson-meter counts, badge text (500), pattern-chip text (500), lesson-block text (12px; title 600).

### Named Rules

**The Numerals Rule.** Times, counts, dates in rows and stat figures are `tabular-nums`; the pattern chip and lesson meter set their text tabular too.

**The Two-Line Row Rule.** A list row is a 14px/500 primary line and a muted second line, truncated; time sits in a fixed 48px column on the left, place on the right.

## Layout

A fixed app shell: a 56px top bar (Paper, hairline bottom) with the brand mark, "Pilates Evi" at 20px/600 and the studio name muted after a middle dot, then the theme toggle and user menu; a 256px sidebar (Paper, hairline end border, `lg` and up) that becomes a 256px left Sheet below `lg`; a scrolling `main` on Bench at 30%. Page content sits in a `max-w-6xl` column (the wizard `max-w-5xl`, settings `max-w-3xl`) with 16px padding on phones and 24px from `lg`, 24px between blocks.

Every page opens with the page header: `h1` and one muted subtitle line on the left (optional back link above, optional details under the title), actions on the right, wrapping under on narrow screens. At most one action is primary.

The Panel is a 3 + 2 grid at `lg` (today's lessons and new registrations left, renewals right). The client hub is a 2 + 1 grid (kayıt cards left, Bilgiler right). The calendar page puts week navigation in the header actions, the Oda / Eğitmen toggle and entity pills under the header, then the week board full width. Side work (move, appointment details) happens in a right Sheet, never on a new page: 448px for details, 512px for the Taşı sheets, full width on phones. Breakpoints are Tailwind's (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).

Phones are a supported second device: dialogs fit the dynamic viewport (`100dvh` minus 2rem, scrolling inside), sheet and wizard footers stick to the bottom with the primary action first, tables drop secondary columns below `md`, and small icon buttons grow to 44px touch targets.

## Elevation & Depth

Flat by rule. Resting surfaces cast no shadow; depth is tonal — Paper cards on the Bench-30% page, Bench rows on hover, a 1px Ink-at-10% ring around every card and the week board. Shadows belong to floating layers only: popovers, dropdowns, dialogs, sheets (shadcn defaults), and the sticky "Taşınıyor" bar on the calendar, which floats over the board while a lesson is being moved.

### Shadow Vocabulary

- **Floating** (shadcn `shadow-md` / `shadow-lg`): anything that opens or sticks over the page — popover, dropdown, dialog, sheet, the "Taşınıyor" bar.

### Named Rules

**The Flat Studio Rule.** Nothing at rest lifts. Separate with a hairline, a tone step or whitespace — never a shadow.

## Shapes

Two silhouettes: **pills** for anything pressed or typed into (buttons, inputs, badges, toggle items, room / trainer pills, wizard step chips — 26px), and **soft rectangles** for containers (cards and the week board 18px, popovers / dialogs 14px, sidebar items and list-row hovers 10px, lesson blocks and pattern chips 8px). The brand mark is a 7/32 rounded square. Progress material is fully round (the lesson meter). The smallest shape is the pattern chip's day cell: 6×10px at 2px radius.

Borders are 1px hairline; cards and lesson blocks use an inset ring rather than a border.

## Components

### Buttons

- **Shape:** pill (26px), 36px tall (`sm` 32px, `lg` 40px, `xs` 24px), 12px horizontal padding, 14px/500, lucide icon at 16px.
- **Primary:** Studio Orange fill, On Orange text. One per screen ("Yeni kayıt", a sheet's submit "Taşı").
- **Outline:** hairline border, Hairline fill at 30%; the default for secondary actions ("Takvim", "Yenile" on renewal rows, "Düzenle", "Vazgeç").
- **Secondary:** Quiet Grey; selected state of choice pills.
- **Ghost:** transparent; top-bar icons, row actions ("Taşı", "İptal et").
- **Destructive:** Conflict Red at 10% with red text.
- **Hover / Focus / Active:** primary drops to 80%, outline rises to 50%; focus is a 3px Ring at 50% plus a Ring border; active nudges 1px down; disabled is 50% opacity.

### Chips / Badges

- **Style:** pill, 20px tall, 12px/500, 8px horizontal padding.
- **Meanings:** `secondary` = neutral highlight ("Sıradaki"); `outline` = neutral labels ("Grup", "Özel", "Son ders" in a lesson's trainee list); `warning` (yellow tint, amber ink) = renewal due; `destructive` (red tint) = conflict.

### Cards / Containers

- **Corner Style:** 18px.
- **Background:** Paper on the Bench-30% page.
- **Shadow Strategy:** none; 1px Ink-at-10% ring.
- **Internal Padding:** 24px (`sm` cards 16px), 24px between header, content and footer. Lists inside cards are `divide-y` rows with 10px vertical padding; no card in a card.
- **Title:** `Card.Title` renders an `h2` (16px/500) so card titles sit in the page outline under the page `h1`.
- **In code:** `Card.Root` for titled cards; the `surface` utility (`src/app.css`) for any other container that should read as a card (the week board, stat strip, tables, empty states). Clickable rows inside a card use the `row-link` utility.

### Stat Strip

A row of figures in one card, cells split by hairlines (two columns on phones). Each cell: a 14px muted label, a 30px/600 tabular figure with an optional muted "/ total", an optional 12px muted hint.

### Inputs / Fields

- **Style:** pill, 36px, Hairline fill at 30% with a hairline border, 16px text on phones / 14px from `md`, muted placeholder.
- **Focus:** Ring border + 3px Ring at 50%.
- **Error / Disabled:** `aria-invalid` turns the border red with a 20% red ring; disabled is 50% opacity.
- **Choices:** radio and checkbox fill Studio Orange when checked (via `accent` / primary).

### Navigation

- **Style:** grouped lists in the sidebar ("Stüdyo", "Yönetim") under 12px/600 muted group names, separated by hairlines; items 14px with a 16px lucide icon, 10px radius, 8px/12px padding.
- **States:** active = Studio Orange fill with On Orange text at 500; hover = Bench fill.
- **Mobile:** the same list in a left Sheet from a ghost menu button.
- **Brand:** the mark is an exercise ball resting on a mat, in On Orange on a Studio Orange rounded tile (the ball's seam cut in the tile colour); the favicon is the same drawing.

### Week Board (signature surface)

One card: the entity name (room or trainer) as a 16px/600 header, then a fixed-layout table — a sticky 64px hour column, seven day columns Monday first, 64px-tall hour rows split by hairlines. Day headers are 12px/600 day name over a muted tabular date; today's header turns Orange Ink and reads "Bugün · dd/mm", and today's column carries a 3.5% orange tint top to bottom. On narrow screens the board scrolls sideways and opens on today's column.

Cells hold one of four things:

- **Lesson block:** an 8px-radius block with an inset ring, 12px text — package name (600), trainees (a group shows its fill first, "4/12 · …"), the other dimension at 60% ink (trainer on a room's week, room on a trainer's week), then at most one flag line. Default tone is orange tint (10% fill, 25% ring); a renewal-due lesson adds an amber "Son ders" line with a clock-alert icon; a conflict switches the block to the red tint with a red "Kapasite aşıldı" line; an empty group, a taken slot ("Dolu") or the lesson being moved go muted (Bench fill, 10% ink ring, muted text).
- **Free cell:** quiet; its action label appears in muted text only on hover or focus.
- **Chosen cell:** 5% orange fill, 30% orange ring, Orange Ink label ("Seçili").
- **Day actions:** a ghost ellipsis menu in the header of future days (close the day, etc.).

While a lesson is being moved, a sticky "Taşınıyor" bar (Paper, 18px radius, 40% orange ring, floating shadow) sits above the board with an outline "Vazgeç".

### Pattern Chip (signature)

The weekly pattern as an object: a small 8px-radius Paper chip with a hairline border; inside, a Monday-first strip of seven 6×10px cells (2px radius, 2px gap) — lesson days filled Studio Orange, the rest Ink at 10% — then the pattern in words, 12px/500 tabular ("Sal, Per · 10:00"). It appears wherever a kayıt is named: renewal rows on the Panel, the client hub's kayıt card, group lessons.

### Lesson Meter (signature)

How far a kayıt has come: a 6px fully-round Bench track (min 64px, flexible) filled by the used share in Meter Orange, with a 500ms ease-out width transition (off under `prefers-reduced-motion`), then a 12px/600 tabular count — "N ders kaldı" or "Bitti". The total is the lessons the kayıt was sold with; "kaldı" is always the lessons still on the calendar, so a cancelled or deleted lesson counts as used. When a renewal is due (`isRenewalDue`: last lesson within 14 days), the fill goes quiet (Ink at 25%) and the count turns Amber Ink with a clock-alert icon and a screen-reader "yenileme zamanı", so the meaning never rests on colour alone. Exposed as `role="meter"` with a Turkish label.

### Sheets

Right Sheet, full width on phones, 448px (details) or 512px (Taşı) from `sm`; a hairline-bordered header with the action as title and the lesson as a muted subtitle; content in 24px sections; definition lists as a two-column grid (muted term, 500 value); a sticky footer with outline "Vazgeç" and the primary submit. Previews inside a sheet ("Önizleme") are a live region, and a "→" between old and new slot is read out as "yeni saat / oda / eğitmen".

### Load Error

What a block shows when its data failed to load, instead of looking empty: a full-width strip, 18px radius, Conflict Red at 10% with red 14px text, a triangle-alert icon, the failure in one sentence ("Haftanın dersleri yüklenemedi.") and an outline "Tekrar dene" that reloads just that data. It replaces the block's content in place, inside the same layout as its skeleton.

## Do's and Don'ts

### Do:

- **Do** spend solid Studio Orange only on the one primary action per screen and the active nav item; tint it for booked slots and today.
- **Do** set orange type with `--primary-ink`.
- **Do** name every kayıt with its pattern chip and show its progress with the lesson meter.
- **Do** keep yellow for renewal due (14-day window) with Amber Ink as its text and the clock-alert icon beside it, and red as a 10% tint for conflicts and destructive actions.
- **Do** show a failed load as the Load Error strip with "Tekrar dene", never as an empty list.
- **Do** separate with hairlines, tone steps (Paper / Bench-30 / Bench-60) and whitespace; cards at 18px with the 10% ring.
- **Do** open every page with the page header (title, one muted line, actions right) inside a `max-w-6xl` column.
- **Do** do side work (move, details, close day) in a right Sheet over the week board.
- **Do** set every comparable number `tabular-nums`; write Turkish literally, Monday-first, Istanbul time.

### Don't:

- **Don't** introduce a per-page accent; the palette is one orange, one renewal yellow, one tinted red, stone neutrals.
- **Don't** fill red or yellow solid, or set type in the yellow itself.
- **Don't** give yellow a second meaning (partially-taken slots, unchangeable fields, verification notices).
- **Don't** shadow resting surfaces, or add gradient tiles, KPI rings or icon-in-a-circle stat cards.
- **Don't** drift toward the spa look (beige, sage, soft serif) or the generic grey dashboard.
- **Don't** nest a card in a card; lists inside cards are `divide-y` rows.
- **Don't** use a second typeface, uppercase eyebrows or fluid `clamp()` type.
