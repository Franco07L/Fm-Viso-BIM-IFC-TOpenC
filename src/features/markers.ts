import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, showToast } from "../core/dom";
import { icons } from "../core/icons";

/**
 * Nivel 4 — Marcadores. Con el modo activo, un click sobre el modelo coloca un
 * pin numerado en ese punto (útil para señalar zonas). "Sin marcas" los borra.
 */
export function setupMarkers(viewer: Viewer, ui: UI) {
  const marker = viewer.components.get(OBF.Marker);
  let marking = false;
  let counter = 0;

  viewer.container.addEventListener("click", async () => {
    if (!marking) return;
    const hit = await viewer.casters.get(viewer.world).castRay();
    if (!hit?.point) {
      showToast("Haz click sobre un elemento para marcarlo.", "info");
      return;
    }
    counter++;
    const pin = el("div", "map-pin");
    pin.textContent = String(counter);
    marker.create(viewer.world, pin, hit.point, true);
  });

  const markBtn = ui.bottomBar.addButton({
    icon: icons.pin,
    label: "Marcar",
    group: "annotate",
    title: "Modo marcador: click sobre el modelo coloca un pin",
    toggle: true,
    onClick: (btn) => {
      marking = !marking;
      btn.setActive(marking);
      viewer.container.style.cursor = marking ? "crosshair" : "";
      if (marking && !viewer.models().length) {
        showToast("Carga un modelo para marcar.", "info");
      }
    },
  });

  ui.bottomBar.addButton({
    icon: icons.reset,
    label: "Sin marcas",
    group: "annotate",
    subtle: true,
    title: "Eliminar todos los marcadores",
    onClick: () => {
      for (const worldMarkers of marker.list.values()) {
        for (const id of [...worldMarkers.keys()]) marker.delete(id);
      }
      counter = 0;
      marking = false;
      markBtn.setActive(false);
      viewer.container.style.cursor = "";
    },
  });
}
