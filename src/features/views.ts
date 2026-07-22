import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { CameraProjection } from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { el, showToast } from "../core/dom";
import { railIcons } from "../core/railicons";

type Orientation = "top" | "bottom" | "front" | "back" | "left" | "right";

const VIEWS: { label: string; o: Orientation }[] = [
  { label: "Superior", o: "top" },
  { label: "Inferior", o: "bottom" },
  { label: "Frontal", o: "front" },
  { label: "Posterior", o: "back" },
  { label: "Izquierda", o: "left" },
  { label: "Derecha", o: "right" },
];

/**
 * Nivel 3 — Vistas. Vistas ortográficas predefinidas (planta, alzados) más
 * isométrica, y conmutador de proyección Perspectiva/Ortográfica.
 */
export async function setupViews(viewer: Viewer, ui: UI) {
  const boxer = viewer.components.get(OBC.BoundingBoxer);
  const camera = viewer.world.camera;

  const panel = ui.sidebar.addPanel({
    id: "views",
    icon: railIcons.vistas,
    group: "explore",
    title: "Vistas",
  });

  const requireModels = () => {
    if (viewer.models().length) return true;
    showToast("Carga un modelo primero.", "info");
    return false;
  };

  const modelBox = () => {
    boxer.list.clear();
    boxer.addFromModels();
    const box = boxer.get();
    boxer.list.clear();
    return box;
  };

  const goToOrientation = async (o: Orientation) => {
    if (!requireModels()) return;
    const { position, target } = await boxer.getCameraOrientation(o, 1.3);
    await camera.projection.set("Orthographic");
    updateProjLabel();
    await camera.controls.setLookAt(
      position.x, position.y, position.z,
      target.x, target.y, target.z,
      true,
    );
  };

  const goIsometric = async () => {
    if (!requireModels()) return;
    const box = modelBox();
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const dist = Math.max(size.x, size.y, size.z) * 1.6 + 5;
    await camera.projection.set("Perspective");
    updateProjLabel();
    await camera.controls.setLookAt(
      center.x + dist, center.y + dist * 0.8, center.z + dist,
      center.x, center.y, center.z,
      true,
    );
  };

  // --- UI ---
  const intro = el(
    "p",
    "panel-hint",
    "Vistas ortográficas del modelo. La planta y los alzados activan proyección ortográfica.",
  );

  const grid = el("div", "views-grid");
  for (const { label, o } of VIEWS) {
    const btn = el("button", "view-btn", label);
    btn.type = "button";
    btn.addEventListener("click", () => void goToOrientation(o));
    grid.append(btn);
  }
  const isoBtn = el("button", "view-btn iso", "Isométrica");
  isoBtn.type = "button";
  isoBtn.addEventListener("click", () => void goIsometric());
  grid.append(isoBtn);

  const projBtn = el("button", "btn full", "Proyección: Perspectiva");
  projBtn.type = "button";
  const updateProjLabel = () => {
    const current: CameraProjection = camera.projection.current;
    projBtn.textContent = `Proyección: ${current === "Orthographic" ? "Ortográfica" : "Perspectiva"}`;
  };
  projBtn.addEventListener("click", async () => {
    const next: CameraProjection =
      camera.projection.current === "Perspective" ? "Orthographic" : "Perspective";
    await camera.projection.set(next);
    updateProjLabel();
  });

  panel.body.append(intro, grid, projBtn);
  updateProjLabel();
}
