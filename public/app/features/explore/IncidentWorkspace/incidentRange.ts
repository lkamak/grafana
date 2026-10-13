import { type AbsoluteTimeRange } from '@grafana/data';

export type IncidentDragTarget = 'from' | 'to' | 'range';

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
  if (to > from) {
    return { from, to };
  }
  // A handle drag stops when it meets the other handle, so an empty span can still
  // sit inside the view. Only a range that misses the view should fall back to the default band.
  const collapsedInsideView = from === to && range.from <= view.to && range.to >= view.from;
  if (collapsedInsideView) {
    return { from, to };
  }
  return defaultIncidentRange(view);
}

export function rangeFromTrackPointer(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  view: AbsoluteTimeRange,
  target: IncidentDragTarget,
  origin: AbsoluteTimeRange,
  startX: number
): AbsoluteTimeRange {
  const span = view.to - view.from;
  if (trackWidth <= 0 || span <= 0 || !Number.isFinite(clientX)) {
    return origin;
  }

  const value = view.from + ((clientX - trackLeft) / trackWidth) * span;
  if (!Number.isFinite(value)) {
    return origin;
  }

  if (target === 'from') {
    return { from: Math.min(value, origin.to), to: origin.to };
  }
  if (target === 'to') {
    return { from: origin.from, to: Math.max(value, origin.from) };
  }

  const delta = ((clientX - startX) / trackWidth) * span;
  if (!Number.isFinite(delta)) {
    return origin;
  }
  return { from: origin.from + delta, to: origin.to + delta };
}

export function overlayOffsets(
  range: AbsoluteTimeRange,
  view: AbsoluteTimeRange
): { left: number; width: number } | null {
  const span = view.to - view.from;
  if (span <= 0 || range.to < view.from || range.from > view.to) {
    return null;
  }
  const from = Math.max(range.from, view.from);
  const to = Math.min(range.to, view.to);
  return {
    left: ((from - view.from) / span) * 100,
    width: (Math.max(to - from, 0) / span) * 100,
  };
}
