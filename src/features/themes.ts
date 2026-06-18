import { createDropdown } from "../core/dropdown";

const THEMES = [
  { id: "violet-pulse", label: "Violet Pulse" },
  { id: "cyber-grape", label: "Cyber Grape" },
  { id: "aurora-plasma", label: "Aurora Plasma" },
  { id: "nebula-glass", label: "Nebula Glass" },
  { id: "soft-lumen", label: "Soft Lumen" },
  { id: "quantum-indigo", label: "Quantum Indigo" },
];

const STORAGE_KEY = "bim-viewer-theme";
const DEFAULT_THEME = "violet-pulse";

/**
 * Selector de tema en la barra superior; conmuta data-theme y lo recuerda.
 * `onApply` se llama tras cada cambio (p. ej. para sincronizar el fondo 3D).
 */
export function setupThemes(onApply?: (themeId: string) => void) {
  const host = document.getElementById("theme-host") as HTMLElement;

  const dropdown = createDropdown(
    THEMES.map((t) => ({ value: t.id, label: t.label })),
  );
  dropdown.element.classList.add("theme-dd");
  dropdown.element.title = "Tema visual del visor";
  host.append(dropdown.element);

  const apply = (id: string) => {
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* almacenamiento no disponible: el tema se aplica igual */
    }
    onApply?.(id);
  };

  let saved = DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) saved = stored;
  } catch {
    /* sin acceso a localStorage */
  }

  dropdown.setValue(saved);
  apply(saved);

  dropdown.onChange((id) => apply(id));
}
