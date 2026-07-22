import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { railIcons } from "../core/railicons";
import type { ElementRow } from "../core/datacache";
import { onRolesChange, roleColumn } from "../core/paramroles";
import {
  UNIT_LABEL,
  buildPartidas,
  fmtQty,
  partidasReady,
  type PartidaNode,
  type PartidasResult,
} from "../core/partidas";

const STORAGE_KEY = "bim-viewer-partidas-off";

/**
 * Fase F — Panel de Partidas: árbol del presupuesto con metrado calculado
 * desde el modelo. Requiere el rol "Código de partida" (Configuración de datos).
 */
export function setupPartidas(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let result: PartidasResult | null = null;
  let loading = false;
  let filter = "";
  const collapsed = new Set<string>();
  const off = new Set<string>(loadOff());

  const panel = ui.sidebar.addPanel({
    id: "partidas",
    icon: railIcons.partidas,
    group: "manage",
    title: "Partidas",
    onOpen: () => void ensureBuilt(),
  });

  const intro = el("p", "panel-hint", "");

  const searchRow = el("div", "panel-block");
  const search = el("input", "text-input") as HTMLInputElement;
  search.type = "search";
  search.placeholder = "Buscar partida (código o descripción)…";
  searchRow.append(search);

  const summary = el("div", "clash-summary", "Sin datos todavía.");

  const actions = el("div", "panel-block row");
  const rebuildBtn = el("button", "btn small", "Recalcular");
  const expandBtn = el("button", "btn small", "Expandir");
  const excelBtn = el("button", "btn small", "Excel");
  rebuildBtn.type = expandBtn.type = excelBtn.type = "button";
  actions.append(rebuildBtn, expandBtn, excelBtn);

  const treeEl = el("div", "partida-tree");

  panel.body.append(intro, searchRow, summary, actions, treeEl);

  function loadOff(): string[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as string[];
    } catch {
      /* sin storage */
    }
    return [];
  }

  const persistOff = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...off]));
    } catch {
      /* sin storage */
    }
  };

  /** Filas de un nodo y toda su descendencia. */
  const rowsOf = (node: PartidaNode): ElementRow[] => {
    const out = [...node.rows];
    for (const c of node.children) out.push(...rowsOf(c));
    return out;
  };

  const mapOf = (rows: ElementRow[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    for (const r of rows) (map[r.modelId] ??= new Set()).add(r.localId);
    return map;
  };

  const focusRows = async (rows: ElementRow[]) => {
    if (!rows.length) return;
    const box = new THREE.Box3();
    const byModel = mapOf(rows);
    for (const [modelId, ids] of Object.entries(byModel)) {
      const model = viewer.fragments.list.get(modelId);
      if (!model) continue;
      const boxes = await model.getBoxes([...ids]);
      for (const b of boxes) if (b && !b.isEmpty()) box.union(b);
    }
    if (box.isEmpty()) return;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    await viewer.world.camera.controls.fitToSphere(sphere, true);
  };

  const ensureBuilt = async (force = false) => {
    if (loading) return;
    if (!viewer.models().length) {
      intro.textContent = "Carga un modelo IFC para calcular metrados.";
      return;
    }
    if (!partidasReady()) {
      intro.textContent =
        "Falta configurar el rol «Código de partida» en Configuración de datos (icono de deslizadores).";
      summary.textContent = "Sin configurar.";
      treeEl.replaceChildren();
      panel.setBadge(null);
      return;
    }
    if (result && !force) return;

    loading = true;
    intro.textContent = "Calculando metrados…";
    try {
      result = await buildPartidas();
      intro.textContent = roleColumn("partidaUnit")
        ? "Metrado calculado desde el modelo según la unidad de cada partida."
        : "Sin el rol «Unidad de partida» todas las partidas se cuentan por unidades. Asígnalo para sumar m³/m²/kg.";
      render();
    } catch (error) {
      console.error("Partidas: no se pudo calcular:", error);
      intro.textContent = "No se pudo calcular el metrado.";
    } finally {
      loading = false;
    }
  };

  /** ¿El nodo o alguno de sus descendientes casa con el filtro? */
  const matches = (node: PartidaNode): boolean => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    if (node.code.toLowerCase().includes(q)) return true;
    if (node.description.toLowerCase().includes(q)) return true;
    return node.children.some(matches);
  };

  const renderNode = (node: PartidaNode, host: HTMLElement) => {
    if (!matches(node)) return;

    const isBranch = node.children.length > 0;
    const isCollapsed = collapsed.has(node.code) && !filter;

    const row = el("div", "partida-row");
    if (isBranch) row.classList.add("branch");
    row.style.paddingLeft = `${6 + node.depth * 12}px`;

    const twisty = el("button", "partida-twisty");
    twisty.type = "button";
    if (isBranch) {
      twisty.textContent = isCollapsed ? "▸" : "▾";
      twisty.title = isCollapsed ? "Expandir" : "Contraer";
      twisty.addEventListener("click", (e) => {
        e.stopPropagation();
        if (collapsed.has(node.code)) collapsed.delete(node.code);
        else collapsed.add(node.code);
        render();
      });
    } else {
      twisty.classList.add("leaf");
      twisty.disabled = true;
    }

    const info = el("div", "partida-info");
    const codeLine = el("div", "partida-code-line");
    codeLine.append(el("span", "partida-code", node.code));
    if (node.count && !node.mixed) {
      const qty = el("span", "partida-qty");
      const unit = node.unit || UNIT_LABEL[node.kind];
      const noData = node.incomplete && !node.total;
      qty.textContent = noData ? `— ${unit}` : `${fmtQty(node.total)} ${unit}`;
      if (noData) {
        qty.classList.add("missing");
        qty.title = "Falta el parámetro de cantidad para esta unidad";
      }
      codeLine.append(qty);
    } else if (node.mixed) {
      const qty = el("span", "partida-qty mixed", "varios");
      qty.title = "Agrupa partidas de distinta unidad: no se pueden sumar";
      codeLine.append(qty);
    }
    info.append(codeLine);
    if (node.description) {
      info.append(el("span", "partida-desc", node.description));
    }
    if (node.count) {
      info.append(el("span", "set-count", `${node.count} elemento(s)`));
    }

    const useBox = el("input", "partida-use") as HTMLInputElement;
    useBox.type = "checkbox";
    useBox.checked = !off.has(node.code);
    useBox.title = "Incluir esta partida en exportaciones y resúmenes";
    useBox.addEventListener("click", (e) => e.stopPropagation());
    useBox.addEventListener("change", () => {
      if (useBox.checked) off.delete(node.code);
      else off.add(node.code);
      persistOff();
    });

    const focusBtn = el("button", "icon-btn sm");
    focusBtn.type = "button";
    focusBtn.innerHTML = icons.focus;
    focusBtn.title = "Aislar y enfocar esta partida";
    focusBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const rows = rowsOf(node);
      if (!rows.length) return;
      await hider.isolate(mapOf(rows));
      await focusRows(rows);
    });

    row.append(twisty, info, useBox, focusBtn);
    row.addEventListener("click", async () => {
      const rows = rowsOf(node);
      if (!rows.length) return;
      await viewer.highlighter.clear("select");
      await viewer.highlighter.highlightByID("select", mapOf(rows), true, false);
    });
    host.append(row);

    if (!isCollapsed) {
      for (const child of node.children) renderNode(child, host);
    }
  };

  const render = () => {
    treeEl.replaceChildren();
    if (!result) return;

    for (const root of result.roots) renderNode(root, treeEl);

    if (!treeEl.childElementCount) {
      treeEl.append(el("p", "panel-empty", filter ? "Sin coincidencias." : "No hay partidas."));
    }

    const nPartidas = result.leaves.length;
    const sinCodigo = result.unassigned.length;
    summary.textContent = `${nPartidas} partida(s) · ${result.totalRows - sinCodigo} de ${result.totalRows} elementos con código`;
    panel.setBadge(nPartidas ? String(nPartidas) : null);

    if (sinCodigo) {
      const warn = el(
        "p",
        "panel-hint",
        `${sinCodigo} elemento(s) sin código de partida (no suman metrado).`,
      );
      treeEl.append(warn);
    }
  };

  const exportExcel = () => {
    if (!result?.leaves.length) {
      showToast("No hay partidas para exportar.", "info");
      return;
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const head = ["Código", "Descripción", "Unidad", "Metrado", "Elementos"].join(";");
    const lines = result.leaves
      .filter((n) => !off.has(n.code))
      .map((n) =>
        [
          esc(n.code),
          esc(n.description),
          esc(n.unit || UNIT_LABEL[n.kind]),
          fmtQty(n.total).replace(/\./g, "").replace(",", "."),
          String(n.count),
        ].join(";"),
      );
    // BOM para que Excel reconozca UTF-8 con acentos.
    downloadFile("partidas.csv", `﻿${head}\n${lines.join("\n")}`, "text/csv");
  };

  search.addEventListener("input", () => {
    filter = search.value.trim();
    render();
  });

  rebuildBtn.addEventListener("click", () => void ensureBuilt(true));

  expandBtn.addEventListener("click", () => {
    if (collapsed.size) collapsed.clear();
    else if (result) {
      const collectBranches = (list: PartidaNode[]) => {
        for (const n of list) {
          if (n.children.length) collapsed.add(n.code);
          collectBranches(n.children);
        }
      };
      collectBranches(result.roots);
    }
    expandBtn.textContent = collapsed.size ? "Expandir" : "Contraer";
    render();
  });

  excelBtn.addEventListener("click", exportExcel);

  // Si cambia el mapeo de roles, el metrado deja de ser válido.
  onRolesChange(() => {
    result = null;
    if (panel.isOpen()) void ensureBuilt(true);
  });

  viewer.fragments.list.onItemSet.add(() => {
    result = null;
    if (panel.isOpen()) void ensureBuilt(true);
  });
}
