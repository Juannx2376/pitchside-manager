// Efectos jugables de las instalaciones del club. Un único punto de verdad: el entrenamiento, las
// lesiones, la cantera y los ojeadores leen de aquí, de modo que la interfaz puede explicar qué da cada nivel.
import type { Club } from './club';
import { clamp } from './types';

export interface FacilityEffects {
  /** Multiplicador de la mejora semanal de atributos (0.75-1.5). */
  training: number;
  /** Multiplicador de la recuperación física y de lesiones (1-1.6). */
  recovery: number;
  /** Multiplicador del riesgo de lesión de entrenamiento (0.5-1). */
  injuryMult: number;
  /** Multiplicador de la familiaridad táctica que dan las sesiones (1-1.6). */
  video: number;
  /** Multiplicador de la cantera (1-1.5). */
  youth: number;
  /** Multiplicador del alcance/calidad de ojeadores (1-1.6). */
  scouting: number;
}

/** Nivel 0-5 de una instalación de las ampliadas (las partidas antiguas no las traen). */
export function extraLevel(club: Club, key: 'gym' | 'videoAnalysis' | 'recoveryPool' | 'youthDorm' | 'scoutingNetwork' | 'pitchTech'): number {
  return clamp(club.facilities?.[key] ?? 0, 0, 5);
}

export function facilityEffects(club: Club): FacilityEffects {
  const tg = clamp((club.trainingFacilities ?? 50) / 100, 0, 1);
  const medical = club.facilities?.medical ?? 1;
  const gym = extraLevel(club, 'gym');
  const pool = extraLevel(club, 'recoveryPool');
  const video = extraLevel(club, 'videoAnalysis');
  const dorm = extraLevel(club, 'youthDorm');
  const net = extraLevel(club, 'scoutingNetwork');
  const tech = extraLevel(club, 'pitchTech');
  return {
    training: clamp(0.75 + 0.45 * tg + 0.06 * gym, 0.75, 1.5),
    recovery: clamp(1 + 0.07 * pool + 0.03 * medical, 1, 1.6),
    injuryMult: clamp(1 - 0.05 * gym - 0.04 * pool - 0.03 * Math.max(0, medical - 1) - 0.02 * tech, 0.5, 1),
    video: clamp(1 + 0.12 * video, 1, 1.6),
    youth: clamp(1 + 0.1 * dorm, 1, 1.5),
    scouting: clamp(1 + 0.12 * net, 1, 1.6),
  };
}
