export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface QualitySettings {
  pixelRatio: number;
  shadows: boolean;
  cityBlocks: number;
  speedLineCount: number;
  shadowSize: number;
  particles: number;
  debris: number;
}

const qualitySettings: Record<QualityLevel, QualitySettings> = {
  LOW: { pixelRatio: .85, shadows: false, cityBlocks: 36, speedLineCount: 10, shadowSize:512,particles:100,debris:24 },
  MEDIUM: { pixelRatio: 1, shadows: true, cityBlocks: 48, speedLineCount: 20, shadowSize:1024,particles:200,debris:40 },
  HIGH: { pixelRatio: 1.25, shadows: true, cityBlocks: 60, speedLineCount: 28, shadowSize:2048,particles:300,debris:56 },
  ULTRA: { pixelRatio: 1.5, shadows: true, cityBlocks: 60, speedLineCount: 36, shadowSize:2048,particles:450,debris:72 },
};

export function chooseInitialQuality(): QualityLevel {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 4 || memory <= 4) return 'MEDIUM';
  return 'HIGH';
}

export function getQualitySettings(quality: QualityLevel): QualitySettings {
  return qualitySettings[quality];
}

export const QUALITY_ORDER: QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
