/**
 * Design token system for MediScribe Local
 * Per DESIGN.md §3 Visual Identity
 *
 * All values are exported as TypeScript constants for use in JavaScript/TypeScript code.
 * CSS variables are defined in src/index.css and consumed via Tailwind utilities.
 */

export const colors = {
  // Neutrals / Surfaces
  bg: '#F4EFE4',
  surface: '#FFF9EE',
  surface2: '#E8DDC8',
  border: '#D8C7A6',
  borderStrong: '#C4AE85',

  // Text
  text: '#171511',
  textMuted: '#5C5547',
  textFaint: '#8A8170',

  // Brand / Accents
  primary: '#B65A2A',
  primaryHover: '#9E4C21',
  primarySoft: '#F3DECF',
  wood: '#6B4A2D',
  olive: '#7A8450',
  oliveSoft: '#E7E9D8',

  // Semantic States
  success: '#5E7D4F',
  successSoft: '#E4EAD9',
  warning: '#B07D2E',
  warningSoft: '#F3E6C9',
  error: '#8E3B2F',
  errorSoft: '#F0DCD6',
  info: '#6B6049',
} as const;

export const darkColors = {
  // Dark theme "Study Night"
  bg: '#201B14',
  surface: '#2A241B',
  border: '#473D2E',
  borderStrong: '#5C5042',

  text: '#F0E9DA',
  textMuted: '#B5AA93',
  textFaint: '#8A8170',

  primary: '#C96A38',
  primaryHover: '#B65A2A',
  primarySoft: '#4D3324',
  wood: '#9A7A52',
  olive: '#97A668',
  oliveSoft: '#3D4233',

  success: '#77996A',
  successSoft: '#2F3B2B',
  warning: '#D19A4A',
  warningSoft: '#4D3F28',
  error: '#B14D3F',
  errorSoft: '#422D28',
  info: '#8A8170',
} as const;

export const typography = {
  fontFamily: {
    display: 'Fraunces, serif',
    sans: 'Albert Sans, sans-serif',
    mono: 'IBM Plex Mono, monospace',
  },
  fontSize: {
    display: '3.0rem',
    h1: '1.75rem',
    h2: '1.375rem',
    h3: '1.125rem',
    body: '0.9375rem',
    small: '0.8125rem',
    monoSmall: '0.8125rem',
    smallCaps: '0.75rem',
  },
  lineHeight: {
    display: '1.15',
    heading: '1.15',
    body: '1.5',
    relaxed: '1.7',
  },
  letterSpacing: {
    heading: '-0.01em',
    smallCaps: '0.06em',
  },
} as const;

export const spacing = {
  // 4px base unit
  base: 4,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
  '5xl': 96,

  // Named spacing
  pageGutter: 32,
  pageGutterCompact: 24,
  cardPadding: 24,
  cardPaddingCompact: 16,
  sectionGap: 48,
  sidebarExpanded: 232,
  sidebarCollapsed: 64,
} as const;

export const borderRadius = {
  card: 14,
  button: 10,
  pill: 999,
} as const;

export const shadows = {
  card: '0 1px 2px rgba(23, 21, 17, 0.04), 0 4px 16px rgba(107, 74, 45, 0.07)',
  cardHover: '0 2px 4px rgba(23, 21, 17, 0.06), 0 8px 24px rgba(107, 74, 45, 0.10)',
} as const;

export const transitions = {
  duration: {
    micro: 150,
    normal: 300,
    slow: 600,
    verySlow: 900,
  },
  easing: {
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    easeOutQuint: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
} as const;

export const layout = {
  maxWidth: {
    content: 1200,
    settings: 760,
    welcome: 720,
    reading: '72ch',
  },
  minWindowSize: {
    width: 1024,
    height: 700,
  },
  defaultWindowSize: {
    width: 1280,
    height: 800,
  },
  statusFooterHeight: 36,
} as const;

/**
 * Status badge variants mapping
 * Used for consistent badge styling across the app
 */
export const statusBadgeVariants = {
  completed: 'success',
  running: 'primary',
  failed: 'error',
  skipped: 'warning',
  'scan_only': 'info',
  unsupported: 'error',
  installed: 'success',
  'not_installed': 'info',
  downloading: 'primary',
  'ready_on_cuda': 'success',
  'failed_to_load': 'error',
  warning: 'warning',
} as const;

/**
 * Preset configurations for transcription
 * Maps preset names to their display properties
 */
export const presets = {
  'best-quality': {
    name: 'Best Quality',
    description: 'Highest accuracy, slower processing',
  },
  'bad-audio': {
    name: 'Bad Audio / Conference Hall',
    description: 'Optimized for noisy environments',
  },
  'fast-batch': {
    name: 'Fast Batch',
    description: 'Quick processing for multiple files',
  },
  'low-vram': {
    name: 'Low VRAM Safe',
    description: 'Reduced memory usage',
  },
} as const;

/**
 * Icon sizes (px) for consistent icon rendering
 * Used with Lucide icons throughout the app
 */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

/**
 * Z-index scale for layering
 */
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  popover: 50,
  toast: 60,
} as const;

// Export a combined theme object
export const theme = {
  colors,
  darkColors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  layout,
  statusBadgeVariants,
  presets,
  iconSizes,
  zIndex,
} as const;

export type Theme = typeof theme;

export default theme;
