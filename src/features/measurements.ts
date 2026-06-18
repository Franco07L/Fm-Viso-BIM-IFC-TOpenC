import * as OBF from "@thatopen/components-front";
import type * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { showToast } from "../core/dom";
import { icons } from "../core/icons";

// Interfaz estructural común a las 4 mediciones (sus genéricos concretos las
// hacen incompatibles entre sí, pero comparten estos métodos).
interface Measurer {
  world: OBC.World | null;
  enabled: boolean;
  create: (input?: unknown) => void;
  endCreation: (data?: unknown) => void;
  cancelCreation: () => void;
  delete: (data?: unknown) => void;
  list: { clear: () => void };
}

/**
 * Nivel 3 — Medición. Un botón cicla el tipo de medida
 * (Longitud → Área → Volumen → Ángulo → off). Con un tipo activo:
 * doble-click añade puntos, Enter cierra la medida, Supr borra.
 */
export function setupMeasurements(viewer: Viewer, ui: UI) {
  const components = viewer.components;
  const tools: { label: string; comp: Measurer }[] = [
    { label: "Longitud", comp: components.get(OBF.LengthMeasurement) },
    { label: "Área", comp: components.get(OBF.AreaMeasurement) },
    { label: "Volumen", comp: components.get(OBF.VolumeMeasurement) },
    { label: "Ángulo", comp: components.get(OBF.AngleMeasurement) },
  ];

  for (const { comp } of tools) {
    comp.world = viewer.world;
    comp.enabled = false;
  }

  let active = -1; // -1 = desactivado

  const setActive = (index: number) => {
    for (const { comp } of tools) comp.enabled = false;
    active = index;
    if (index >= 0) tools[index].comp.enabled = true;
  };

  const labelSpan = () => button.element.querySelector("span") as HTMLElement;

  const button = ui.bottomBar.addButton({
    icon: icons.ruler,
    label: "Medir",
    title: "Medir: doble-click pone puntos · Enter cierra · Supr borra · pulsa para cambiar de tipo",
    onClick: (btn) => {
      const next = active >= tools.length - 1 ? -1 : active + 1;
      setActive(next);
      btn.setActive(next >= 0);
      labelSpan().textContent = next >= 0 ? tools[next].label : "Medir";
      if (next >= 0 && !viewer.models().length) {
        showToast("Carga un modelo para medir.", "info");
      }
    },
  });

  ui.bottomBar.addButton({
    icon: icons.reset,
    label: "Sin medidas",
    title: "Borrar todas las medidas",
    onClick: () => {
      for (const { comp } of tools) {
        try {
          comp.list.clear();
        } catch {
          /* algunos tipos no exponen clear; se ignora */
        }
      }
      setActive(-1);
      button.setActive(false);
      labelSpan().textContent = "Medir";
      void viewer.update();
    },
  });

  viewer.container.addEventListener("dblclick", () => {
    if (active >= 0) tools[active].comp.create();
  });

  window.addEventListener("keydown", (event) => {
    if (active < 0) return;
    if (event.code === "Enter") tools[active].comp.endCreation();
    else if (event.code === "Delete" || event.code === "Backspace") {
      tools[active].comp.delete();
    } else if (event.code === "Escape") {
      tools[active].comp.cancelCreation();
    }
  });
}
