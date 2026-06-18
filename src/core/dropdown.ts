import { el } from "./dom";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface Dropdown {
  /** Contenedor a insertar en el DOM. */
  readonly element: HTMLElement;
  setOptions(options: DropdownOption[]): void;
  getValue(): string;
  setValue(value: string): void;
  onChange(cb: (value: string) => void): void;
}

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const CHECK =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>';

// Solo un dropdown abierto a la vez (lista flotante anclada al body).
let openList: HTMLElement | null = null;
let openButton: HTMLButtonElement | null = null;

function closeOpen() {
  openList?.remove();
  openButton?.classList.remove("open");
  openList = null;
  openButton = null;
}

/** Dropdown propio, estilizable por tema (a diferencia del <select> nativo). */
export function createDropdown(initial: DropdownOption[] = []): Dropdown {
  let options = initial;
  let value = options[0]?.value ?? "";
  let changeCb: ((value: string) => void) | null = null;

  const element = el("div", "dd");
  const button = el("button", "dd-btn") as HTMLButtonElement;
  button.type = "button";
  const label = el("span", "dd-label");
  const chevron = el("span", "dd-chevron");
  chevron.innerHTML = CHEVRON;
  button.append(label, chevron);
  element.append(button);

  const renderLabel = () => {
    label.textContent = options.find((o) => o.value === value)?.label ?? "—";
  };

  const open = () => {
    closeOpen();
    const list = el("div", "dd-list");
    for (const opt of options) {
      const item = el("button", "dd-option");
      item.type = "button";
      if (opt.value === value) item.classList.add("selected");
      const check = el("span", "dd-check");
      if (opt.value === value) check.innerHTML = CHECK;
      item.append(el("span", undefined, opt.label), check);
      item.addEventListener("click", () => {
        const changed = value !== opt.value;
        value = opt.value;
        renderLabel();
        closeOpen();
        if (changed) changeCb?.(value);
      });
      list.append(item);
    }

    document.body.append(list);
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    list.style.minWidth = `${rect.width}px`;
    list.style.left = `${rect.left}px`;
    if (spaceBelow < 260 && rect.top > spaceBelow) {
      list.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      list.style.top = `${rect.bottom + 4}px`;
    }
    openList = list;
    openButton = button;
    button.classList.add("open");
  };

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openButton === button) closeOpen();
    else open();
  });

  renderLabel();

  return {
    element,
    setOptions(next) {
      options = next;
      if (!options.some((o) => o.value === value)) value = options[0]?.value ?? "";
      renderLabel();
    },
    getValue: () => value,
    setValue(v) {
      value = v;
      renderLabel();
    },
    onChange(cb) {
      changeCb = cb;
    },
  };
}

window.addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLElement;
  if (openList && !openList.contains(target) && !target.closest(".dd-btn")) {
    closeOpen();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOpen();
});
window.addEventListener("scroll", closeOpen, true);
window.addEventListener("resize", closeOpen);
