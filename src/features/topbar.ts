/**
 * Menú "Vista" de la barra superior.
 *
 * La barra deja a la vista solo lo que se usa a diario (marca + cargar modelo)
 * y agrupa aquí los ajustes ocasionales: modelo de ejemplo, estilo visual,
 * ambiente y tema. Los botones conservan sus IDs, así que las funcionalidades
 * que los controlan (styles/environment/themes/loader) siguen funcionando igual.
 */
export function setupTopbar() {
  const gear = document.getElementById("btn-settings");
  const menu = document.getElementById("settings-menu");
  if (!gear || !menu) return;

  const ANIM_MS = 160; // debe coincidir con la duración de .tb-menu-panel en CSS
  let hideTimer: number | undefined;

  const close = () => {
    menu.classList.remove("open");
    gear.classList.remove("open");
    gear.setAttribute("aria-expanded", "false");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      menu.hidden = true;
    }, ANIM_MS);
  };

  const open = () => {
    window.clearTimeout(hideTimer);
    menu.hidden = false;
    menu.classList.remove("open");
    void menu.offsetWidth; // fuerza el reflow: registra el estado cerrado antes de animar
    menu.classList.add("open");
    gear.classList.add("open");
    gear.setAttribute("aria-expanded", "true");
  };

  gear.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });

  // El menú no se cierra al usarlo por dentro (cambiar estilo, tema…), solo al
  // pulsar fuera o con Escape.
  menu.addEventListener("pointerdown", (e) => e.stopPropagation());
  window.addEventListener("pointerdown", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
