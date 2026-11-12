import { useEffect } from "react";

/**
 * Phones with "Desktop site" on lay the page out near 980px and scale it down.
 * When that happens, pin the layout width to the screen so type stays readable.
 * Also keep a focused field in view when the keyboard shrinks the visual viewport.
 */
export function PhoneViewport() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const apply = () => {
      const screenWidth = window.screen.width;
      if (screenWidth > 0 && screenWidth < 520 && window.innerWidth > screenWidth * 1.4) {
        const next = `width=${Math.round(screenWidth)}, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`;
        if (meta.getAttribute("content") !== next) meta.setAttribute("content", next);
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    const bring = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
      }
    };
    document.addEventListener("focusin", bring);
    window.visualViewport?.addEventListener("resize", bring);
    window.addEventListener("resize", bring);
    return () => {
      document.removeEventListener("focusin", bring);
      window.visualViewport?.removeEventListener("resize", bring);
      window.removeEventListener("resize", bring);
    };
  }, []);

  return null;
}
