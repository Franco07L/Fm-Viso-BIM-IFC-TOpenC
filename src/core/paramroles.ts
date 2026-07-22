import type { ElementRow } from "./datacache";

/**
 * Mapeo de parámetros del modelo a **roles semánticos**.
 *
 * Cada empresa/proyecto nombra sus parámetros distinto (`REP_ID-ACTIVIDAD`,
 * `FAST_CODIGO_PARTIDA`, `BI_CODIGO_PARTIDA`…). En vez de imponer una
 * convención, el visor pregunta una sola vez qué parámetro cumple qué rol y
 * guarda esa configuración. Todo lo que necesita datos de gestión (Partidas,
 * Obras, Cronograma 4D) lee por rol, nunca por nombre literal.
 */

const STORAGE_KEY = "bim-viewer-param-roles";

export type RoleId =
  | "partidaCode"
  | "partidaDesc"
  | "partidaUnit"
  | "qtyVolume"
  | "qtyArea"
  | "qtyLength"
  | "rebarDiameter"
  | "rebarLength"
  | "periodMonth"
  | "periodWeek"
  | "periodDay"
  | "scheduleCode";

export interface RoleDef {
  id: RoleId;
  label: string;
  hint: string;
  group: string;
  /** Patrones para sugerir automáticamente una columna al cargar el modelo. */
  guess: RegExp[];
}

export const ROLE_GROUPS = ["Partidas", "Cantidades", "Acero", "Avance de obra", "Cronograma"] as const;

export const ROLES: RoleDef[] = [
  {
    id: "partidaCode",
    label: "Código de partida",
    hint: "Llave de agrupación del presupuesto (ej. 07.02.01.01)",
    group: "Partidas",
    guess: [/c[oó]digo[ _-]*(de[ _-]*)?partida/i, /partida[ _-]*c[oó]digo/i, /\bcod[ _-]*part/i],
  },
  {
    id: "partidaDesc",
    label: "Descripción de partida",
    hint: "Texto de la partida del presupuesto",
    group: "Partidas",
    guess: [/descripci[oó]n[ _-]*(de[ _-]*)?partida/i, /partida[ _-]*descripci[oó]n/i],
  },
  {
    id: "partidaUnit",
    label: "Unidad de partida",
    hint: "m3, m2, kg, ml, und… decide qué cantidad se suma",
    group: "Partidas",
    guess: [/unidad[ _-]*(de[ _-]*)?partida/i, /^unidad/i, /\bund\b/i],
  },
  {
    id: "qtyVolume",
    label: "Volumen (m³)",
    hint: "Para partidas en m3 (concreto, movimiento de tierras)",
    group: "Cantidades",
    guess: [/net[ _-]*volume/i, /gross[ _-]*volume/i, /volumen/i, /\bvolume\b/i],
  },
  {
    id: "qtyArea",
    label: "Área (m²)",
    hint: "Para partidas en m2 (encofrado, tarrajeo, pisos)",
    group: "Cantidades",
    guess: [/net[ _-]*(side)?area/i, /gross[ _-]*(side)?area/i, /\b[aá]rea\b/i, /\barea\b/i],
  },
  {
    id: "qtyLength",
    label: "Longitud (m)",
    hint: "Para partidas en ml (tuberías, sardineles)",
    group: "Cantidades",
    guess: [/\blength\b/i, /longitud/i],
  },
  {
    id: "rebarDiameter",
    label: "Diámetro de barra",
    hint: "Convierte acero a kg con la tabla ⌀→kg/m",
    group: "Acero",
    guess: [/di[aá]metro/i, /diameter/i, /bar[ _-]*size/i],
  },
  {
    id: "rebarLength",
    label: "Longitud total de barra",
    hint: "Longitud total del acero del elemento",
    group: "Acero",
    guess: [/longitud[ _-]*total/i, /total[ _-]*(bar[ _-]*)?length/i, /bar[ _-]*length/i],
  },
  {
    id: "periodMonth",
    label: "Período mensual ejecutado",
    hint: "Mes real de ejecución (valorización). Ej. 2026-03 o Marzo",
    group: "Avance de obra",
    guess: [/\bmes\b/i, /mensual/i, /\bmonth\b/i],
  },
  {
    id: "periodWeek",
    label: "Período semanal ejecutado",
    hint: "Semana real de ejecución (opcional)",
    group: "Avance de obra",
    guess: [/semana/i, /\bweek\b/i],
  },
  {
    id: "periodDay",
    label: "Período diario ejecutado",
    hint: "Día real de ejecución (opcional)",
    group: "Avance de obra",
    guess: [/\bd[ií]a\b/i, /diario/i, /\bday\b/i],
  },
  {
    id: "scheduleCode",
    label: "Código de actividad",
    hint: "Llave de cruce con el cronograma 4D (REP_ID-ACTIVIDAD)",
    group: "Cronograma",
    guess: [/id[ _-]*actividad/i, /actividad[ _-]*id/i, /c[oó]digo[ _-]*actividad/i],
  },
];

export type RoleMap = Partial<Record<RoleId, string>>;

/** Tabla estándar de acero corrugado: diámetro comercial → peso lineal. */
export const STEEL_TABLE: { label: string; mm: number; kgPerM: number }[] = [
  { label: '1/4"', mm: 6.35, kgPerM: 0.249 },
  { label: '3/8"', mm: 9.525, kgPerM: 0.56 },
  { label: '1/2"', mm: 12.7, kgPerM: 0.996 },
  { label: '5/8"', mm: 15.875, kgPerM: 1.556 },
  { label: '3/4"', mm: 19.05, kgPerM: 2.24 },
  { label: '7/8"', mm: 22.225, kgPerM: 3.049 },
  { label: '1"', mm: 25.4, kgPerM: 3.982 },
  { label: '1 1/8"', mm: 28.575, kgPerM: 5.04 },
  { label: '1 1/4"', mm: 31.75, kgPerM: 6.223 },
  { label: '1 3/8"', mm: 34.925, kgPerM: 7.529 },
  { label: '1 1/2"', mm: 38.1, kgPerM: 8.961 },
];

let roles: RoleMap = load();
const listeners = new Set<() => void>();

function load(): RoleMap {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as RoleMap;
  } catch {
    /* sin storage */
  }
  return {};
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  } catch {
    /* sin storage */
  }
}

export function getRoles(): RoleMap {
  return { ...roles };
}

/** Columna asignada a un rol, o "" si no está configurado. */
export function roleColumn(id: RoleId): string {
  return roles[id] ?? "";
}

export function setRole(id: RoleId, column: string) {
  if (column) roles[id] = column;
  else delete roles[id];
  persist();
  for (const cb of listeners) cb();
}

export function clearRoles() {
  roles = {};
  persist();
  for (const cb of listeners) cb();
}

export function onRolesChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Valor del rol para una fila (cadena vacía si el rol no está mapeado). */
export function roleValue(row: ElementRow, id: RoleId): string {
  const col = roles[id];
  return col ? (row.values[col] ?? "") : "";
}

/** Número del rol para una fila (NaN si no aplica). */
export function roleNumber(row: ElementRow, id: RoleId): number {
  const raw = roleValue(row, id);
  if (!raw) return NaN;
  // Tolera "12,5 m3" o "1 234.5": deja solo dígitos, signo y separador decimal.
  const cleaned = raw.replace(/[^\d,.\-]/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

/** ¿Hay al menos un rol configurado? */
export function hasAnyRole(): boolean {
  return Object.keys(roles).length > 0;
}

/**
 * Sugiere columnas para los roles aún sin asignar, según patrones de nombre.
 * No pisa lo que el usuario ya configuró. Devuelve cuántos roles se llenaron.
 */
export function autoDetect(columns: string[]): number {
  let filled = 0;
  for (const def of ROLES) {
    if (roles[def.id]) continue;
    for (const pattern of def.guess) {
      const hit = columns.find((c) => pattern.test(c));
      if (hit) {
        roles[def.id] = hit;
        filled++;
        break;
      }
    }
  }
  if (filled) persist();
  return filled;
}

/** Descarta roles cuya columna ya no existe en el modelo cargado. */
export function pruneRoles(columns: string[]) {
  let changed = false;
  for (const id of Object.keys(roles) as RoleId[]) {
    if (!columns.includes(roles[id] as string)) {
      delete roles[id];
      changed = true;
    }
  }
  if (changed) {
    persist();
    for (const cb of listeners) cb();
  }
}

/**
 * Interpreta la unidad de una partida y dice qué cantidad hay que sumar.
 * `count` = contar elementos (und, pza, glb…).
 */
export type QtyKind = "volume" | "area" | "length" | "weight" | "count";

export function qtyKindForUnit(unit: string): QtyKind {
  const u = unit.trim().toLowerCase().replace(/\s/g, "");
  if (/^m3|m³|mc$/.test(u)) return "volume";
  if (/^m2|m²$/.test(u)) return "area";
  if (/^(m|ml|mL|metro)$/.test(u)) return "length";
  if (/^(kg|kgs|kilo)/.test(u)) return "weight";
  return "count";
}

/** kg/m de un diámetro dado, aceptando `1/2"`, `1/2`, `12.7`, `12.7 mm`. */
export function steelKgPerM(diameter: string): number {
  const raw = diameter.trim();
  if (!raw) return NaN;
  const norm = raw.replace(/["”\s]/g, "");
  const byLabel = STEEL_TABLE.find(
    (s) => s.label.replace(/["\s]/g, "") === norm,
  );
  if (byLabel) return byLabel.kgPerM;
  const mm = parseFloat(norm.replace(/[^\d.,]/g, "").replace(",", "."));
  if (Number.isNaN(mm)) return NaN;
  // Tolerancia de 0.3 mm para nomenclaturas redondeadas (12.7 vs 12.70 vs 13).
  const byMm = STEEL_TABLE.find((s) => Math.abs(s.mm - mm) < 0.35);
  return byMm ? byMm.kgPerM : NaN;
}
