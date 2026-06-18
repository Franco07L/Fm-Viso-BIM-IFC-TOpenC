import * as THREE from "three";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";

interface Issue {
  id: number;
  title: string;
  position: [number, number, number];
  target: [number, number, number];
  selection: Record<string, number[]>;
}

/**
 * Nivel 4 — Issues / Vistas guardadas (estilo BCF ligero).
 * Captura un "issue": título + vista de cámara actual + selección. Al pulsarlo,
 * restaura la cámara y la selección. Exportable como JSON.
 */
export function setupBcf(viewer: Viewer, ui: UI) {
  const controls = viewer.world.camera.controls;
  const issues: Issue[] = [];
  let counter = 0;

  const panel = ui.sidebar.addPanel({
    id: "issues",
    icon: icons.issue,
    title: "Issues",
  });

  // --- Captura ---
  const form = el("div", "panel-block");
  const input = el("input", "text-input") as HTMLInputElement;
  input.type = "text";
  input.placeholder = "Título del issue…";
  const captureBtn = el("button", "btn primary full", "Capturar vista actual");
  captureBtn.type = "button";
  form.append(input, captureBtn);

  const exportBtn = el("button", "btn small", "Exportar JSON");
  exportBtn.type = "button";
  const exportRow = el("div", "panel-block row");
  exportRow.append(exportBtn);

  const listEl = el("div", "issues-list");
  const emptyEl = el("p", "panel-empty", "Captura una vista para crear un issue.");
  listEl.append(emptyEl);

  panel.body.append(form, exportRow, listEl);

  const capture = () => {
    if (!viewer.models().length) {
      showToast("Carga un modelo primero.", "info");
      return;
    }
    counter++;
    const pos = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    controls.getPosition(pos);
    controls.getTarget(tgt);
    const selection: Record<string, number[]> = {};
    for (const [modelId, ids] of Object.entries(viewer.selection())) {
      if (ids.size) selection[modelId] = [...ids];
    }
    issues.push({
      id: counter,
      title: input.value.trim() || `Issue ${counter}`,
      position: [pos.x, pos.y, pos.z],
      target: [tgt.x, tgt.y, tgt.z],
      selection,
    });
    input.value = "";
    render();
  };

  const restore = async (issue: Issue) => {
    await controls.setLookAt(
      issue.position[0], issue.position[1], issue.position[2],
      issue.target[0], issue.target[1], issue.target[2],
      true,
    );
    await viewer.highlighter.clear("select");
    const map: Record<string, Set<number>> = {};
    let hasSelection = false;
    for (const [modelId, ids] of Object.entries(issue.selection)) {
      if (ids.length) {
        map[modelId] = new Set(ids);
        hasSelection = true;
      }
    }
    if (hasSelection) {
      await viewer.highlighter.highlightByID("select", map, true, false);
    }
  };

  const render = () => {
    listEl.replaceChildren();
    panel.setBadge(issues.length ? String(issues.length) : null);
    if (!issues.length) {
      listEl.append(emptyEl);
      return;
    }
    for (const issue of issues) {
      const item = el("div", "issue-item");

      const main = el("button", "issue-main");
      main.type = "button";
      main.title = "Ir a esta vista";
      const selCount = Object.values(issue.selection).reduce((a, b) => a + b.length, 0);
      main.append(el("span", "issue-title", issue.title));
      main.append(
        el("span", "issue-sub", selCount ? `${selCount} elem. seleccionados` : "Solo vista"),
      );
      main.addEventListener("click", () => void restore(issue));

      const del = el("button", "icon-btn sm");
      del.type = "button";
      del.innerHTML = icons.trash;
      del.title = "Eliminar issue";
      del.addEventListener("click", () => {
        const i = issues.indexOf(issue);
        if (i >= 0) issues.splice(i, 1);
        render();
      });

      item.append(main, del);
      listEl.append(item);
    }
  };

  const exportJson = () => {
    if (!issues.length) {
      showToast("No hay issues para exportar.", "info");
      return;
    }
    downloadFile(
      "issues.json",
      JSON.stringify(issues, null, 2),
      "application/json",
    );
  };

  captureBtn.addEventListener("click", capture);
  exportBtn.addEventListener("click", exportJson);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") capture();
  });

  render();
}
