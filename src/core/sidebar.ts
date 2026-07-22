import { el } from "./dom";
import { GROUP_COLOR, type RailGroup } from "./railicons";

export interface PanelHandle {
  /** Contenedor donde la funcionalidad inyecta su contenido. */
  readonly body: HTMLElement;
  /** Muestra un contador/etiqueta en el botón de la barra (o lo quita con null). */
  setBadge(text: string | null): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export interface Sidebar {
  /** Registra un panel desplegable accionado por un botón-icono. */
  addPanel(opts: {
    id: string;
    icon: string;
    title: string;
    /** Grupo de función: tiñe el icono con el color semántico del grupo. */
    group?: RailGroup;
    onOpen?: () => void;
  }): PanelHandle;
  /** Registra un botón de acción simple (sin panel). */
  addAction(opts: {
    id: string;
    icon: string;
    title: string;
    onClick: () => void;
  }): HTMLButtonElement;
  /** Separador visual entre grupos de botones. */
  addSeparator(): void;
}

export function createSidebar(host: HTMLElement): Sidebar {
  const rail = el("div", "sidebar-rail");
  const drawer = el("aside", "sidebar-drawer");
  drawer.hidden = true;

  const drawerHeader = el("div", "drawer-header");
  const drawerTitle = el("h2", "drawer-title");
  const drawerClose = el("button", "drawer-close");
  drawerClose.type = "button";
  drawerClose.innerHTML = "&times;";
  drawerClose.title = "Cerrar panel";
  drawerHeader.append(drawerTitle, drawerClose);

  const drawerBody = el("div", "drawer-body");
  drawer.append(drawerHeader, drawerBody);
  host.append(rail, drawer);

  interface Entry {
    button: HTMLButtonElement;
    title: string;
    body: HTMLElement;
    onOpen?: () => void;
  }
  const entries = new Map<string, Entry>();
  let activeId: string | null = null;
  let hideTimer: number | undefined;
  const ANIM_MS = 190; // debe coincidir con la duración de .sidebar-drawer en CSS

  const close = () => {
    if (!activeId) return;
    entries.get(activeId)?.button.classList.remove("active");
    activeId = null;
    drawer.classList.remove("open");
    // Espera a que termine la transición de salida antes de sacarlo del flujo
    // (display:none no se puede animar). El timeout es red de seguridad si
    // transitionend no llega a disparar (reduced-motion, tab en background).
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      drawer.hidden = true;
    }, ANIM_MS);
  };

  const open = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (activeId && activeId !== id) {
      entries.get(activeId)?.button.classList.remove("active");
    }
    const wasClosed = drawer.hidden;
    window.clearTimeout(hideTimer);
    activeId = id;
    entry.button.classList.add("active");
    drawerTitle.textContent = entry.title;
    drawerBody.replaceChildren(entry.body);
    if (wasClosed) {
      drawer.hidden = false;
      drawer.classList.remove("open");
      // Fuerza el reflow para que el navegador registre el estado "cerrado"
      // antes de animar a "abierto"; sin esto ambos cambios se agrupan en un
      // solo frame y no hay transición que reproducir.
      void drawer.offsetWidth;
    }
    // Cambiar de panel con el drawer ya abierto no reinicia la entrada — solo
    // se anima al aparecer desde cerrado, cambiar de pestaña no debe parpadear.
    drawer.classList.add("open");
    // Abrir un panel cierra el menú "Vista" de la barra: nunca dos capas juntas.
    document.dispatchEvent(new CustomEvent("ui:panel-open"));
    entry.onOpen?.();
  };

  drawerClose.addEventListener("click", close);
  // Si se abre el menú "Vista", este drawer se cierra.
  document.addEventListener("ui:menu-open", close);

  return {
    addPanel({ id, icon, title, group, onOpen }) {
      const button = el("button", "rail-btn");
      button.type = "button";
      button.innerHTML = icon;
      // `data-label` alimenta el tooltip propio (CSS): el `title` nativo tarda
      // ~1s en aparecer y no se puede estilizar con el tema.
      button.dataset.label = title;
      button.setAttribute("aria-label", title);
      // Color del grupo: el icono ilustrado lee --ic / --ic-soft.
      if (group) {
        const c = GROUP_COLOR[group];
        button.dataset.group = group;
        button.style.setProperty("--ic", c);
        button.style.setProperty("--ic-soft", `color-mix(in srgb, ${c} 22%, transparent)`);
      }

      const badge = el("span", "rail-badge");
      badge.hidden = true;
      button.append(badge);

      const body = el("div", "panel-content");

      button.addEventListener("click", () => {
        if (activeId === id) close();
        else open(id);
      });

      rail.append(button);
      entries.set(id, { button, title, body, onOpen });

      return {
        body,
        setBadge(text) {
          if (text === null || text === "") {
            badge.hidden = true;
            return;
          }
          const changed = badge.textContent !== text;
          badge.textContent = text;
          badge.hidden = false;
          // Rebota solo cuando el valor cambia (no en cada render idéntico).
          if (changed) {
            badge.classList.remove("bump");
            void badge.offsetWidth; // reinicia la animación
            badge.classList.add("bump");
          }
        },
        open: () => open(id),
        close: () => {
          if (activeId === id) close();
        },
        isOpen: () => activeId === id,
      };
    },

    addAction({ icon, title, onClick }) {
      const button = el("button", "rail-btn");
      button.type = "button";
      button.innerHTML = icon;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", onClick);
      rail.append(button);
      return button;
    },

    addSeparator() {
      rail.append(el("div", "rail-sep"));
    },
  };
}
