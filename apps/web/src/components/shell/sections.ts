// Estructura de navegación: 6 secciones con sus vistas. Cada vista pertenece a una sola sección;
// la barra lateral muestra las secciones y, dentro de cada una, pestañas "pill" con sus vistas.
import type { View } from '../../store/game';

export interface Section {
  id: string;
  icon: string;
  views: View[];
}

export const SECTIONS: Section[] = [
  { id: 'home', icon: 'home', views: ['hub', 'inbox', 'objectives'] },
  { id: 'squad', icon: 'squad', views: ['squad', 'tactics', 'training'] },
  { id: 'market', icon: 'market', views: ['transfers', 'scouting', 'deadline'] },
  { id: 'club', icon: 'club', views: ['finances', 'staff'] },
  { id: 'compete', icon: 'compete', views: ['competition', 'calendar', 'world'] },
  { id: 'career', icon: 'career', views: ['career', 'settings', 'help'] },
];

/** Secciones para un mánager sin club. */
export const JOBLESS_SECTIONS: Section[] = [
  { id: 'jobs', icon: 'jobs', views: ['unemployed', 'inbox'] },
  { id: 'compete', icon: 'compete', views: ['competition', 'world'] },
  { id: 'career', icon: 'career', views: ['career', 'settings', 'help'] },
];

/** Vistas "especiales" (partido, prensa, gala…) cuelgan de Inicio. */
const HOME_EXTRAS: View[] = ['match', 'press', 'gala', 'data'];

export function sectionOf(view: View, list: Section[] = SECTIONS): Section {
  const direct = list.find((s) => s.views.includes(view));
  if (direct) return direct;
  if (HOME_EXTRAS.includes(view)) return list[0];
  return list[0];
}
