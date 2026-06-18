import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";

export type ViewerWorld = OBC.SimpleWorld<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>;

/** Referencias centrales del visor que comparten todas las funcionalidades. */
export interface Viewer {
  components: OBC.Components;
  world: ViewerWorld;
  renderer: OBF.PostproductionRenderer;
  fragments: OBC.FragmentsManager;
  highlighter: OBF.Highlighter;
  casters: OBC.Raycasters;
  grid: OBC.SimpleGrid;
  container: HTMLElement;
  /** Modelos cargados actualmente. */
  models: () => FRAGS.FragmentsModel[];
  /** Selección actual del Highlighter (estilo "select"). */
  selection: () => OBC.ModelIdMap;
  /** Encludra la cámara a todos los modelos. */
  fitToModels: () => Promise<void>;
  /** Refresca el render de fragmentos. */
  update: () => Promise<void>;
}

export async function setupViewer(container: HTMLElement): Promise<Viewer> {
  const components = new OBC.Components();
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBF.PostproductionRenderer
  >();

  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  world.scene.three.background = new THREE.Color("#15181d");

  const renderer = new OBF.PostproductionRenderer(components, container);
  world.renderer = renderer;
  world.camera = new OBC.OrthoPerspectiveCamera(components);

  components.init();

  const grid = components.get(OBC.Grids).create(world);
  await world.camera.controls.setLookAt(25, 18, 25, 0, 0, 0);

  // Motor de fragmentos (geometría servida desde el worker local)
  const fragments = components.get(OBC.FragmentsManager);
  fragments.init(`${import.meta.env.BASE_URL}resources/worker.mjs`);

  world.camera.controls.addEventListener("update", () => {
    void fragments.core.update();
  });

  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    void fragments.core.update(true);
  });

  const highlighter = components.get(OBF.Highlighter);
  highlighter.setup({
    world,
    selectMaterialDefinition: {
      color: new THREE.Color("#bcf124"),
      opacity: 1,
      transparent: false,
      renderedFaces: FRAGS.RenderedFaces.TWO,
    },
  });
  highlighter.multiple = "ctrlKey";
  highlighter.zoomToSelection = false;

  const casters = components.get(OBC.Raycasters);
  const boxer = components.get(OBC.BoundingBoxer);

  const fitToModels = async () => {
    boxer.list.clear();
    boxer.addFromModels();
    const box = boxer.get();
    boxer.list.clear();
    if (box.isEmpty()) return;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    sphere.radius = Math.max(sphere.radius * 1.2, 2);
    await world.camera.controls.fitToSphere(sphere, true);
  };

  return {
    components,
    world,
    renderer,
    fragments,
    highlighter,
    casters,
    grid,
    container,
    models: () => [...fragments.list.values()],
    selection: () => highlighter.selection.select ?? {},
    fitToModels,
    update: () => fragments.core.update(true),
  };
}
