import type { Sidebar } from "./sidebar";
import type { BottomBar } from "./toolbar";

/** Contexto de interfaz compartido por todas las funcionalidades. */
export interface UI {
  sidebar: Sidebar;
  bottomBar: BottomBar;
}
