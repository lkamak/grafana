import { css } from '@emotion/css';
import { useEffect, useMemo, useRef, useState } from 'react';

import { type GrafanaTheme2, rangeUtil } from '@grafana/data';
import { t } from '@grafana/i18n';
import { sceneGraph, type SceneTimeRangeLike } from '@grafana/scenes';
import { useStyles2 } from '@grafana/ui';

import { type DashboardScene } from '../../scene/DashboardScene';

import { buildRevisionPanelPreviewScene, type PreviewTimeRange } from './buildRevisionPanelPreviewScene';
import { type VisualPanelSnapshot } from './getVisualDashboardDiff';

type RevisionPanelPreviewProps = {
  snapshot: VisualPanelSnapshot;
  sharedTimeRange: SceneTimeRangeLike;
  sourceDashboard?: object;
  /** When false, renders an empty placeholder (used for lazy mount). */
  active?: boolean;
};

/**
 * Renders a live panel preview for one side of a version compare row.
 * Instantiates a one-panel embedded scene from the revision snapshot (not EmbeddedDashboard).
 */
export function RevisionPanelPreview({
  snapshot,
  sharedTimeRange,
  sourceDashboard,
  active = true,
}: RevisionPanelPreviewProps) {
  const styles = useStyles2(getStyles);

  if (!active) {
    return <div className={styles.placeholder} aria-hidden />;
  }

  return (
    <RevisionPanelPreviewActive
      snapshot={snapshot}
      sharedTimeRange={sharedTimeRange}
      sourceDashboard={sourceDashboard}
    />
  );
}

function RevisionPanelPreviewActive({
  snapshot,
  sharedTimeRange,
  sourceDashboard,
}: Omit<RevisionPanelPreviewProps, 'active'>) {
  const styles = useStyles2(getStyles);
  const timeRangeValues = useSharedTimeRangeValues(sharedTimeRange);

  const scene = useMemo(() => {
    try {
      return buildRevisionPanelPreviewScene(snapshot, timeRangeValues, { sourceDashboard });
    } catch (error) {
      console.error('Failed to build revision panel preview scene', error);
      return null;
    }
    // Rebuild only when the panel snapshot identity changes; time sync happens via effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  useEffect(() => {
    if (!scene) {
      return;
    }
    // Activate only the preview time range. Activating the DashboardScene would
    // overwrite getDashboardSrv() current and global scene context.
    return sceneGraph.getTimeRange(scene).activate();
  }, [scene]);

  useEffect(() => {
    if (!scene) {
      return;
    }
    const previewTimeRange = sceneGraph.getTimeRange(scene);
    if (previewTimeRange.state.timeZone !== timeRangeValues.timeZone) {
      previewTimeRange.onTimeZoneChange(timeRangeValues.timeZone);
    }
    previewTimeRange.onTimeRangeChange(
      rangeUtil.convertRawToRange({ from: timeRangeValues.from, to: timeRangeValues.to }, timeRangeValues.timeZone)
    );
  }, [scene, timeRangeValues.from, timeRangeValues.to, timeRangeValues.timeZone]);

  if (!scene) {
    return (
      <div className={styles.error}>
        {t('dashboard-scene.version-history.visual.preview-error', 'Unable to render panel preview')}
      </div>
    );
  }

  return <DashboardSceneBody scene={scene} />;
}

function DashboardSceneBody({ scene }: { scene: DashboardScene }) {
  const styles = useStyles2(getStyles);
  const { body } = scene.useState();

  return (
    <div className={styles.canvas} data-testid="revision-panel-preview">
      <body.Component model={body} />
    </div>
  );
}

function useSharedTimeRangeValues(sharedTimeRange: SceneTimeRangeLike): PreviewTimeRange {
  const [values, setValues] = useState<PreviewTimeRange>(() => ({
    from: sharedTimeRange.state.from,
    to: sharedTimeRange.state.to,
    timeZone: sharedTimeRange.state.timeZone,
  }));

  useEffect(() => {
    setValues({
      from: sharedTimeRange.state.from,
      to: sharedTimeRange.state.to,
      timeZone: sharedTimeRange.state.timeZone,
    });
    const sub = sharedTimeRange.subscribeToState((state) => {
      setValues({
        from: state.from,
        to: state.to,
        timeZone: state.timeZone,
      });
    });
    return () => sub.unsubscribe();
  }, [sharedTimeRange]);

  return values;
}

type LazyRevisionPanelPreviewProps = RevisionPanelPreviewProps & {
  /** Root margin for intersection observer (default 120px). */
  rootMargin?: string;
};

/**
 * Defers mounting the panel preview until the row scrolls near the viewport,
 * so large dashboards do not fire 2N queries on open.
 */
export function LazyRevisionPanelPreview({ rootMargin = '120px', ...props }: LazyRevisionPanelPreviewProps) {
  const styles = useStyles2(getStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (!window.IntersectionObserver) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={containerRef} className={styles.lazyHost}>
      <RevisionPanelPreview {...props} active={isVisible} />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  canvas: css({
    width: '100%',
    minHeight: 220,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    overflow: 'hidden',
    background: theme.colors.background.primary,
  }),
  placeholder: css({
    width: '100%',
    minHeight: 220,
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
  }),
  lazyHost: css({
    width: '100%',
    minHeight: 220,
  }),
  error: css({
    minHeight: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.text.secondary,
    border: `1px dashed ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(2),
  }),
});
