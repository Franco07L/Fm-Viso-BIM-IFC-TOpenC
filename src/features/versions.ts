import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { railIcons } from "../core/railicons";
import type { ElementRow } from "../core/datacache";
import {
  deleteSnapshot,
  diffAgainst,
  listSnapshots,
  quantityDeltas,
  saveSnapshot,
  takeSnapshot,
  type Change,
  type DiffResult,
  type Snapshot,
} from "../core/versions";

const COLOR_ADDED = new THREE.Color("#39d98a");
const COLOR_MODIFIED = new THREE.Color("#ffb43d");

/**
 * Control de cambios entre versiones del modelo.
 *
 * Guarda una instantánea del modelo actual y, al cargar una exportación
 * posterior, dice qué se añadió, qué desapareció y qué cambió — incluido el
 * impacto en el metrado por partida.
 */
export function setupVersions(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);

  let snapshots: Snapshot[] = listSnapshots();
  let diff: DiffResult | null = null;
  let busy = false;

  const panel = ui.sidebar.addPanel({
    id: "versions",
    icon: railIcons.versiones,
    group: "manage",
    title: "Control de cambios",
    onOpen: () => render(),
  });

  const intro = el(
    "p",
    "panel-hint",
    "Guarda una instantánea del modelo y compárala con una exportación posterior: qué se añadió, qué desapareció y qué cambió.",
  );

  const takeRow = el("div", "panel-block row");
  const takeBtn = el("button", "btn primary small", "Guardar instantánea");
  takeBtn.type = "button";
  takeRow.append(takeBtn);

  const snapList = el("div", "ver-snaps");
  const resultHost = el("div", "ver-result");

  panel.body.append(intro, takeRow, snapList, resultHost);

  const mapOf = (rows: ElementRow[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    for (const r of rows) (map[r.modelId] ??= new Set()).add(r.localId);
    return map;
  };

  const rowsOf = (changes: Change[]): ElementRow[] =>
    changes.map((c) => c.row).filter((r): r is ElementRow => !!r);

  const takeNew = async () => {
    if (!viewer.models().length) {
      showToast("Carga un modelo primero.", "info");
      return;
    }
    const name = window.prompt(
      "Nombre de la instantánea",
      `Versión ${new Date().toLocaleDateString("es-PE")}`,
    );
    if (!name) return;
    busy = true;
    takeBtn.disabled = true;
    takeBtn.textContent = "Indexando…";
    try {
      const snap = await takeSnapshot(name);
      if (!saveSnapshot(snap)) {
        showToast(
          "El modelo es demasiado grande para guardar la instantánea en este navegador.",
        );
        return;
      }
      snapshots = listSnapshots();
      showToast(`Instantánea «${name}» guardada (${snap.items.length} elementos).`, "info");
      render();
    } catch (error) {
      console.error("Instantánea:", error);
      showToast("No se pudo crear la instantánea.");
    } finally {
      busy = false;
      takeBtn.disabled = false;
      takeBtn.textContent = "Guardar instantánea";
    }
  };

  const compare = async (snap: Snapshot) => {
    if (busy || !viewer.models().length) {
      if (!viewer.models().length) showToast("Carga un modelo para comparar.", "info");
      return;
    }
    busy = true;
    try {
      diff = await diffAgainst(snap);
      render();
    } catch (error) {
      console.error("Comparación:", error);
      showToast("No se pudo comparar.");
    } finally {
      busy = false;
    }
  };

  const paintDiff = async () => {
    if (!diff) return;
    for (const model of viewer.models()) await model.resetColor(undefined);
    for (const [changes, color] of [
      [diff.added, COLOR_ADDED],
      [diff.modified, COLOR_MODIFIED],
    ] as const) {
      for (const [modelId, ids] of Object.entries(mapOf(rowsOf(changes)))) {
        const model = viewer.fragments.list.get(modelId);
        if (model && ids.size) await model.setColor([...ids], color);
      }
    }
    await viewer.update();
  };

  const renderSnaps = () => {
    snapList.replaceChildren();
    if (!snapshots.length) {
      snapList.append(
        el("p", "panel-empty", "Sin instantáneas. Guarda una para empezar a comparar."),
      );
      return;
    }
    for (const snap of [...snapshots].reverse()) {
      const item = el("div", "ver-snap");
      const info = el("div", "set-info");
      info.append(el("span", "set-name", snap.name));
      info.append(
        el(
          "span",
          "set-count",
          `${snap.items.length} elementos · ${new Date(snap.at).toLocaleString("es-PE")}`,
        ),
      );

      const cmpBtn = el("button", "btn small", "Comparar");
      cmpBtn.type = "button";
      cmpBtn.addEventListener("click", () => void compare(snap));

      const rmBtn = el("button", "icon-btn sm");
      rmBtn.type = "button";
      rmBtn.innerHTML = icons.trash;
      rmBtn.title = "Eliminar instantánea";
      rmBtn.addEventListener("click", () => {
        deleteSnapshot(snap.at);
        snapshots = listSnapshots();
        if (diff?.base.at === snap.at) diff = null;
        render();
      });

      item.append(info, cmpBtn, rmBtn);
      snapList.append(item);
    }
  };

  const changeGroup = (
    title: string,
    cls: string,
    changes: Change[],
    canFocus: boolean,
  ): HTMLElement => {
    const wrap = el("details", `ver-group ${cls}`);
    wrap.append(el("summary", undefined, `${title} (${changes.length})`));
    if (!changes.length) {
      wrap.append(el("p", "panel-empty", "Ninguno."));
      return wrap;
    }
    if (canFocus) {
      const isoBtn = el("button", "btn small full", "Aislar estos elementos");
      isoBtn.type = "button";
      isoBtn.addEventListener("click", async () => {
        const rows = rowsOf(changes);
        if (!rows.length) return;
        await hider.isolate(mapOf(rows));
        await viewer.update();
      });
      wrap.append(isoBtn);
    }
    const list = el("div", "ver-change-list");
    for (const c of changes.slice(0, 100)) {
      const row = el("div", "ver-change");
      const info = el("div", "set-info");
      info.append(el("span", "set-name", c.name || c.category || c.id));
      if (c.diffs.length) {
        for (const d of c.diffs.slice(0, 4)) {
          info.append(
            el(
              "span",
              "set-count",
              `${d.field}: «${d.before || "vacío"}» → «${d.after || "vacío"}»`,
            ),
          );
        }
      } else {
        info.append(el("span", "set-count", c.category));
      }
      row.append(info);
      if (c.row) {
        row.classList.add("clickable");
        row.addEventListener("click", async () => {
          await viewer.highlighter.clear("select");
          await viewer.highlighter.highlightByID("select", mapOf([c.row as ElementRow]), true, false);
        });
      }
      list.append(row);
    }
    if (changes.length > 100) {
      list.append(el("p", "panel-hint", `Mostrando 100 de ${changes.length}.`));
    }
    wrap.append(list);
    return wrap;
  };

  const renderResult = () => {
    resultHost.replaceChildren();
    if (!diff) return;

    const head = el("div", "clash-summary");
    head.textContent = `vs «${diff.base.name}»: +${diff.added.length} nuevos · −${diff.removed.length} eliminados · ~${diff.modified.length} modificados · ${diff.unchanged} sin cambios`;
    resultHost.append(head);

    const actions = el("div", "panel-block row");
    const paintBtn = el("button", "btn small", "Colorear cambios");
    const resetBtn = el("button", "btn small", "Quitar color");
    const csvBtn = el("button", "btn small", "Excel");
    paintBtn.type = resetBtn.type = csvBtn.type = "button";
    paintBtn.addEventListener("click", () => void paintDiff());
    resetBtn.addEventListener("click", async () => {
      await hider.set(true);
      for (const model of viewer.models()) await model.resetColor(undefined);
      await viewer.update();
    });
    csvBtn.addEventListener("click", exportCsv);
    actions.append(paintBtn, resetBtn, csvBtn);
    resultHost.append(actions);

    const legend = el("div", "ver-legend");
    for (const [cls, text] of [
      ["added", "Nuevos"],
      ["modified", "Modificados"],
    ] as const) {
      const it = el("span", `ver-leg ${cls}`);
      it.append(el("i"), el("span", undefined, text));
      legend.append(it);
    }
    resultHost.append(legend);

    resultHost.append(changeGroup("Nuevos", "added", diff.added, true));
    resultHost.append(changeGroup("Modificados", "modified", diff.modified, true));
    // Los eliminados ya no existen en el modelo: no se pueden aislar.
    resultHost.append(changeGroup("Eliminados", "removed", diff.removed, false));

    const deltas = quantityDeltas(diff);
    if (deltas.length) {
      const qty = el("details", "ver-group qty");
      qty.append(el("summary", undefined, `Impacto por partida (${deltas.length})`));
      const list = el("div", "ver-change-list");
      for (const d of deltas.slice(0, 60)) {
        const row = el("div", "ver-change");
        const info = el("div", "set-info");
        info.append(el("span", "set-name", d.code));
        const sign = d.delta > 0 ? "+" : "";
        info.append(
          el("span", "set-count", `${d.before} → ${d.after} elementos (${sign}${d.delta})`),
        );
        row.append(info);
        list.append(row);
      }
      qty.append(list);
      resultHost.append(qty);
    }
  };

  const exportCsv = () => {
    if (!diff) return;
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ["Cambio", "Categoría", "Nombre", "Parámetro", "Antes", "Después"].join(";");
    const lines: string[] = [];
    const label: Record<string, string> = {
      added: "Nuevo",
      removed: "Eliminado",
      modified: "Modificado",
    };
    for (const c of [...diff.added, ...diff.removed, ...diff.modified]) {
      if (c.diffs.length) {
        for (const d of c.diffs) {
          lines.push(
            [esc(label[c.kind]), esc(c.category), esc(c.name), esc(d.field), esc(d.before), esc(d.after)].join(";"),
          );
        }
      } else {
        lines.push([esc(label[c.kind]), esc(c.category), esc(c.name), "", "", ""].join(";"));
      }
    }
    downloadFile("control-de-cambios.csv", `﻿${head}\n${lines.join("\n")}`, "text/csv");
  };

  const render = () => {
    renderSnaps();
    renderResult();
    panel.setBadge(
      diff ? String(diff.added.length + diff.removed.length + diff.modified.length) : null,
    );
  };

  takeBtn.addEventListener("click", () => void takeNew());

  viewer.fragments.list.onItemSet.add(() => {
    diff = null;
    if (panel.isOpen()) render();
  });

  render();
}
