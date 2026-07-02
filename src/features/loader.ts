import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import { showToast } from "../core/dom";

const loadingOverlay = () => document.getElementById("loading") as HTMLElement;
const loadingText = () => document.getElementById("loading-text") as HTMLElement;
const progressBar = () => document.getElementById("progress-bar") as HTMLElement;
const dropzone = () => document.getElementById("dropzone") as HTMLElement;

function showLoading(label: string) {
  loadingText().textContent = `Procesando ${label}…`;
  progressBar().style.width = "0%";
  loadingOverlay().hidden = false;
}

function setProgress(progress: number) {
  progressBar().style.width = `${Math.min(100, Math.round(progress * 100))}%`;
}

function hideLoading() {
  loadingOverlay().hidden = true;
}

// Un IFC válido (STEP ISO-10303-21) declara su firma en los primeros bytes.
function isIfcContent(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 1024));
  return head.includes("ISO-10303-21");
}

// Manifest que expone el puente local del addin de Revit (Nivel 3): lista de
// archivos IFC recién exportados, cada uno con su URL de descarga.
interface BridgeManifest {
  files: { name: string; url: string }[];
}

export interface Loader {
  loadIfcFiles: (files: Iterable<File>) => Promise<void>;
}

export async function setupLoader(viewer: Viewer): Promise<Loader> {
  const ifcLoader = viewer.components.get(OBC.IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { path: `${import.meta.env.BASE_URL}resources/`, absolute: true },
  });

  let modelCounter = 0;

  const loadIfc = async (bytes: Uint8Array, fileName: string) => {
    if (!isIfcContent(bytes)) {
      showToast(`"${fileName}" no parece ser un archivo IFC válido.`);
      return;
    }
    showLoading(fileName);
    try {
      modelCounter++;
      const modelId = `${fileName.replace(/\.ifc$/i, "")}-${modelCounter}`;
      await ifcLoader.load(bytes, true, modelId, {
        processData: {
          progressCallback: (progress: number) => setProgress(progress),
        },
      });
      // La geometría ya está lista: ocultamos el overlay sin esperar al encuadre
      // (la transición de cámara depende del loop de render y podría tardar si la
      // pestaña está en segundo plano, lo que dejaría el overlay pegado).
      hideLoading();
      void viewer.fitToModels();
    } catch (error) {
      console.error("Error al cargar el IFC:", error);
      showToast(`No se pudo cargar "${fileName}". Verifica que sea un IFC válido.`);
      hideLoading();
    }
  };

  const loadIfcFiles = async (files: Iterable<File>) => {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".ifc")) continue;
      const buffer = await file.arrayBuffer();
      await loadIfc(new Uint8Array(buffer), file.name);
    }
  };

  // Botones de la barra superior
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const folderInput = document.getElementById("folder-input") as HTMLInputElement;
  const btnLoad = document.getElementById("btn-load") as HTMLButtonElement;
  const btnLoadFolder = document.getElementById("btn-load-folder") as HTMLButtonElement;
  const btnSample = document.getElementById("btn-sample") as HTMLButtonElement;

  btnLoad.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    if (fileInput.files) await loadIfcFiles(fileInput.files);
    fileInput.value = "";
  });

  // ---------- Nivel 2: cargar todos los .ifc de una carpeta de una vez ----------
  // Vía <input webkitdirectory>: el navegador lista recursivamente todos los
  // archivos de la carpeta elegida (incluida "carpeta independiente por
  // modelo/vínculo" del addin de Revit) en un único diálogo, sin permisos
  // async extra — soporte más amplio que la File System Access API moderna.
  btnLoadFolder.addEventListener("click", () => folderInput.click());

  folderInput.addEventListener("change", async () => {
    const all = folderInput.files ? [...folderInput.files] : [];
    const ifcFiles = all
      .filter((f) => f.name.toLowerCase().endsWith(".ifc"))
      .sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, "es"));
    folderInput.value = "";
    if (!ifcFiles.length) {
      showToast("Esa carpeta no contiene archivos .ifc.", "info");
      return;
    }
    showToast(`Cargando ${ifcFiles.length} archivo(s) IFC de la carpeta…`, "info");
    await loadIfcFiles(ifcFiles);
  });

  btnSample.addEventListener("click", async () => {
    btnSample.disabled = true;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}samples/small.ifc`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      await loadIfc(new Uint8Array(buffer), "ejemplo.ifc");
    } catch (error) {
      console.error("No se pudo cargar el modelo de ejemplo:", error);
      showToast("No se pudo cargar el modelo de ejemplo.");
    } finally {
      btnSample.disabled = false;
    }
  });

  // Arrastrar y soltar archivos .ifc sobre el visor
  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragDepth++;
    dropzone().hidden = false;
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone().hidden = true;
  });
  window.addEventListener("drop", async (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropzone().hidden = true;
    if (event.dataTransfer?.files) await loadIfcFiles(event.dataTransfer.files);
  });

  // ---------- Nivel 3: auto-carga desde el puente local del addin de Revit ----------
  // Si la URL trae ?load=<manifest>, el addin C# acaba de exportar y levantó un
  // servidor local efímero sirviendo esos IFC + un manifest.json. Lo detectamos
  // al arrancar y cargamos todo sin que el usuario tenga que hacer nada más.
  const tryAutoLoadFromBridge = async () => {
    const params = new URLSearchParams(location.search);
    const manifestUrl = params.get("load");
    if (!manifestUrl) return;

    // Limpiar el parámetro de la URL para que un F5 no reintente el fetch.
    const clean = new URL(location.href);
    clean.searchParams.delete("load");
    history.replaceState(null, "", clean);

    showToast("Conectando con FM Pro (Revit)…", "info");
    try {
      const res = await fetch(manifestUrl, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = (await res.json()) as BridgeManifest;
      if (!manifest.files?.length) {
        showToast("El addin no reportó archivos para cargar.", "info");
        return;
      }
      for (const entry of manifest.files) {
        const fileRes = await fetch(entry.url, { mode: "cors" });
        if (!fileRes.ok) {
          showToast(`No se pudo descargar "${entry.name}" desde Revit.`);
          continue;
        }
        const buffer = await fileRes.arrayBuffer();
        await loadIfc(new Uint8Array(buffer), entry.name);
      }
    } catch (error) {
      console.error("No se pudo conectar con el puente local de FM Pro:", error);
      showToast(
        "No se pudo conectar con FM Pro (Revit). Carga los archivos manualmente con \"Cargar carpeta\".",
      );
    }
  };
  void tryAutoLoadFromBridge();

  return { loadIfcFiles };
}
