import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { createDropdown } from "../core/dropdown";
import { getDataCache, type ElementRow } from "../core/datacache";

const STORAGE_KEY = "bim-viewer-audit-params";
const MISSING_COLOR = new THREE.Color("#ff3b3b");
const OK_COLOR = new THREE.Color("#39d98a");

/**
 * Auditoría de completitud de datos (estilo Quantor): elige parámetros clave
 * (código, descripción, partida…) y el panel cuenta cuántos elementos los
 * tienen vacíos, con acciones para verlos y un heatmap completos/incompletos.
 */
export function setupAudit(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let audited: string[] = [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) audited = JSON.parse(saved) as string[];
  } catch {
    /* sin storage */
  }

  let rows: ElementRow[] = [];
  let columns: string[] = [];
  let loaded = false;
  let heatmapOn = false;

  const panel = ui.sidebar.addPanel({
    id: "audit",
    icon: icons.audit,
    title: "Auditoría",
    onOpen: () => void ensureLoaded(),
  });

  const intro = el(
    "p",
    "panel-hint",
    "Controla la completitud de datos: cuántos elementos tienen vacío cada parámetro clave (código, descripción, partida…).",
  );

  const addRow = el("div", "panel-block");
  const paramDd = createDropdown([{ value: "", label: "+ Auditar parámetro…" }]);
  addRow.append(paramDd.element);

  const listEl = el("div", "sets-list");
  const emptyEl = el("p", "panel-empty", "Añade parámetros para auditar.");

  const heatBtn = el("button", "btn full", "Heatmap: apagado");
  heatBtn.type = "button";
  heatBtn.title = "Rojo: le falta algún parámetro auditado · Verde: completo";
  const clearBtn = el("button", "btn small", "Quitar colores");
  clearBtn.type = "button";
  const actions = el("div", "panel-block row");
  actions.append(clearBtn);

  panel.body.append(intro, addRow, listEl, heatBtn, actions);

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(audited));
    } catch {
      /* sin storage */
    }
  };

  const missingOf = (col: string): ElementRow[] => rows.filter((r) => !(r.values[col] ?? ""));

  const mapOf = (list: ElementRow[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    for (const r of list) (map[r.modelId] ??= new Set()).add(r.localId);
    return map;
  };

  const paint = async (map: OBC.ModelIdMap, color: THREE.Color) => {
    for (const [modelId, ids] of Object.entries(map)) {
      const model = viewer.fragments.list.get(modelId);
      if (model && ids.size) await model.setColor([...ids], color);
    }
  };

  const clearColors = async () => {
    for (const model of viewer.models()) await model.resetColor(undefined);
    heatmapOn = false;
    heatBtn.textContent = "Heatmap: apagado";
    heatBtn.classList.remove("active");
    await viewer.update();
  };

  const applyHeatmap = async () => {
    if (!audited.length) {
      showToast("Añade al menos un parámetro a auditar.", "info");
      return;
    }
    const missing = rows.filter((r) => audited.some((c) => !(r.values[c] ?? "")));
    const complete = rows.filter((r) => audited.every((c) => (r.values[c] ?? "") !== ""));
    await paint(mapOf(complete), OK_COLOR);
    await paint(mapOf(missing), MISSING_COLOR);
    await viewer.update();
    heatBtn.textContent = `Heatmap: ${missing.length} incompletos`;
    heatBtn.classList.add("active");
    heatmapOn = true;
  };

  const render = () => {
    listEl.replaceChildren();
    const totalMissing = new Set<string>();
    if (!audited.length) {
      listEl.append(emptyEl);
      panel.setBadge(null);
      return;
    }
    for (const col of audited) {
      const missing = missingOf(col);
      missing.forEach((r) => totalMissing.add(r.key));

      const item = el("div", "set-item");
      const dot = el("span", "set-swatch");
      dot.style.background = missing.length ? "#ff3b3b" : "#39d98a";
      dot.style.borderRadius = "50%";

      const info = el("div", "set-info");
      info.append(el("span", "set-name", `Sin ${col}`));
      info.append(
        el("span", "set-count", missing.length ? `${missing.length} elementos` : "Completo ✓"),
      );

      const selBtn = el("button", "icon-btn sm");
      selBtn.type = "button";
      selBtn.innerHTML = icons.cursor;
      selBtn.title = "Seleccionar los que lo tienen vacío";
      selBtn.addEventListener("click", async () => {
        if (!missing.length) return;
        await viewer.highlighter.clear("select");
        await viewer.highlighter.highlightByID("select", mapOf(missing), true, false);
      });

      const isoBtn = el("button", "icon-btn sm");
      isoBtn.type = "button";
      isoBtn.innerHTML = icons.focus;
      isoBtn.title = "Aislar y pintar en rojo los que lo tienen vacío";
      isoBtn.addEventListener("click", async () => {
        if (!missing.length) return;
        const map = mapOf(missing);
        await hider.isolate(map);
        await paint(map, MISSING_COLOR);
        await viewer.update();
      });

      const rmBtn = el("button", "icon-btn sm");
      rmBtn.type = "button";
      rmBtn.innerHTML = icons.trash;
      rmBtn.title = "Dejar de auditar este parámetro";
      rmBtn.addEventListener("click", () => {
        audited = audited.filter((c) => c !== col);
        persist();
        refreshDd();
        render();
      });

      item.append(dot, info, selBtn, isoBtn, rmBtn);
      listEl.append(item);
    }
    panel.setBadge(totalMissing.size ? String(totalMissing.size) : null);
  };

  const refreshDd = () => {
    const remaining = columns.filter((c) => !audited.includes(c));
    paramDd.setOptions([
      { value: "", label: "+ Auditar parámetro…" },
      ...remaining.map((c) => ({ value: c, label: c })),
    ]);
    paramDd.setValue("");
  };

  paramDd.onChange((v) => {
    if (!v) return;
    audited.push(v);
    persist();
    refreshDd();
    render();
  });

  const ensureLoaded = async () => {
    if (loaded || !viewer.models().length) return;
    intro.textContent = "Indexando modelo…";
    try {
      const cache = await getDataCache();
      rows = cache.rows;
      columns = cache.columns;
      loaded = true;
      // Descartar parámetros guardados que no existen en este modelo.
      audited = audited.filter((c) => columns.includes(c));
      intro.textContent =
        "Controla la completitud de datos: cuántos elementos tienen vacío cada parámetro clave.";
      refreshDd();
      render();
    } catch (error) {
      console.error("Auditoría: no se pudo indexar:", error);
      intro.textContent = "No se pudo indexar el modelo.";
    }
  };

  heatBtn.addEventListener("click", () => {
    if (heatmapOn) void clearColors();
    else void applyHeatmap();
  });
  clearBtn.addEventListener("click", () => void clearColors());

  viewer.fragments.list.onItemSet.add(() => {
    loaded = false;
    rows = [];
    if (panel.isOpen()) void ensureLoaded();
  });

  render();
}
