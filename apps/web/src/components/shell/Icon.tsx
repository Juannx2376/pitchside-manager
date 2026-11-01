// Iconos de línea coherentes para la barra lateral (SVG inline, heredan `currentColor`).
const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-6h3v6h5V10',
  squad: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5M3.5 19c.4-3 2.6-5 5.5-5s5.1 2 5.5 5m1.5-4.8c2.4.1 4 1.7 4.5 4.8',
  market: 'M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5',
  club: 'M3 20h18M5 20V9l7-4.5L19 9v11M9 20v-6h6v6M9 11.5h.01M15 11.5h.01',
  compete: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4.5c0 2.5 1 4 3.5 4.5M16 6h3.5c0 2.5-1 4-3.5 4.5M12 13v4m-3.5 3h7M10 17h4',
  career: 'm12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7L12 4Z',
  jobs: 'M4 6.5h16v11H4v-11Zm0 1 8 5.5 8-5.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'm20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  help: 'M9.5 9a2.6 2.6 0 1 1 3.7 2.4c-.9.5-1.2 1-1.2 2M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  play: 'M8 5.5v13l11-6.5-11-6.5Z',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-12.5 3.5 2.5-1.3 4h-4.4l-1.3-4L12 8.5Z',
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 17v3',
  cash: 'M3 7h18v10H3V7Zm9 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  alert: 'M12 4 3 19h18L12 4Zm0 6v4m0 3h.01',
  cross: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z',
  pen: 'M4 20l1-4L16 5l3 3L8 19l-4 1Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  megaphone: 'M4 10v4h3l7 4V6L7 10H4Zm12 .5a3 3 0 0 1 0 3',
  gift: 'M4 10h16v10H4V10Zm-1-3h18v3H3V7Zm9 0v13M12 7c-2-3-6-3-5 0 .5 1 3 0 5 0Zm0 0c2-3 6-3 5 0-.5 1-3 0-5 0Z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4.5c0 2.5 1 4 3.5 4.5M16 6h3.5c0 2.5-1 4-3.5 4.5M12 13v4m-3.5 3h7M10 17h4',
  star: 'm12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7L12 4Z',
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.home} />
    </svg>
  );
}
