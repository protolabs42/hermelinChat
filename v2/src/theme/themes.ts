import HERMELIN_SVG from '../assets/hermelin-not-flipped.svg?raw'
import STOUT_SVG from '../assets/stout-mascot.svg?raw'
import SKULL_SVG from '../assets/matrix-skull.svg?raw'
import RABBIT_SVG from '../assets/white-rabbit.svg?raw'
import NOUS_SVG from '../assets/nous-alignment.svg?raw'
import NOUS_FLIPPED_SVG from '../assets/nous-alignment-flipped.svg?raw'
import SAMARITAN_SVG from '../assets/samaritan-mark.svg?raw'

export interface ThemeIdentity {
  topbarSvg: string
  mascotSvg: string
  mascotTitle: string
  whisperText: string
}

export interface ThemeColors {
  accent300: string; accent400: string; accent500: string; accent600: string
  accent700: string; accent800: string; accent900: string
  bg: string; surface: string; elevated: string; border: string
  muted: string; text: string; textBright: string; accent: string
  danger: string; success: string; info: string; purple: string; cyan: string
}

export interface ThemeBackground {
  kind: 'particles' | 'matrix-rain' | 'nous-crt' | 'samaritan'
  overlay?: { kind: 'grain' | 'scanlines'; opacity: number }
  matrixRain?: {
    colWidth: number
    fontSize: number
    fadeAlpha: number
    opacity: number
    frameMs: number
    speedBase: number
    speedJitter: number
    redChance: number
    resetChance: number
  }
}

export interface Theme {
  id: string
  label: string
  colors: ThemeColors
  background?: ThemeBackground
  identity: ThemeIdentity
}

export const DEFAULT_THEME_ID = 'catppuccin'

export const THEMES: Record<string, Theme> = {
  hermelin: {
    id: 'hermelin',
    label: 'Hermelin (amber)',
    identity: {
      topbarSvg: HERMELIN_SVG,
      mascotSvg: STOUT_SVG,
      mascotTitle: 'the Stout knows\u2026',
      whisperText: 'aligned to you\u2026',
    },
    colors: {
      accent300: '#ffd480',
      accent400: '#f5b731',
      accent500: '#e0a020',
      accent600: '#c48a18',
      accent700: '#9a6c12',
      accent800: '#6b4a0e',
      accent900: '#3d2a08',
      bg: '#08080a',
      surface: '#0e0e12',
      elevated: '#16161d',
      border: '#232330',
      muted: '#55556a',
      text: '#b8b8cc',
      textBright: '#e8e8f0',
      accent: '#f5b731',
      danger: '#e84057',
      success: '#38c878',
      info: '#60a5fa',
      purple: '#a78bfa',
      cyan: '#22d3ee',
    },
    background: {
      kind: 'particles',
      overlay: { kind: 'grain', opacity: 0.03 },
    },
  },

  matrix: {
    id: 'matrix',
    label: 'Matrix (rabbit)',
    identity: {
      topbarSvg: SKULL_SVG,
      mascotSvg: RABBIT_SVG,
      mascotTitle: 'follow the white rabbit\u2026',
      whisperText: 'follow the white rabbit\u2026',
    },
    colors: {
      accent300: '#b7ffd6',
      accent400: '#4dffa1',
      accent500: '#2da565',
      accent600: '#248a53',
      accent700: '#1a6b3f',
      accent800: '#114d2c',
      accent900: '#0a3019',
      bg: '#0c0f0e',
      surface: '#111514',
      elevated: '#1a201f',
      border: '#2a3533',
      muted: '#5a6f6a',
      text: '#c8d8d3',
      textBright: '#e8f0ec',
      accent: '#4dffa1',
      danger: '#fb7185',
      success: '#4dffa1',
      info: '#60a5fa',
      purple: '#a78bfa',
      cyan: '#22d3ee',
    },
    background: {
      kind: 'matrix-rain',
      matrixRain: {
        colWidth: 14,
        fontSize: 12,
        fadeAlpha: 0.04,
        opacity: 0.3,
        frameMs: 50,
        speedBase: 0.025,
        speedJitter: 0.03,
        redChance: 0.18,
        resetChance: 0.985,
      },
      overlay: { kind: 'scanlines', opacity: 0.06 },
    },
  },

  nous: {
    id: 'nous',
    label: 'Nous (aqua)',
    identity: {
      topbarSvg: NOUS_FLIPPED_SVG,
      mascotSvg: NOUS_SVG,
      mascotTitle: 'nous research',
      whisperText: 'aligned to nous\u2026',
    },
    colors: {
      accent300: '#9ae1f2',
      accent400: '#5cc8e6',
      accent500: '#3aa8c8',
      accent600: '#2a88a8',
      accent700: '#1e6888',
      accent800: '#144868',
      accent900: '#0a2838',
      bg: '#06181e',
      surface: '#0a2028',
      elevated: '#0e2830',
      border: '#1a3a44',
      muted: '#4a7a88',
      text: '#8acade',
      textBright: '#c0e8f4',
      accent: '#5cc8e6',
      danger: '#e84057',
      success: '#38c878',
      info: '#5cc8e6',
      purple: '#a78bfa',
      cyan: '#22d3ee',
    },
    background: {
      kind: 'nous-crt',
      overlay: { kind: 'grain', opacity: 0.03 },
    },
  },

  samaritan: {
    id: 'samaritan',
    label: 'Samaritan (light)',
    identity: {
      topbarSvg: SAMARITAN_SVG,
      mascotSvg: SAMARITAN_SVG,
      mascotTitle: 'samaritan',
      whisperText: 'the machine sees you\u2026',
    },
    colors: {
      accent300: '#e06666',
      accent400: '#cc3333',
      accent500: '#aa2020',
      accent600: '#881818',
      accent700: '#661212',
      accent800: '#440c0c',
      accent900: '#220606',
      bg: '#e8e6e1',
      surface: '#dddbd6',
      elevated: '#d2d0cb',
      border: '#bab8b3',
      muted: '#7a7872',
      text: '#3a3835',
      textBright: '#1a1816',
      accent: '#cc3333',
      danger: '#aa2020',
      success: '#2da565',
      info: '#60a5fa',
      purple: '#a78bfa',
      cyan: '#22d3ee',
    },
    background: {
      kind: 'samaritan',
      overlay: { kind: 'grain', opacity: 0.02 },
    },
  },

  catppuccin: {
    id: 'catppuccin',
    label: 'Catppuccin (lavender)',
    identity: {
      topbarSvg: HERMELIN_SVG,
      mascotSvg: HERMELIN_SVG,
      mascotTitle: 'aurora',
      whisperText: 'the sky remembers what the ground forgets',
    },
    colors: {
      accent300: '#d0d5ff',
      accent400: '#b4befe',
      accent500: '#9399e2',
      accent600: '#7278c4',
      accent700: '#555aa0',
      accent800: '#3b3f7a',
      accent900: '#232554',
      bg: '#1e1e2e',
      surface: '#181825',
      elevated: '#313244',
      border: '#45475a',
      muted: '#6c7086',
      text: '#bac2de',
      textBright: '#cdd6f4',
      accent: '#b4befe',
      danger: '#f38ba8',
      success: '#a6e3a1',
      info: '#89b4fa',
      purple: '#cba6f7',
      cyan: '#94e2d5',
    },
    background: {
      kind: 'particles',
      overlay: { kind: 'grain', opacity: 0.02 },
    },
  },

  'catppuccin-macchiato': {
    id: 'catppuccin-macchiato',
    label: 'Catppuccin Macchiato (lavender)',
    identity: {
      topbarSvg: HERMELIN_SVG,
      mascotSvg: HERMELIN_SVG,
      mascotTitle: 'aurora',
      whisperText: 'the sky remembers what the ground forgets',
    },
    colors: {
      accent300: '#ccd0ff',
      accent400: '#b7bdf8',
      accent500: '#939adc',
      accent600: '#7278be',
      accent700: '#555a9c',
      accent800: '#3b3f78',
      accent900: '#232552',
      bg: '#24273a',
      surface: '#1e2030',
      elevated: '#363a4f',
      border: '#494d64',
      muted: '#6e738d',
      text: '#b8c0e0',
      textBright: '#cad3f5',
      accent: '#b7bdf8',
      danger: '#ed8796',
      success: '#a6da95',
      info: '#8aadf4',
      purple: '#c6a0f6',
      cyan: '#8bd5ca',
    },
    background: {
      kind: 'particles',
      overlay: { kind: 'grain', opacity: 0.02 },
    },
  },

  'catppuccin-frappe': {
    id: 'catppuccin-frappe',
    label: 'Catppuccin Frappe (lavender)',
    identity: {
      topbarSvg: HERMELIN_SVG,
      mascotSvg: HERMELIN_SVG,
      mascotTitle: 'aurora',
      whisperText: 'the sky remembers what the ground forgets',
    },
    colors: {
      accent300: '#c8ccff',
      accent400: '#babbf1',
      accent500: '#9698d6',
      accent600: '#7476b8',
      accent700: '#575996',
      accent800: '#3d3e72',
      accent900: '#24254e',
      bg: '#303446',
      surface: '#292c3c',
      elevated: '#414559',
      border: '#51576d',
      muted: '#737994',
      text: '#b5bfe2',
      textBright: '#c6d0f5',
      accent: '#babbf1',
      danger: '#e78284',
      success: '#a6d189',
      info: '#8caaee',
      purple: '#ca9ee6',
      cyan: '#81c8be',
    },
    background: {
      kind: 'particles',
      overlay: { kind: 'grain', opacity: 0.02 },
    },
  },

  'catppuccin-latte': {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte (lavender)',
    identity: {
      topbarSvg: HERMELIN_SVG,
      mascotSvg: HERMELIN_SVG,
      mascotTitle: 'aurora',
      whisperText: 'the sky remembers what the ground forgets',
    },
    colors: {
      accent300: '#6366a8',
      accent400: '#7287fd',
      accent500: '#5b6cd0',
      accent600: '#4854a8',
      accent700: '#363f82',
      accent800: '#262c5e',
      accent900: '#181c3c',
      bg: '#eff1f5',
      surface: '#e6e9ef',
      elevated: '#ccd0da',
      border: '#bcc0cc',
      muted: '#8c8fa1',
      text: '#5c5f77',
      textBright: '#4c4f69',
      accent: '#7287fd',
      danger: '#d20f39',
      success: '#40a02b',
      info: '#1e66f5',
      purple: '#8839ef',
      cyan: '#179299',
    },
    background: {
      kind: 'particles',
      overlay: { kind: 'grain', opacity: 0.01 },
    },
  },
}

export const THEME_OPTIONS = Object.values(THEMES).map((t) => ({ id: t.id, label: t.label }))
