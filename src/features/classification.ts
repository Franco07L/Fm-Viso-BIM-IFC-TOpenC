import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import {
  resolveGroups,
  listCriteria,
  type GroupCriterion,
} from "../core/grouping";
import { presetColorFor } from "../core/subdisciplines";
import { createDropdown } from "../core/dropdown";

interface GroupRow {
  name: string;
  map: OBC.ModelIdMap;
  count: number;
  color: THREE.Color;
}

function countMap(map: OBC.ModelIdMap): number {
  let total = 0;
  for (const ids of Object.values(map)) total += ids.size;
  return total;
}

function paletteColor(index: number, total: number): THREE.Color {
  const hue = (index / Math.max(total, 1)) * 0.85;
  return new THREE.Color().setHSL(hue, 0.6, 0.55);
}

/**
 * Conjuntos por criterio (Nivel 2 + colores por subdisciplina).
 * Agrupa los elementos por categoría, modelo, atributo o property set, y permite
 * seleccionar / aislar / colorear cada grupo, colorear todos (mapa por
 * disciplina) y exportar.
 */
export async function setupClassification(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let criteria: { label: string; value: GroupCriterion }[] = [
    { label: "Categoría IFC", value: { type: "category", label: "Categoría IFC" } },
    { label: "Modelo / archivo", value: { type: "model", label: "Modelo" } },
  ];
  let criterion: GroupCriterion = criteria[0].value;
  let rows: GroupRow[] = [];
  // Colores fijados manualmente por el usuario (sobrescriben tabla y paleta).
  const colorOverrides = new Map<string, THREE.Color>();

  // Prioridad: override manual → tabla RGB de subdisciplina → paleta automática.
  const assignColor = (name: string, index: number, total: number): THREE.Color => {
    const override = colorOverrides.get(name);
    if (override) return override.clone();
    return presetColorFor(name) ?? paletteColor(index, total);
  };

  const panel = ui.sidebar.addPanel({
    id: "sets",
    icon: icons.layers,
    title: "Conjuntos",
    onOpen: () => void refreshCriteria(),
  });

  // --- Controles ---
  const controls = el("div", "panel-block");
  controls.append(el("label", "tol-label", "Agrupar por"));
  const critDd = createDropdown();
  const generateBtn = el("button", "btn primary full", "Generar conjuntos");
  generateBtn.type = "button";
  controls.append(critDd.element, generateBtn);

  const actions = el("div", "panel-block row");
  const colorAllBtn = el("button", "btn small", "Colorear");
  const clearColorBtn = el("button", "btn small", "Quitar color");
  const exportBtn = el("button", "btn small", "Exportar");
  colorAllBtn.type = clearColorBtn.type = exportBtn.type = "button";
  actions.append(colorAllBtn, clearColorBtn, exportBtn);

  const listEl = el("div", "sets-list");
  const emptyEl = el("p", "panel-empty", "Genera conjuntos para empezar.");
  listEl.append(emptyEl);

  panel.body.append(controls, actions, listEl);

  // --- Criterios disponibles ---
  const refreshCriteria = async () => {
    if (!viewer.models().length) return;
    try {
      const opts = await listCriteria(viewer);
      criteria = [
        { label: "Categoría IFC", value: { type: "category", label: "Categoría IFC" } },
        { label: "Modelo / archivo", value: { type: "model", label: "Modelo" } },
        ...opts.attributes.map((name) => ({
          label: `Atributo: ${name}`,
          value: { type: "attribute" as const, name, label: name },
        })),
        ...opts.properties.map((p) => ({
          label: `${p.prop} (${p.pset})`,
          value: { type: "property" as const, pset: p.pset, prop: p.prop, label: p.prop },
        })),
      ];
      critDd.setOptions(
        criteria.map((c, i) => ({ value: String(i), label: c.label })),
      );
      criterion = criteria[Number(critDd.getValue()) || 0].value;
    } catch (error) {
      console.error("No se pudieron leer los criterios:", error);
    }
  };

  critDd.onChange((v) => {
    criterion = criteria[Number(v) || 0].value;
  });

  // --- Aplicación sobre el modelo ---
  const colorMap = async (map: OBC.ModelIdMap, color: THREE.Color) => {
    for (const [modelId, ids] of Object.entries(map)) {
      const model = viewer.fragments.list.get(modelId);
      if (model && ids.size) await model.setColor([...ids], color);
    }
  };

  const clearColors = async () => {
    for (const model of viewer.models()) await model.resetColor(undefined);
    await viewer.update();
  };

  const colorAll = async () => {
    if (!rows.length) return;
    for (const row of rows) await colorMap(row.map, row.color);
    await viewer.update();
  };

  const exportSets = () => {
    if (!rows.length) {
      showToast("No hay conjuntos para exportar.", "info");
      return;
    }
    const header = "Grupo,Elementos";
    const body = rows
      .map((r) => `"${r.name.replace(/"/g, '""')}",${r.count}`)
      .join("\n");
    downloadFile("conjuntos.csv", `${header}\n${body}`, "text/csv");
  };

  // --- Render ---
  const renderList = () => {
    listEl.replaceChildren();
    panel.setBadge(rows.length ? String(rows.length) : null);
    if (!rows.length) {
      listEl.append(emptyEl);
      return;
    }
    for (const row of rows) {
      const item = el("div", "set-item");

      const swatch = el("span", "set-swatch editable");
      swatch.style.background = `#${row.color.getHexString()}`;
      swatch.title = "Click para cambiar el color de este grupo";
      // Click en el swatch → selector de color nativo; el color se fija como
      // override manual y se aplica al modelo.
      swatch.addEventListener("click", () => {
        const input = el("input") as HTMLInputElement;
        input.type = "color";
        input.value = `#${row.color.getHexString()}`;
        input.style.position = "fixed";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        document.body.append(input);
        input.addEventListener("input", async () => {
          row.color.set(input.value);
          colorOverrides.set(row.name, row.color.clone());
          swatch.style.background = input.value;
          await colorMap(row.map, row.color);
          await viewer.update();
        });
        input.addEventListener("change", () => input.remove());
        input.click();
      });

      const info = el("div", "set-info");
      info.append(el("span", "set-name", row.name));
      info.append(el("span", "set-count", `${row.count} elem.`));

      const selectBtn = el("button", "icon-btn sm");
      selectBtn.type = "button";
      selectBtn.innerHTML = icons.cursor;
      selectBtn.title = "Seleccionar este conjunto (selección por lotes)";
      selectBtn.addEventListener("click", async () => {
        await viewer.highlighter.clear("select");
        await viewer.highlighter.highlightByID("select", row.map, true, false);
      });

      const isolateBtn = el("button", "icon-btn sm");
      isolateBtn.type = "button";
      isolateBtn.innerHTML = icons.focus;
      isolateBtn.title = "Aislar este conjunto";
      isolateBtn.addEventListener("click", async () => {
        await hider.isolate(row.map);
        await viewer.update();
      });

      const colorBtn = el("button", "icon-btn sm");
      colorBtn.type = "button";
      colorBtn.innerHTML = icons.palette;
      colorBtn.title = "Colorear este conjunto";
      colorBtn.addEventListener("click", async () => {
        await colorMap(row.map, row.color);
        await viewer.update();
      });

      item.append(swatch, info, selectBtn, isolateBtn, colorBtn);
      listEl.append(item);
    }
  };

  // --- Generar ---
  const generate = async () => {
    if (!viewer.models().length) {
      showToast("Carga un modelo primero.", "info");
      return;
    }
    generateBtn.disabled = true;
    generateBtn.textContent = "Generando…";
    try {
      const grouped = await resolveGroups(viewer, criterion);
      const groups = new Map<string, OBC.ModelIdMap>();
      for (const g of grouped) {
        const map = groups.get(g.group) ?? {};
        (map[g.modelId] ??= new Set()).add(g.localId);
        groups.set(g.group, map);
      }

      const names = [...groups.keys()].sort((a, b) =>
        a.localeCompare(b, "es", { numeric: true }),
      );
      const collected: GroupRow[] = names.map((name) => {
        const map = groups.get(name)!;
        return { name, map, count: countMap(map), color: new THREE.Color() };
      });
      collected.forEach((row, i) => (row.color = assignColor(row.name, i, collected.length)));
      rows = collected;
      renderList();
      if (!rows.length) showToast("No se encontraron grupos.", "info");
    } catch (error) {
      console.error("No se pudieron generar los conjuntos:", error);
      showToast("No se pudieron generar los conjuntos.");
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generar conjuntos";
    }
  };

  generateBtn.addEventListener("click", () => void generate());
  colorAllBtn.addEventListener("click", () => void colorAll());
  clearColorBtn.addEventListener("click", () => void clearColors());
  exportBtn.addEventListener("click", exportSets);

  viewer.fragments.list.onItemSet.add(() => {
    rows = [];
    renderList();
  });

  renderList();
}
