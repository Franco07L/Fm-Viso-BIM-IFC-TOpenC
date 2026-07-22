import { el } from "./dom";

/** Familia de la acción; tiñe el botón (en hover/activo) con su color. */
export type ToolGroup = "view" | "tool" | "annotate" | "data";

const TOOL_COLOR: Record<ToolGroup, string> = {
  view: "#22d3ee", // control de vista (cian, como Explorar)
  tool: "#fbbf24", // corte/medida/caja (ámbar, como Analizar)
  annotate: "#fb7185", // marcadores (rosa, como Colaborar)
  data: "#a855f7", // tabla/captura (violeta, como Gestionar)
};

export interface ToolButton {
  readonly element: HTMLButtonElement;
  setActive(active: boolean): void;
  setDisabled(disabled: boolean): void;
}

export interface BottomBar {
  addButton(opts: {
    icon: string;
    label: string;
    title: string;
    group?: ToolGroup;
    /** Acción secundaria (limpiar/quitar): se ve más tenue y compacta. */
    subtle?: boolean;
    onClick: (btn: ToolButton) => void;
    toggle?: boolean;
  }): ToolButton;
  addSeparator(): void;
}

/** Barra de herramientas flotante inferior para acciones rápidas. */
export function createBottomBar(host: HTMLElement): BottomBar {
  const bar = el("div", "bottom-bar");
  host.append(bar);

  return {
    addButton({ icon, label, title, group, subtle, onClick, toggle }) {
      const button = el("button", "tool-btn");
      button.type = "button";
      button.title = title;
      button.setAttribute("aria-label", title);
      button.innerHTML = `${icon}<span>${label}</span>`;
      if (group) button.style.setProperty("--ic", TOOL_COLOR[group]);
      if (subtle) button.classList.add("subtle");

      const control: ToolButton = {
        element: button,
        setActive(active) {
          button.classList.toggle("active", active);
        },
        setDisabled(disabled) {
          button.disabled = disabled;
        },
      };

      button.addEventListener("click", () => {
        if (toggle) button.classList.toggle("active");
        onClick(control);
      });

      bar.append(button);
      return control;
    },

    addSeparator() {
      bar.append(el("div", "tool-sep"));
    },
  };
}
