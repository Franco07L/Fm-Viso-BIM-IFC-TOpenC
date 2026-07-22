import { getDataCache, COL_CATEGORY, COL_NAME, type ElementRow } from "./datacache";
import { roleColumn, roleValue } from "./paramroles";

/**
 * Control de cambios entre versiones del modelo (inspirado en el versionado de
 * Speckle, pero local y sin nube).
 *
 * Se toma una **instantánea** del modelo cargado (huella de cada elemento) y se
 * guarda. Al cargar una exportación posterior del mismo proyecto se compara
 * contra esa instantánea y se reporta qué se añadió, qué desapareció y qué
 * cambió de valor. Es el "¿qué cambió entre la revisión A y la B?" que hoy se
 * hace comparando PDFs a mano.
 */

const STORAGE_KEY = "bim-viewer-snapshots";
/** Cuántas instantáneas se conservan (las más nuevas). */
const MAX_SNAPSHOTS = 8;

export interface SnapshotItem {
  /** Identidad estable del elemento entre exportaciones. */
  id: string;
  category: string;
  name: string;
  /** Valores de los parámetros vigilados, para detectar cambios. */
  values: Record<string, string>;
}

export interface Snapshot {
  name: string;
  at: number;
  /** Parámetros que se compararon (los roles configurados + base). */
  tracked: string[];
  items: SnapshotItem[];
}

export type ChangeKind = "added" | "removed" | "modified";

export interface Change {
  kind: ChangeKind;
  id: string;
  category: string;
  name: string;
  /** Solo en `modified`: qué parámetros cambiaron y cómo. */
  diffs: { field: string; before: string; after: string }[];
  /** Fila actual en el modelo (ausente si el elemento desapareció). */
  row?: ElementRow;
}

export interface DiffResult {
  base: Snapshot;
  added: Change[];
  removed: Change[];
  modified: Change[];
  unchanged: number;
}

/**
 * Identidad del elemento entre exportaciones. El `localId` cambia en cada
 * export de Revit, así que se prefiere el GUID de IFC; si no está, se cae a
 * categoría+nombre (menos fiable pero suficiente para comparar revisiones).
 */
function identityOf(row: ElementRow): string {
  const guid =
    row.values.GlobalId ?? row.values.Guid ?? row.values.GUID ?? row.values._guid;
  if (guid) return `guid:${guid}`;
  return `nk:${row.values[COL_CATEGORY] ?? ""}|${row.values[COL_NAME] ?? ""}|${row.localId}`;
}

/** Parámetros que se comparan: los roles configurados + los básicos. */
function trackedFields(): string[] {
  const fields = new Set<string>([COL_CATEGORY, COL_NAME]);
  for (const id of [
    "partidaCode",
    "partidaDesc",
    "partidaUnit",
    "qtyVolume",
    "qtyArea",
    "qtyLength",
    "periodMonth",
    "scheduleCode",
  ] as const) {
    const col = roleColumn(id);
    if (col) fields.add(col);
  }
  return [...fields];
}

export async function takeSnapshot(name: string): Promise<Snapshot> {
  const cache = await getDataCache();
  const tracked = trackedFields();
  const items: SnapshotItem[] = cache.rows.map((row) => {
    const values: Record<string, string> = {};
    for (const f of tracked) values[f] = row.values[f] ?? "";
    return {
      id: identityOf(row),
      category: row.values[COL_CATEGORY] ?? "",
      name: row.values[COL_NAME] ?? "",
      values,
    };
  });
  return { name, at: Date.now(), tracked, items };
}

export function listSnapshots(): Snapshot[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Snapshot[];
  } catch {
    /* sin storage */
  }
  return [];
}

/** Guarda la instantánea. Devuelve false si no cupo en el almacenamiento. */
export function saveSnapshot(snap: Snapshot): boolean {
  const all = listSnapshots();
  all.push(snap);
  while (all.length > MAX_SNAPSHOTS) all.shift();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function deleteSnapshot(at: number) {
  const all = listSnapshots().filter((s) => s.at !== at);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* sin storage */
  }
}

/** Compara el modelo cargado ahora contra una instantánea guardada. */
export async function diffAgainst(base: Snapshot): Promise<DiffResult> {
  const cache = await getDataCache();
  const current = new Map<string, ElementRow>();
  for (const row of cache.rows) current.set(identityOf(row), row);

  const baseById = new Map(base.items.map((i) => [i.id, i]));

  const added: Change[] = [];
  const removed: Change[] = [];
  const modified: Change[] = [];
  let unchanged = 0;

  for (const [id, row] of current) {
    const before = baseById.get(id);
    if (!before) {
      added.push({
        kind: "added",
        id,
        category: row.values[COL_CATEGORY] ?? "",
        name: row.values[COL_NAME] ?? "",
        diffs: [],
        row,
      });
      continue;
    }
    const diffs: Change["diffs"] = [];
    for (const field of base.tracked) {
      const b = before.values[field] ?? "";
      const a = row.values[field] ?? "";
      if (b !== a) diffs.push({ field, before: b, after: a });
    }
    if (diffs.length) {
      modified.push({
        kind: "modified",
        id,
        category: row.values[COL_CATEGORY] ?? "",
        name: row.values[COL_NAME] ?? "",
        diffs,
        row,
      });
    } else {
      unchanged++;
    }
  }

  for (const [id, item] of baseById) {
    if (current.has(id)) continue;
    removed.push({
      kind: "removed",
      id,
      category: item.category,
      name: item.name,
      diffs: [],
    });
  }

  return { base, added, removed, modified, unchanged };
}

/**
 * Impacto en cantidades: cuánto varió el metrado por partida entre versiones.
 * Solo se calcula si está mapeado el rol «Código de partida».
 */
export interface QtyDelta {
  code: string;
  before: number;
  after: number;
  delta: number;
}

export function quantityDeltas(diff: DiffResult): QtyDelta[] {
  const codeCol = roleColumn("partidaCode");
  if (!codeCol || !diff.base.tracked.includes(codeCol)) return [];

  const counts = new Map<string, { before: number; after: number }>();
  const bump = (code: string, key: "before" | "after") => {
    if (!code) return;
    const entry = counts.get(code) ?? counts.set(code, { before: 0, after: 0 }).get(code)!;
    entry[key]++;
  };

  for (const item of diff.base.items) bump(item.values[codeCol] ?? "", "before");
  for (const c of [...diff.added, ...diff.modified]) {
    if (c.row) bump(roleValue(c.row, "partidaCode"), "after");
  }
  // Los que no cambiaron siguen contando en "después".
  for (const item of diff.base.items) {
    const changed = diff.modified.some((m) => m.id === item.id);
    const gone = diff.removed.some((r) => r.id === item.id);
    if (!changed && !gone) bump(item.values[codeCol] ?? "", "after");
  }

  return [...counts.entries()]
    .map(([code, v]) => ({ code, before: v.before, after: v.after, delta: v.after - v.before }))
    .filter((d) => d.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
