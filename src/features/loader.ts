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
  const btnLoad = document.getElementById("btn-load") as HTMLButtonElement;
  const btnSample = document.getElementById("btn-sample") as HTMLButtonElement;

  btnLoad.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    if (fileInput.files) await loadIfcFiles(fileInput.files);
    fileInput.value = "";
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

  return { loadIfcFiles };
}
