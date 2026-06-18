import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";

export interface Environment {
  /** Re-aplica el fondo (plano o cielo) con los colores del tema actual. */
  refresh(): void;
}

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Cielo por tema: cenit (arriba) → horizonte (abajo). Soft Lumen = día claro;
// los oscuros, atmósfera tenue. fogScale ajusta cuánto se funde la lejanía.
const SKY: Record<
  string,
  { top: string; horizon: string; fogScale: number }
> = {
  "violet-pulse": { top: "#190f2e", horizon: "#473a64", fogScale: 1 },
  "cyber-grape": { top: "#0d0a1e", horizon: "#322c5e", fogScale: 1 },
  "aurora-plasma": { top: "#1b1226", horizon: "#4a3a55", fogScale: 1 },
  "nebula-glass": { top: "#11142e", horizon: "#39416e", fogScale: 1 },
  "soft-lumen": { top: "#9fc4ec", horizon: "#eef4fb", fogScale: 1.6 },
  "quantum-indigo": { top: "#0b1228", horizon: "#2c3a64", fogScale: 1.1 },
};

/**
 * Fondo del visor. Por defecto un color plano (sigue --bg del tema). El modo
 * "Ambiente" lo cambia por un cielo degradado (sky → horizonte) más niebla que
 * funde la lejanía con el horizonte. Los colores se derivan del tema activo.
 */
export function setupEnvironment(viewer: Viewer): Environment {
  const scene = viewer.world.scene.three;
  const boxer = viewer.components.get(OBC.BoundingBoxer);
  let active = false;

  const makeSky = (): {
    texture: THREE.CanvasTexture;
    horizon: THREE.Color;
    fogScale: number;
  } => {
    const theme = document.documentElement.dataset.theme ?? "violet-pulse";
    const cfg = SKY[theme] ?? SKY["violet-pulse"];
    const top = new THREE.Color(cfg.top);
    const horizon = new THREE.Color(cfg.horizon);

    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, `#${top.getHexString()}`);
      grad.addColorStop(0.55, `#${top.clone().lerp(horizon, 0.5).getHexString()}`);
      grad.addColorStop(0.85, `#${top.clone().lerp(horizon, 0.85).getHexString()}`);
      grad.addColorStop(1, `#${horizon.getHexString()}`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 4, 512);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, horizon, fogScale: cfg.fogScale };
  };

  const apply = () => {
    if (active) {
      const { texture, horizon, fogScale } = makeSky();
      scene.background = texture;
      boxer.list.clear();
      boxer.addFromModels();
      const box = boxer.get();
      boxer.list.clear();
      if (!box.isEmpty()) {
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const r = Math.max(sphere.radius, 5);
        scene.fog = new THREE.Fog(horizon, r * 2.6 * fogScale, r * 9 * fogScale);
      } else {
        scene.fog = new THREE.Fog(horizon, 60 * fogScale, 320 * fogScale);
      }
    } else {
      scene.background = new THREE.Color(readVar("--bg", "#15181d"));
      scene.fog = null;
    }
    void viewer.update();
  };

  const btn = document.getElementById("btn-env") as HTMLButtonElement | null;
  btn?.addEventListener("click", () => {
    active = !active;
    btn.classList.toggle("active", active);
    apply();
  });

  apply();
  return { refresh: apply };
}
