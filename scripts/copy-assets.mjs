// Copia a public/resources los binarios que el visor necesita servir
// localmente: el worker de @thatopen/fragments y el WASM de web-ifc.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "public", "resources");
mkdirSync(outDir, { recursive: true });

const assets = [
  ["node_modules/@thatopen/fragments/dist/Worker/worker.mjs", "worker.mjs"],
  ["node_modules/web-ifc/web-ifc.wasm", "web-ifc.wasm"],
  ["node_modules/web-ifc/web-ifc-mt.wasm", "web-ifc-mt.wasm"],
];

for (const [src, dest] of assets) {
  const from = join(root, ...src.split("/"));
  if (!existsSync(from)) {
    console.warn(`[copy-assets] aun no existe: ${src} (se copiara tras instalar dependencias)`);
    continue;
  }
  copyFileSync(from, join(outDir, dest));
  console.log(`[copy-assets] ${src} -> public/resources/${dest}`);
}
