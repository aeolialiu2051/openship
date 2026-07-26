export interface SparklineGeometry {
  linePoints: string;
  areaPoints: string;
}

/** Normalize arbitrary values into a small, responsive SVG coordinate space. */
export function buildSparklineGeometry(
  values: number[],
  width = 100,
  height = 40,
  padding = 2,
): SparklineGeometry | null {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const usableHeight = Math.max(0, height - padding * 2);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const normalized = range === 0 ? 0.5 : (value - min) / range;
    const y = height - padding - normalized * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return {
    linePoints: points.join(" "),
    areaPoints: `0,${height} ${points.join(" ")} ${width},${height}`,
  };
}
