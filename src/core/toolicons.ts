/**
 * Iconos ilustrados de la barra inferior.
 *
 * Mismo lenguaje de 2 tonos que `railicons.ts`, con una diferencia deliberada:
 * aquí el TRAZO usa `currentColor` en vez de `var(--ic)`. Así la barra se ve
 * neutra en reposo (14 iconos a todo color serían un arcoíris) y se enciende
 * con el color de su familia al hover/activo, cuando el CSS cambia `color`.
 * El relleno suave sí lleva siempre el tinte de la familia, como insinuación.
 *
 * Las acciones de limpiar (Sin cortes/medidas/marcas) llevan el MISMO glifo que
 * su acción primaria más una insignia ×, en vez de la flecha circular genérica
 * que antes se repetía en las tres y no decía cuál era cuál.
 */

const wrap = (inner: string) =>
  `<svg class="ic-tool" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

/** Relleno de familia (sin trazo): da cuerpo al glifo. */
const soft = 'fill="var(--ic-soft)" stroke="none"';
/** Detalle sólido en el color del texto (pupilas, puntos). */
const dot = 'fill="currentColor" stroke="none"';

/** Insignia × abajo-derecha: marca las acciones de "limpiar". */
const clearBadge = `
  <circle cx="18.6" cy="18.6" r="4.6" fill="var(--surface)" stroke="none"/>
  <circle cx="18.6" cy="18.6" r="4.2" ${soft}/>
  <circle cx="18.6" cy="18.6" r="4.2" stroke-width="1.3"/>
  <path d="M17.2 17.2l2.8 2.8M20 17.2l-2.8 2.8" stroke-width="1.4"/>`;

export const toolIcons = {
  // ---- Vista (cian) ----
  /** Todo: restaurar la vista completa. Ojo con iris pleno. */
  todo: wrap(`
    <path d="M2.6 12S6.2 6.2 12 6.2 21.4 12 21.4 12 17.8 17.8 12 17.8 2.6 12 2.6 12Z" ${soft}/>
    <path d="M2.6 12S6.2 6.2 12 6.2 21.4 12 21.4 12 17.8 17.8 12 17.8 2.6 12 2.6 12Z"/>
    <circle cx="12" cy="12" r="3.1" ${soft}/>
    <circle cx="12" cy="12" r="3.1"/>
    <circle cx="12" cy="12" r="1.15" ${dot}/>`),

  /** Aislar: lo aislado queda sólido; lo que se oculta, en contorno punteado. */
  aislar: wrap(`
    <rect x="2.9" y="2.9" width="10" height="10" rx="2.2" stroke-dasharray="2.6 2.4" opacity=".5"/>
    <rect x="9.6" y="9.6" width="11.5" height="11.5" rx="2.4" ${soft}/>
    <rect x="9.6" y="9.6" width="11.5" height="11.5" rx="2.4" stroke-width="1.7"/>`),

  /** Ocultar: ojo tachado. */
  ocultar: wrap(`
    <path d="M9.9 6.4A9.6 9.6 0 0 1 12 6.2c5.8 0 9.4 5.8 9.4 5.8a17.4 17.4 0 0 1-3.3 4M6.3 7.7A17 17 0 0 0 2.6 12s3.6 5.8 9.4 5.8a9.5 9.5 0 0 0 3.8-.8"/>
    <path d="M4 3.6 20 19.8" stroke-width="1.7"/>`),

  /** Ghost: silueta translúcida. */
  ghost: wrap(`
    <path d="M5.6 20.4V10.2a6.4 6.4 0 0 1 12.8 0v10.2l-2.5-1.7-1.9 1.7-2-1.7-2 1.7-1.9-1.7-2.5 1.7Z" ${soft}/>
    <path d="M5.6 20.4V10.2a6.4 6.4 0 0 1 12.8 0v10.2l-2.5-1.7-1.9 1.7-2-1.7-2 1.7-1.9-1.7-2.5 1.7Z"/>
    <circle cx="9.9" cy="10.6" r=".95" ${dot}/>
    <circle cx="14.1" cy="10.6" r=".95" ${dot}/>`),

  /** Encuadrar: corchetes de encuadre alrededor del modelo. */
  encuadrar: wrap(`
    <path d="M3.2 8.6V4.8a1.6 1.6 0 0 1 1.6-1.6h3.8M15.4 3.2h3.8a1.6 1.6 0 0 1 1.6 1.6v3.8M20.8 15.4v3.8a1.6 1.6 0 0 1-1.6 1.6h-3.8M8.6 20.8H4.8a1.6 1.6 0 0 1-1.6-1.6v-3.8"/>
    <rect x="8.7" y="8.7" width="6.6" height="6.6" rx="1.6" ${soft}/>
    <rect x="8.7" y="8.7" width="6.6" height="6.6" rx="1.6"/>`),

  // ---- Herramientas (ámbar) ----
  /** Cortar: volumen atravesado por un plano de corte. */
  cortar: wrap(`
    <path d="M12 3.4 19.6 7.7v8.6L12 20.6 4.4 16.3V7.7L12 3.4Z" ${soft}/>
    <path d="M12 3.4 19.6 7.7v8.6L12 20.6 4.4 16.3V7.7L12 3.4Z"/>
    <path d="M2.6 15.6 21.4 8.4" stroke-width="1.8"/>`),

  /** Sin cortes: el mismo volumen cortado + insignia de limpiar. */
  sinCortes: wrap(`
    <path d="M10.6 3.2 17.6 7.1v7.8l-7 3.9-7-3.9V7.1l7-3.9Z" ${soft}/>
    <path d="M10.6 3.2 17.6 7.1v7.8l-7 3.9-7-3.9V7.1l7-3.9Z"/>
    <path d="M2.4 14 18.6 7.6" stroke-width="1.7"/>
    ${clearBadge}`),

  /** Medir: línea de cota con flechas y testeros. */
  medir: wrap(`
    <rect x="4" y="10.4" width="16" height="3.2" rx="1.3" ${soft}/>
    <path d="M4 7.4v9.2M20 7.4v9.2" stroke-width="1.7"/>
    <path d="M4.6 12h14.8"/>
    <path d="M7.6 9.8 5 12l2.6 2.2M16.4 9.8 19 12l-2.6 2.2"/>`),

  /** Sin medidas: cota + insignia de limpiar. */
  sinMedidas: wrap(`
    <rect x="3" y="9" width="13.6" height="3.2" rx="1.3" ${soft}/>
    <path d="M3 6.2v8.8M16.6 6.2v8.8" stroke-width="1.7"/>
    <path d="M3.6 10.6h12.4"/>
    ${clearBadge}`),

  // ---- Marcadores (rosa) ----
  /** Marcar: pin sobre el modelo. */
  marcar: wrap(`
    <path d="M12 21.4s6.9-6.1 6.9-11.3a6.9 6.9 0 1 0-13.8 0c0 5.2 6.9 11.3 6.9 11.3Z" ${soft}/>
    <path d="M12 21.4s6.9-6.1 6.9-11.3a6.9 6.9 0 1 0-13.8 0c0 5.2 6.9 11.3 6.9 11.3Z"/>
    <circle cx="12" cy="10.1" r="2.5" ${dot}/>`),

  /** Sin marcas: pin + insignia de limpiar. */
  sinMarcas: wrap(`
    <path d="M9.8 18.8s5.8-5.1 5.8-9.4a5.8 5.8 0 1 0-11.6 0c0 4.3 5.8 9.4 5.8 9.4Z" ${soft}/>
    <path d="M9.8 18.8s5.8-5.1 5.8-9.4a5.8 5.8 0 1 0-11.6 0c0 4.3 5.8 9.4 5.8 9.4Z"/>
    <circle cx="9.8" cy="9.2" r="2" ${dot}/>
    ${clearBadge}`),

  /** Caja de sección: volumen con tiradores en las esquinas. */
  caja: wrap(`
    <path d="M12 4.6 19.4 8.7v7.6L12 20.4 4.6 16.3V8.7L12 4.6Z" ${soft}/>
    <path d="M12 4.6 19.4 8.7v7.6L12 20.4 4.6 16.3V8.7L12 4.6Z"/>
    <path d="M12 12.5 19.4 8.7M12 12.5v7.9M12 12.5 4.6 8.7" opacity=".55"/>
    <rect x="10.7" y="1.6" width="2.6" height="2.6" rx=".8" ${dot}/>
    <rect x="1.5" y="10.7" width="2.6" height="2.6" rx=".8" ${dot}/>
    <rect x="19.9" y="10.7" width="2.6" height="2.6" rx=".8" ${dot}/>`),

  // ---- Datos (violeta) ----
  /** Tabla BIM: rejilla con cabecera marcada. */
  tabla: wrap(`
    <rect x="3" y="4.4" width="18" height="15.2" rx="2.2" ${soft}/>
    <path d="M5.2 4.4h13.6a2.2 2.2 0 0 1 2.2 2.2v3H3v-3a2.2 2.2 0 0 1 2.2-2.2Z" ${dot} opacity=".28"/>
    <rect x="3" y="4.4" width="18" height="15.2" rx="2.2"/>
    <path d="M3 9.6h18" stroke-width="1.7"/>
    <path d="M3 14.6h18M9.8 9.6v10M15.4 9.6v10" opacity=".65"/>`),

  /** Captura: cámara con lente. */
  captura: wrap(`
    <path d="M3.4 8.4h3.3l1.7-2.4h7.2l1.7 2.4h3.3a1.6 1.6 0 0 1 1.6 1.6v7.8a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6V10a1.6 1.6 0 0 1 1.6-1.6Z" ${soft}/>
    <path d="M3.4 8.4h3.3l1.7-2.4h7.2l1.7 2.4h3.3a1.6 1.6 0 0 1 1.6 1.6v7.8a1.6 1.6 0 0 1-1.6 1.6H3.4a1.6 1.6 0 0 1-1.6-1.6V10a1.6 1.6 0 0 1 1.6-1.6Z"/>
    <circle cx="12" cy="13.7" r="3.7" ${soft}/>
    <circle cx="12" cy="13.7" r="3.7"/>
    <circle cx="12" cy="13.7" r="1.3" ${dot}/>`),
} as const;
