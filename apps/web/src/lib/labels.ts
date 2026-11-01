import { TACTICAL_STYLES, TACTIC_TEMPLATES, t, tm, type Msg, type Tactic, type TacticalStyle } from '@pitchside/core';

const TEMPLATE_IDS: readonly string[] = TACTIC_TEMPLATES.map((x) => x.id);

/** Tactic names created from presets/templates store their id; user tactics store free text. */
export function tacticName(tc: Pick<Tactic, 'name'>): string {
  if ((TACTICAL_STYLES as readonly string[]).includes(tc.name)) return t(`ui.style.${tc.name as TacticalStyle}`);
  if (TEMPLATE_IDS.includes(tc.name)) return t(`ui.tpl.${tc.name}`);
  return tc.name;
}

/** Competition names may be plain strings (real leagues) or messages (generated cups). */
export function compName(n: Msg | string): string {
  return tm(n);
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
