// Три пресета StyleBible. Размеры — px при кадре 1920×1080; тени — CSS box-shadow по
// уровням elevation 0..3.
import type { StyleBible } from "@ms/contracts";

export type PresetId = "dark-premium" | "light-clean" | "tech-neon";

const SCALE = [18, 22, 28, 36, 48, 64, 88, 120, 160];

/** Тёмный премиум: глубокий графит, фиолетово-бирюзовые акценты, мягкие пружины. */
const darkPremium: StyleBible = {
  id: "dark-premium",
  name: "Dark Premium",
  palette: {
    bg: "#07080d",
    surface: "#12141c",
    text: "#f3f4f8",
    muted: "#8b91a5",
    accent: ["#8b7cff", "#45d6c0", "#f4b56a"],
    positive: "#45d6c0",
    negative: "#ff6b81",
  },
  typography: {
    display: { family: "Manrope", weight: 800 },
    body: { family: "Inter", weight: 500 },
    mono: { family: "JetBrains Mono", weight: 500 },
    scale: SCALE,
    tracking: { display: -0.035, body: -0.01, caps: 0.14, mono: 0 },
  },
  grid: { columns: 12, gutter: 32, safe_area: { x: 0.06, y: 0.08 } },
  surfaces: {
    radius: [10, 18, 26, 36],
    elevation: [
      "0 0 0 1px rgba(255, 255, 255, 0.06)",
      "0 0 0 1px rgba(255, 255, 255, 0.07), 0 10px 24px -10px rgba(0, 0, 0, 0.7)",
      "0 0 0 1px rgba(255, 255, 255, 0.09), 0 24px 48px -16px rgba(0, 0, 0, 0.8), 0 6px 14px -4px rgba(0, 0, 0, 0.5)",
      "0 0 0 1px rgba(255, 255, 255, 0.12), 0 48px 96px -24px rgba(0, 0, 0, 0.9), 0 16px 32px -8px rgba(0, 0, 0, 0.6), 0 0 80px -20px rgba(139, 124, 255, 0.35)",
    ],
  },
  motion: {
    intensity: "balanced",
    easing: { enter: [0.16, 1, 0.3, 1], exit: [0.7, 0, 0.84, 0], emphasis: [0.34, 1.56, 0.64, 1] },
    spring: {
      soft: { damping: 22, stiffness: 90, mass: 1 },
      snappy: { damping: 15, stiffness: 170, mass: 0.8 },
      bouncy: { damping: 10, stiffness: 140, mass: 0.9 },
    },
    stagger_frames: 4,
    enter_frames: 24,
    exit_frames: 14,
  },
  camera: { allow_zoom: true, max_scale: 1.08, parallax: true },
};

/** Светлый чистый: бумажный фон, синий акцент, мягкие тени, сдержанное движение. */
const lightClean: StyleBible = {
  id: "light-clean",
  name: "Light Clean",
  palette: {
    bg: "#f4f5f7",
    surface: "#ffffff",
    text: "#0e1116",
    muted: "#5b6472",
    accent: ["#2563eb", "#0d9488", "#f59e0b"],
    positive: "#16a34a",
    negative: "#dc2626",
  },
  typography: {
    display: { family: "Inter", weight: 700 },
    body: { family: "Inter", weight: 400 },
    mono: { family: "JetBrains Mono", weight: 400 },
    scale: SCALE,
    tracking: { display: -0.03, body: -0.005, caps: 0.12, mono: 0 },
  },
  grid: { columns: 12, gutter: 32, safe_area: { x: 0.06, y: 0.08 } },
  surfaces: {
    radius: [8, 14, 20, 28],
    elevation: [
      "0 0 0 1px rgba(14, 17, 22, 0.08)",
      "0 0 0 1px rgba(14, 17, 22, 0.06), 0 2px 4px rgba(14, 17, 22, 0.08), 0 10px 22px -6px rgba(14, 17, 22, 0.18)",
      "0 0 0 1px rgba(14, 17, 22, 0.05), 0 3px 6px rgba(14, 17, 22, 0.07), 0 22px 42px -10px rgba(14, 17, 22, 0.24)",
      "0 0 0 1px rgba(14, 17, 22, 0.04), 0 6px 12px rgba(14, 17, 22, 0.08), 0 40px 80px -18px rgba(14, 17, 22, 0.34)",
    ],
  },
  motion: {
    intensity: "balanced",
    easing: { enter: [0.22, 1, 0.36, 1], exit: [0.64, 0, 0.78, 0], emphasis: [0.34, 1.4, 0.64, 1] },
    spring: {
      soft: { damping: 26, stiffness: 100, mass: 1 },
      snappy: { damping: 20, stiffness: 180, mass: 0.9 },
      bouncy: { damping: 13, stiffness: 150, mass: 0.9 },
    },
    stagger_frames: 3,
    enter_frames: 22,
    exit_frames: 12,
  },
  camera: { allow_zoom: false, max_scale: 1.04, parallax: false },
};

/** Тех-неон: почти чёрный синий, циан и маджента, свечение вместо теней, резкое движение. */
const techNeon: StyleBible = {
  id: "tech-neon",
  name: "Tech Neon",
  palette: {
    bg: "#03050c",
    surface: "#0a1022",
    text: "#e6f3ff",
    muted: "#7487a8",
    accent: ["#00e5ff", "#ff2bd6", "#b6ff3b"],
    positive: "#b6ff3b",
    negative: "#ff4d6d",
  },
  typography: {
    display: { family: "JetBrains Mono", weight: 700 },
    body: { family: "Inter", weight: 500 },
    mono: { family: "JetBrains Mono", weight: 500 },
    scale: SCALE,
    tracking: { display: -0.04, body: 0, caps: 0.2, mono: 0.02 },
  },
  grid: { columns: 12, gutter: 28, safe_area: { x: 0.06, y: 0.08 } },
  surfaces: {
    radius: [2, 6, 10, 14],
    elevation: [
      "0 0 0 1px rgba(0, 229, 255, 0.16)",
      "0 0 0 1px rgba(0, 229, 255, 0.3), 0 0 22px -6px rgba(0, 229, 255, 0.35)",
      "0 0 0 1px rgba(0, 229, 255, 0.45), 0 0 40px -8px rgba(0, 229, 255, 0.5), 0 20px 40px -14px rgba(0, 0, 0, 0.9)",
      "0 0 0 1.5px rgba(0, 229, 255, 0.7), 0 0 72px -8px rgba(0, 229, 255, 0.6), 0 0 24px -6px rgba(255, 43, 214, 0.45), 0 32px 64px -16px rgba(0, 0, 0, 0.95)",
    ],
  },
  motion: {
    intensity: "energetic",
    easing: { enter: [0.12, 1, 0.24, 1], exit: [0.76, 0, 0.9, 0.2], emphasis: [0.5, 1.8, 0.5, 1] },
    spring: {
      soft: { damping: 18, stiffness: 140, mass: 0.8 },
      snappy: { damping: 14, stiffness: 240, mass: 0.6 },
      bouncy: { damping: 9, stiffness: 200, mass: 0.7 },
    },
    stagger_frames: 3,
    enter_frames: 16,
    exit_frames: 10,
  },
  camera: { allow_zoom: true, max_scale: 1.12, parallax: true },
};

export const presets: Record<PresetId, StyleBible> = {
  "dark-premium": darkPremium,
  "light-clean": lightClean,
  "tech-neon": techNeon,
};
