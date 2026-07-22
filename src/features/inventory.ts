import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, showToast } from "../core/dom";
import { railIcons } from "../core/railicons";
import { createDropdown } from "../core/dropdown";

/**
 * Nivel 5 — Vista de Inventario por categoría (feature diferenciador).
 * Extrae todos los elementos de una categoría, los oculta del modelo y los
 * dispone alineados en una grilla ordenada a un costado, para inventario/conteo
 * visual. Al restaurar, vuelven a su sitio. Ningún visor lo trae nativo: se
 * construye con el Mesher (geometría real) + Hider.
 */
export function setupInventory(viewer: Viewer, ui: UI) {
  const mesher = viewer.components.get(OBF.Mesher);
  const hider = viewer.components.get(OBC.Hider);
  const boxer = viewer.components.get(OBC.BoundingBoxer);

  const panel = ui.sidebar.addPanel({
    id: "inventory",
    icon: railIcons.inventario,
    group: "explore",
    title: "Inventario",
    onOpen: () => void populate(),
  });

  const intro = el(
    "p",
    "panel-hint",
    "Separa todos los elementos de una categoría y los alinea en una grilla para conteo visual. Vuelve a pulsar para restaurar.",
  );

  const catDd = createDropdown();
  const countLabel = el("span", "inv-count", "");
  const selectRow = el("div", "panel-block");
  selectRow.append(catDd.element, countLabel);

  const actionBtn = el("button", "btn primary full", "Generar inventario");
  actionBtn.type = "button";

  panel.body.append(intro, selectRow, actionBtn);

  let active = false;
  let container: THREE.Group | null = null;
  let activeMap: OBC.ModelIdMap | null = null;

  // --- Poblar categorías del primer modelo ---
  const populate = async () => {
    const model = viewer.models()[0];
    if (!model) {
      catDd.setOptions([{ value: "", label: "Carga un modelo…" }]);
      return;
    }
    const cats = (await model.getCategories())
      .filter((c) => /^IFC/.test(c))
      .sort();
    catDd.setOptions(cats.map((c) => ({ value: c, label: c })));
  };

  viewer.fragments.list.onItemSet.add(() => {
    void populate();
    if (active) void restore();
  });

  const buildMap = async (category: string): Promise<OBC.ModelIdMap> => {
    const map: OBC.ModelIdMap = {};
    for (const model of viewer.models()) {
      const found = await model.getItemsOfCategories([
        new RegExp(`^${category}$`),
      ]);
      const ids = Object.values(found).flat();
      if (ids.length) map[model.modelId] = new Set(ids);
    }
    return map;
  };

  const generate = async () => {
    const category = catDd.getValue();
    if (!category) return;
    actionBtn.disabled = true;
    actionBtn.textContent = "Generando…";
    try {
      const map = await buildMap(category);
      const total = Object.values(map).reduce((a, s) => a + s.size, 0);
      if (!total) {
        showToast("Esa categoría no tiene elementos.", "info");
        return;
      }

      // Punto de partida de la grilla: a un costado del modelo.
      boxer.list.clear();
      boxer.addFromModels();
      const modelBox = boxer.get();
      boxer.list.clear();
      const origin = new THREE.Vector3(
        modelBox.isEmpty() ? 0 : modelBox.max.x,
        modelBox.isEmpty() ? 0 : modelBox.min.y,
        modelBox.isEmpty() ? 0 : modelBox.min.z,
      );

      // Extraer geometría real de cada elemento y agruparla por elemento.
      const result = await mesher.get(map, { applyTransformation: true });
      const groups: { object: THREE.Group; box: THREE.Box3 }[] = [];
      for (const [, byLocal] of result as Map<string, Map<number, THREE.Mesh[]>>) {
        for (const [, meshes] of byLocal) {
          const object = new THREE.Group();
          for (const mesh of meshes) object.add(mesh);
          const box = new THREE.Box3().setFromObject(object);
          groups.push({ object, box });
        }
      }
      if (!groups.length) {
        showToast("No se pudo extraer la geometría.", "info");
        return;
      }

      // Separación basada en el elemento más grande.
      let maxDim = 0;
      const size = new THREE.Vector3();
      for (const { box } of groups) {
        box.getSize(size);
        maxDim = Math.max(maxDim, size.x, size.y, size.z);
      }
      const spacing = maxDim * 1.25 + 0.5;
      const cols = Math.ceil(Math.sqrt(groups.length));
      const gridStartX = origin.x + spacing;

      container = new THREE.Group();
      const center = new THREE.Vector3();
      groups.forEach(({ object, box }, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        box.getCenter(center);
        object.position.x = gridStartX + col * spacing - center.x;
        object.position.z = origin.z + row * spacing - center.z;
        object.position.y = origin.y - box.min.y; // apoyado en el plano base
        container!.add(object);
      });
      viewer.world.scene.three.add(container);

      // Ocultar los originales para que solo se vea el inventario alineado.
      await hider.set(false, map);
      activeMap = map;
      await viewer.update();

      active = true;
      actionBtn.textContent = "Restaurar modelo";
      countLabel.textContent = `${groups.length} piezas`;
    } catch (error) {
      console.error("No se pudo generar el inventario:", error);
      showToast("No se pudo generar el inventario.");
    } finally {
      actionBtn.disabled = false;
    }
  };

  const restore = async () => {
    if (container) {
      viewer.world.scene.three.remove(container);
      container.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry?.dispose();
      });
      container = null;
    }
    mesher.remove();
    if (activeMap) {
      await hider.set(true, activeMap);
      activeMap = null;
    }
    await viewer.update();
    active = false;
    actionBtn.textContent = "Generar inventario";
    countLabel.textContent = "";
  };

  actionBtn.addEventListener("click", () => {
    if (active) void restore();
    else void generate();
  });

  void populate();
}
