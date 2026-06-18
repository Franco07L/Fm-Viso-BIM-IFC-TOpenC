import { el } from "./dom";

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

  const close = () => {
    if (!activeId) return;
    entries.get(activeId)?.button.classList.remove("active");
    activeId = null;
    drawer.hidden = true;
  };

  const open = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (activeId && activeId !== id) {
      entries.get(activeId)?.button.classList.remove("active");
    }
    activeId = id;
    entry.button.classList.add("active");
    drawerTitle.textContent = entry.title;
    drawerBody.replaceChildren(entry.body);
    drawer.hidden = false;
    entry.onOpen?.();
  };

  drawerClose.addEventListener("click", close);

  return {
    addPanel({ id, icon, title, onOpen }) {
      const button = el("button", "rail-btn");
      button.type = "button";
      button.innerHTML = icon;
      button.title = title;
      button.setAttribute("aria-label", title);

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
          } else {
            badge.textContent = text;
            badge.hidden = false;
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
