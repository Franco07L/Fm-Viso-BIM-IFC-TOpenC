// Helpers de DOM reutilizables por toda la UI del visor.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Crea un botón con un icono SVG inline y un tooltip accesible. */
export function iconButton(
  icon: string,
  title: string,
  onClick: () => void,
  className = "",
): HTMLButtonElement {
  const button = el("button", `icon-btn ${className}`.trim());
  button.type = "button";
  button.innerHTML = icon;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", onClick);
  return button;
}

let toastTimer: number | undefined;

export function showToast(message: string, kind: "info" | "error" = "error") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = el("div");
    toast.id = "toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4500);
}

/** Descarga un texto como archivo (para export CSV/JSON/BCF). */
export function downloadFile(
  filename: string,
  content: string | Blob,
  mime = "text/plain",
) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
