import type { Viewer } from "./viewer";

/**
 * Cache compartido de datos de elementos. Aplana atributos y property sets de
 * todos los elementos de todos los modelos en filas tabulares. Lo consumen la
 * Tabla BIM, la Auditoría y el constructor de Filtros, y se construye una sola
 * vez por sesión de modelos (se invalida al cargar/quitar modelos).
 */

export const COL_MODEL = "Modelo";
export const COL_CATEGORY = "Categoría";
export const COL_NAME = "Nombre";

export interface ElementRow {
  modelId: string;
  localId: number;
  /** Clave única `${modelId}|${localId}` para sets/filtros. */
  key: string;
  /** Valores por columna; "" significa vacío/faltante. */
  values: Record<string, string>;
}

export interface DataCache {
  rows: ElementRow[];
  /** Columnas conocidas: base primero, luego alfabético. */
  columns: string[];
}

type Progress = (done: number, total: number) => void;

let cache: DataCache | null = null;
let building: Promise<DataCache> | null = null;
let viewerRef: Viewer | null = null;

function attrValue(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
    return (v as { value: unknown }).value;
  }
  return undefined;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(4)));
  }
  return String(value);
}

/** Registra la invalidación automática al cargar/quitar modelos. */
export function initDataCache(viewer: Viewer) {
  viewerRef = viewer;
  viewer.fragments.list.onItemSet.add(() => {
    cache = null;
    building = null;
  });
  viewer.fragments.list.onItemDeleted.add(() => {
    cache = null;
    building = null;
  });
}

export function dataCacheReady(): boolean {
  return cache !== null;
}

export async function getDataCache(onProgress?: Progress): Promise<DataCache> {
  if (cache) return cache;
  if (building) return building;
  const viewer = viewerRef;
  if (!viewer) throw new Error("DataCache no inicializado");
  building = build(viewer, onProgress)
    .then((result) => {
      cache = result;
      building = null;
      return result;
    })
    .catch((error) => {
      building = null;
      throw error;
    });
  return building;
}

async function build(viewer: Viewer, onProgress?: Progress): Promise<DataCache> {
  const rows: ElementRow[] = [];
  const columns = new Set<string>();

  // Pre-listar ids por modelo para conocer el total (progreso real).
  const perModel: { modelId: string; catOf: Map<number, string> }[] = [];
  let total = 0;
  for (const model of viewer.models()) {
    const byCat = await model.getItemsOfCategories([/^IFC/]);
    // Solo elementos con geometría (los que tienen estado de visibilidad):
    // excluye psets, materiales, relaciones y demás entidades auxiliares.
    const geometric = new Set<number>([
      ...(await model.getItemsByVisibility(true)),
      ...(await model.getItemsByVisibility(false)),
    ]);
    const catOf = new Map<number, string>();
    for (const [cat, ids] of Object.entries(byCat)) {
      for (const id of ids) if (geometric.has(id)) catOf.set(id, cat);
    }
    total += catOf.size;
    perModel.push({ modelId: model.modelId, catOf });
  }

  let done = 0;
  const CHUNK = 400;

  for (const { modelId, catOf } of perModel) {
    const model = viewer.fragments.list.get(modelId);
    if (!model) continue;
    const allIds = [...catOf.keys()];

    for (let i = 0; i < allIds.length; i += CHUNK) {
      const ids = allIds.slice(i, i + CHUNK);
      const data = await model.getItemsData(ids, {
        attributesDefault: true,
        relations: { IsDefinedBy: { attributes: true, relations: true } },
      });

      for (let j = 0; j < ids.length; j++) {
        const d = data[j] as Record<string, unknown>;
        const values: Record<string, string> = {};
        values[COL_MODEL] = modelId;
        values[COL_CATEGORY] = catOf.get(ids[j]) ?? "";

        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_") || Array.isArray(v)) continue;
          const raw = attrValue(v);
          if (raw === undefined) continue;
          const key = k === "Name" ? COL_NAME : k;
          values[key] = fmt(raw);
          columns.add(key);
        }

        const psets = Array.isArray(d.IsDefinedBy)
          ? (d.IsDefinedBy as Record<string, unknown>[])
          : [];
        for (const ps of psets) {
          const psName = attrValue(ps.Name);
          if (typeof psName !== "string") continue;
          const props = [
            ...(Array.isArray(ps.HasProperties) ? ps.HasProperties : []),
            ...(Array.isArray(ps.Quantities) ? ps.Quantities : []),
          ] as Record<string, unknown>[];
          for (const p of props) {
            const pn = attrValue(p.Name);
            if (typeof pn !== "string") continue;
            let val = attrValue(p.NominalValue);
            if (val === undefined) {
              for (const [pk, pv] of Object.entries(p)) {
                if (pk !== "Name" && pk.endsWith("Value")) {
                  const c = attrValue(pv);
                  if (c !== undefined) {
                    val = c;
                    break;
                  }
                }
              }
            }
            const key = `${pn} (${psName})`;
            values[key] = fmt(val);
            columns.add(key);
          }
        }

        rows.push({ modelId, localId: ids[j], key: `${modelId}|${ids[j]}`, values });
      }

      done += ids.length;
      onProgress?.(done, total);
      // Ceder el hilo para que la UI (barra de progreso) respire.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const rest = [...columns]
    .filter((c) => c !== COL_MODEL && c !== COL_CATEGORY && c !== COL_NAME)
    .sort((a, b) => a.localeCompare(b, "es"));

  return { rows, columns: [COL_MODEL, COL_CATEGORY, COL_NAME, ...rest] };
}
