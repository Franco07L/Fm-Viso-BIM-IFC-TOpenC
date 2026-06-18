import type { Viewer } from "../core/viewer";
import { clearPanel, showSelection } from "../panel";

/**
 * Conecta la selección del Highlighter con el panel de propiedades.
 * - Click: selecciona un elemento (reemplaza el anterior).
 * - Ctrl + Click: añade/quita de la selección.
 * - Click en vacío o ESC: limpia la selección.
 */
export function setupSelection(viewer: Viewer) {
  const { highlighter, fragments } = viewer;

  highlighter.events.select.onHighlight.add(() => {
    void showSelection(fragments, viewer.selection());
  });

  highlighter.events.select.onClear.add(() => clearPanel());

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") void highlighter.clear("select");
  });

  clearPanel();
}
