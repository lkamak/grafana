import { css } from '@emotion/css';
import { type PointerEvent, useCallback, useRef } from 'react';

import { type AbsoluteTimeRange, dateTime, type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t, Trans } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';

import { clampRangeToView, overlayOffsets } from './incidentRange';
import { useIncidentWorkspace } from './IncidentWorkspaceContext';

interface Props {
  viewRange: AbsoluteTimeRange;
}

type DragTarget = 'from' | 'to' | 'range';

export function IncidentHighlight({ viewRange }: Props) {
  const styles = useStyles2(getStyles);
  const { active, range, setRange } = useIncidentWorkspace();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ target: DragTarget; startX: number; origin: AbsoluteTimeRange } | null>(null);

  const applyPointer = useCallback(
    (clientX: number, target: DragTarget, origin: AbsoluteTimeRange) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const rect = track.getBoundingClientRect();
      const span = viewRange.to - viewRange.from;
      if (rect.width <= 0 || span <= 0) {
        return;
      }
      const next = posToRange(clientX, rect, viewRange, target, origin, dragRef.current?.startX ?? clientX);
      setRange(clampRangeToView(next, viewRange));
    },
    [setRange, viewRange]
  );

  const onPointerDown = (event: PointerEvent<HTMLElement>, target: DragTarget) => {
    if (!range) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { target, startX: event.clientX, origin: range };
    applyPointer(event.clientX, target, range);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    applyPointer(event.clientX, drag.target, drag.origin);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!active || !range) {
    return null;
  }

  const offsets = overlayOffsets(range, viewRange);
  const fromLabel = dateTime(range.from).toISOString();
  const toLabel = dateTime(range.to).toISOString();

  return (
    <div className={styles.wrap} data-testid={selectors.pages.Explore.General.incidentWorkspace}>
      <div className={styles.header}>
        <span>
          <Trans i18nKey="explore.incident-workspace.range-label">Incident range</Trans>
        </span>
        <span className={styles.times}>
          {fromLabel} → {toLabel}
        </span>
      </div>
      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={(event) => onPointerDown(event, nearestHandle(event, trackRef.current, range, viewRange))}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={styles.selected} style={{ left: `${offsets.left}%`, width: `${offsets.width}%` }}>
          <button
            type="button"
            className={styles.handle}
            style={{ left: 0 }}
            aria-label={t('explore.incident-workspace.start-handle', 'Incident range start')}
            aria-valuemin={viewRange.from}
            aria-valuemax={viewRange.to}
            aria-valuenow={range.from}
            role="slider"
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown(event, 'from');
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <button
            type="button"
            className={styles.handle}
            style={{ left: '100%' }}
            aria-label={t('explore.incident-workspace.end-handle', 'Incident range end')}
            aria-valuemin={viewRange.from}
            aria-valuemax={viewRange.to}
            aria-valuenow={range.to}
            role="slider"
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown(event, 'to');
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      </div>
      <div className={styles.band} style={{ left: `${offsets.left}%`, width: `${offsets.width}%` }} aria-hidden />
    </div>
  );
}

function nearestHandle(
  event: PointerEvent<HTMLElement>,
  track: HTMLDivElement | null,
  range: AbsoluteTimeRange,
  view: AbsoluteTimeRange
): DragTarget {
  if (!track) {
    return 'range';
  }
  const rect = track.getBoundingClientRect();
  const span = view.to - view.from;
  const at = view.from + ((event.clientX - rect.left) / rect.width) * span;
  return Math.abs(at - range.from) <= Math.abs(at - range.to) ? 'from' : 'to';
}

function posToRange(
  clientX: number,
  rect: DOMRect,
  view: AbsoluteTimeRange,
  target: DragTarget,
  origin: AbsoluteTimeRange,
  startX: number
): AbsoluteTimeRange {
  const span = view.to - view.from;
  const value = view.from + ((clientX - rect.left) / rect.width) * span;

  if (target === 'from') {
    return { from: Math.min(value, origin.to), to: origin.to };
  }
  if (target === 'to') {
    return { from: origin.from, to: Math.max(value, origin.from) };
  }

  const delta = ((clientX - startX) / rect.width) * span;
  return { from: origin.from + delta, to: origin.to + delta };
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrap: css({
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(1),
  }),
  header: css({
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  times: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  track: css({
    position: 'relative',
    height: 16,
    borderRadius: theme.shape.radius.pill,
    background: theme.colors.background.secondary,
    cursor: 'pointer',
    touchAction: 'none',
  }),
  selected: css({
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: theme.colors.warning.transparent,
    border: `1px solid ${theme.colors.warning.border}`,
    borderRadius: theme.shape.radius.pill,
  }),
  handle: css({
    position: 'absolute',
    top: -4,
    width: 12,
    height: 24,
    padding: 0,
    border: `1px solid ${theme.colors.warning.border}`,
    borderRadius: theme.shape.radius.pill,
    background: theme.colors.warning.main,
    cursor: 'ew-resize',
    transform: 'translateX(-50%)',
    touchAction: 'none',
  }),
  band: css({
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: theme.colors.warning.transparent,
    borderLeft: `2px solid ${theme.colors.warning.border}`,
    borderRight: `2px solid ${theme.colors.warning.border}`,
    pointerEvents: 'none',
    zIndex: 0,
  }),
});
