import * as THREE from "three";

/**
 * Tabla de colores por subdisciplina (estándar del usuario / flujo MRBIM).
 * Cada entrada mapea una subdisciplina a su color RGB. Las que no tienen color
 * definido (—) caen en la paleta automática.
 */
export interface SubdisciplineDef {
  discipline: string;
  name: string;
  abbr: string;
  rgb?: [number, number, number];
}

export const SUBDISCIPLINES: SubdisciplineDef[] = [
  { discipline: "Estructuras", name: "Movimiento de Tierra", abbr: "MOT" },
  { discipline: "Estructuras", name: "Concreto + Aisladores", abbr: "EST" },
  { discipline: "Arquitectura", name: "Arquitectura (acabados)", abbr: "ARQ" },
  { discipline: "Arquitectura", name: "Muro Cortina", abbr: "MCO" },
  { discipline: "IS", name: "Agua Fría", abbr: "AF", rgb: [0, 175, 80] },
  { discipline: "IS", name: "Agua Caliente", abbr: "AC", rgb: [0, 200, 150] },
  { discipline: "IS", name: "Agua Blanda", abbr: "AB", rgb: [226, 239, 217] },
  { discipline: "IS", name: "Desagüe Negro", abbr: "DN", rgb: [127, 127, 127] },
  { discipline: "IS", name: "Desagüe Graso", abbr: "DG", rgb: [128, 128, 0] },
  { discipline: "IS", name: "Drenaje Pluvial", abbr: "DP", rgb: [255, 185, 185] },
  { discipline: "IS", name: "Ventilación", abbr: "VT", rgb: [178, 178, 178] },
  { discipline: "IS", name: "Riego", abbr: "RI", rgb: [180, 198, 231] },
  { discipline: "IM", name: "Extracción Forzada", abbr: "EF", rgb: [146, 208, 80] },
  { discipline: "IM", name: "Grupo Electrógeno", abbr: "GRE", rgb: [64, 49, 82] },
  { discipline: "IM", name: "Suministro HVAC", abbr: "SHV", rgb: [139, 227, 137] },
  { discipline: "ACI", name: "Tubería de Rociadores", abbr: "TR", rgb: [255, 0, 0] },
  { discipline: "IE/Com", name: "Iluminación", abbr: "IL", rgb: [255, 255, 0] },
  { discipline: "IE/Com", name: "Tomacorrientes Estabilizado", abbr: "ELE", rgb: [255, 192, 0] },
  { discipline: "IE/Com", name: "Malla Tierra", abbr: "MT", rgb: [255, 255, 175] },
  { discipline: "IE/Com", name: "Data", abbr: "DT", rgb: [162, 101, 235] },
  { discipline: "IE/Com", name: "CCTV", abbr: "CT", rgb: [45, 157, 130] },
  { discipline: "IE/Com", name: "Control de Acceso", abbr: "CA", rgb: [45, 157, 120] },
  { discipline: "IE/Com", name: "BMS", abbr: "BMS", rgb: [15, 36, 62] },
  { discipline: "IE/Com", name: "Audio Ambiental", abbr: "AA", rgb: [251, 212, 180] },
  { discipline: "IE/Com", name: "Perifoneo", abbr: "PE", rgb: [229, 223, 236] },
  { discipline: "IE/Com", name: "UPS", abbr: "UPS", rgb: [148, 138, 84] },
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .trim();
}

// Índice por nombre y por abreviatura normalizados.
const byKey = new Map<string, THREE.Color>();
for (const d of SUBDISCIPLINES) {
  if (!d.rgb) continue;
  // Los valores de la tabla son sRGB (0-255). Se construyen en sRGB para que el
  // color se vea exactamente como en la tabla bajo el color management de three.
  const color = new THREE.Color().setRGB(
    d.rgb[0] / 255,
    d.rgb[1] / 255,
    d.rgb[2] / 255,
    THREE.SRGBColorSpace,
  );
  byKey.set(norm(d.name), color);
  byKey.set(norm(d.abbr), color);
}

/**
 * Devuelve el color de la tabla para un nombre de grupo, si coincide con una
 * subdisciplina conocida por su nombre o abreviatura (tolerante a may/min,
 * tildes, y prefijos tipo "IS-AF" o "AF - Agua Fría").
 */
export function presetColorFor(group: string): THREE.Color | null {
  const g = norm(group);
  if (byKey.has(g)) return byKey.get(g)!.clone();
  // Coincidencia por token (p. ej. "IS-AF", "AF_Tuberia", "Agua Fría (AF)").
  const tokens = g.split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    if (byKey.has(t)) return byKey.get(t)!.clone();
  }
  return null;
}
