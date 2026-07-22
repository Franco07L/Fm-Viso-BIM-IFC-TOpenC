import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { showToast } from "../core/dom";
import { icons } from "../core/icons";

/**
 * Nivel 3 — Cortes (planos de sección).
 * Con el modo activo, doble-click crea un plano de corte en la cara apuntada.
 * Supr borra el plano bajo el cursor; el botón limpia todos.
 */
export function setupSections(viewer: Viewer, ui: UI) {
  const clipper = viewer.components.get(OBC.Clipper);
  clipper.enabled = false;

  let active = false;

  viewer.container.addEventListener("dblclick", () => {
    if (active) void clipper.create(viewer.world);
  });

  window.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.code === "Delete" || event.code === "Backspace") {
      void clipper.delete(viewer.world);
    }
  });

  const button = ui.bottomBar.addButton({
    icon: icons.scissors,
    label: "Cortar",
    group: "tool",
    title: "Modo corte: doble-click crea un plano · Supr borra · vuelve a pulsar para salir",
    toggle: true,
    onClick: (btn) => {
      active = !active;
      clipper.enabled = active;
      btn.setActive(active);
      if (active && !viewer.models().length) {
        showToast("Carga un modelo para cortar.", "info");
      }
    },
  });

  ui.bottomBar.addButton({
    icon: icons.reset,
    label: "Sin cortes",
    group: "tool",
    subtle: true,
    title: "Eliminar todos los planos de corte",
    onClick: () => {
      clipper.deleteAll();
      active = false;
      clipper.enabled = false;
      button.setActive(false);
      void viewer.update();
    },
  });
}
