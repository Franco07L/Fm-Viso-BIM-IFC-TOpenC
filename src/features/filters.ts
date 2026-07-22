import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { railIcons } from "../core/railicons";
import { createDropdown } from "../core/dropdown";
import { getDataCache, COL_CATEGORY, type ElementRow } from "../core/datacache";
import { showInTable } from "./datatable";

type Op = "=" | "≠" | "contiene" | "no contiene" | ">" | "<" | "vacío" | "no vacío";
const OPS: Op[] = ["=", "≠", "contiene", "no contiene", ">", "<", "vacío", "no vacío"];
const NO_VALUE_OPS: Op[] = ["vacío", "no vacío"];

interface Condition {
  col: string;
  op: Op;
  val: string;
}

interface SavedView {
  name: string;
  mode: "and" | "or";
  conds: Condition[];
}

const STORAGE_KEY = "bim-viewer-saved-filters";
const FILTER_COLOR = new THREE.Color("#ff8a3d");

function evalCondition(row: ElementRow, c: Condition): boolean {
  const v = row.values[c.col] ?? "";
  switch (c.op) {
    case "vacío":
      return v === "";
    case "no vacío":
      return v !== "";
    case "=":
      return v.toLowerCase() === c.val.toLowerCase();
    case "≠":
      return v.toLowerCase() !== c.val.toLowerCase();
    case "contiene":
      return v.toLowerCase().includes(c.val.toLowerCase());
    case "no contiene":
      return !v.toLowerCase().includes(c.val.toLowerCase());
    case ">":
    case "<": {
      const a = parseFloat(v.replace(",", "."));
      const b = parseFloat(c.val.replace(",", "."));
      if (Number.isNaN(a) || Number.isNaN(b)) {
        return c.op === ">" ? v > c.val : v < c.val;
      }
      return c.op === ">" ? a > b : a < b;
    }
  }
}

/**
 * Fase B — Constructor de filtros multi-condición (propiedad + operador +
 * valor, en Y/O) con acciones sobre el resultado y vistas guardadas con nombre.
 */
export function setupFilters(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let rows: ElementRow[] = [];
  let columns: string[] = [];
  let loaded = false;
  let mode: "and" | "or" = "and";
  let conds: Condition[] = [{ col: COL_CATEGORY, op: "contiene", val: "" }];
  let matched: ElementRow[] = [];

  let saved: SavedView[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw) as SavedView[];
  } catch {
    /* sin storage */
  }
  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* sin storage */
    }
  };

  const panel = ui.sidebar.addPanel({
    id: "filters",
    icon: railIcons.filtros,
    group: "analyze",
    title: "Filtros",
    onOpen: () => void ensureLoaded(),
  });

  const intro = el(
    "p",
    "panel-hint",
    "Filtra elementos por propiedades combinando condiciones, y guarda las vistas que uses seguido.",
  );

  // Modo Y/O
  const modeSeg = el("div", "seg-control");
  const andBtn = el("button", "seg-btn active", "Todas (Y)");
  const orBtn = el("button", "seg-btn", "Alguna (O)");
  andBtn.type = orBtn.type = "button";
  modeSeg.append(andBtn, orBtn);
  andBtn.addEventListener("click", () => {
    mode = "and";
    andBtn.classList.add("active");
    orBtn.classList.remove("active");
    run();
  });
  orBtn.addEventListener("click", () => {
    mode = "or";
    orBtn.classList.add("active");
    andBtn.classList.remove("active");
    run();
  });

  const condsEl = el("div", "panel-block");
  const addBtn = el("button", "btn full", "+ Agregar condición");
  addBtn.type = "button";

  const resultEl = el("div", "clash-summary", "—");

  const actions = el("div", "panel-block row");
  const mkAction = (label: string, title: string) => {
    const b = el("button", "btn small", label);
    b.type = "button";
    b.title = title;
    actions.append(b);
    return b;
  };
  const selBtn = mkAction("Seleccionar", "Seleccionar el resultado");
  const isoBtn = mkAction("Aislar", "Aislar el resultado");
  const ghostBtn = mkAction("Ghost", "Resto translúcido, resultado sólido");
  const colorBtn = mkAction("Color", "Pintar el resultado de naranja");
  const tableBtn = mkAction("Tabla", "Ver el resultado en la Tabla BIM");
  const resetBtn = mkAction("Reset", "Mostrar todo y quitar colores");

  // Vistas guardadas
  const saveRow = el("div", "panel-block row");
  const nameInput = el("input", "text-input") as HTMLInputElement;
  nameInput.placeholder = "Nombre de la vista…";
  nameInput.style.flex = "1";
  const saveBtn = el("button", "btn small", "Guardar");
  saveBtn.type = "button";
  saveRow.append(nameInput, saveBtn);
  const savedList = el("div", "sets-list");

  panel.body.append(intro, modeSeg, condsEl, addBtn, resultEl, actions, saveRow, savedList);

  // ---------- Render de condiciones ----------
  const renderConds = () => {
    condsEl.replaceChildren();
    conds.forEach((c, i) => {
      const rowEl = el("div", "filter-cond");

      const colDd = createDropdown(columns.map((col) => ({ value: col, label: col })));
      colDd.setValue(c.col);
      colDd.onChange((v) => {
        c.col = v;
        run();
      });

      const opDd = createDropdown(OPS.map((o) => ({ value: o, label: o })));
      opDd.setValue(c.op);

      const valInput = el("input", "text-input filter-val") as HTMLInputElement;
      valInput.placeholder = "valor…";
      valInput.value = c.val;
      valInput.hidden = NO_VALUE_OPS.includes(c.op);
      valInput.addEventListener("input", () => {
        c.val = valInput.value;
        run();
      });

      opDd.onChange((v) => {
        c.op = v as Op;
        valInput.hidden = NO_VALUE_OPS.includes(c.op);
        run();
      });

      const rm = el("button", "icon-btn sm");
      rm.innerHTML = icons.close;
      rm.title = "Quitar condición";
      rm.addEventListener("click", () => {
        conds.splice(i, 1);
        if (!conds.length) conds.push({ col: columns[0] ?? COL_CATEGORY, op: "contiene", val: "" });
        renderConds();
        run();
      });

      const topRow = el("div", "filter-cond-top");
      topRow.append(colDd.element, rm);
      const botRow = el("div", "filter-cond-bot");
      botRow.append(opDd.element, valInput);
      rowEl.append(topRow, botRow);
      condsEl.append(rowEl);
    });
  };

  addBtn.addEventListener("click", () => {
    conds.push({ col: columns[0] ?? COL_CATEGORY, op: "contiene", val: "" });
    renderConds();
  });

  // ---------- Evaluación ----------
  const run = () => {
    if (!loaded) return;
    const active = conds.filter((c) => NO_VALUE_OPS.includes(c.op) || c.val.trim() !== "");
    if (!active.length) {
      matched = [];
      resultEl.textContent = "Escribe al menos una condición.";
      panel.setBadge(null);
      return;
    }
    matched = rows.filter((r) =>
      mode === "and" ? active.every((c) => evalCondition(r, c)) : active.some((c) => evalCondition(r, c)),
    );
    resultEl.textContent = `${matched.length} de ${rows.length} elementos cumplen`;
    panel.setBadge(matched.length ? String(matched.length) : null);
  };

  const mapOf = (list: ElementRow[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    for (const r of list) (map[r.modelId] ??= new Set()).add(r.localId);
    return map;
  };

  const requireMatch = () => {
    if (!matched.length) {
      showToast("El filtro no tiene resultados.", "info");
      return false;
    }
    return true;
  };

  selBtn.addEventListener("click", async () => {
    if (!requireMatch()) return;
    await viewer.highlighter.clear("select");
    await viewer.highlighter.highlightByID("select", mapOf(matched), true, false);
  });
  isoBtn.addEventListener("click", async () => {
    if (!requireMatch()) return;
    await hider.isolate(mapOf(matched));
    await viewer.update();
  });
  ghostBtn.addEventListener("click", async () => {
    if (!requireMatch()) return;
    for (const model of viewer.models()) await model.setOpacity(undefined, 0.1);
    for (const [modelId, ids] of Object.entries(mapOf(matched))) {
      const model = viewer.fragments.list.get(modelId);
      if (model && ids.size) await model.resetOpacity([...ids]);
    }
    await viewer.update();
  });
  colorBtn.addEventListener("click", async () => {
    if (!requireMatch()) return;
    for (const [modelId, ids] of Object.entries(mapOf(matched))) {
      const model = viewer.fragments.list.get(modelId);
      if (model && ids.size) await model.setColor([...ids], FILTER_COLOR);
    }
    await viewer.update();
  });
  tableBtn.addEventListener("click", () => {
    if (!requireMatch()) return;
    showInTable(new Set(matched.map((r) => r.key)));
  });
  resetBtn.addEventListener("click", async () => {
    await hider.set(true);
    for (const model of viewer.models()) {
      await model.resetColor(undefined);
      await model.resetOpacity(undefined);
    }
    await viewer.update();
  });

  // ---------- Vistas guardadas ----------
  const renderSaved = () => {
    savedList.replaceChildren();
    for (const view of saved) {
      const item = el("div", "set-item");
      const info = el("div", "set-info");
      info.append(el("span", "set-name", view.name));
      info.append(el("span", "set-count", `${view.conds.length} condición(es) · ${view.mode === "and" ? "Y" : "O"}`));

      const applyBtn = el("button", "icon-btn sm");
      applyBtn.innerHTML = icons.filter;
      applyBtn.title = "Aplicar esta vista";
      applyBtn.addEventListener("click", () => {
        mode = view.mode;
        andBtn.classList.toggle("active", mode === "and");
        orBtn.classList.toggle("active", mode === "or");
        conds = view.conds.map((c) => ({ ...c }));
        renderConds();
        run();
      });

      const delBtn = el("button", "icon-btn sm");
      delBtn.innerHTML = icons.trash;
      delBtn.title = "Eliminar vista guardada";
      delBtn.addEventListener("click", () => {
        saved = saved.filter((s) => s !== view);
        persist();
        renderSaved();
      });

      item.append(info, applyBtn, delBtn);
      savedList.append(item);
    }
  };

  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("Ponle un nombre a la vista.", "info");
      return;
    }
    saved = saved.filter((s) => s.name !== name);
    saved.push({ name, mode, conds: conds.map((c) => ({ ...c })) });
    persist();
    nameInput.value = "";
    renderSaved();
  });

  // ---------- Carga ----------
  const ensureLoaded = async () => {
    if (loaded || !viewer.models().length) return;
    resultEl.textContent = "Indexando modelo…";
    try {
      const cache = await getDataCache();
      rows = cache.rows;
      columns = cache.columns;
      loaded = true;
      resultEl.textContent = "—";
      renderConds();
      run();
    } catch (error) {
      console.error("Filtros: no se pudo indexar:", error);
      resultEl.textContent = "No se pudo indexar el modelo.";
    }
  };

  viewer.fragments.list.onItemSet.add(() => {
    loaded = false;
    rows = [];
    matched = [];
    if (panel.isOpen()) void ensureLoaded();
  });

  renderSaved();
}
