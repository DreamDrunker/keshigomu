const GB_TO_MB = 1024;
const GB_TO_TB = 1024;

export const formatSizeFromGb = (gb: number) =>
  !Number.isFinite(gb) || gb <= 0
    ? "0 MB"
    : gb < 1
      ? `${(gb * GB_TO_MB).toFixed(gb * GB_TO_MB < 10 ? 1 : 0)} MB`
      : gb < GB_TO_TB
        ? `${gb.toFixed(1)} GB`
        : `${(gb / GB_TO_TB).toFixed(1)} TB`;
