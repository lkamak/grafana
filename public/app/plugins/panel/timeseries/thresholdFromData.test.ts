import { createDataFrame, FieldColorModeId, type FieldConfigSource, FieldType, ThresholdsMode } from '@grafana/data';
import { GraphGradientMode, GraphThresholdsStyleMode, VisibilityMode } from '@grafana/schema';

import {
  applySuggestedThreshold,
  collectNumericValues,
  computeP95FromFrames,
  countPointsAbove,
} from './thresholdFromData';

const series = [
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    ],
  }),
];

describe('thresholdFromData', () => {
  it('collects finite numeric values and skips time fields', () => {
    expect(collectNumericValues(series)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('computes p95 with Grafana ReducerID.p95', () => {
    // sorted length 10 → index = round(9 * 0.95) = 9 → value 10
    expect(computeP95FromFrames(series)).toBe(10);
  });

  it('returns undefined when there is no numeric data', () => {
    expect(computeP95FromFrames([])).toBeUndefined();
    expect(
      computeP95FromFrames([
        createDataFrame({
          fields: [{ name: 'time', type: FieldType.time, values: [1, 2, 3] }],
        }),
      ])
    ).toBeUndefined();
  });

  it('counts points strictly above the threshold', () => {
    expect(countPointsAbove(series, 8)).toEqual({ above: 2, total: 10 });
    expect(countPointsAbove(series, 10)).toEqual({ above: 0, total: 10 });
  });

  it('applies an absolute p95 threshold line without mutating the original config', () => {
    const fieldConfig: FieldConfigSource = {
      defaults: {
        color: { mode: FieldColorModeId.PaletteClassic },
        custom: { drawStyle: 'line' },
      },
      overrides: [],
    };

    const next = applySuggestedThreshold(fieldConfig, 8.5);

    expect(fieldConfig.defaults.thresholds).toBeUndefined();
    expect(next.defaults.thresholds).toEqual({
      mode: ThresholdsMode.Absolute,
      steps: [
        { value: -Infinity, color: 'green' },
        { value: 8.5, color: 'red' },
      ],
    });
    expect(next.defaults.color?.mode).toBe(FieldColorModeId.Thresholds);
    expect(next.defaults.custom.thresholdsStyle).toEqual({ mode: GraphThresholdsStyleMode.Line });
    expect(next.defaults.custom.gradientMode).toBe(GraphGradientMode.Scheme);
    expect(next.defaults.custom.showPoints).toBe(VisibilityMode.Always);
    expect(next.defaults.custom.drawStyle).toBe('line');
  });
});
