import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, downloadFile, showToast } from "../core/dom";
import { icons } from "../core/icons";
import {
  resolveGroups,
  listCriteria,
  type GroupCriterion,
} from "../core/grouping";
import { createDropdown } from "../core/dropdown";

interface ClashItem {
  modelId: string;
  localId: number;
  group: string;
  box: THREE.Box3;
}

interface ClashPair {
  a: ClashItem;
  b: ClashItem;
  center: THREE.Vector3;
}

const CLASH_COLOR = new THREE.Color("#ff3b3b");
const IDENTITY = new THREE.Matrix4();

function crossKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function heatColor(count: number, max: number): string {
  const t = max > 1 ? (count - 1) / (max - 1) : 1;
  const hue = (1 - t) * 48;
  const light = 72 - t * 24;
  return `hsl(${hue}, 92%, ${light}%)`;
}

export async function setupClash(viewer: Viewer, ui: UI) {
  const hider = viewer.components.get(OBC.Hider);
  const mesher = viewer.components.get(OBF.Mesher);

  // Opciones de criterio de agrupación (eje de la matriz).
  let criteria: { label: string; value: GroupCriterion }[] = [
    { label: "Categoría IFC", value: { type: "category", label: "Categoría IFC" } },
    { label: "Modelo / archivo", value: { type: "model", label: "Modelo" } },
  ];
  let criterion: GroupCriterion = criteria[0].value;
  let precision: "box" | "geometry" = "box";

  let items: ClashItem[] = [];
  let types: string[] = [];
  const disabled = new Set<string>(); // cruces desactivados
  let clashes: ClashPair[] = [];
  let matrix = new Map<string, Map<string, ClashPair[]>>();
  let maxCell = 0;
  // Cache de geometría + BVH por elemento (modelId|localId). Persiste entre
  // detecciones mientras no cambien los modelos, para que re-correr sea rápido.
  const bvhCache = new Map<string, { geom: THREE.BufferGeometry; bvh: MeshBVH }[]>();

  const panel = ui.sidebar.addPanel({
    id: "clash",
    icon: icons.clash,
    title: "Interferencias",
    onOpen: () => void refreshCriteria(),
  });

  // ---------- UI ----------
  const intro = el(
    "p",
    "panel-hint",
    "Cruza elementos por categoría, modelo o parámetro (disciplina). Detecta colisiones por caja o geometría exacta.",
  );

  const critRow = el("div", "panel-block");
  critRow.append(el("label", "tol-label", "Cruzar por"));
  const critDd = createDropdown();
  critRow.append(critDd.element);

  const precRow = el("div", "panel-block");
  precRow.append(el("label", "tol-label", "Precisión"));
  const precSeg = el("div", "seg-control");
  const boxBtn = el("button", "seg-btn active", "Cajas (rápido)");
  const geomBtn = el("button", "seg-btn", "Geometría");
  boxBtn.type = geomBtn.type = "button";
  precSeg.append(boxBtn, geomBtn);
  precRow.append(precSeg);

  const tolRow = el("div", "panel-block row tol-row");
  tolRow.append(el("label", "tol-label", "Tolerancia (m)"));
  const tolInput = el("input", "text-input tol-input") as HTMLInputElement;
  tolInput.type = "number";
  tolInput.value = "0.01";
  tolInput.step = "0.01";
  tolInput.min = "0";
  tolRow.append(tolInput);

  const configBtn = el("button", "btn full", "Configurar cruces…");
  configBtn.type = "button";
  const detectBtn = el("button", "btn primary full", "Detectar interferencias");
  detectBtn.type = "button";

  const progressWrap = el("div", "clash-progress");
  progressWrap.hidden = true;
  const progressBar = el("div", "clash-progress-bar");
  const progressText = el("span", "clash-progress-text", "");
  progressWrap.append(progressBar, progressText);

  const summary = el("div", "clash-summary", "Sin resultados todavía.");

  const actions = el("div", "panel-block row");
  const matrixBtn = el("button", "btn small", "Ver matriz");
  const highlightBtn = el("button", "btn small", "Resaltar");
  const clearBtn = el("button", "btn small", "Limpiar");
  matrixBtn.type = highlightBtn.type = clearBtn.type = "button";
  actions.append(matrixBtn, highlightBtn, clearBtn);

  const listEl = el("div", "clash-list");

  panel.body.append(
    intro, critRow, precRow, tolRow, configBtn, detectBtn, progressWrap, summary, actions, listEl,
  );

  const yieldToUi = () => new Promise((r) => setTimeout(r, 0));
  const setProgress = (done: number, total: number, label: string) => {
    if (total <= 0) {
      progressWrap.hidden = true;
      return;
    }
    progressWrap.hidden = false;
    const pct = Math.min(100, Math.round((done / total) * 100));
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${label} ${pct}%`;
  };

  // ---------- Criterios disponibles ----------
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
    items = [];
    types = [];
    disabled.clear();
  });

  const setPrecision = (p: "box" | "geometry") => {
    precision = p;
    boxBtn.classList.toggle("active", p === "box");
    geomBtn.classList.toggle("active", p === "geometry");
  };
  boxBtn.addEventListener("click", () => setPrecision("box"));
  geomBtn.addEventListener("click", () => setPrecision("geometry"));

  // ---------- Recolección de elementos con grupo + caja ----------
  const collectItems = async (): Promise<ClashItem[]> => {
    const grouped = await resolveGroups(viewer, criterion);
    const byModel = new Map<string, typeof grouped>();
    for (const g of grouped) {
      const arr = byModel.get(g.modelId) ?? [];
      arr.push(g);
      byModel.set(g.modelId, arr);
    }
    const result: ClashItem[] = [];
    for (const [modelId, gItems] of byModel) {
      const model = viewer.fragments.list.get(modelId);
      if (!model) continue;
      const ids = gItems.map((g) => g.localId);
      const boxes = await model.getBoxes(ids);
      for (let i = 0; i < ids.length; i++) {
        const box = boxes[i];
        if (box && !box.isEmpty()) {
          result.push({ modelId, localId: ids[i], group: gItems[i].group, box });
        }
      }
    }
    return result;
  };

  const ensureItems = async () => {
    if (!items.length) {
      items = await collectItems();
      types = [...new Set(items.map((it) => it.group))].sort((a, b) =>
        a.localeCompare(b, "es", { numeric: true }),
      );
    }
  };

  // ---------- Refinado por geometría (BVH) ----------
  // Asegura que los elementos involucrados en los candidatos tengan su BVH en
  // cache. Solo construye los que faltan, por lotes y cediendo a la UI.
  const ensureBvh = async (pairs: [number, number][]) => {
    const involved = new Map<string, Set<number>>();
    for (const [ia, ib] of pairs) {
      for (const it of [items[ia], items[ib]]) {
        if (bvhCache.has(`${it.modelId}|${it.localId}`)) continue;
        (involved.get(it.modelId) ?? involved.set(it.modelId, new Set()).get(it.modelId)!).add(
          it.localId,
        );
      }
    }
    let total = 0;
    for (const ids of involved.values()) total += ids.size;
    if (!total) return;

    let built = 0;
    for (const [modelId, ids] of involved) {
      const result = await mesher.get(
        { [modelId]: ids },
        { applyTransformation: true },
      );
      for (const [, byLocal] of result as Map<string, Map<number, THREE.Mesh[]>>) {
        for (const [localId, meshes] of byLocal) {
          const entries: { geom: THREE.BufferGeometry; bvh: MeshBVH }[] = [];
          for (const mesh of meshes) {
            const geom = mesh.geometry;
            if (!geom?.attributes?.position) continue;
            entries.push({ geom, bvh: new MeshBVH(geom) });
          }
          bvhCache.set(`${modelId}|${localId}`, entries);
          built++;
          if (built % 40 === 0) {
            setProgress(built, total, "Preparando geometría");
            await yieldToUi();
          }
        }
      }
    }
  };

  const geometriesIntersect = (a: ClashItem, b: ClashItem): boolean => {
    const ga = bvhCache.get(`${a.modelId}|${a.localId}`);
    const gb = bvhCache.get(`${b.modelId}|${b.localId}`);
    if (!ga || !gb) return false;
    for (const ea of ga) {
      for (const eb of gb) {
        if (ea.bvh.intersectsGeometry(eb.geom, IDENTITY)) return true;
      }
    }
    return false;
  };

  // ---------- Detección ----------
  const detect = async () => {
    if (!viewer.models().length) {
      showToast("Carga uno o más modelos IFC primero.", "info");
      return;
    }
    detectBtn.disabled = true;
    detectBtn.textContent = "Detectando…";
    try {
      await ensureItems();
      if (!items.length) {
        showToast("No se encontró geometría para analizar.", "info");
        return;
      }

      const tol = Math.max(0, parseFloat(tolInput.value) || 0);
      const boxes = items.map((it) => {
        const b = it.box.clone();
        if (tol > 0) b.expandByScalar(-tol);
        return b;
      });

      // Tamaño de celda del grid ~ tamaño medio.
      const size = new THREE.Vector3();
      let avg = 0;
      for (const b of boxes) {
        b.getSize(size);
        avg += (size.x + size.y + size.z) / 3;
      }
      avg = avg / boxes.length || 1;
      const cs = Math.max(avg, 0.5);
      const key = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

      const grid = new Map<string, number[]>();
      boxes.forEach((b, idx) => {
        if (b.isEmpty()) return;
        for (let x = Math.floor(b.min.x / cs); x <= Math.floor(b.max.x / cs); x++)
          for (let y = Math.floor(b.min.y / cs); y <= Math.floor(b.max.y / cs); y++)
            for (let z = Math.floor(b.min.z / cs); z <= Math.floor(b.max.z / cs); z++) {
              const k = key(x, y, z);
              const arr = grid.get(k) ?? grid.set(k, []).get(k)!;
              arr.push(idx);
            }
      });

      // Broad phase: candidatos por AABB, respetando la config de cruces.
      const candidates: [number, number][] = [];
      const seen = new Set<string>();
      for (const arr of grid.values()) {
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const ia = arr[i], ib = arr[j];
            const A = items[ia], B = items[ib];
            if (A.group === B.group) continue;
            if (disabled.has(crossKey(A.group, B.group))) continue;
            const pk = ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
            if (seen.has(pk)) continue;
            seen.add(pk);
            if (boxes[ia].intersectsBox(boxes[ib])) candidates.push([ia, ib]);
          }
        }
      }

      let pairs = candidates;
      if (precision === "geometry") {
        if (candidates.length > 8000) {
          showToast(
            `${candidates.length} candidatos: usa "Cajas" o más tolerancia para no saturar.`,
            "info",
          );
        }
        detectBtn.textContent = "Refinando geometría…";
        await ensureBvh(candidates);
        const refined: [number, number][] = [];
        for (let i = 0; i < candidates.length; i++) {
          const [ia, ib] = candidates[i];
          if (geometriesIntersect(items[ia], items[ib])) refined.push(candidates[i]);
          if (i % 150 === 0) {
            setProgress(i, candidates.length, "Analizando geometría");
            await yieldToUi();
          }
        }
        pairs = refined;
      }
      setProgress(0, 0, "");

      clashes = pairs.map(([ia, ib]) => {
        const A = items[ia], B = items[ib];
        const inter = boxes[ia].clone().intersect(boxes[ib]);
        const center = new THREE.Vector3();
        (inter.isEmpty() ? boxes[ia] : inter).getCenter(center);
        return { a: A, b: B, center };
      });

      buildMatrix();
      render();
      if (!clashes.length) showToast("No se detectaron interferencias.", "info");
    } catch (error) {
      console.error("Error en la detección de interferencias:", error);
      showToast("No se pudo completar la detección.");
    } finally {
      detectBtn.disabled = false;
      detectBtn.textContent = "Detectar interferencias";
      setProgress(0, 0, "");
    }
  };

  const buildMatrix = () => {
    matrix = new Map();
    maxCell = 0;
    for (const c of clashes) {
      const [x, y] = [c.a.group, c.b.group].sort();
      if (!matrix.has(x)) matrix.set(x, new Map());
      const row = matrix.get(x)!;
      const list = row.get(y) ?? [];
      list.push(c);
      row.set(y, list);
      maxCell = Math.max(maxCell, list.length);
    }
  };

  // ---------- Resaltado / navegación ----------
  const idsByModel = (pairs: ClashPair[]): OBC.ModelIdMap => {
    const map: OBC.ModelIdMap = {};
    const add = (it: ClashItem) => {
      (map[it.modelId] ??= new Set()).add(it.localId);
    };
    for (const c of pairs) {
      add(c.a);
      add(c.b);
    }
    return map;
  };

  const paint = async (pairs: ClashPair[]) => {
    for (const [modelId, ids] of Object.entries(idsByModel(pairs))) {
      const model = viewer.fragments.list.get(modelId);
      if (model) await model.setColor([...ids], CLASH_COLOR);
    }
    await viewer.update();
  };

  const focusPairs = async (pairs: ClashPair[]) => {
    if (!pairs.length) return;
    const box = new THREE.Box3();
    for (const c of pairs) box.expandByPoint(c.center);
    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    box.getCenter(center);
    box.getBoundingSphere(sphere);
    const dist = Math.max(sphere.radius * 2.2, 6);
    await viewer.world.camera.controls.setLookAt(
      center.x + dist, center.y + dist, center.z + dist,
      center.x, center.y, center.z,
      true,
    );
  };

  const clearColors = async () => {
    for (const model of viewer.models()) await model.resetColor(undefined);
    await viewer.update();
  };

  // ---------- Render del panel ----------
  const render = () => {
    listEl.replaceChildren();
    const rows: { a: string; b: string; pairs: ClashPair[] }[] = [];
    for (const [a, row] of matrix) {
      for (const [b, pairs] of row) rows.push({ a, b, pairs });
    }
    rows.sort((p, q) => q.pairs.length - p.pairs.length);

    panel.setBadge(clashes.length ? String(clashes.length) : null);
    summary.textContent = clashes.length
      ? `${clashes.length} interferencias en ${rows.length} cruces`
      : "Sin resultados todavía.";

    for (const { a, b, pairs } of rows) {
      const item = el("div", "clash-row");
      const swatch = el("span", "clash-dot");
      swatch.style.background = heatColor(pairs.length, maxCell);
      const info = el("div", "set-info");
      info.append(el("span", "set-name", `${a} × ${b}`));
      info.append(el("span", "set-count", `${pairs.length} interferencias`));
      const focusBtn = el("button", "icon-btn sm");
      focusBtn.type = "button";
      focusBtn.innerHTML = icons.focus;
      focusBtn.title = "Aislar y enfocar";
      focusBtn.addEventListener("click", async () => {
        await hider.isolate(idsByModel(pairs));
        await paint(pairs);
        await focusPairs(pairs);
      });
      item.append(swatch, info, focusBtn);
      listEl.append(item);
    }
  };

  // ---------- Overlay: matriz de configuración de cruces ----------
  const showConfig = async () => {
    if (!viewer.models().length) {
      showToast("Carga un modelo primero.", "info");
      return;
    }
    configBtn.disabled = true;
    configBtn.textContent = "Leyendo tipos…";
    try {
      await ensureItems();
    } finally {
      configBtn.disabled = false;
      configBtn.textContent = "Configurar cruces…";
    }
    if (!types.length) {
      showToast("No hay tipos para configurar.", "info");
      return;
    }
    buildMatrixOverlay({
      title: "Configurar cruces a analizar",
      mode: "config",
    });
  };

  // Hace arrastrable un panel tomándolo por su cabecera.
  const enableDrag = (panel: HTMLElement, handle: HTMLElement) => {
    let dragging = false;
    let ox = 0;
    let oy = 0;
    handle.style.touchAction = "none";
    handle.style.cursor = "move";
    handle.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      panel.style.left = `${Math.max(0, e.clientX - ox)}px`;
      panel.style.top = `${Math.max(0, e.clientY - oy)}px`;
      panel.style.right = "auto";
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

  // ---------- Panel flotante: matriz (config o resultados) ----------
  // Es un panel arrastrable, sin backdrop, para no bloquear el modelo.
  const buildMatrixOverlay = (opts: { title: string; mode: "config" | "result" }) => {
    document.querySelector(".matrix-float")?.remove();
    const box = el("div", "matrix-float");
    const head = el("div", "matrix-head");
    head.append(el("h3", undefined, opts.title));
    const headActions = el("div", "matrix-head-actions");
    if (opts.mode === "result") {
      const csvBtn = el("button", "btn small", "Exportar CSV");
      csvBtn.type = "button";
      csvBtn.addEventListener("click", exportCsv);
      headActions.append(csvBtn);
    } else {
      const hintLabel = el("span", "set-count", "Click en una celda para activar/desactivar el cruce");
      headActions.append(hintLabel);
    }
    const close = el("button", "icon-btn");
    close.innerHTML = icons.close;
    close.title = "Cerrar";
    close.addEventListener("click", () => box.remove());
    headActions.append(close);
    head.append(headActions);
    enableDrag(box, head);

    const scroll = el("div", "matrix-scroll");
    const table = el("table", "matrix-table");
    const axis = opts.mode === "result" ? matrixTypes() : types;

    const thead = el("tr");
    thead.append(el("th", "corner", "VS"));
    for (const c of axis) {
      const th = el("th", "col-head");
      th.append(el("span", undefined, c));
      thead.append(th);
    }
    table.append(thead);

    for (const rowType of axis) {
      const tr = el("tr");
      tr.append(el("th", "row-head", rowType));
      for (const colType of axis) {
        const td = el("td", "matrix-cell");
        if (rowType === colType) {
          td.classList.add("diagonal");
        } else if (opts.mode === "config") {
          const off = disabled.has(crossKey(rowType, colType));
          td.classList.add("cfg", off ? "off" : "on");
          td.textContent = off ? "" : "✓";
          td.title = `${rowType} × ${colType}`;
          td.addEventListener("click", () => {
            const k = crossKey(rowType, colType);
            if (disabled.has(k)) disabled.delete(k);
            else disabled.add(k);
            const nowOff = disabled.has(k);
            td.classList.toggle("off", nowOff);
            td.classList.toggle("on", !nowOff);
            td.textContent = nowOff ? "" : "✓";
          });
        } else {
          const [x, y] = [rowType, colType].sort();
          const pairs = matrix.get(x)?.get(y);
          if (pairs?.length) {
            td.textContent = String(pairs.length);
            td.style.background = heatColor(pairs.length, maxCell);
            td.style.color = "#1a1205";
            td.title = `${x} × ${y}: ${pairs.length} — click para aislar`;
            td.classList.add("hot");
            td.addEventListener("click", async () => {
              await hider.isolate(idsByModel(pairs));
              await paint(pairs);
              await focusPairs(pairs);
            });
          }
        }
        tr.append(td);
      }
      table.append(tr);
    }

    scroll.append(table);
    box.append(head, scroll);
    document.body.append(box);
  };

  const matrixTypes = (): string[] => {
    const set = new Set<string>();
    for (const [a, row] of matrix) {
      set.add(a);
      for (const b of row.keys()) set.add(b);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  };

  const exportCsv = () => {
    if (!clashes.length) return;
    const header = ["Grupo A", "Grupo B", "Interferencias"].join(",");
    const lines: string[] = [];
    for (const [a, row] of matrix) {
      for (const [b, pairs] of row) lines.push(`"${a}","${b}",${pairs.length}`);
    }
    downloadFile("interferencias.csv", `${header}\n${lines.join("\n")}`, "text/csv");
  };

  configBtn.addEventListener("click", () => void showConfig());
  detectBtn.addEventListener("click", () => void detect());
  matrixBtn.addEventListener("click", () => {
    if (!clashes.length) {
      showToast("Primero ejecuta la detección.", "info");
      return;
    }
    buildMatrixOverlay({ title: "Matriz de interferencias", mode: "result" });
  });
  highlightBtn.addEventListener("click", () => {
    if (!clashes.length) {
      showToast("Primero ejecuta la detección.", "info");
      return;
    }
    void (async () => {
      await hider.set(true);
      await paint(clashes);
    })();
  });
  clearBtn.addEventListener("click", () => {
    void (async () => {
      await hider.set(true);
      await clearColors();
    })();
  });

  viewer.fragments.list.onItemSet.add(() => {
    items = [];
    types = [];
    clashes = [];
    matrix = new Map();
    disabled.clear();
    bvhCache.clear();
    render();
  });

  render();
}
