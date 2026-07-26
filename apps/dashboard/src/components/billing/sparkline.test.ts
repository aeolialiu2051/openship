import { describe, expect, it } from "vitest";
import { buildSparklineGeometry } from "./sparkline";

describe("buildSparklineGeometry", () => {
  it("maps values across the SVG width and height", () => {
    expect(buildSparklineGeometry([0, 10], 100, 40, 2)).toEqual({
      linePoints: "0.00,38.00 100.00,2.00",
      areaPoints: "0,40 0.00,38.00 100.00,2.00 100,40",
    });
  });

  it("centers a flat series and handles empty input", () => {
    expect(buildSparklineGeometry([4, 4], 100, 40, 2)?.linePoints).toBe(
      "0.00,20.00 100.00,20.00",
    );
    expect(buildSparklineGeometry([])).toBeNull();
  });
});
