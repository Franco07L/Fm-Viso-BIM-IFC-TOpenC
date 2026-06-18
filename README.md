# Visor BIM · IFC

Visor BIM web para archivos IFC construido con el ecosistema de
[ThatOpen Engine](https://github.com/ThatOpen/engine_docs):
`@thatopen/components`, `@thatopen/components-front`, `@thatopen/fragments`,
`three` y `web-ifc`.

## Características

### Carga y propiedades
- **Carga de IFC**: botón "Cargar IFC" (varios archivos), arrastrar y soltar
  sobre el visor, y un modelo de ejemplo incluido.
- **Panel de propiedades**: nombre, categoría IFC, GUID, atributos y property
  sets (incluidas cantidades) de los elementos seleccionados, en grupos
  colapsables.

### Selección
- `Click`: selecciona un elemento (reemplaza la selección anterior).
- `Ctrl + Click`: selección múltiple.
- `Click` en vacío o `ESC`: limpia la selección.
- **Selección por lotes**: desde el panel *Conjuntos*, el botón de selección de
  cada grupo selecciona todos sus elementos a la vez. Cuando la selección es
  grande, el panel muestra un resumen por categoría en lugar de miles de fichas.

### Visibilidad (barra inferior)
- **Mostrar todo**, **Aislar** la selección, **Ocultar** la selección, y
  **Ghost** (deja translúcido todo menos la selección).

### Conjuntos y color por subdisciplina (panel *Conjuntos*)
- Agrupar los elementos por cualquier criterio: **Categoría IFC**, **Modelo**,
  un **atributo** (ObjectType, Phase…) o una **propiedad de un property set**
  (Nivel, Material, o tus psets de disciplina como ACTIVO / Descripción de
  partida). El selector se llena solo con lo que trae el IFC.
- Cada conjunto se puede **seleccionar**, **aislar** o **colorear**.
- **Colorear** todos = mapa de colores por disciplina/criterio, con leyenda.
  Si el grupo coincide con una subdisciplina de la **tabla estándar**
  (`core/subdisciplines.ts`: AF, AC, DN, TR, IL…) usa su **RGB exacto**; el
  resto, paleta automática. Cada color es **editable** (click en el swatch).
- **Exportar** la tabla de conjuntos a CSV.

### Cortes, medición y vistas (Nivel 3)
- **Cortes**: modo corte → doble-click crea un plano de sección; `Supr` borra.
- **Medición**: un botón cicla Longitud → Área → Volumen → Ángulo; doble-click
  pone puntos, `Enter` cierra la medida.
- **Vistas** (panel): vistas ortográficas (planta, alzados) e isométrica, y
  conmutador de proyección Perspectiva/Ortográfica.

### Anotación y colaboración (Nivel 4)
- **Marcadores**: modo marcador → click coloca un pin numerado sobre el modelo.
- **Issues** (panel): captura un "issue" con la vista de cámara actual + la
  selección; al pulsarlo restaura ambas. Exportable a JSON (BCF ligero).

### Vista de Inventario por categoría (Nivel 5 · diferenciador)
- Panel *Inventario*: separa todos los elementos de una categoría, los oculta
  del modelo y los **alinea en una grilla ordenada** a un costado para conteo
  visual. "Restaurar" los devuelve a su sitio. Ningún visor BIM lo trae nativo;
  se construye con el `Mesher` (geometría real) + `Hider`.

### Detección de interferencias / Clash (panel *Interferencias*)
- **Cruza por el criterio que elijas**: categoría, modelo o parámetro
  (disciplina/subdisciplina leída de los psets). Con **varios IFC cargados**
  (arquitectura + estructuras + MEP exportados por separado desde Revit) cruza
  todas las disciplinas.
- **Dos niveles de precisión**: *Cajas* (rápido, por AABB con índice espacial
  grid hash + tolerancia configurable) y *Geometría* (exacto: refina los
  candidatos con test de malla real vía `three-mesh-bvh`, descartando los falsos
  positivos donde las cajas se tocan pero la geometría no). El modo Geometría
  muestra **barra de progreso**, no congela la UI (procesa por lotes) y **cachea
  la geometría** para acelerar re-corridas. Es pesado con muchos candidatos:
  conviene filtrar antes con la matriz de configuración.
- **Matriz de configuración**: antes de detectar, eliges en una matriz qué
  cruces analizar (activar/desactivar como tu plantilla de clash con CP / No
  aplica).
- **Matriz heatmap** de resultados: cada celda con el nº de interferencias y
  **escala de color** (amarillo → naranja → rojo). Click en una celda aísla,
  colorea de rojo y enfoca ese cruce.
- Lista de cruces ordenada por cantidad, "Resaltar" todo, y export CSV.

### Temas visuales
- Selector en la barra superior con **6 temas** conmutables en vivo: Violet
  Pulse, Cyber Grape, Aurora Plasma, Nebula Glass, Soft Lumen (claro) y Quantum
  Indigo. La preferencia se guarda en `localStorage`.
- Todo el color sale de variables CSS por tema (`core`/`style.css`), con
  contraste adaptado (texto, hover, glow/glass) — incluido el tema claro donde
  el texto pasa a oscuro. El fondo 3D también sigue el tema.

### Estilos visuales y navegación
- **Estilos** (botón superior): Normal · Calidad (oclusión ambiental + sombras)
  · Técnico (bordes tipo plano) — vía `PostproductionRenderer`.
- **Navegación estilo Revit**: botón central = paneo, `Shift` + central =
  orbitar sobre el punto bajo el cursor, rueda = zoom al cursor, `Inicio` =
  encuadrar. Click izquierdo reservado para selección.

## Requisitos

- Node.js 18+ (probado con Node 24).

## Uso

```bash
npm install      # instala dependencias y copia worker/WASM a public/resources
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # build de producción en dist/
npm run preview  # sirve la build de producción
```

## Despliegue (GitHub Pages)

El repo incluye un workflow (`.github/workflows/deploy.yml`) que, en cada push a
`main`, compila y publica `dist/` en GitHub Pages. La base del sitio está fijada
en `vite.config.ts` (`/Fm-Viso-BIM-IFC-TOpenC/`) y los recursos (worker, WASM,
modelo de ejemplo) se cargan vía `import.meta.env.BASE_URL`, así que funcionan
tanto en local como bajo el subpath de Pages.

Para activarlo (una sola vez): en el repositorio, **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Tras el primer despliegue, el visor queda
en `https://franco07l.github.io/Fm-Viso-BIM-IFC-TOpenC/`.

## Arquitectura

Estructura modular: un núcleo crea el contexto del visor y la UI, y cada
funcionalidad es un módulo independiente que recibe ese contexto y registra su
panel/acciones.

```
src/
  main.ts                  Orquestador: crea el visor + UI y monta cada feature
  core/
    viewer.ts              Mundo (escena, cámara, renderer), fragments, selección
    sidebar.ts             Barra lateral de paneles desplegables
    toolbar.ts             Barra inferior de acciones rápidas
    grouping.ts            Agrupación por criterio (categoría/modelo/atributo/pset)
    ui.ts                  Tipo de contexto de UI compartido
    dom.ts, icons.ts       Helpers de DOM, toasts e iconos SVG
  features/
    loader.ts              Carga IFC (botones, drag&drop, validación)
    navigation.ts          Navegación estilo Revit
    styles.ts              Estilos visuales (postproducción)
    selection.ts           Selección ↔ panel de propiedades
    visibility.ts          Nivel 1 — aislar / ocultar / ghost
    classification.ts      Nivel 2 — conjuntos + color + selección por lotes
    sections.ts            Nivel 3 — cortes (Clipper)
    measurements.ts        Nivel 3 — medición (longitud/área/volumen/ángulo)
    views.ts               Nivel 3 — vistas ortográficas e isométrica
    markers.ts             Nivel 4 — marcadores (pines)
    bcf.ts                 Nivel 4 — issues / vistas guardadas
    inventory.ts           Nivel 5 — vista de inventario por categoría
    clash.ts               Detección de interferencias + matriz heatmap
  panel.ts                 Render del panel de propiedades
  style.css                Estilos de toda la UI
```

Notas de implementación:

- La conversión IFC → Fragments la hace `OBC.IfcLoader` (web-ifc WASM); la
  geometría vive en el worker de `@thatopen/fragments`.
- La categoría y el GUID se leen de los atributos `_category` / `_guid` que
  devuelve `getItemsData` (no usar `Item.getCategory()`, que falla en el worker
  en fragments 3.x).
- El overlay de carga se oculta en cuanto la geometría está lista, sin esperar a
  la animación de encuadre (que depende del bucle de render y se pausa si la
  pestaña está en segundo plano).
- En la consola del navegador, `window.__viewer` expone `components`, `world`,
  `fragments`, `highlighter` y `casters` para depuración.
