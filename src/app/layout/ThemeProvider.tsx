import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

type Theme = "dark" | "light";

/**
 * Strukturell kompatibel mit React.MouseEvent: die Schalter übergeben ihr Klick-Event
 * unverändert (`onClick={toggleTheme}`), daraus entsteht der Mittelpunkt der Aufblende.
 */
type ThemeToggleOrigin = { clientX: number; clientY: number; detail?: number };

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: (origin?: ThemeToggleOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const REVEAL_ATTR = "data-theme-reveal";
const FADE_ATTR = "data-theme-fade";
/** Muss zu --duration-theme-fade in src/index.css passen. */
const FADE_MS = 260;

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("rvtools-theme");
      return stored === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Läuft gerade eine Aufblende? Schnelles Doppelklicken startet dann keine zweite,
  // sondern schaltet sofort – gestapelte halbe Reveals sähen kaputt aus.
  const revealRunningRef = useRef(false);

  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem("rvtools-theme", theme);
    } catch {
      // localStorage not available
    }
  }, [theme]);

  const toggleTheme = useCallback(
    (origin?: ThemeToggleOrigin) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const root = document.documentElement;

      // Der Klassentausch muss synchron im View-Transition-Callback passieren, damit der
      // Browser den neuen Zustand im selben Snapshot erfasst.
      const commit = () => {
        applyThemeClass(next);
        flushSync(() => setTheme(next));
      };

      const startViewTransition = (
        document as unknown as {
          startViewTransition?: (callback: () => void) => { finished: Promise<void> };
        }
      ).startViewTransition?.bind(document);

      if (revealRunningRef.current || prefersReducedMotion()) {
        commit();
        return;
      }

      if (!startViewTransition) {
        root.setAttribute(FADE_ATTR, "");
        commit();
        window.setTimeout(() => root.removeAttribute(FADE_ATTR), FADE_MS);
        return;
      }

      // Tastaturauslösung liefert detail === 0 und keine brauchbaren Koordinaten –
      // dann blendet der Kreis symmetrisch aus der Viewport-Mitte auf.
      const fromPointer = origin !== undefined && origin.detail !== 0;
      const x = fromPointer ? origin.clientX : window.innerWidth / 2;
      const y = fromPointer ? origin.clientY : window.innerHeight / 2;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

      root.style.setProperty("--theme-reveal-x", `${x}px`);
      root.style.setProperty("--theme-reveal-y", `${y}px`);
      root.style.setProperty("--theme-reveal-r", `${radius}px`);
      root.setAttribute(REVEAL_ATTR, "");
      revealRunningRef.current = true;

      const cleanup = () => {
        revealRunningRef.current = false;
        root.removeAttribute(REVEAL_ATTR);
      };

      startViewTransition(commit).finished.then(cleanup, cleanup);
    },
    [theme],
  );

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
