import * as THREE from "three";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { createDropdown } from "../core/dropdown";
import {
  getDataCache,
  COL_CATEGORY,
  COL_MODEL,
  COL_NAME,
  type ElementRow,
} from "../core/datacache";

const PAGE = 300;

// API para que otras features (Filtros) muestren su resultado en la tabla.
let apiOpen: ((filterKeys: Set<string> | null) => void) | null = null;

export function showInTable(filterKeys: Set<string> | null) {
  apiOpen?.(filterKeys);
}

/**
 * Tabla BIM inferior (estilo panel de datos longitudinal): todos los elementos
 * en filas, columnas configurables por propiedad, búsqueda, click en fila
 * selecciona y enfoca, y export Excel/CSV/JSON (consumible por Power BI).
 */
export function setupDatatable(viewer: Viewer, ui: UI) {
  let allRows: ElementRow[] = [];
  let columns: string[] = [];
  let activeCols: string[] = [COL_CATEGORY, COL_NAME];
  let search = "";
  let externalFilter: Set<string> | null = null;
  let limit = PAGE;
  let loaded = false;

  // ---------- Estructura del panel ----------
  const panel = el("div", "dtable");
  panel.hidden = true;

  const head = el("div", "dtable-head");
  const title = el("span", "dtable-title", "Tabla BIM");
  const searchInput = el("input", "text-input dtable-search") as HTMLInputElement;
  searchInput.type = "search";
  searchInput.placeholder = "Buscar…";

  const colDd = createDropdown([{ value: "", label: "+ Columna" }]);
  colDd.element.classList.add("dtable-coldd");

  const filterChip = el("span", "dtable-chip");
  filterChip.hidden = true;

  const countLabel = el("span", "dtable-count", "");

  const btnExcel = el("button", "btn small", "Excel");
  btnExcel.type = "button";
  btnExcel.title = "Exportar todas las columnas a CSV para Excel (separador ;)";
  const btnCsv = el("button", "btn small", "CSV");
  btnCsv.type = "button";
  btnCsv.title = "Exportar todas las columnas a CSV estándar (Power BI)";
  const btnJson = el("button", "btn small", "JSON");
  btnJson.type = "button";

  const btnClose = el("button", "icon-btn sm");
  btnClose.innerHTML = icons.close;
  btnClose.title = "Cerrar tabla";

  head.append(title, searchInput, colDd.element, filterChip, countLabel, btnExcel, btnCsv, btnJson, btnClose);

  const scroll = el("div", "dtable-scroll");
  const table = el("table", "dtable-table");
  scroll.append(table);

  const moreBtn = el("button", "btn small dtable-more", "Mostrar más");
  moreBtn.type = "button";
  moreBtn.hidden = true;

  panel.append(head, scroll, moreBtn);
  document.body.append(panel);

  // ---------- Datos ----------
  const filtered = (): ElementRow[] => {
    let rows = allRows;
    if (externalFilter) rows = rows.filter((r) => externalFilter!.has(r.key));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        activeCols.some((c) => (r.values[c] ?? "").toLowerCase().includes(q)),
      );
    }
    return rows;
  };

  const render = () => {
    const rows = filtered();
    countLabel.textContent = `${rows.length} de ${allRows.length} elementos`;
    filterChip.hidden = !externalFilter;
    if (externalFilter) filterChip.textContent = `Filtro: ${externalFilter.size} elem. ✕`;

    table.replaceChildren();
    const thead = el("tr");
    for (const c of activeCols) {
      const th = el("th");
      th.append(el("span", undefined, c));
      if (c !== COL_CATEGORY && c !== COL_NAME) {
        const rm = el("button", "dtable-colrm", "✕");
        rm.type = "button";
        rm.title = `Quitar columna ${c}`;
        rm.addEventListener("click", () => {
          activeCols = activeCols.filter((x) => x !== c);
          refreshColDd();
          render();
        });
        th.append(rm);
      }
      thead.append(th);
    }
    table.append(thead);

    for (const row of rows.slice(0, limit)) {
      const tr = el("tr", "dtable-row");
      for (const c of activeCols) tr.append(el("td", undefined, row.values[c] ?? ""));
      tr.addEventListener("click", () => void focusRow(row, tr));
      table.append(tr);
    }

    moreBtn.hidden = rows.length <= limit;
    if (rows.length > limit) {
      moreBtn.textContent = `Mostrar más (${rows.length - limit} restantes)`;
    }
  };

  const focusRow = async (row: ElementRow, tr: HTMLElement) => {
    table.querySelectorAll(".dtable-row.sel").forEach((n) => n.classList.remove("sel"));
    tr.classList.add("sel");
    const map = { [row.modelId]: new Set([row.localId]) };
    await viewer.highlighter.clear("select");
    await viewer.highlighter.highlightByID("select", map, true, false);
    const model = viewer.fragments.list.get(row.modelId);
    if (!model) return;
    const [box] = await model.getBoxes([row.localId]);
    if (box && !box.isEmpty()) {
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      sphere.radius = Math.max(sphere.radius * 3, 4);
      await viewer.world.camera.controls.fitToSphere(sphere, true);
    }
  };

  const refreshColDd = () => {
    const remaining = columns.filter((c) => !activeCols.includes(c));
    colDd.setOptions([
      { value: "", label: "+ Columna" },
      ...remaining.map((c) => ({ value: c, label: c })),
    ]);
    colDd.setValue("");
  };

  colDd.onChange((v) => {
    if (!v) return;
    activeCols.push(v);
    refreshColDd();
    render();
  });

  searchInput.addEventListener("input", () => {
    search = searchInput.value.trim();
    limit = PAGE;
    render();
  });

  moreBtn.addEventListener("click", () => {
    limit += PAGE;
    render();
  });

  filterChip.addEventListener("click", () => {
    externalFilter = null;
    limit = PAGE;
    render();
  });

  // ---------- Export ----------
  const buildCsv = (sep: string): string => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = filtered();
    const lines = [columns.map(esc).join(sep)];
    for (const r of rows) {
      lines.push(columns.map((c) => esc(r.values[c] ?? "")).join(sep));
    }
    return lines.join("\r\n");
  };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  btnExcel.addEventListener("click", () => {
    if (!loaded) return;
    // BOM para que Excel abra UTF-8 con tildes; ";" para locales es-PE/es-ES.
    downloadFile(`tabla-bim-${stamp()}.csv`, "﻿" + buildCsv(";"), "text/csv;charset=utf-8");
  });
  btnCsv.addEventListener("click", () => {
    if (!loaded) return;
    downloadFile(`tabla-bim-${stamp()}.csv`, "﻿" + buildCsv(","), "text/csv;charset=utf-8");
  });
  btnJson.addEventListener("click", () => {
    if (!loaded) return;
    const rows = filtered().map((r) => ({ modelo: r.modelId, id: r.localId, ...r.values }));
    downloadFile(`tabla-bim-${stamp()}.json`, JSON.stringify(rows, null, 1), "application/json");
  });

  // ---------- Apertura / carga ----------
  const load = async () => {
    countLabel.textContent = "Indexando modelo…";
    try {
      const cache = await getDataCache((done, total) => {
        countLabel.textContent = `Indexando ${done}/${total}…`;
      });
      allRows = cache.rows;
      columns = cache.columns;
      if (viewer.models().length > 1 && !activeCols.includes(COL_MODEL)) {
        activeCols = [COL_MODEL, ...activeCols];
      }
      loaded = true;
      refreshColDd();
      render();
    } catch (error) {
      console.error("No se pudo indexar el modelo:", error);
      countLabel.textContent = "";
      showToast("No se pudo indexar el modelo para la tabla.");
    }
  };

  const open = async (filterKeys: Set<string> | null = externalFilter) => {
    if (!viewer.models().length) {
      showToast("Carga un modelo primero.", "info");
      return;
    }
    externalFilter = filterKeys;
    limit = PAGE;
    panel.hidden = false;
    tableBtn.setActive(true);
    if (!loaded) await load();
    else render();
  };

  const close = () => {
    panel.hidden = true;
    tableBtn.setActive(false);
  };

  btnClose.addEventListener("click", close);
  apiOpen = (keys) => void open(keys);

  const tableBtn = ui.bottomBar.addButton({
    icon: icons.table,
    label: "Tabla",
    group: "data",
    title: "Tabla BIM: todos los elementos con sus propiedades, export Excel/CSV/JSON",
    onClick: () => {
      if (panel.hidden) void open();
      else close();
    },
  });

  // Al cambiar los modelos, la tabla debe reindexar.
  viewer.fragments.list.onItemSet.add(() => {
    loaded = false;
    allRows = [];
    externalFilter = null;
    if (!panel.hidden) void load();
  });
}
