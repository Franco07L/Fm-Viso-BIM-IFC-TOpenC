import { getDataCache, type ElementRow } from "./datacache";
import {
  qtyKindForUnit,
  roleColumn,
  roleNumber,
  roleValue,
  steelKgPerM,
  type QtyKind,
} from "./paramroles";

/**
 * Fase F — Árbol de partidas con metrado agregado desde el modelo.
 *
 * Agrupa los elementos por su código de partida (rol `partidaCode`) y suma la
 * cantidad que corresponde a la unidad de esa partida: m3→volumen, m2→área,
 * ml→longitud, kg→acero (⌀ × longitud vía la tabla estándar), otro→conteo.
 * El código se descompone por puntos para armar la jerarquía del presupuesto
 * (`07` → `07.02` → `07.02.01` → …), igual que un presupuesto peruano.
 */

export interface PartidaNode {
  code: string;
  /** Segmento propio del código (lo que se ve indentado en el árbol). */
  label: string;
  description: string;
  unit: string;
  kind: QtyKind;
  /** Metrado propio (solo de los elementos con ESTE código exacto). */
  own: number;
  /** Metrado acumulado (propio + descendientes). NaN si la rama mezcla unidades. */
  total: number;
  /** La rama agrupa partidas de distinta unidad: no se puede sumar. */
  mixed: boolean;
  /** Elementos con este código exacto. */
  rows: ElementRow[];
  /** Nº de elementos acumulado (propio + descendientes). */
  count: number;
  children: PartidaNode[];
  depth: number;
  /** Verdadero si ningún elemento aportó cantidad (falta el parámetro). */
  incomplete: boolean;
}

/** Etiqueta por defecto cuando la partida no declara unidad. */
export const UNIT_LABEL: Record<QtyKind, string> = {
  volume: "m³",
  area: "m²",
  length: "m",
  weight: "kg",
  count: "und",
};

export interface PartidasResult {
  roots: PartidaNode[];
  /** Todas las hojas con elementos reales, en orden de código. */
  leaves: PartidaNode[];
  /** Elementos sin código de partida. */
  unassigned: ElementRow[];
  totalRows: number;
}

/** Cantidad que aporta UN elemento a una partida, según la unidad. */
export function elementQuantity(row: ElementRow, kind: QtyKind): number {
  switch (kind) {
    case "volume":
      return roleNumber(row, "qtyVolume");
    case "area":
      return roleNumber(row, "qtyArea");
    case "length":
      return roleNumber(row, "qtyLength");
    case "weight": {
      const kgPerM = steelKgPerM(roleValue(row, "rebarDiameter"));
      const len = roleNumber(row, "rebarLength");
      if (Number.isNaN(kgPerM) || Number.isNaN(len)) return NaN;
      return kgPerM * len;
    }
    case "count":
      return 1;
  }
}

function makeNode(code: string, label: string, depth: number): PartidaNode {
  return {
    code,
    label,
    description: "",
    unit: "",
    kind: "count",
    own: 0,
    total: 0,
    mixed: false,
    rows: [],
    count: 0,
    children: [],
    depth,
    incomplete: false,
  };
}

/** ¿Está configurado lo mínimo para construir el árbol? */
export function partidasReady(): boolean {
  return roleColumn("partidaCode") !== "";
}

/**
 * Construye el árbol. `rowsOverride` permite alimentar filas sintéticas
 * (pruebas) en vez de leer el cache del modelo cargado.
 */
export async function buildPartidas(rowsOverride?: ElementRow[]): Promise<PartidasResult> {
  const allRows = rowsOverride ?? (await getDataCache()).rows;
  const byCode = new Map<string, ElementRow[]>();
  const unassigned: ElementRow[] = [];

  for (const row of allRows) {
    const code = roleValue(row, "partidaCode").trim();
    if (!code) {
      unassigned.push(row);
      continue;
    }
    const list = byCode.get(code) ?? byCode.set(code, []).get(code)!;
    list.push(row);
  }

  // Índice de nodos por código completo; crea los ancestros que falten.
  const nodes = new Map<string, PartidaNode>();
  const roots: PartidaNode[] = [];

  const ensureNode = (code: string): PartidaNode => {
    const existing = nodes.get(code);
    if (existing) return existing;
    const parts = code.split(".");
    const label = parts[parts.length - 1];
    const node = makeNode(code, label, parts.length - 1);
    nodes.set(code, node);
    if (parts.length === 1) {
      roots.push(node);
    } else {
      const parent = ensureNode(parts.slice(0, -1).join("."));
      parent.children.push(node);
    }
    return node;
  };

  for (const [code, rows] of byCode) {
    const node = ensureNode(code);
    node.rows = rows;
    // Descripción y unidad: el primer valor no vacío que aparezca.
    for (const r of rows) {
      if (!node.description) node.description = roleValue(r, "partidaDesc");
      if (!node.unit) node.unit = roleValue(r, "partidaUnit");
      if (node.description && node.unit) break;
    }
    node.kind = qtyKindForUnit(node.unit);

    let sum = 0;
    let counted = 0;
    for (const r of rows) {
      const q = elementQuantity(r, node.kind);
      if (!Number.isNaN(q)) {
        sum += q;
        counted++;
      }
    }
    node.own = sum;
    node.incomplete = counted === 0 && rows.length > 0;
  }

  /**
   * Rollup de hojas hacia arriba. Una rama solo muestra total si TODA su
   * descendencia comparte unidad: sumar m³ con m² o kg no significa nada en un
   * presupuesto, así que esas ramas quedan como "mixtas" (sin metrado).
   * Devuelve las unidades presentes en el subárbol.
   */
  const rollup = (node: PartidaNode): Set<string> => {
    const units = new Set<string>();
    if (node.rows.length) units.add(node.unit || UNIT_LABEL[node.kind]);

    let total = node.own;
    let count = node.rows.length;
    for (const child of node.children) {
      for (const u of rollup(child)) units.add(u);
      total += child.total;
      count += child.count;
    }

    node.count = count;
    node.mixed = units.size > 1;
    node.total = node.mixed ? NaN : total;
    // Una rama homogénea hereda la unidad de sus hojas para poder rotularla.
    if (!node.mixed && !node.unit && units.size === 1) node.unit = [...units][0];
    return units;
  };

  const sortTree = (list: PartidaNode[]) => {
    list.sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
    for (const n of list) sortTree(n.children);
  };

  for (const r of roots) rollup(r);
  sortTree(roots);

  const leaves: PartidaNode[] = [];
  const collect = (list: PartidaNode[]) => {
    for (const n of list) {
      if (n.rows.length) leaves.push(n);
      collect(n.children);
    }
  };
  collect(roots);

  return { roots, leaves, unassigned, totalRows: allRows.length };
}

/** Formatea un metrado con la precisión típica de presupuesto. */
export function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
