# Animation-Pläne

Pläne aus dem `improve-animations`-Skill. Jeder Plan ist eigenständig: Dateipfade,
Zielwerte (Kurven, Dauern) und Feel-Checks stehen vollständig darin, damit ein
beliebiger Agent ihn ohne Kontext aus dem ursprünglichen Gespräch ausführen kann.

## Pläne

| # | Titel | Severity | Kategorie | Status |
| --- | --- | --- | --- | --- |
| [001](001-theme-transition-circular-reveal.md) | Theme-Wechsel als kreisförmige Aufblende vom Schalter animieren | MEDIUM | Missed opportunities / Physicality & origin | TODO |

## Empfohlene Reihenfolge

1. **001** — keine Abhängigkeiten, kann sofort ausgeführt werden.

## Abhängigkeiten und Folgearbeiten

- **001 legt die ersten geteilten Motion-Tokens an** (`--ease-out`,
  `--duration-theme-reveal`, `--duration-theme-fade` in `src/index.css`). Ein späterer
  Konsolidierungsplan für die handgetippten Dauern und Kurven in `src/index.css`
  (`120ms ease`, `180ms ease`, `200ms ease`, `460ms cubic-bezier(0.22, 1, 0.36, 1)`)
  sollte auf diesen Tokens aufbauen und **nach** 001 laufen.
- Noch nicht als Plan erfasst, beim Recon aufgefallen und bewusst außerhalb von 001:
  - `src/components/ui/sonner.tsx:1` bezieht `useTheme` aus `next-themes`, während die
    App ihren eigenen `ThemeProvider` nutzt. Die Toasts bekommen dadurch dauerhaft
    `"system"` statt des aktiven Themes — ein Korrektheits-, kein Animationsthema.
  - `tailwind.config.ts:126` nutzt `pulse-glow` mit `ease-in-out` als Dauerschleife;
    ob das gewollte Aufmerksamkeitslenkung oder dekoratives Rauschen ist, braucht einen
    eigenen Audit-Durchlauf.
