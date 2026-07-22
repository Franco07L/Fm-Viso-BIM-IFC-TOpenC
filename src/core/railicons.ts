/**
 * Iconos ilustrados del rail lateral.
 *
 * A diferencia de los iconos de línea de `icons.ts` (currentColor, 1 trazo),
 * estos son ilustraciones a 2 tonos con color semántico por GRUPO de función:
 * cada icono lee `var(--ic)` (color del grupo, sólido) y `var(--ic-soft)` (el
 * mismo color translúcido, como relleno de fondo). El color lo fija `sidebar.ts`
 * por grupo, así que las 6 paletas de tema lo respetan automáticamente.
 *
 * Grupos: explore (cian) · analyze (ámbar) · manage (violeta) · collab (rosa).
 */

export type RailGroup = "explore" | "analyze" | "manage" | "collab";

/** Color base de cada grupo (se deriva el `-soft` con alpha en CSS). */
export const GROUP_COLOR: Record<RailGroup, string> = {
  explore: "#22d3ee",
  analyze: "#fbbf24",
  manage: "#a855f7",
  collab: "#fb7185",
};

const wrap = (inner: string) =>
  `<svg class="ic-ill" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

// Relleno suave (fondo) y trazo/relleno fuerte (glifo). El blanco de los
// detalles usa opacidad para no quemar en temas claros.
const soft = 'fill="var(--ic-soft)"';
const S = 'stroke="var(--ic)"';

export const railIcons = {
  // ---- Explorar (cian) ----
  // Conjuntos: capas apiladas con profundidad.
  conjuntos: wrap(`
    <path d="M12 3.2 21 8l-9 4.8L3 8l9-4.8Z" ${soft}/>
    <path d="M12 3.2 21 8l-9 4.8L3 8l9-4.8Z" ${S} stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M3 12l9 4.8L21 12" ${S} stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
    <path d="M3 16l9 4.8L21 16" ${S} stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>`),
  // Vistas: cubo isométrico con una cara resaltada.
  vistas: wrap(`
    <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" ${soft}/>
    <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" ${S} stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" ${S} stroke-width="1.3" stroke-linejoin="round" opacity=".65"/>
    <path d="M12 3 20 7.5 12 12 4 7.5 12 3Z" fill="var(--ic)" opacity=".9"/>`),
  // Inventario: grilla de cajas para conteo.
  inventario: wrap(`
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" ${soft}/>
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="var(--ic)" opacity=".85"/>
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="var(--ic)" opacity=".85"/>
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" ${soft}/>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" ${S} stroke-width="1.3" opacity=".55"/>`),

  // ---- Analizar (ámbar) ----
  // Interferencias: dos volúmenes que chocan + chispa.
  interferencias: wrap(`
    <rect x="3" y="3" width="11" height="11" rx="2" ${soft}/>
    <rect x="10" y="10" width="11" height="11" rx="2" ${soft}/>
    <rect x="3" y="3" width="11" height="11" rx="2" ${S} stroke-width="1.4"/>
    <rect x="10" y="10" width="11" height="11" rx="2" ${S} stroke-width="1.4"/>
    <path d="M12 8.5 13.4 11l2.6.3-1.9 1.8.5 2.6-2.3-1.3-2.3 1.3.5-2.6L8.6 11.3l2.6-.3L12 8.5Z" fill="var(--ic)"/>`),
  // Filtros: embudo relleno.
  filtros: wrap(`
    <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" ${soft}/>
    <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" ${S} stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4 5h16l-3.2 3.7H7.2L4 5Z" fill="var(--ic)" opacity=".9"/>`),
  // Auditoría: portapapeles con check.
  auditoria: wrap(`
    <rect x="5" y="4.5" width="14" height="16.5" rx="2.4" ${soft}/>
    <rect x="5" y="4.5" width="14" height="16.5" rx="2.4" ${S} stroke-width="1.4"/>
    <rect x="9" y="2.6" width="6" height="3.4" rx="1.2" fill="var(--ic)"/>
    <path d="M8.6 12.5 11 15l4.4-4.6" ${S} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),

  // ---- Gestionar (violeta) ----
  // Configuración de datos: deslizadores.
  configuracion: wrap(`
    <path d="M4 7h9M18 7h2M4 12h4M13 12h7M4 17h9M18 17h2" ${S} stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="15.5" cy="7" r="2.6" ${soft}/>
    <circle cx="15.5" cy="7" r="2.6" ${S} stroke-width="1.5"/>
    <circle cx="10" cy="12" r="2.6" ${soft}/>
    <circle cx="10" cy="12" r="2.6" ${S} stroke-width="1.5"/>
    <circle cx="15.5" cy="17" r="2.6" ${soft}/>
    <circle cx="15.5" cy="17" r="2.6" ${S} stroke-width="1.5"/>`),
  // Partidas: árbol jerárquico con nodos.
  partidas: wrap(`
    <path d="M6 5v14M6 12h5M6 19h5" ${S} stroke-width="1.5" stroke-linecap="round"/>
    <rect x="11" y="3" width="9" height="4.4" rx="1.4" fill="var(--ic)" opacity=".85"/>
    <rect x="11" y="9.8" width="9" height="4.4" rx="1.4" ${soft}/>
    <rect x="11" y="9.8" width="9" height="4.4" rx="1.4" ${S} stroke-width="1.3"/>
    <rect x="11" y="16.6" width="9" height="4.4" rx="1.4" ${soft}/>
    <rect x="11" y="16.6" width="9" height="4.4" rx="1.4" ${S} stroke-width="1.3"/>`),
  // Avance de obra: calendario con barra de progreso.
  obras: wrap(`
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" ${soft}/>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" ${S} stroke-width="1.4"/>
    <path d="M3.5 9.5h17" ${S} stroke-width="1.4"/>
    <path d="M8 3.2v3.6M16 3.2v3.6" ${S} stroke-width="1.6" stroke-linecap="round"/>
    <rect x="6.2" y="12.6" width="8.5" height="2.6" rx="1.3" fill="var(--ic)"/>
    <rect x="6.2" y="16.4" width="5" height="2.6" rx="1.3" fill="var(--ic)" opacity=".55"/>`),
  // Cronograma 4D: barras de Gantt.
  cronograma: wrap(`
    <path d="M3.5 4v16" ${S} stroke-width="1.5" stroke-linecap="round"/>
    <rect x="6" y="5" width="9" height="3.4" rx="1.4" fill="var(--ic)" opacity=".85"/>
    <rect x="10" y="10.3" width="10" height="3.4" rx="1.4" ${soft}/>
    <rect x="10" y="10.3" width="10" height="3.4" rx="1.4" ${S} stroke-width="1.3"/>
    <rect x="6.5" y="15.6" width="7" height="3.4" rx="1.4" fill="var(--ic)"/>`),
  // Control de cambios: dos versiones que se comparan (ramas).
  versiones: wrap(`
    <circle cx="7" cy="6" r="2.4" ${soft}/>
    <circle cx="7" cy="6" r="2.4" ${S} stroke-width="1.5"/>
    <circle cx="7" cy="18" r="2.4" ${soft}/>
    <circle cx="7" cy="18" r="2.4" ${S} stroke-width="1.5"/>
    <circle cx="17" cy="12" r="2.6" fill="var(--ic)"/>
    <path d="M7 8.4v7.2M9.2 6.6c4 .3 5.6 2 5.8 5.1" ${S} stroke-width="1.5" stroke-linecap="round" fill="none"/>`),

  // ---- Colaborar (rosa) ----
  // Issues: burbuja de comentario con marca.
  issues: wrap(`
    <path d="M4 5.5h16v10.5H10.5L6 20v-4H4V5.5Z" ${soft}/>
    <path d="M4 5.5h16v10.5H10.5L6 20v-4H4V5.5Z" ${S} stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="9" cy="10.7" r="1.15" fill="var(--ic)"/>
    <circle cx="12.5" cy="10.7" r="1.15" fill="var(--ic)"/>
    <circle cx="16" cy="10.7" r="1.15" fill="var(--ic)"/>`),
} as const;
