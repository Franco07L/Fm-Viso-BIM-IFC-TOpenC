import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { getDataCache, type ElementRow } from "../core/datacache";
import { onRolesChange, roleColumn, roleValue } from "../core/paramroles";
import {
  ScheduleError,
  clearSavedSchedule,
  computeEvm,
  dateToIso,
  fmtMoney,
  isoToDate,
  loadSavedSchedule,
  parseSchedule,
  phaseAt,
  saveSchedule,
  type ScheduleActivity,
  type ScheduleData,
} from "../core/schedule";

const COLOR_DONE = new THREE.Color("#39d98a");
const COLOR_RUNNING = new THREE.Color("#ffb43d");
const COLOR_PENDING = new THREE.Color("#4b5563");

/**
 * Fase I — Cronograma 4D, curva S y EVM.
 *
 * Carga el `cronograma_viewer.json` que emite `bim4d_discretizer` y lo cruza
 * con el modelo por el rol «Código de actividad». Da tres lecturas:
 *  · Gantt navegable (click → aísla y enfoca los elementos de la actividad).
 *  · Simulación 4D: un cursor de fecha pinta ejecutado / en curso / pendiente.
 *  · Curva S programada vs ejecutada (EVM/SPI), cruzando con Avance de obra.
 */
export function setupSchedule(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let data: ScheduleData | null = loadSavedSchedule();
  let rows: ElementRow[] = [];
  let indexed = false;
  /** Elementos del modelo por código de actividad. */
  let byCode = new Map<string, ElementRow[]>();
  let cursor: Date | null = null;
  let simulating = false;

  const panel = ui.sidebar.addPanel({
    id: "schedule",
    icon: icons.gantt,
    title: "Cronograma 4D",
    onOpen: () => void ensureIndexed(),
  });

  const intro = el("p", "panel-hint", "");

  const fileInput = el("input") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;

  const loadRow = el("div", "panel-block row");
  const loadBtn = el("button", "btn primary small", "Cargar cronograma…");
  const clearBtn = el("button", "btn small", "Quitar");
  loadBtn.type = clearBtn.type = "button";
  loadRow.append(loadBtn, clearBtn, fileInput);

  const summary = el("div", "clash-summary", "Sin cronograma cargado.");

  // --- Simulación 4D ---
  const simWrap = el("div", "sched-sim");
  const simHead = el("div", "panel-block row");
  const simBtn = el("button", "btn small", "Simular 4D");
  const simReset = el("button", "btn small", "Restaurar");
  simBtn.type = simReset.type = "button";
  simHead.append(simBtn, simReset);
  const dateLabel = el("div", "sched-date", "—");
  const slider = el("input", "sched-slider") as HTMLInputElement;
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "100";
  const legend = el("div", "sched-legend");
  for (const [cls, text] of [
    ["done", "Ejecutado"],
    ["running", "En curso"],
    ["pending", "Pendiente"],
  ] as const) {
    const item = el("span", `sched-leg ${cls}`);
    item.append(el("i"), el("span", undefined, text));
    legend.append(item);
  }
  simWrap.append(simHead, dateLabel, slider, legend);

  // --- Acciones de vista ---
  const viewRow = el("div", "panel-block row");
  const ganttBtn = el("button", "btn small", "Ver Gantt");
  const curveBtn = el("button", "btn small", "Curva S / EVM");
  const csvBtn = el("button", "btn small", "Excel");
  ganttBtn.type = curveBtn.type = csvBtn.type = "button";
  viewRow.append(ganttBtn, curveBtn, csvBtn);

  const listEl = el("div", "sched-list");

  panel.body.append(intro, loadRow, summary, simWrap, viewRow, listEl);

  // ---------- Índice modelo ↔ cronograma ----------
  const ensureIndexed = async () => {
    renderIntro();
    if (!data || !viewer.models().length) {
      render();
      return;
    }
    if (!roleColumn("scheduleCode")) {
      render();
      return;
    }
    if (indexed) {
      render();
      return;
    }
    try {
      rows = (await getDataCache()).rows;
      byCode = new Map();
      for (const r of rows) {
        const code = roleValue(r, "scheduleCode").trim();
        if (!code) continue;
        const list = byCode.get(code) ?? byCode.set(code, []).get(code)!;
        list.push(r);
      }
      indexed = true;
    } catch (error) {
      console.error("Cronograma: no se pudo indexar el modelo:", error);
    }
    render();
  };

  const renderIntro = () => {
    if (!data) {
      intro.textContent =
        "Carga el cronograma_viewer.json que genera el discretizador BIM 4D (carpeta salidas/).";
      return;
    }
    if (!roleColumn("scheduleCode")) {
      intro.textContent =
        "Cronograma cargado. Para cruzarlo con el 3D asigna el rol «Código de actividad» en Configuración de datos.";
      return;
    }
    intro.textContent = "Cronograma cruzado con el modelo por código de actividad.";
  };

  const mapOf = (list: ElementRow[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    for (const r of list) (map[r.modelId] ??= new Set()).add(r.localId);
    return map;
  };

  const rowsOfActivity = (a: ScheduleActivity): ElementRow[] =>
    a.codigo ? (byCode.get(a.codigo) ?? []) : [];

  const linkedCount = (): number =>
    data ? data.actividades.filter((a) => rowsOfActivity(a).length).length : 0;

  // ---------- Simulación 4D ----------
  const timeline = (): { start: Date; end: Date } | null => {
    if (!data) return null;
    const dates = data.actividades
      .flatMap((a) => [a.inicio, a.fin])
      .filter((d): d is string => !!d)
      .map(isoToDate);
    if (!dates.length) return null;
    return {
      start: new Date(Math.min(...dates.map((d) => d.getTime()))),
      end: new Date(Math.max(...dates.map((d) => d.getTime()))),
    };
  };

  const cursorFromSlider = (): Date | null => {
    const t = timeline();
    if (!t) return null;
    const frac = Number(slider.value) / 100;
    return new Date(t.start.getTime() + (t.end.getTime() - t.start.getTime()) * frac);
  };

  const applySimulation = async () => {
    if (!data) return;
    const cut = cursorFromSlider();
    if (!cut) return;
    cursor = cut;
    dateLabel.textContent = cut.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const groups: Record<"done" | "running" | "pending", ElementRow[]> = {
      done: [],
      running: [],
      pending: [],
    };
    for (const a of data.actividades) {
      const list = rowsOfActivity(a);
      if (!list.length) continue;
      groups[phaseAt(a, cut)].push(...list);
    }

    for (const [phase, color] of [
      ["done", COLOR_DONE],
      ["running", COLOR_RUNNING],
      ["pending", COLOR_PENDING],
    ] as const) {
      for (const [modelId, ids] of Object.entries(mapOf(groups[phase]))) {
        const model = viewer.fragments.list.get(modelId);
        if (model && ids.size) await model.setColor([...ids], color);
      }
    }
    // Lo pendiente queda translúcido: se lee el avance de un vistazo.
    for (const [modelId, ids] of Object.entries(mapOf(groups.pending))) {
      const model = viewer.fragments.list.get(modelId);
      if (model && ids.size) await model.setOpacity([...ids], 0.18);
    }
    for (const phase of ["done", "running"] as const) {
      for (const [modelId, ids] of Object.entries(mapOf(groups[phase]))) {
        const model = viewer.fragments.list.get(modelId);
        if (model && ids.size) await model.resetOpacity([...ids]);
      }
    }
    await viewer.update();
  };

  const stopSimulation = async () => {
    simulating = false;
    simBtn.classList.remove("active");
    simBtn.textContent = "Simular 4D";
    for (const model of viewer.models()) {
      await model.resetColor(undefined);
      await model.resetOpacity(undefined);
    }
    await hider.set(true);
    await viewer.update();
  };

  // ---------- Panel flotante reutilizable (Gantt / Curva) ----------
  const enableDrag = (box: HTMLElement, handle: HTMLElement) => {
    let dragging = false;
    let ox = 0;
    let oy = 0;
    handle.style.touchAction = "none";
    handle.style.cursor = "move";
    handle.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      dragging = true;
      const r = box.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      box.style.left = `${Math.max(0, e.clientX - ox)}px`;
      box.style.top = `${Math.max(0, e.clientY - oy)}px`;
      box.style.right = "auto";
    });
    handle.addEventListener("pointerup", (e) => {
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
  };

  const floatWindow = (title: string, body: HTMLElement) => {
    document.querySelector(".sched-float")?.remove();
    const box = el("div", "matrix-float sched-float");
    const head = el("div", "matrix-head");
    head.append(el("h3", undefined, title));
    const acts = el("div", "matrix-head-actions");
    const close = el("button", "icon-btn");
    close.innerHTML = icons.close;
    close.title = "Cerrar";
    close.addEventListener("click", () => box.remove());
    acts.append(close);
    head.append(acts);
    enableDrag(box, head);
    const scroll = el("div", "matrix-scroll");
    scroll.append(body);
    box.append(head, scroll);
    document.body.append(box);
    return box;
  };

  // ---------- Gantt ----------
  const buildGantt = (): HTMLElement => {
    const host = el("div", "gantt");
    if (!data) return host;
    const t = timeline();
    if (!t) {
      host.append(el("p", "panel-empty", "El cronograma no trae fechas."));
      return host;
    }

    const acts = data.actividades.filter((a) => a.inicio);
    const span = Math.max(1, t.end.getTime() - t.start.getTime());
    const pct = (d: Date) => ((d.getTime() - t.start.getTime()) / span) * 100;

    // Cabecera de meses.
    const header = el("div", "gantt-head");
    header.append(el("div", "gantt-label", "Actividad"));
    const axis = el("div", "gantt-axis");
    const months: string[] = [];
    const walker = new Date(t.start.getFullYear(), t.start.getMonth(), 1);
    while (walker <= t.end) {
      months.push(dateToIso(walker));
      walker.setMonth(walker.getMonth() + 1);
    }
    for (const m of months) {
      const tick = el("span", "gantt-tick");
      tick.style.left = `${pct(isoToDate(m))}%`;
      tick.textContent = isoToDate(m).toLocaleDateString("es-PE", {
        month: "short",
        year: "2-digit",
      });
      axis.append(tick);
    }
    header.append(axis);
    host.append(header);

    for (const a of acts) {
      const start = isoToDate(a.inicio as string);
      const end = a.fin ? isoToDate(a.fin) : start;
      const linked = rowsOfActivity(a);

      const row = el("div", "gantt-row");
      const label = el("div", "gantt-label");
      label.append(el("span", "gantt-name", a.nombre));
      label.append(
        el("span", "gantt-sub", `${a.codigo ?? "sin código"} · ${a.dias}d`),
      );
      if (linked.length) label.classList.add("linked");

      const track = el("div", "gantt-track");
      const bar = el("div", "gantt-bar");
      bar.style.left = `${pct(start)}%`;
      bar.style.width = `${Math.max(0.6, pct(end) - pct(start))}%`;
      if (!a.modelable) bar.classList.add("nomodel");
      if (cursor) bar.classList.add(phaseAt(a, cursor));
      bar.title = `${a.nombre}\n${a.inicio} → ${a.fin}\n${fmtMoney(a.costo, data.moneda)}${
        linked.length ? `\n${linked.length} elemento(s) en el modelo` : "\nSin elementos vinculados"
      }`;
      track.append(bar);

      if (cursor) {
        const line = el("div", "gantt-cursor");
        line.style.left = `${pct(cursor)}%`;
        track.append(line);
      }

      row.append(label, track);
      if (linked.length) {
        row.classList.add("clickable");
        row.addEventListener("click", async () => {
          await hider.isolate(mapOf(linked));
          await viewer.update();
        });
      }
      host.append(row);
    }
    return host;
  };

  // ---------- Curva S + EVM ----------
  const executedByCode = (): Map<string, string> => {
    const out = new Map<string, string>();
    if (!roleColumn("periodMonth") || !roleColumn("scheduleCode")) return out;
    for (const [code, list] of byCode) {
      // La actividad se considera ejecutada en el ÚLTIMO mes reportado.
      let last = "";
      for (const r of list) {
        const raw = roleValue(r, "periodMonth").trim();
        if (raw && raw > last) last = raw;
      }
      if (last) out.set(code, last.length >= 7 ? last.slice(0, 7) : last);
    }
    return out;
  };

  const buildCurve = (): HTMLElement => {
    const host = el("div", "curve");
    if (!data) return host;
    if (!data.curvaMensual.length) {
      host.append(
        el(
          "p",
          "panel-empty",
          "El cronograma no trae curva S: el APU no tenía costos unitarios.",
        ),
      );
      return host;
    }

    const exec = executedByCode();
    const evm = computeEvm(data, exec);
    const W = 720;
    const H = 300;
    const PAD = { l: 64, r: 16, t: 16, b: 40 };
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const maxY = Math.max(
      data.costoTotal,
      ...evm.map((p) => Math.max(p.pv, p.ev)),
      1,
    );
    const n = Math.max(evm.length - 1, 1);
    const x = (i: number) => PAD.l + (i / n) * iw;
    const y = (v: number) => PAD.t + ih - (v / maxY) * ih;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "curve-svg");

    // Rejilla horizontal + etiquetas de monto.
    for (let g = 0; g <= 4; g++) {
      const vy = PAD.t + (ih * g) / 4;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(PAD.l));
      line.setAttribute("x2", String(W - PAD.r));
      line.setAttribute("y1", String(vy));
      line.setAttribute("y2", String(vy));
      line.setAttribute("class", "curve-grid");
      svg.append(line);
      const lab = document.createElementNS(ns, "text");
      lab.setAttribute("x", String(PAD.l - 8));
      lab.setAttribute("y", String(vy + 4));
      lab.setAttribute("text-anchor", "end");
      lab.setAttribute("class", "curve-axis");
      lab.textContent = `${Math.round((maxY * (4 - g)) / 4 / 1000)}k`;
      svg.append(lab);
    }

    const path = (values: number[], cls: string) => {
      if (!values.length) return;
      const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", cls);
      svg.append(p);
    };

    path(evm.map((p) => p.pv), "curve-pv");
    if (exec.size) path(evm.map((p) => p.ev), "curve-ev");

    // Eje de meses (uno de cada dos si son muchos).
    const step = evm.length > 10 ? 2 : 1;
    evm.forEach((p, i) => {
      if (i % step) return;
      const lab = document.createElementNS(ns, "text");
      lab.setAttribute("x", String(x(i)));
      lab.setAttribute("y", String(H - 14));
      lab.setAttribute("text-anchor", "middle");
      lab.setAttribute("class", "curve-axis");
      lab.textContent = p.mes;
      svg.append(lab);
    });

    host.append(svg);

    const leg = el("div", "curve-legend");
    const pvLeg = el("span", "curve-leg pv");
    pvLeg.append(el("i"), el("span", undefined, "Programado (PV)"));
    leg.append(pvLeg);
    if (exec.size) {
      const evLeg = el("span", "curve-leg ev");
      evLeg.append(el("i"), el("span", undefined, "Ejecutado (EV)"));
      leg.append(evLeg);
    }
    host.append(leg);

    // Panel EVM: solo SPI. El CPI exige costo REAL de obra, que no tenemos.
    const stats = el("div", "curve-stats");
    const last = evm[evm.length - 1];
    const add = (label: string, value: string, cls = "") => {
      const cell = el("div", `curve-stat ${cls}`.trim());
      cell.append(el("span", "curve-stat-label", label));
      cell.append(el("span", "curve-stat-value", value));
      stats.append(cell);
    };
    add("Presupuesto (BAC)", fmtMoney(data.costoTotal, data.moneda));
    if (last) add("Programado a la fecha (PV)", fmtMoney(last.pv, data.moneda));
    if (exec.size && last) {
      add("Ejecutado (EV)", fmtMoney(last.ev, data.moneda));
      add(
        "SPI (EV/PV)",
        last.spi.toFixed(2),
        last.spi >= 1 ? "good" : last.spi >= 0.9 ? "warn" : "bad",
      );
    }
    host.append(stats);

    if (!exec.size) {
      host.append(
        el(
          "p",
          "panel-hint",
          "Para ver la curva ejecutada y el SPI, asigna los roles «Código de actividad» y «Período mensual ejecutado» en Configuración de datos.",
        ),
      );
    }
    host.append(
      el(
        "p",
        "panel-hint",
        "No se calcula CPI: requiere el costo REAL de obra, que no está en el modelo ni en el presupuesto programado.",
      ),
    );
    return host;
  };

  // ---------- Lista de actividades ----------
  const render = () => {
    listEl.replaceChildren();
    if (!data) {
      summary.textContent = "Sin cronograma cargado.";
      panel.setBadge(null);
      simWrap.hidden = true;
      viewRow.hidden = true;
      return;
    }
    simWrap.hidden = false;
    viewRow.hidden = false;

    const linked = linkedCount();
    summary.textContent = `${data.proyecto} · ${data.actividades.length} actividades · ${
      data.plazoLaborable ?? "?"
    } días · ${fmtMoney(data.costoTotal, data.moneda)}`;
    panel.setBadge(String(data.actividades.length));

    if (roleColumn("scheduleCode")) {
      listEl.append(
        el(
          "p",
          "panel-hint",
          `${linked} de ${data.actividades.length} actividades tienen elementos en el modelo.`,
        ),
      );
    }

    const sorted = [...data.actividades].sort((a, b) =>
      (a.inicio ?? "").localeCompare(b.inicio ?? ""),
    );
    for (const a of sorted.slice(0, 150)) {
      const list = rowsOfActivity(a);
      const item = el("div", "sched-item");
      if (list.length) item.classList.add("linked");
      const info = el("div", "set-info");
      info.append(el("span", "set-name", a.nombre));
      info.append(
        el(
          "span",
          "set-count",
          `${a.codigo ?? "sin código"} · ${a.inicio ?? "?"} → ${a.fin ?? "?"} · ${
            list.length ? `${list.length} elem.` : "sin vínculo"
          }`,
        ),
      );
      item.append(info);
      if (list.length) {
        const focusBtn = el("button", "icon-btn sm");
        focusBtn.type = "button";
        focusBtn.innerHTML = icons.focus;
        focusBtn.title = "Aislar los elementos de esta actividad";
        focusBtn.addEventListener("click", async () => {
          await hider.isolate(mapOf(list));
          await viewer.update();
        });
        item.append(focusBtn);
      }
      listEl.append(item);
    }
    if (sorted.length > 150) {
      listEl.append(el("p", "panel-hint", `Mostrando 150 de ${sorted.length}.`));
    }
  };

  // ---------- Carga de archivo ----------
  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      data = parseSchedule(text);
      saveSchedule(data);
      indexed = false;
      await ensureIndexed();
      const t = timeline();
      if (t) {
        slider.value = "100";
        cursor = t.end;
      }
      showToast(
        `Cronograma «${data.proyecto}» cargado: ${data.actividades.length} actividades.`,
        "info",
      );
    } catch (error) {
      const msg = error instanceof ScheduleError ? error.message : "No se pudo leer el archivo.";
      console.error("Cronograma:", error);
      showToast(msg);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const head = [
      "Código", "Actividad", "Módulo", "Inicio", "Fin", "Días", "Costo", "Elementos vinculados",
    ].join(";");
    const lines = data.actividades.map((a) =>
      [
        esc(a.codigo ?? ""),
        esc(a.nombre),
        esc(a.modulo ?? ""),
        esc(a.inicio ?? ""),
        esc(a.fin ?? ""),
        String(a.dias),
        a.costo.toFixed(2),
        String(rowsOfActivity(a).length),
      ].join(";"),
    );
    downloadFile("cronograma.csv", `﻿${head}\n${lines.join("\n")}`, "text/csv");
  };

  loadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
    fileInput.value = "";
  });

  clearBtn.addEventListener("click", () => {
    data = null;
    indexed = false;
    byCode = new Map();
    clearSavedSchedule();
    document.querySelector(".sched-float")?.remove();
    void stopSimulation();
    renderIntro();
    render();
  });

  simBtn.addEventListener("click", () => {
    if (!data) return;
    if (simulating) {
      void stopSimulation();
      return;
    }
    if (!roleColumn("scheduleCode")) {
      showToast("Asigna el rol «Código de actividad» para simular en 3D.", "info");
      return;
    }
    simulating = true;
    simBtn.classList.add("active");
    simBtn.textContent = "Detener";
    void applySimulation();
  });

  simReset.addEventListener("click", () => void stopSimulation());

  slider.addEventListener("input", () => {
    const cut = cursorFromSlider();
    if (cut) {
      cursor = cut;
      dateLabel.textContent = cut.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }
    if (simulating) void applySimulation();
  });

  ganttBtn.addEventListener("click", () => {
    if (!data) return;
    floatWindow(`Gantt — ${data.proyecto}`, buildGantt());
  });

  curveBtn.addEventListener("click", () => {
    if (!data) return;
    floatWindow(`Curva S / EVM — ${data.proyecto}`, buildCurve());
  });

  csvBtn.addEventListener("click", exportCsv);

  onRolesChange(() => {
    indexed = false;
    if (panel.isOpen()) void ensureIndexed();
  });

  viewer.fragments.list.onItemSet.add(() => {
    indexed = false;
    rows = [];
    byCode = new Map();
    if (panel.isOpen()) void ensureIndexed();
  });

  renderIntro();
  render();
}
