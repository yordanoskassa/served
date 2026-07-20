# Served typography

Inspired by [Legora](https://legora.com/) (light serif display + humanist sans body) and [Harvey](https://www.harvey.ai/) (editorial serif headlines, sans UI).

## Fonts

| Role | Font | Use |
|------|------|-----|
| Display / editorial | **Newsreader** (300–500) | Marketing hero, section openers, dialog titles, stats on landing, pull quotes |
| UI / body | **IBM Plex Sans** (400–600) | Navigation, buttons, forms, workspace headings, tables, pipeline, metadata |

## Utility classes (`index.css`)

| Class | Font | Typical size |
|-------|------|----------------|
| `.type-display` | Serif, light | Hero ~44–88px |
| `.type-section` | Serif, light | Section titles ~32–52px |
| `.type-subsection` | Serif, normal | Supporting headline ~20–24px |
| `.type-stat` | Serif, light | Large numbers |
| `.type-quote` | Serif, italic | Blockquotes |
| `.type-lead` | Sans | Intro copy 16–17px |
| `.type-body` | Sans | Body 14px |
| `.type-ui` / `.type-ui-title` / `.type-ui-heading` | Sans | Panels, cards, workspace |
| `.type-eyebrow` / `.type-label` | Sans, uppercase | Section labels 11px |
| `.type-caption` | Sans | Metadata 12px |

## Rules

1. **Do not** set large marketing headlines in bold sans — use `.type-display` or `.type-section` (light serif).
2. **Do not** use serif for buttons, nav links, badges, tabs, or form labels — sans only.
3. **Workspace app** (dashboard, upload, analysis, pipeline): prefer `.type-ui-heading` for card titles; reserve serif for the main page opener only.
4. **Base size** is 16px on `html`; dense UI may use 14px (`.type-body`) but marketing intros should be `.type-lead` or larger.
