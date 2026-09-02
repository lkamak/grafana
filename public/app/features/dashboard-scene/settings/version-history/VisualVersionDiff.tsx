import { css } from '@emotion/css';
import { useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type SceneTimeRangeLike } from '@grafana/scenes';
import { Alert, Badge, EmptyState, FilterPill, Stack, Text, useStyles2 } from '@grafana/ui';

import { DiffGroup } from './DiffGroup';
import { LazyRevisionPanelPreview } from './RevisionPanelPreview';
import {
  getVisualDashboardDiff,
  type VisualPanelChangeKind,
  type VisualPanelDiff,
} from './getVisualDashboardDiff';
import { jsonDiff } from './utils';

type VisualVersionDiffProps = {
  lhs: object;
  rhs: object;
  sharedTimeRange: SceneTimeRangeLike;
  hasMigratedToV2?: boolean;
};

const FILTERS: VisualPanelChangeKind[] = ['changed', 'added', 'removed', 'layout-only'];

export function VisualVersionDiff({ lhs, rhs, sharedTimeRange, hasMigratedToV2 }: VisualVersionDiffProps) {
  const visualDiff = useMemo(() => getVisualDashboardDiff(lhs, rhs), [lhs, rhs]);
  const [activeFilters, setActiveFilters] = useState<Set<VisualPanelChangeKind>>(
    () => new Set(['changed', 'added', 'removed'])
  );

  const filteredPanels = visualDiff.panels.filter((panel) => activeFilters.has(panel.kind));
  const counts = useMemo(() => countByKind(visualDiff.panels), [visualDiff.panels]);
  const dashboardDiff = useMemo(() => {
    if (!visualDiff.hasDashboardLevelChanges) {
      return null;
    }
    return jsonDiff(lhs, rhs);
  }, [lhs, rhs, visualDiff.hasDashboardLevelChanges]);

  const toggleFilter = (kind: VisualPanelChangeKind) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  return (
    <Stack direction="column" gap={2}>
      <Alert
        severity="info"
        title={t(
          'dashboard-scene.version-history.visual.live-preview-title',
          'Live preview uses current data sources'
        )}
      >
        <Trans i18nKey="dashboard-scene.version-history.visual.live-preview-body">
          Panel previews show how each version would render with the dashboard&apos;s current time range and data
          sources — not a historical snapshot of past query results.
        </Trans>
      </Alert>

      {hasMigratedToV2 && (
        <Alert
          title={t(
            'dashboard.save-dashboard-diff.title-because-dashboard-migrated-grafana-format',
            'The diff is hard to read because the dashboard has been migrated to the new Grafana dashboard format'
          )}
          severity="info"
        />
      )}

      <Stack gap={1} wrap="wrap" alignItems="center">
        <Text variant="bodySmall" color="secondary">
          <Trans i18nKey="dashboard-scene.version-history.visual.filter-label">Show:</Trans>
        </Text>
        {FILTERS.map((kind) => (
          <FilterPill
            key={kind}
            label={`${kindLabel(kind)} (${counts[kind]})`}
            selected={activeFilters.has(kind)}
            onClick={() => toggleFilter(kind)}
          />
        ))}
      </Stack>

      {filteredPanels.length === 0 ? (
        <EmptyState
          variant="not-found"
          message={
            visualDiff.panels.length === 0
              ? t(
                  'dashboard-scene.version-history.visual.empty-no-panel-changes',
                  'No panel changes between these versions'
                )
              : t(
                  'dashboard-scene.version-history.visual.empty-filtered',
                  'No panels match the selected filters'
                )
          }
        />
      ) : (
        <Stack direction="column" gap={2}>
          {filteredPanels.map((panel) => (
            <VisualPanelDiffRow
              key={`${panel.kind}-${panel.key}`}
              panel={panel}
              lhsDashboard={lhs}
              rhsDashboard={rhs}
              sharedTimeRange={sharedTimeRange}
            />
          ))}
        </Stack>
      )}

      {visualDiff.hasDashboardLevelChanges && dashboardDiff && (
        <Stack direction="column" gap={1}>
          <Text element="h4">
            <Trans i18nKey="dashboard-scene.version-history.visual.dashboard-level-heading">
              Dashboard-level changes
            </Trans>
          </Text>
          {Object.entries(dashboardDiff)
            .filter(([key]) => key !== 'panels' && key !== 'elements' && key !== 'layout')
            .map(([key, diffs]) => (
              <DiffGroup diffs={diffs} key={key} title={key} />
            ))}
        </Stack>
      )}
    </Stack>
  );
}

function VisualPanelDiffRow({
  panel,
  lhsDashboard,
  rhsDashboard,
  sharedTimeRange,
}: {
  panel: VisualPanelDiff;
  lhsDashboard: object;
  rhsDashboard: object;
  sharedTimeRange: SceneTimeRangeLike;
}) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.row} data-testid={`visual-diff-row-${panel.kind}-${panel.key}`}>
      <Stack justifyContent="space-between" alignItems="center" gap={1}>
        <Stack alignItems="center" gap={1}>
          <Badge text={kindLabel(panel.kind)} color={kindBadgeColor(panel.kind)} />
          <Text weight="medium">{panel.title || t('dashboard-scene.version-history.visual.untitled', 'Untitled panel')}</Text>
          {panel.type && (
            <Text variant="bodySmall" color="secondary">
              {panel.type}
            </Text>
          )}
        </Stack>
      </Stack>

      <div className={styles.pair}>
        <div className={styles.side}>
          <Text variant="bodySmall" color="secondary">
            <Trans i18nKey="dashboard-scene.version-history.visual.old-version-label">Previous version</Trans>
          </Text>
          {panel.lhs ? (
            <LazyRevisionPanelPreview
              snapshot={panel.lhs}
              sharedTimeRange={sharedTimeRange}
              sourceDashboard={lhsDashboard}
            />
          ) : (
            <div className={styles.missingSide} data-testid="visual-diff-missing-lhs">
              <Trans i18nKey="dashboard-scene.version-history.visual.panel-added">Panel added in newer version</Trans>
            </div>
          )}
        </div>
        <div className={styles.side}>
          <Text variant="bodySmall" color="secondary">
            <Trans i18nKey="dashboard-scene.version-history.visual.new-version-label">Newer version</Trans>
          </Text>
          {panel.rhs ? (
            <LazyRevisionPanelPreview
              snapshot={panel.rhs}
              sharedTimeRange={sharedTimeRange}
              sourceDashboard={rhsDashboard}
            />
          ) : (
            <div className={styles.missingSide} data-testid="visual-diff-missing-rhs">
              <Trans i18nKey="dashboard-scene.version-history.visual.panel-removed">Panel removed in newer version</Trans>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function countByKind(panels: VisualPanelDiff[]): Record<VisualPanelChangeKind, number> {
  return {
    changed: panels.filter((p) => p.kind === 'changed').length,
    added: panels.filter((p) => p.kind === 'added').length,
    removed: panels.filter((p) => p.kind === 'removed').length,
    'layout-only': panels.filter((p) => p.kind === 'layout-only').length,
  };
}

function kindLabel(kind: VisualPanelChangeKind): string {
  switch (kind) {
    case 'changed':
      return t('dashboard-scene.version-history.visual.filter-changed', 'Changed');
    case 'added':
      return t('dashboard-scene.version-history.visual.filter-added', 'Added');
    case 'removed':
      return t('dashboard-scene.version-history.visual.filter-removed', 'Removed');
    case 'layout-only':
      return t('dashboard-scene.version-history.visual.filter-layout-only', 'Layout only');
  }
}

function kindBadgeColor(kind: VisualPanelChangeKind): 'blue' | 'green' | 'orange' | 'purple' {
  switch (kind) {
    case 'changed':
      return 'blue';
    case 'added':
      return 'green';
    case 'removed':
      return 'orange';
    case 'layout-only':
      return 'purple';
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  row: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
  }),
  pair: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing(2),
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: '1fr',
    },
  }),
  side: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    minWidth: 0,
  }),
  missingSide: css({
    minHeight: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.text.secondary,
    background: theme.colors.background.canvas,
    border: `1px dashed ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(2),
    textAlign: 'center',
  }),
});
