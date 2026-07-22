import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, showToast } from "../core/dom";
import { icons } from "../core/icons";
import { createDropdown, type Dropdown } from "../core/dropdown";
import { getDataCache } from "../core/datacache";
import {
  ROLES,
  ROLE_GROUPS,
  STEEL_TABLE,
  autoDetect,
  clearRoles,
  pruneRoles,
  roleColumn,
  setRole,
  type RoleId,
} from "../core/paramroles";

/**
 * Fase E — Configuración de datos.
 *
 * Panel donde el usuario dice, una sola vez por proyecto, qué parámetro del
 * modelo cumple cada rol (código de partida, unidad, mes ejecutado…). Es la
 * base de Partidas, Obras y Cronograma 4D: todos leen por rol, no por nombre.
 */
export function setupMapping(viewer: Viewer, ui: UI) {
  let columns: string[] = [];
  let loaded = false;
  const dropdowns = new Map<RoleId, Dropdown>();

  const panel = ui.sidebar.addPanel({
    id: "mapping",
    icon: icons.sliders,
    title: "Configuración de datos",
    onOpen: () => void ensureLoaded(),
  });

  const intro = el(
    "p",
    "panel-hint",
    "Indica qué parámetro de tu modelo cumple cada rol. Se guarda para este navegador y lo usan Partidas, Obras y Cronograma.",
  );

  const autoBtn = el("button", "btn small", "Detectar automáticamente");
  const resetBtn = el("button", "btn small", "Limpiar todo");
  autoBtn.type = resetBtn.type = "button";
  const topActions = el("div", "panel-block row");
  topActions.append(autoBtn, resetBtn);

  const rolesHost = el("div", "roles-host");

  // Tabla de acero (referencia visible, editable no hace falta: es estándar).
  const steelWrap = el("details", "roles-steel");
  const steelSummary = el("summary", undefined, "Tabla de acero ⌀ → kg/m");
  steelWrap.append(steelSummary);
  const steelTable = el("table", "steel-table");
  const headRow = el("tr");
  headRow.append(el("th", undefined, "Diámetro"), el("th", undefined, "mm"), el("th", undefined, "kg/m"));
  steelTable.append(headRow);
  for (const s of STEEL_TABLE) {
    const tr = el("tr");
    tr.append(
      el("td", undefined, s.label),
      el("td", undefined, String(s.mm)),
      el("td", undefined, s.kgPerM.toFixed(3)),
    );
    steelTable.append(tr);
  }
  steelWrap.append(steelTable);

  panel.body.append(intro, topActions, rolesHost, steelWrap);

  const optionsFor = () => [
    { value: "", label: "— Sin asignar —" },
    ...columns.map((c) => ({ value: c, label: c })),
  ];

  const buildRows = () => {
    rolesHost.replaceChildren();
    dropdowns.clear();

    for (const group of ROLE_GROUPS) {
      const defs = ROLES.filter((r) => r.group === group);
      if (!defs.length) continue;

      const section = el("div", "roles-group");
      section.append(el("h4", "roles-group-title", group));

      for (const def of defs) {
        const row = el("div", "role-row");
        const label = el("div", "role-label");
        label.append(el("span", "role-name", def.label));
        label.append(el("span", "role-hint", def.hint));

        const dd = createDropdown(optionsFor());
        dd.setValue(roleColumn(def.id));
        dd.onChange((v) => {
          setRole(def.id, v);
          updateBadge();
        });
        dropdowns.set(def.id, dd);

        row.append(label, dd.element);
        section.append(row);
      }
      rolesHost.append(section);
    }
    updateBadge();
  };

  const syncValues = () => {
    for (const [id, dd] of dropdowns) {
      dd.setOptions(optionsFor());
      dd.setValue(roleColumn(id));
    }
    updateBadge();
  };

  const updateBadge = () => {
    const set = ROLES.filter((r) => roleColumn(r.id)).length;
    panel.setBadge(set ? `${set}` : null);
  };

  const ensureLoaded = async () => {
    if (loaded || !viewer.models().length) {
      if (!columns.length) buildRows();
      return;
    }
    intro.textContent = "Indexando modelo…";
    try {
      const cache = await getDataCache();
      columns = cache.columns;
      loaded = true;
      pruneRoles(columns);
      const filled = autoDetect(columns);
      intro.textContent =
        "Indica qué parámetro de tu modelo cumple cada rol. Se guarda para este navegador y lo usan Partidas, Obras y Cronograma.";
      buildRows();
      if (filled) {
        showToast(`Se sugirieron ${filled} parámetro(s) automáticamente. Revísalos.`, "info");
      }
    } catch (error) {
      console.error("Mapeo: no se pudo indexar:", error);
      intro.textContent = "No se pudo indexar el modelo.";
    }
  };

  autoBtn.addEventListener("click", () => {
    if (!columns.length) {
      showToast("Carga un modelo primero.", "info");
      return;
    }
    const filled = autoDetect(columns);
    syncValues();
    showToast(
      filled ? `Se completaron ${filled} rol(es).` : "No se encontraron coincidencias nuevas.",
      "info",
    );
  });

  resetBtn.addEventListener("click", () => {
    clearRoles();
    syncValues();
    showToast("Configuración de roles limpiada.", "info");
  });

  viewer.fragments.list.onItemSet.add(() => {
    loaded = false;
    columns = [];
    if (panel.isOpen()) void ensureLoaded();
  });

  buildRows();
}
