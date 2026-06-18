import CameraControls from "camera-controls";
import type { Viewer } from "../core/viewer";

/**
 * Navegación estilo Revit:
 * - Botón central (arrastrar): paneo.
 * - Shift + central: orbitar alrededor del punto bajo el cursor.
 * - Rueda: zoom hacia el cursor.
 * - Click izquierdo: reservado para selección (no mueve la cámara).
 */
export function setupNavigation(viewer: Viewer) {
  const { ACTION } = CameraControls;
  const controls = viewer.world.camera.controls;

  controls.mouseButtons.left = ACTION.NONE;
  controls.mouseButtons.middle = ACTION.TRUCK;
  controls.mouseButtons.right = ACTION.NONE;
  controls.mouseButtons.wheel = ACTION.DOLLY;
  controls.dollyToCursor = true;

  const setOrbitMode = (active: boolean) => {
    controls.mouseButtons.middle = active ? ACTION.ROTATE : ACTION.TRUCK;
  };

  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") setOrbitMode(true);
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift") setOrbitMode(false);
  });
  window.addEventListener("blur", () => setOrbitMode(false));

  // La órbita pivota sobre el elemento bajo el cursor, como en Revit.
  viewer.container.addEventListener("pointerdown", (event) => {
    if (event.button !== 1 || !event.shiftKey) return;
    void viewer.casters
      .get(viewer.world)
      .castRay()
      .then((hit) => {
        if (hit?.point) {
          controls.setOrbitPoint(hit.point.x, hit.point.y, hit.point.z);
        }
      });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Home") void viewer.fitToModels();
  });
}
