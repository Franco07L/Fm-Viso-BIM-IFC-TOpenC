import type * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";

type ItemData = FRAGS.ItemData;
type ItemAttribute = FRAGS.ItemAttribute;

const panelBody = document.getElementById("panel-body") as HTMLElement;
const panelCount = document.getElementById("panel-count") as HTMLElement;

// Evita que una consulta lenta pise el render de una selección más reciente
let renderToken = 0;

function isAttr(
  value: ItemAttribute | ItemData[] | undefined | null,
): value is ItemAttribute {
  return (
    value !== undefined &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    "value" in value
  );
}

function attrValue(value: ItemAttribute | ItemData[] | undefined): unknown {
  return isAttr(value) ? value.value : undefined;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(parseFloat(value.toFixed(4)));
  }
  return String(value);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildGroup(
  title: string,
  rows: [string, string][],
  open: boolean,
): HTMLDetailsElement {
  const details = el("details");
  details.open = open;
  const summary = el("summary", undefined, title);
  details.append(summary);

  const table = el("table", "props-table");
  for (const [key, value] of rows) {
    const tr = el("tr");
    tr.append(el("td", undefined, key), el("td", undefined, value));
    table.append(tr);
  }
  details.append(table);
  return details;
}

// Filas de un property set: propiedades (NominalValue) y cantidades
// (LengthValue, AreaValue, VolumeValue, WeightValue, CountValue...)
function getPsetRows(pset: ItemData): [string, string][] {
  const rows: [string, string][] = [];
  const props = [
    ...(Array.isArray(pset.HasProperties) ? pset.HasProperties : []),
    ...(Array.isArray(pset.Quantities) ? pset.Quantities : []),
  ];
  for (const prop of props) {
    const name = attrValue(prop.Name);
    if (name === undefined || name === null) continue;
    let value = attrValue(prop.NominalValue);
    if (value === undefined) {
      for (const [key, candidate] of Object.entries(prop)) {
        if (key !== "NominalValue" && key.endsWith("Value") && isAttr(candidate)) {
          value = candidate.value;
          break;
        }
      }
    }
    rows.push([String(name), formatValue(value)]);
  }
  return rows;
}

function buildCard(
  localId: number,
  category: string,
  guid: string,
  data: ItemData,
  expand: boolean,
): HTMLElement {
  const card = el("article", "element-card");

  const header = el("header");
  const name = attrValue(data.Name);
  const title =
    typeof name === "string" && name.trim() ? name : `Elemento ${localId}`;
  header.append(el("h3", undefined, title));

  const meta = el("div", "element-meta");
  if (category) meta.append(el("span", "chip", category));
  meta.append(el("span", "guid", guid ? `GUID ${guid}` : `ID ${localId}`));
  header.append(meta);
  card.append(header);

  const attrRows: [string, string][] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_") || !isAttr(value)) continue;
    attrRows.push([key, formatValue(value.value)]);
  }
  if (attrRows.length) card.append(buildGroup("Atributos", attrRows, expand));

  const psets = Array.isArray(data.IsDefinedBy) ? data.IsDefinedBy : [];
  for (const pset of psets) {
    const psetName = attrValue(pset.Name);
    const rows = getPsetRows(pset);
    if (!rows.length) continue;
    card.append(
      buildGroup(
        typeof psetName === "string" ? psetName : "Property Set",
        rows,
        expand,
      ),
    );
  }

  return card;
}

export function clearPanel() {
  renderToken++;
  panelCount.textContent = "";
  const empty = el("p", "empty");
  empty.innerHTML =
    "Ningún elemento seleccionado.<br />Haz click sobre un elemento del modelo para ver sus propiedades.";
  panelBody.replaceChildren(empty);
}

// Resumen por categoría para selecciones grandes (selección por lotes): evita
// crear miles de tarjetas y da una lectura tipo conteo.
function renderSummary(total: number, counts: Map<string, number>) {
  const card = el("article", "element-card");
  const header = el("header");
  header.append(el("h3", undefined, "Selección múltiple"));
  const meta = el("div", "element-meta");
  meta.append(el("span", "chip", `${total} elementos`));
  header.append(meta);
  card.append(header);

  const table = el("table", "props-table");
  for (const [cat, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const tr = el("tr");
    tr.append(el("td", undefined, cat || "—"), el("td", undefined, String(n)));
    table.append(tr);
  }
  card.append(table);

  const hint = el(
    "p",
    "empty",
    "Selección por lotes. Para analizar por categoría usa el panel Conjuntos.",
  );
  panelBody.replaceChildren(card, hint);
}

const MAX_CARDS = 25;

export async function showSelection(
  fragments: OBC.FragmentsManager,
  selection: OBC.ModelIdMap,
) {
  const token = ++renderToken;

  let total = 0;
  for (const localIds of Object.values(selection)) total += localIds.size;
  if (!total) {
    clearPanel();
    return;
  }

  // Selección masiva: mostrar resumen por categoría en lugar de tarjetas.
  if (total > MAX_CARDS) {
    const counts = new Map<string, number>();
    for (const [modelId, localIds] of Object.entries(selection)) {
      const model = fragments.list.get(modelId);
      if (!model) continue;
      const data = await model.getItemsData([...localIds], {
        attributesDefault: true,
      });
      for (const d of data) {
        const cat = String(attrValue(d._category) ?? "");
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    if (token !== renderToken) return;
    panelCount.textContent = `${total} elementos`;
    renderSummary(total, counts);
    return;
  }

  const cards: HTMLElement[] = [];
  for (const [modelId, localIds] of Object.entries(selection)) {
    const model = fragments.list.get(modelId);
    if (!model) continue;
    const ids = [...localIds];

    const itemsData = await model.getItemsData(ids, {
      attributesDefault: true,
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOccurrence: { attributes: false, relations: false },
      },
    });

    for (let i = 0; i < ids.length; i++) {
      const data = itemsData[i];
      const category = String(attrValue(data._category) ?? "");
      const guid = String(attrValue(data._guid) ?? "");
      cards.push(buildCard(ids[i], category, guid, data, total === 1));
    }
  }

  // Si mientras consultábamos cambió la selección, descartar este render
  if (token !== renderToken) return;

  panelCount.textContent = total === 1 ? "1 elemento" : `${total} elementos`;
  panelBody.replaceChildren(...cards);
}
