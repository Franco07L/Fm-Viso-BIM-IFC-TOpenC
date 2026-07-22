/**
 * Contrato de intercambio con `bim4d_discretizer` (motor de cronograma 4D).
 *
 * El motor emite `cronograma_viewer.json` con lo que YA calculó (fechas del
 * tren, precedencias y curva S programada del APU). El visor solo lee: así
 * ambos proyectos evolucionan por separado mientras respeten esta forma.
 */

export const SCHEDULE_SCHEMA = 1;
const STORAGE_KEY = "bim-viewer-schedule";

export interface ScheduleActivity {
  /** Llave de cruce con el modelo (rol «Código de actividad»). */
  codigo: string | null;
  nombre: string;
  actividad: string | null;
  modulo: string | null;
  nivel: string | null;
  proceso: string | null;
  fase: string;
  /** ISO `YYYY-MM-DD`. */
  inicio: string | null;
  fin: string | null;
  dias: number;
  costo: number;
  modelable: boolean;
  predecesoras: string[];
}

export interface CurvePoint {
  fecha: string;
  costo: number;
  acumulado: number;
  pct: number;
}

export interface MonthPoint {
  mes: string;
  costo: number;
  acumulado: number;
  pct: number;
}

export interface ScheduleData {
  schema: number;
  proyecto: string;
  generado: string;
  inicio: string | null;
  fin: string | null;
  plazoLaborable: number | null;
  moneda: string;
  costoTotal: number;
  actividades: ScheduleActivity[];
  curvaS: CurvePoint[];
  curvaMensual: MonthPoint[];
}

export class ScheduleError extends Error {}

/** Valida y normaliza el JSON del discretizador. Lanza `ScheduleError`. */
export function parseSchedule(text: string): ScheduleData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ScheduleError("El archivo no es un JSON válido.");
  }
  if (!raw || typeof raw !== "object") {
    throw new ScheduleError("El archivo no tiene la estructura esperada.");
  }
  const d = raw as Partial<ScheduleData>;
  if (typeof d.schema !== "number") {
    throw new ScheduleError(
      "Falta el campo «schema»: ¿es un cronograma_viewer.json del discretizador?",
    );
  }
  if (d.schema > SCHEDULE_SCHEMA) {
    throw new ScheduleError(
      `El archivo usa el esquema ${d.schema} y este visor entiende hasta el ${SCHEDULE_SCHEMA}. Actualiza el visor.`,
    );
  }
  if (!Array.isArray(d.actividades)) {
    throw new ScheduleError("El archivo no trae la lista de actividades.");
  }

  const actividades: ScheduleActivity[] = d.actividades.map((a) => ({
    codigo: a?.codigo ?? null,
    nombre: String(a?.nombre ?? "(sin nombre)"),
    actividad: a?.actividad ?? null,
    modulo: a?.modulo ?? null,
    nivel: a?.nivel ?? null,
    proceso: a?.proceso ?? null,
    fase: String(a?.fase ?? ""),
    inicio: a?.inicio ?? null,
    fin: a?.fin ?? null,
    dias: Number(a?.dias ?? 0),
    costo: Number(a?.costo ?? 0),
    modelable: a?.modelable !== false,
    predecesoras: Array.isArray(a?.predecesoras) ? a.predecesoras : [],
  }));

  return {
    schema: d.schema,
    proyecto: String(d.proyecto ?? "Proyecto"),
    generado: String(d.generado ?? ""),
    inicio: d.inicio ?? null,
    fin: d.fin ?? null,
    plazoLaborable: d.plazoLaborable ?? null,
    moneda: String(d.moneda ?? "PEN"),
    costoTotal: Number(d.costoTotal ?? 0),
    actividades,
    curvaS: Array.isArray(d.curvaS) ? d.curvaS : [],
    curvaMensual: Array.isArray(d.curvaMensual) ? d.curvaMensual : [],
  };
}

export function saveSchedule(data: ScheduleData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* el cronograma puede exceder la cuota: no es crítico */
  }
}

export function loadSavedSchedule(): ScheduleData | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return parseSchedule(saved);
  } catch {
    return null;
  }
}

export function clearSavedSchedule() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin storage */
  }
}

/** Fecha ISO → Date local a medianoche (evita corrimientos por zona horaria). */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function dateToIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Mes `YYYY-MM` de una fecha ISO. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Estado de una actividad respecto a una fecha de corte. */
export type ActivityPhase = "done" | "running" | "pending";

export function phaseAt(a: ScheduleActivity, cut: Date): ActivityPhase {
  if (!a.inicio) return "pending";
  const start = isoToDate(a.inicio);
  const end = a.fin ? isoToDate(a.fin) : start;
  if (cut < start) return "pending";
  if (cut >= end) return "done";
  return "running";
}

export interface EvmPoint {
  mes: string;
  /** Valor planificado acumulado (del cronograma + APU). */
  pv: number;
  /** Valor ganado acumulado: costo de lo realmente ejecutado. */
  ev: number;
  /** Índice de desempeño del cronograma (EV/PV). */
  spi: number;
}

/**
 * EVM de cronograma. `executedByCode` mapea código de actividad → mes
 * `YYYY-MM` en que el modelo dice que se ejecutó (rol «Período ejecutado»).
 *
 * Solo se calcula SPI: el CPI necesita **costo real** de obra, un dato que no
 * está ni en el modelo ni en el presupuesto programado. No se inventa.
 */
export function computeEvm(
  data: ScheduleData,
  executedByCode: Map<string, string>,
): EvmPoint[] {
  const months = new Set<string>(data.curvaMensual.map((m) => m.mes));
  for (const mes of executedByCode.values()) months.add(mes);
  const axis = [...months].sort();
  if (!axis.length) return [];

  const pvByMonth = new Map(data.curvaMensual.map((m) => [m.mes, m.acumulado]));

  // Costo programado de cada actividad ejecutada, imputado a su mes real.
  const evByMonth = new Map<string, number>();
  const costOf = new Map(
    data.actividades.filter((a) => a.codigo).map((a) => [a.codigo as string, a.costo]),
  );
  for (const [code, mes] of executedByCode) {
    const cost = costOf.get(code);
    if (cost === undefined) continue;
    evByMonth.set(mes, (evByMonth.get(mes) ?? 0) + cost);
  }

  const out: EvmPoint[] = [];
  let pvLast = 0;
  let evAcc = 0;
  for (const mes of axis) {
    pvLast = pvByMonth.get(mes) ?? pvLast;
    evAcc += evByMonth.get(mes) ?? 0;
    out.push({
      mes,
      pv: pvLast,
      ev: evAcc,
      spi: pvLast > 0 ? evAcc / pvLast : 0,
    });
  }
  return out;
}

/** Formatea un monto en la moneda del cronograma. */
export function fmtMoney(value: number, currency = "PEN"): string {
  const symbol = currency === "PEN" ? "S/" : "";
  return `${symbol} ${value.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
