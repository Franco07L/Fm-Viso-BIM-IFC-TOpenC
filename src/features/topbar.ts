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

  const close = () => {
    menu.hidden = true;
    gear.classList.remove("open");
    gear.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    menu.hidden = false;
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
