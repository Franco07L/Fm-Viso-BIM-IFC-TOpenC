import { defineConfig } from "vite";

// En producción (GitHub Pages) el sitio se sirve bajo /<repo>/, así que la base
// debe coincidir con el nombre del repositorio. En desarrollo se usa la raíz.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Fm-Viso-BIM-IFC-TOpenC/" : "/",
}));
