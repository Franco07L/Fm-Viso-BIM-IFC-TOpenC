import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import { showToast } from "../core/dom";

/**
 * Estilos visuales (postproducción):
 * - Normal: render directo, con grilla.
 * - Calidad: oclusión ambiental + sombras.
 * - Técnico: calidad + bordes tipo plano (pen).
 * En los modos con postproducción se oculta la grilla (las pasadas de AO/bordes
 * la ensucian) y el render queda más limpio.
 */
export function setupStyles(viewer: Viewer) {
  const { renderer, grid } = viewer;
  const btnStyle = document.getElementById("btn-style") as HTMLButtonElement;

  const modes: { label: string; apply: () => void }[] = [
    {
      label: "Normal",
      apply: () => {
        renderer.postproduction.enabled = false;
        grid.three.visible = true;
      },
    },
    {
      label: "Calidad",
      apply: () => {
        renderer.postproduction.enabled = true;
        renderer.postproduction.style = OBF.PostproductionAspect.COLOR_SHADOWS;
        grid.three.visible = false;
      },
    },
    {
      label: "Técnico",
      apply: () => {
        renderer.postproduction.enabled = true;
        renderer.postproduction.style = OBF.PostproductionAspect.COLOR_PEN_SHADOWS;
        grid.three.visible = false;
      },
    },
  ];

  let index = 0;
  btnStyle.addEventListener("click", () => {
    index = (index + 1) % modes.length;
    try {
      modes[index].apply();
      btnStyle.textContent = `Estilo: ${modes[index].label}`;
    } catch (error) {
      console.error("No se pudo cambiar el estilo visual:", error);
      showToast("No se pudo cambiar el estilo visual.");
    }
  });
}
