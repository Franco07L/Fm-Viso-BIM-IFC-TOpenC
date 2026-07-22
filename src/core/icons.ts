// Iconos SVG inline (estilo línea, 24x24, currentColor) usados en toolbars.
// Mantenerlos aquí evita dependencias externas y permite teñir con CSS.

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  cursor: svg('<path d="M5 3l6 16 2-7 7-2z"/>'),
  eye: svg(
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/>',
  ),
  eyeOff: svg(
    '<path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6 6.3A17 17 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4-.9"/><path d="M3 3l18 18"/>',
  ),
  ghost: svg(
    '<path d="M5 21V9a7 7 0 0 1 14 0v12l-3-2-2 2-2-2-2 2-3-2z"/><circle cx="9.5" cy="10" r=".6" fill="currentColor"/><circle cx="14.5" cy="10" r=".6" fill="currentColor"/>',
  ),
  isolate: svg(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><path d="M14 4h7M14 8h7M14 14h7M14 18h7M3 14h7v7H3z" opacity=".5"/>',
  ),
  focus: svg(
    '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>',
  ),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  palette: svg(
    '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.5a1.5 1.5 0 0 0-1 2.6 1.5 1.5 0 0 1-1 2.6z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  ),
  layers: svg(
    '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/>',
  ),
  scissors: svg(
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1L20 20M8.1 15.9L20 4"/>',
  ),
  ruler: svg(
    '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 11l2 2M11 7l2 2M9 9l1 1M5 13l2 2"/>',
  ),
  plans: svg(
    '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 9v12M15 3v6"/>',
  ),
  pin: svg(
    '<path d="M12 22s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  ),
  issue: svg(
    '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  ),
  grid: svg(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ),
  home: svg('<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
  download: svg('<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>'),
  trash: svg(
    '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/>',
  ),
  camera: svg(
    '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  ),
  cube: svg('<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>'),
  clash: svg(
    '<rect x="3" y="3" width="11" height="11" rx="1"/><rect x="10" y="10" width="11" height="11" rx="1"/>',
  ),
  filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>'),
  audit: svg(
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 11l2 2 4-4"/><path d="M9 16h6"/>',
  ),
  table: svg(
    '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  ),
  sliders: svg(
    '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  ),
  tree: svg(
    '<path d="M4 5h6M4 5v14M4 12h6M4 19h6"/><rect x="12" y="3" width="8" height="4" rx="1"/><rect x="12" y="10" width="8" height="4" rx="1"/><rect x="12" y="17" width="8" height="4" rx="1"/>',
  ),
  calendar: svg(
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ),
  gantt: svg(
    '<path d="M3 4v16"/><rect x="6" y="5" width="9" height="3" rx="1"/><rect x="9" y="10.5" width="11" height="3" rx="1"/><rect x="6" y="16" width="7" height="3" rx="1"/>',
  ),
  compare: svg(
    '<path d="M12 3v18"/><path d="M6 7H3l3-4 3 4H6zM6 7v10"/><path d="M18 17h3l-3 4-3-4h3zM18 17V7"/>',
  ),
} as const;

export type IconName = keyof typeof icons;
