import { setupViewer } from "./core/viewer";
import { createSidebar } from "./core/sidebar";
import { createBottomBar } from "./core/toolbar";
import type { UI } from "./core/ui";
import { setupLoader } from "./features/loader";
import { setupNavigation } from "./features/navigation";
import { setupStyles } from "./features/styles";
import { setupThemes } from "./features/themes";
import { setupEnvironment } from "./features/environment";
import { setupSelection } from "./features/selection";
import { setupVisibility } from "./features/visibility";
import { setupClassification } from "./features/classification";
import { setupSections } from "./features/sections";
import { setupMeasurements } from "./features/measurements";
import { setupViews } from "./features/views";
import { setupMarkers } from "./features/markers";
import { setupBcf } from "./features/bcf";
import { setupInventory } from "./features/inventory";
import { setupClash } from "./features/clash";
import { initDataCache } from "./core/datacache";
import { setupDatatable } from "./features/datatable";
import { setupAudit } from "./features/audit";
import { setupFilters } from "./features/filters";
import { setupSectionBox, setupCapture } from "./features/sectionbox";
import { setupMapping } from "./features/mapping";
import { setupPartidas } from "./features/partidas";
import { setupObras } from "./features/obras";
import { setupSchedule } from "./features/schedule";
import { setupVersions } from "./features/versions";
import "./style.css";

async function main() {
  const container = document.getElementById("viewer") as HTMLElement;
  const sidebarHost = document.getElementById("sidebar") as HTMLElement;
  const overlayHost = document.getElementById("viewer-overlay") as HTMLElement;

  const viewer = await setupViewer(container);
  const ui: UI = {
    sidebar: createSidebar(sidebarHost),
    bottomBar: createBottomBar(overlayHost),
  };

  // Interacción base. El entorno (fondo plano o cielo) sigue el tema activo.
  const environment = setupEnvironment(viewer);
  setupThemes(() => environment.refresh());
  setupNavigation(viewer);
  setupStyles(viewer);
  setupSelection(viewer);
  await setupLoader(viewer);

  // Funcionalidades (cada una registra su panel/acciones en la UI)
  setupVisibility(viewer, ui);
  await setupClassification(viewer, ui);
  setupSections(viewer, ui);
  setupMeasurements(viewer, ui);
  await setupViews(viewer, ui);
  setupMarkers(viewer, ui);
  setupBcf(viewer, ui);
  setupInventory(viewer, ui);
  await setupClash(viewer, ui);

  // Datos tabulares compartidos (tabla, auditoría, filtros) + extras
  initDataCache(viewer);
  setupMapping(viewer, ui);
  setupPartidas(viewer, ui);
  setupObras(viewer, ui);
  setupSchedule(viewer, ui);
  setupVersions(viewer, ui);
  setupFilters(viewer, ui);
  setupAudit(viewer, ui);
  setupSectionBox(viewer, ui);
  setupDatatable(viewer, ui);
  setupCapture(viewer, ui);

  // Acceso de depuración desde la consola del navegador
  (window as unknown as { __viewer: typeof viewer }).__viewer = viewer;
}

main().catch((error) => {
  console.error("Error al iniciar el visor:", error);
});
