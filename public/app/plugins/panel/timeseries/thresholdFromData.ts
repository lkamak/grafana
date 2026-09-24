import {
  type DataFrame,
  type Field,
  FieldColorModeId,
  type FieldConfigSource,
  FieldType,
  reduceField,
  ReducerID,
  ThresholdsMode,
} from '@grafana/data';
import { GraphGradientMode, GraphThresholdsStyleMode, VisibilityMode } from '@grafana/schema';

export interface ThresholdFromDataInstanceState {
  applyFieldConfig: (config: FieldConfigSource) => void;
  fieldConfig: FieldConfigSource;
}

export function collectNumericValues(frames: DataFrame[]): number[] {
  const values: number[] = [];

  for (const frame of frames) {
    for (const field of frame.fields) {
      if (field.type !== FieldType.number) {
        continue;
      }

      for (const value of field.values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          values.push(value);
        }
      }
    }
  }

  return values;
}

/** p95 of all numeric points in the current query result (Grafana `ReducerID.p95`). */
export function computeP95FromFrames(frames: DataFrame[]): number | undefined {
  const values = collectNumericValues(frames);
  if (values.length === 0) {
    return undefined;
  }

  const field: Field = {
    name: 'threshold-from-data',
    type: FieldType.number,
    config: {},
    values,
  };

  const calcs = reduceField({ field, reducers: [ReducerID.p95] });
  const p95 = calcs[ReducerID.p95];
  return typeof p95 === 'number' && Number.isFinite(p95) ? p95 : undefined;
}

export function countPointsAbove(frames: DataFrame[], threshold: number): { above: number; total: number } {
  const values = collectNumericValues(frames);
  return {
    total: values.length,
    above: values.filter((value) => value > threshold).length,
  };
}

export function applySuggestedThreshold(fieldConfig: FieldConfigSource, threshold: number): FieldConfigSource {
  return {
    ...fieldConfig,
    defaults: {
      ...fieldConfig.defaults,
      thresholds: {
        mode: ThresholdsMode.Absolute,
        steps: [
          { value: -Infinity, color: 'green' },
          { value: threshold, color: 'red' },
        ],
      },
      color: {
        ...fieldConfig.defaults?.color,
        mode: FieldColorModeId.Thresholds,
      },
      custom: {
        ...fieldConfig.defaults?.custom,
        thresholdsStyle: { mode: GraphThresholdsStyleMode.Line },
        gradientMode: GraphGradientMode.Scheme,
        showPoints: VisibilityMode.Always,
      },
    },
  };
}
