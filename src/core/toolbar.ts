import { el } from "./dom";

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
    addButton({ icon, label, title, onClick, toggle }) {
      const button = el("button", "tool-btn");
      button.type = "button";
      button.title = title;
      button.setAttribute("aria-label", title);
      button.innerHTML = `${icon}<span>${label}</span>`;

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
