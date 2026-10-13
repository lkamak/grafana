import { type AbsoluteTimeRange } from '@grafana/data';

export function defaultIncidentRange(view: AbsoluteTimeRange): AbsoluteTimeRange {
  const span = Math.max(view.to - view.from, 1);
  return {
    from: view.from + span * 0.25,
    to: view.from + span * 0.75,
  };
}

export function clampRangeToView(range: AbsoluteTimeRange, view: AbsoluteTimeRange): AbsoluteTimeRange {
  const from = Math.min(Math.max(range.from, view.from), view.to);
  const to = Math.max(Math.min(range.to, view.to), view.from);
  if (to <= from) {
    return defaultIncidentRange(view);
  }
  return { from, to };
}

export function overlayOffsets(range: AbsoluteTimeRange, view: AbsoluteTimeRange): { left: number; width: number } {
  const span = view.to - view.from;
  if (span <= 0) {
    return { left: 0, width: 0 };
  }
  const clamped = clampRangeToView(range, view);
  return {
    left: ((clamped.from - view.from) / span) * 100,
    width: ((clamped.to - clamped.from) / span) * 100,
  };
}
