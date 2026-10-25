// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/app/NavIcon.tsx).
export type SectionId =
  'home' | 'consumption' | 'power' | 'tariffs' | 'quality' | 'ask' | 'settings';

/** Outline icons for the main sections (24×24, stroke follows the text colour). */
const PATHS: Record<SectionId, string[]> = {
  // House
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h5v-6h4v6h5V9.5'],
  // Bar chart
  consumption: ['M3 21h18', 'M6 17v-5', 'M10.5 17V7', 'M15 17v-7', 'M19.5 17V4'],
  // Lightning bolt
  power: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  // Euro sign in a tag
  tariffs: [
    'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z',
    'M14 9.2a3 3 0 1 0 0 3.6',
    'M8.5 10h4M8.5 12h4',
  ],
  // Sine wave over a baseline
  quality: ['M2 12c2.5-7 5.5-7 8 0s5.5 7 8 0', 'M18 12c1-2.8 2-4 4-4', 'M2 21h20'],
  // Speech bubble
  ask: [
    'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z',
    'M8.5 12h.01M12 12h.01M15.5 12h.01',
  ],
  // Gear
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  ],
};

export function NavIcon({ section }: { section: SectionId }) {
  return (
    <svg
      className="nav-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[section].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
