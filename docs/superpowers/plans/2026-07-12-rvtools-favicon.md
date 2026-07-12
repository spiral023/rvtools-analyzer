# RVTools Analyzer Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein kontrastreiches Infrastruktur-Favicon mit Imagegen erstellen, in browsergerechte Formate überführen und in der Vite-App einbinden.

**Architecture:** Eine quadratische Imagegen-Mastergrafik dient als einzige visuelle Quelle. Daraus werden deterministisch PNG-Größen und eine Multi-Size-ICO-Datei unter `public/` erzeugt; `index.html` referenziert die Assets explizit.

**Tech Stack:** Imagegen, Pillow, HTML, Vite

---

### Task 1: Mastergrafik erzeugen und prüfen

**Files:**
- Create: `public/favicon-master.png`

- [ ] **Step 1: Imagegen mit der freigegebenen Bildspezifikation ausführen**

Prompt:

```text
Use case: logo-brand
Asset type: square master artwork for the RVTools Analyzer browser favicon
Primary request: Create a minimal infrastructure analysis app icon: three bold cyan data/server nodes connected into one compact network symbol, centered inside a dark anthracite rounded square.
Style/medium: flat vector-like raster icon, geometric, crisp, professional, no 3D
Composition/framing: perfectly centered, symmetrical visual weight, generous safe padding, thick shapes that remain legible at 16x16 pixels
Color palette: dark anthracite background matching hsl(222 15% 6%), bright cyan symbol matching hsl(190 85% 48%)
Constraints: square canvas; no text; no letters; no watermark; no transparency; no shadows; no gradients; no thin lines; no micro-details
Avoid: photorealism, glossy effects, VMware branding, spreadsheet imagery, decorative background elements
```

Expected: Imagegen liefert eine quadratische PNG-Datei mit einem einzigen klaren Symbol.

- [ ] **Step 2: Ausgabe in das Projekt kopieren**

Die ausgewählte Imagegen-Ausgabe als `public/favicon-master.png` speichern.

- [ ] **Step 3: Mastergrafik visuell prüfen**

Mit der lokalen Bildansicht kontrollieren: quadratisch, keine Schrift, kein Wasserzeichen, Anthrazit/Cyan, kräftige Linien und ausreichender Rand.

- [ ] **Step 4: Asset-Commit erstellen**

```bash
git add public/favicon-master.png
git commit -m "design: add RVTools favicon artwork"
```

### Task 2: Browserformate ableiten

**Files:**
- Create: `public/favicon-16x16.png`
- Create: `public/favicon-32x32.png`
- Create: `public/apple-touch-icon.png`
- Modify: `public/favicon.ico`

- [ ] **Step 1: Browsergrößen aus der Mastergrafik erzeugen**

Mit Pillow und hochwertigem Lanczos-Resampling die PNG-Dateien in 16 × 16, 32 × 32 und 180 × 180 Pixeln erzeugen. Die ICO-Datei aus Größen 16, 32 und 48 Pixeln erstellen.

- [ ] **Step 2: Dateiformate und Dimensionen verifizieren**

Run:

```powershell
@'
from PIL import Image
expected = {
    "public/favicon-16x16.png": (16, 16),
    "public/favicon-32x32.png": (32, 32),
    "public/apple-touch-icon.png": (180, 180),
}
for path, size in expected.items():
    with Image.open(path) as image:
        assert image.size == size, (path, image.size)
with Image.open("public/favicon.ico") as image:
    assert image.format == "ICO", image.format
print("favicon assets valid")
'@ | python -
```

Expected: `favicon assets valid`

- [ ] **Step 3: Abgeleitete Assets committen**

```bash
git add public/favicon-16x16.png public/favicon-32x32.png public/apple-touch-icon.png public/favicon.ico
git commit -m "build: add browser favicon formats"
```

### Task 3: Favicon einbinden und Gesamtprojekt prüfen

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Explizite Favicon-Links ergänzen**

Direkt nach der Description in `index.html` einfügen:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<meta name="theme-color" content="#0d0f12" />
```

- [ ] **Step 2: Produktionsprüfung ausführen**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: Alle Tests bestehen, ESLint meldet keine neuen Fehler und Vite erstellt `dist/` erfolgreich.

- [ ] **Step 3: Build-Ausgabe prüfen**

Run:

```powershell
Get-Item dist/favicon.ico, dist/favicon-16x16.png, dist/favicon-32x32.png, dist/apple-touch-icon.png
```

Expected: Alle vier Dateien sind in `dist/` vorhanden.

- [ ] **Step 4: Einbindung committen**

```bash
git add index.html
git commit -m "feat: use branded RVTools favicon"
```
