import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { railIcons } from "../core/railicons";
import { createDropdown } from "../core/dropdown";
import { getDataCache, type ElementRow } from "../core/datacache";
import {
  onRolesChange,
  qtyKindForUnit,
  roleColumn,
  roleValue,
  type RoleId,
} from "../core/paramroles";
import { UNIT_LABEL, elementQuantity, fmtQty } from "../core/partidas";

const STORAGE_KEY = "bim-viewer-obras-periods";
const NO_PERIOD = "Sin valorizar";

type Granularity = "periodMonth" | "periodWeek" | "periodDay";

const GRAN_LABEL: Record<Granularity, string> = {
  periodMonth: "Mensual",
  periodWeek: "Semanal",
  periodDay: "Diario",
};

interface PeriodInfo {
  name: string;
  rows: ElementRow[];
  color: string;
  opacity: number;
  visible: boolean;
  /** Metrado por unidad (m³, m², kg…) de los elementos del período. */
  qty: Map<string, number>;
}

/** Paleta determinista: mismo período → mismo color entre sesiones. */
function autoColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return hslToHex(hue, 68, 58);
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Fase H — Avance de obra (valorización real).
 *
 * Lee el período de ejecución que alguien etiquetó en el modelo (mes/semana/día)
 * y lo traduce a lectura visual: color por período, transparencia y visibilidad,
 * más el % de avance y el metrado ejecutado. Es el avance REAL reportado, no el
 * programado: complementa al Cronograma 4D (que calcula lo que debería estar).
 */
export function setupObras(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let rows: ElementRow[] = [];
  let loaded = false;
  let granularity: Granularity = "periodMonth";
  let periods: PeriodInfo[] = [];
  let applied = false;
  const savedColors: Record<string, string> = loadColors();

  const panel = ui.sidebar.addPanel({
    id: "obras",
    icon: railIcons.obras,
    group: "manage",
    title: "Avance de obra",
    onOpen: () => void ensureLoaded(),
  });

  const intro = el("p", "panel-hint", "");

  const granRow = el("div", "panel-block");
  granRow.append(el("label", "tol-label", "Período"));
  const granDd = createDropdown();
  granRow.append(granDd.element);

  const summary = el("div", "clash-summary", "Sin datos todavía.");
  const donutHost = el("div", "obra-donut");

  const actions = el("div", "panel-block row");
  const applyBtn = el("button", "btn primary small", "Aplicar colores");
  const resetBtn = el("button", "btn small", "Restaurar");
  const csvBtn = el("button", "btn small", "Excel");
  applyBtn.type = resetBtn.type = csvBtn.type = "button";
  actions.append(applyBtn, resetBtn, csvBtn);

  const listEl = el("div", "obra-list");

  panel.body.append(intro, granRow, summary, donutHost, actions, listEl);

  function loadColors(): Record<string, string> {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as Record<string, string>;
    } catch {
      /* sin storage */
    }
    return {};
  }

  const persistColors = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedColors));
    } catch {
      /* sin storage */
    }
  };

  const availableGrans = (): Granularity[] =>
    (["periodMonth", "periodWeek", "periodDay"] as Granularity[]).filter((g) =>
      roleColumn(g as RoleId),
    );

  const mapOf = (list: ElementRow[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    for (const r of list) (map[r.modelId] ??= new Set()).add(r.localId);
    return map;
  };

  /** Metrado del período agrupado por unidad (no se mezclan m³ con m²). */
  const quantitiesOf = (list: ElementRow[]): Map<string, number> => {
    const out = new Map<string, number>();
    if (!roleColumn("partidaCode")) return out;
    for (const r of list) {
      const unit = roleValue(r, "partidaUnit");
      const kind = qtyKindForUnit(unit);
      const q = elementQuantity(r, kind);
      if (Number.isNaN(q)) continue;
      const label = unit || UNIT_LABEL[kind];
      out.set(label, (out.get(label) ?? 0) + q);
    }
    return out;
  };

  const buildPeriods = () => {
    const byPeriod = new Map<string, ElementRow[]>();
    for (const r of rows) {
      const raw = roleValue(r, granularity as RoleId).trim();
      const name = raw || NO_PERIOD;
      const list = byPeriod.get(name) ?? byPeriod.set(name, []).get(name)!;
      list.push(r);
    }

    const names = [...byPeriod.keys()]
      .filter((n) => n !== NO_PERIOD)
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    if (byPeriod.has(NO_PERIOD)) names.push(NO_PERIOD);

    periods = names.map((name, i) => ({
      name,
      rows: byPeriod.get(name)!,
      color:
        savedColors[name] ??
        (name === NO_PERIOD ? "#6b7280" : autoColor(i, Math.max(names.length - 1, 1))),
      opacity: 1,
      visible: true,
      qty: quantitiesOf(byPeriod.get(name)!),
    }));
  };

  const ensureLoaded = async (force = false) => {
    if (!viewer.models().length) {
      intro.textContent = "Carga un modelo IFC para leer el avance.";
      return;
    }
    const grans = availableGrans();
    if (!grans.length) {
      intro.textContent =
        "Falta configurar un «Período ejecutado» (mensual/semanal/diario) en Configuración de datos.";
      summary.textContent = "Sin configurar.";
      listEl.replaceChildren();
      donutHost.replaceChildren();
      panel.setBadge(null);
      return;
    }
    if (!grans.includes(granularity)) granularity = grans[0];
    granDd.setOptions(grans.map((g) => ({ value: g, label: GRAN_LABEL[g] })));
    granDd.setValue(granularity);

    if (loaded && !force) {
      buildPeriods();
      render();
      return;
    }

    intro.textContent = "Indexando modelo…";
    try {
      rows = (await getDataCache()).rows;
      loaded = true;
      intro.textContent =
        "Avance REAL reportado en el modelo. Colorea por período para comunicar el estado de obra.";
      buildPeriods();
      render();
    } catch (error) {
      console.error("Obras: no se pudo indexar:", error);
      intro.textContent = "No se pudo indexar el modelo.";
    }
  };

  const renderDonut = () => {
    donutHost.replaceChildren();
    const total = rows.length;
    if (!total || !periods.length) return;

    const R = 52;
    const C = 2 * Math.PI * R;
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 140 140");
    svg.setAttribute("class", "obra-donut-svg");

    let offset = 0;
    for (const p of periods) {
      const frac = p.rows.length / total;
      const circle = document.createElementNS(svgNs, "circle");
      circle.setAttribute("cx", "70");
      circle.setAttribute("cy", "70");
      circle.setAttribute("r", String(R));
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", p.color);
      circle.setAttribute("stroke-width", "20");
      circle.setAttribute("stroke-dasharray", `${frac * C} ${C}`);
      circle.setAttribute("stroke-dashoffset", String(-offset));
      circle.setAttribute("transform", "rotate(-90 70 70)");
      const title = document.createElementNS(svgNs, "title");
      title.textContent = `${p.name}: ${(frac * 100).toFixed(1)}%`;
      circle.append(title);
      svg.append(circle);
      offset += frac * C;
    }

    const done = rows.length - (periods.find((p) => p.name === NO_PERIOD)?.rows.length ?? 0);
    const pct = total ? (done / total) * 100 : 0;
    const text = document.createElementNS(svgNs, "text");
    text.setAttribute("x", "70");
    text.setAttribute("y", "70");
    text.setAttribute("class", "obra-donut-label");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = `${pct.toFixed(0)}%`;
    svg.append(text);

    donutHost.append(svg);
    donutHost.append(el("span", "set-count", `${done} de ${total} elementos valorizados`));
  };

  const render = () => {
    listEl.replaceChildren();
    const total = rows.length;

    if (!periods.length) {
      listEl.append(el("p", "panel-empty", "Sin períodos en el modelo."));
      panel.setBadge(null);
      return;
    }

    for (const p of periods) {
      const pct = total ? (p.rows.length / total) * 100 : 0;
      const item = el("div", "obra-row");

      const swatch = el("input", "obra-swatch") as HTMLInputElement;
      swatch.type = "color";
      swatch.value = p.color;
      swatch.title = "Color del período";
      swatch.addEventListener("input", () => {
        p.color = swatch.value;
        savedColors[p.name] = p.color;
        persistColors();
        renderDonut();
        if (applied) void applyColors();
      });

      const info = el("div", "set-info");
      info.append(el("span", "set-name", p.name));
      const qtyText = [...p.qty.entries()]
        .map(([u, v]) => `${fmtQty(v)} ${u}`)
        .join(" · ");
      info.append(
        el(
          "span",
          "set-count",
          `${p.rows.length} elem. · ${pct.toFixed(1)}%${qtyText ? ` · ${qtyText}` : ""}`,
        ),
      );

      const bar = el("div", "obra-bar");
      const fill = el("div", "obra-bar-fill");
      fill.style.width = `${pct}%`;
      fill.style.background = p.color;
      bar.append(fill);
      info.append(bar);

      const opacity = el("input", "obra-opacity") as HTMLInputElement;
      opacity.type = "range";
      opacity.min = "10";
      opacity.max = "100";
      opacity.value = String(Math.round(p.opacity * 100));
      opacity.title = "Transparencia del período";
      opacity.addEventListener("input", () => {
        p.opacity = Number(opacity.value) / 100;
        if (applied) void applyOpacity(p);
      });

      const eye = el("button", "icon-btn sm");
      eye.type = "button";
      eye.innerHTML = p.visible ? icons.eye : icons.eyeOff;
      eye.title = "Mostrar/ocultar este período";
      eye.addEventListener("click", async () => {
        p.visible = !p.visible;
        eye.innerHTML = p.visible ? icons.eye : icons.eyeOff;
        await hider.set(p.visible, mapOf(p.rows));
        await viewer.update();
      });

      item.append(swatch, info, opacity, eye);
      item.addEventListener("click", async (e) => {
        if ((e.target as HTMLElement).closest("input,button")) return;
        await viewer.highlighter.clear("select");
        await viewer.highlighter.highlightByID("select", mapOf(p.rows), true, false);
      });
      listEl.append(item);
    }

    const done = total - (periods.find((p) => p.name === NO_PERIOD)?.rows.length ?? 0);
    summary.textContent = `${periods.length} período(s) · ${((done / total) * 100).toFixed(1)}% valorizado`;
    panel.setBadge(String(periods.filter((p) => p.name !== NO_PERIOD).length));
    renderDonut();
  };

  const applyOpacity = async (p: PeriodInfo) => {
    for (const [modelId, ids] of Object.entries(mapOf(p.rows))) {
      const model = viewer.fragments.list.get(modelId);
      if (!model || !ids.size) continue;
      if (p.opacity >= 0.99) await model.resetOpacity([...ids]);
      else await model.setOpacity([...ids], p.opacity);
    }
    await viewer.update();
  };

  const applyColors = async () => {
    for (const p of periods) {
      const color = new THREE.Color();
      color.setStyle(p.color, THREE.SRGBColorSpace);
      for (const [modelId, ids] of Object.entries(mapOf(p.rows))) {
        const model = viewer.fragments.list.get(modelId);
        if (model && ids.size) await model.setColor([...ids], color);
      }
      if (p.opacity < 0.99) await applyOpacity(p);
    }
    await viewer.update();
    applied = true;
  };

  const resetVisual = async () => {
    await hider.set(true);
    for (const model of viewer.models()) {
      await model.resetColor(undefined);
      await model.resetOpacity(undefined);
    }
    for (const p of periods) {
      p.visible = true;
      p.opacity = 1;
    }
    applied = false;
    await viewer.update();
    render();
  };

  const exportCsv = () => {
    if (!periods.length) {
      showToast("No hay períodos para exportar.", "info");
      return;
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const total = rows.length;
    const head = ["Período", "Elementos", "% del total", "Metrado ejecutado"].join(";");
    const lines = periods.map((p) =>
      [
        esc(p.name),
        String(p.rows.length),
        ((p.rows.length / total) * 100).toFixed(2).replace(".", ","),
        esc([...p.qty.entries()].map(([u, v]) => `${fmtQty(v)} ${u}`).join(" · ")),
      ].join(";"),
    );
    downloadFile("avance-obra.csv", `﻿${head}\n${lines.join("\n")}`, "text/csv");
  };

  granDd.onChange((v) => {
    granularity = v as Granularity;
    buildPeriods();
    render();
    if (applied) void applyColors();
  });

  applyBtn.addEventListener("click", () => void applyColors());
  resetBtn.addEventListener("click", () => void resetVisual());
  csvBtn.addEventListener("click", exportCsv);

  onRolesChange(() => {
    if (panel.isOpen()) void ensureLoaded();
  });

  viewer.fragments.list.onItemSet.add(() => {
    loaded = false;
    rows = [];
    periods = [];
    applied = false;
    if (panel.isOpen()) void ensureLoaded(true);
  });
}
