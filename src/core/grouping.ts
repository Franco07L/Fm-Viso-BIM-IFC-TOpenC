import type { Viewer } from "./viewer";

/**
 * Criterio para agrupar/cruzar elementos. Reutilizado por Conjuntos, Clash y
 * Colores por disciplina. Permite agrupar por categoría IFC, por modelo
 * (archivo), por un atributo, o por una propiedad de un property set.
 */
export type GroupCriterion =
  | { type: "category"; label: string }
  | { type: "model"; label: string }
  | { type: "attribute"; name: string; label: string }
  | { type: "property"; pset: string; prop: string; label: string };

export interface GroupedItem {
  modelId: string;
  localId: number;
  group: string;
}

const UNSET = "Sin valor";

function attrValue(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
    return (v as { value: unknown }).value;
  }
  return undefined;
}

function readPropertyValue(prop: Record<string, unknown>): unknown {
  const nominal = attrValue(prop.NominalValue);
  if (nominal !== undefined) return nominal;
  for (const [key, candidate] of Object.entries(prop)) {
    if (key !== "Name" && key.endsWith("Value")) {
      const val = attrValue(candidate);
      if (val !== undefined) return val;
    }
  }
  return undefined;
}

function groupLabel(value: unknown): string {
  if (value === undefined || value === null || value === "") return UNSET;
  return String(value);
}

/** Resuelve el grupo de cada elemento de los modelos cargados según el criterio. */
export async function resolveGroups(
  viewer: Viewer,
  criterion: GroupCriterion,
): Promise<GroupedItem[]> {
  const out: GroupedItem[] = [];

  for (const model of viewer.models()) {
    const modelId = model.modelId;
    const byCat = await model.getItemsOfCategories([/^IFC/]);

    if (criterion.type === "category") {
      for (const [cat, ids] of Object.entries(byCat)) {
        for (const id of ids) out.push({ modelId, localId: id, group: cat });
      }
      continue;
    }

    const allIds = Object.values(byCat).flat();
    if (!allIds.length) continue;

    if (criterion.type === "model") {
      for (const id of allIds) out.push({ modelId, localId: id, group: modelId });
      continue;
    }

    const data = await model.getItemsData(allIds, {
      attributesDefault: true,
      relations:
        criterion.type === "property"
          ? { IsDefinedBy: { attributes: true, relations: true } }
          : {},
    });

    for (let i = 0; i < allIds.length; i++) {
      const d = data[i] as Record<string, unknown>;
      let value: unknown;

      if (criterion.type === "attribute") {
        value = attrValue(d[criterion.name]);
      } else {
        const psets = Array.isArray(d.IsDefinedBy)
          ? (d.IsDefinedBy as Record<string, unknown>[])
          : [];
        for (const ps of psets) {
          if (attrValue(ps.Name) !== criterion.pset) continue;
          const props = [
            ...(Array.isArray(ps.HasProperties) ? ps.HasProperties : []),
            ...(Array.isArray(ps.Quantities) ? ps.Quantities : []),
          ] as Record<string, unknown>[];
          for (const p of props) {
            if (attrValue(p.Name) === criterion.prop) {
              value = readPropertyValue(p);
              break;
            }
          }
        }
      }

      out.push({ modelId, localId: allIds[i], group: groupLabel(value) });
    }
  }

  return out;
}

export interface CriteriaOptions {
  attributes: string[];
  properties: { pset: string; prop: string }[];
}

/**
 * Inspecciona una muestra de elementos para descubrir qué atributos y
 * propiedades hay disponibles como criterios de agrupación.
 */
export async function listCriteria(viewer: Viewer): Promise<CriteriaOptions> {
  const attributes = new Set<string>();
  const properties = new Map<string, { pset: string; prop: string }>();

  for (const model of viewer.models()) {
    const byCat = await model.getItemsOfCategories([/^IFC/]);
    // Muestra: hasta 40 elementos repartidos entre categorías.
    const sample: number[] = [];
    for (const ids of Object.values(byCat)) {
      if (ids.length) sample.push(...ids.slice(0, 6));
      if (sample.length > 40) break;
    }
    if (!sample.length) continue;

    const data = await model.getItemsData(sample, {
      attributesDefault: true,
      relations: { IsDefinedBy: { attributes: true, relations: true } },
    });

    for (const d of data as Record<string, unknown>[]) {
      for (const [key, val] of Object.entries(d)) {
        if (key.startsWith("_") || Array.isArray(val)) continue;
        if (val && typeof val === "object" && "value" in val) attributes.add(key);
      }
      const psets = Array.isArray(d.IsDefinedBy)
        ? (d.IsDefinedBy as Record<string, unknown>[])
        : [];
      for (const ps of psets) {
        const psetName = attrValue(ps.Name);
        if (typeof psetName !== "string") continue;
        const props = [
          ...(Array.isArray(ps.HasProperties) ? ps.HasProperties : []),
          ...(Array.isArray(ps.Quantities) ? ps.Quantities : []),
        ] as Record<string, unknown>[];
        for (const p of props) {
          const propName = attrValue(p.Name);
          if (typeof propName !== "string") continue;
          properties.set(`${psetName}::${propName}`, { pset: psetName, prop: propName });
        }
      }
    }
  }

  return {
    attributes: [...attributes].sort(),
    properties: [...properties.values()].sort((a, b) =>
      `${a.pset} ${a.prop}`.localeCompare(`${b.pset} ${b.prop}`, "es"),
    ),
  };
}
