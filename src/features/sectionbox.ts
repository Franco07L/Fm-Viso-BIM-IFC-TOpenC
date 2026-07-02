import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";
import type { UI } from "../core/ui";
import { showToast } from "../core/dom";
import { icons } from "../core/icons";

/**
 * Fase C — Caja de sección (estilo BIMETRYC/Speckle): 6 planos de corte que
 * encierran lo visible (o la selección, si la hay). Cada plano se puede
 * arrastrar con su gizmo. Volver a pulsar el botón la quita.
 */
export function setupSectionBox(viewer: Viewer, ui: UI) {
  const clipper = viewer.components.get(OBC.Clipper);
  const boxer = viewer.components.get(OBC.BoundingBoxer);
  let planeIds: string[] = [];

  const selectionBox = async (): Promise<THREE.Box3> => {
    const selection = viewer.selection();
    const hasSelection = Object.values(selection).some((s) => s.size > 0);
    boxer.list.clear();
    if (hasSelection) await boxer.addFromModelIdMap(selection);
    else boxer.addFromModels();
    const box = boxer.get();
    boxer.list.clear();
    return box;
  };

  const create = async () => {
    if (!viewer.models().length) {
      showToast("Carga un modelo primero.", "info");
      return false;
    }
    const box = await selectionBox();
    if (box.isEmpty()) return false;
    // Margen del 3% para no rozar la geometría.
    const size = new THREE.Vector3();
    box.getSize(size);
    box.expandByVector(size.multiplyScalar(0.03));

    const { min, max } = box;
    const center = new THREE.Vector3();
    box.getCenter(center);

    // 6 caras con la normal hacia ADENTRO (three conserva el semiespacio
    // positivo de la normal, así que apuntando adentro se conserva el interior).
    const faces: { normal: THREE.Vector3; point: THREE.Vector3 }[] = [
      { normal: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(max.x, center.y, center.z) },
      { normal: new THREE.Vector3(1, 0, 0), point: new THREE.Vector3(min.x, center.y, center.z) },
      { normal: new THREE.Vector3(0, -1, 0), point: new THREE.Vector3(center.x, max.y, center.z) },
      { normal: new THREE.Vector3(0, 1, 0), point: new THREE.Vector3(center.x, min.y, center.z) },
      { normal: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(center.x, center.y, max.z) },
      { normal: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(center.x, center.y, min.z) },
    ];

    clipper.enabled = true;
    for (const face of faces) {
      planeIds.push(clipper.createFromNormalAndCoplanarPoint(viewer.world, face.normal, face.point));
    }
    await viewer.update();
    return true;
  };

  const remove = async () => {
    for (const id of planeIds) {
      try {
        await clipper.delete(viewer.world, id);
      } catch {
        /* el plano pudo borrarse manualmente con Supr */
      }
    }
    planeIds = [];
    await viewer.update();
  };

  ui.bottomBar.addButton({
    icon: icons.cube,
    label: "Caja",
    title: "Caja de sección alrededor de lo visible (o la selección). Arrastra los gizmos para ajustarla.",
    onClick: (btn) => {
      void (async () => {
        if (planeIds.length) {
          await remove();
          btn.setActive(false);
        } else {
          const ok = await create();
          btn.setActive(ok);
        }
      })();
    },
  });

  // Si cambian los modelos, la caja previa pierde sentido.
  viewer.fragments.list.onItemSet.add(() => {
    planeIds = [];
  });
}

/** Captura PNG del visor tal como se ve (respeta tema, estilos y ambiente). */
export function setupCapture(viewer: Viewer, ui: UI) {
  ui.bottomBar.addButton({
    icon: icons.camera,
    label: "Captura",
    title: "Descargar una imagen PNG de la vista actual",
    onClick: () => {
      try {
        // Render + lectura en el mismo tick para que el buffer siga vivo.
        viewer.renderer.update();
        const canvas = viewer.renderer.three.domElement;
        canvas.toBlob((blob) => {
          if (!blob) {
            showToast("No se pudo generar la captura.");
            return;
          }
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `visor-bim-${stamp}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }, "image/png");
      } catch (error) {
        console.error("Captura falló:", error);
        showToast("No se pudo generar la captura.");
      }
    },
  });
}
