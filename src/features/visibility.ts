import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { showToast } from "../core/dom";
import { icons } from "../core/icons";

/**
 * Nivel 1 — Visibilidad. Acciones rápidas en la barra inferior:
 * Mostrar todo · Aislar selección · Ocultar selección · Ghost (resto translúcido).
 */
export function setupVisibility(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  const hasSelection = () => {
    const sel = viewer.selection();
    return Object.values(sel).some((ids) => ids.size > 0);
  };

  const requireSelection = () => {
    if (hasSelection()) return true;
    showToast("Selecciona uno o más elementos primero.", "info");
    return false;
  };

  const requireModels = () => {
    if (viewer.models().length) return true;
    showToast("Carga un modelo primero.", "info");
    return false;
  };

  let ghostOn = false;
  let ghostBtn: import("../core/toolbar").ToolButton | null = null;

  const showAll = async () => {
    if (!requireModels()) return;
    await hider.set(true);
    for (const model of viewer.models()) await model.resetOpacity(undefined);
    ghostOn = false;
    ghostBtn?.setActive(false);
    await viewer.update();
  };

  const isolate = async () => {
    if (!requireSelection()) return;
    await hider.isolate(viewer.selection());
    await viewer.update();
  };

  const hide = async () => {
    if (!requireSelection()) return;
    await hider.set(false, viewer.selection());
    await viewer.update();
  };

  // Ghost global (estilo BIMETRYC): toggle que deja TODO translúcido; si hay
  // selección, esta queda sólida. Volver a pulsar restaura la opacidad.
  const ghost = async () => {
    if (!requireModels()) return;
    ghostOn = !ghostOn;
    ghostBtn?.setActive(ghostOn);
    if (ghostOn) {
      for (const model of viewer.models()) await model.setOpacity(undefined, 0.12);
      for (const [modelId, ids] of Object.entries(viewer.selection())) {
        const model = viewer.fragments.list.get(modelId);
        if (model && ids.size) await model.resetOpacity([...ids]);
      }
    } else {
      for (const model of viewer.models()) await model.resetOpacity(undefined);
    }
    await viewer.update();
  };

  const { bottomBar } = ui;
  bottomBar.addButton({
    icon: icons.eye,
    label: "Todo",
    title: "Mostrar todos los elementos",
    onClick: () => void showAll(),
  });
  bottomBar.addButton({
    icon: icons.focus,
    label: "Aislar",
    title: "Aislar la selección (oculta el resto)",
    onClick: () => void isolate(),
  });
  bottomBar.addButton({
    icon: icons.eyeOff,
    label: "Ocultar",
    title: "Ocultar la selección",
    onClick: () => void hide(),
  });
  ghostBtn = bottomBar.addButton({
    icon: icons.ghost,
    label: "Ghost",
    title: "Fantasma global: todo translúcido (la selección queda sólida). Pulsa de nuevo para restaurar.",
    onClick: () => void ghost(),
  });
  bottomBar.addSeparator();
  bottomBar.addButton({
    icon: icons.home,
    label: "Encuadrar",
    title: "Encuadrar el modelo (tecla Inicio)",
    onClick: () => void viewer.fitToModels(),
  });
}
