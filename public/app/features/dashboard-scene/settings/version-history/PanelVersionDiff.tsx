import { css, cx } from '@emotion/css';
import { type CSSProperties, useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Badge, Box, Stack, Text, useStyles2 } from '@grafana/ui';
import { GRID_COLUMN_COUNT } from 'app/core/constants';

import {
  type PanelChangeKind,
  type PanelGridPos,
  type PanelVersionDiffItem,
  diffDashboardPanels,
} from './panelVersionDiff';

type PanelVersionDiffProps = {
  lhs: object;
  rhs: object;
};

type Tile = {
  key: string;
  item: PanelVersionDiffItem;
  pos: PanelGridPos;
  variant: 'current' | 'ghost';
};

const KIND_BADGE_COLOR: Record<PanelChangeKind, 'green' | 'red' | 'orange' | 'blue' | 'darkgrey'> = {
  added: 'green',
  removed: 'red',
  changed: 'orange',
  moved: 'blue',
  unchanged: 'darkgrey',
};

export function PanelVersionDiff({ lhs, rhs }: PanelVersionDiffProps) {
  const styles = useStyles2(getStyles);
  const items = useMemo(() => diffDashboardPanels(lhs, rhs), [lhs, rhs]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId);
  const tiles = useMemo(() => buildTiles(items), [items]);

  if (items.length === 0) {
    return (
      <Text color="secondary">
        <Trans i18nKey="dashboard-scene.panel-version-diff.no-panels">No panels to compare in these versions.</Trans>
      </Text>
    );
  }

  return (
    <Stack direction="column" gap={2}>
      <div>
        <Text element="h4">
          <Trans i18nKey="dashboard-scene.panel-version-diff.title">Panel layout</Trans>
        </Text>
        <Text color="secondary" variant="bodySmall">
          <Trans i18nKey="dashboard-scene.panel-version-diff.subtitle">
            Each panel is marked added, removed, changed, moved, or unchanged. Click a changed panel to see title,
            query, visualization, and threshold diffs.
          </Trans>
        </Text>
      </div>

      <Stack gap={1} wrap="wrap">
        {(['added', 'removed', 'changed', 'moved', 'unchanged'] as PanelChangeKind[]).map((kind) => (
          <Badge key={kind} color={KIND_BADGE_COLOR[kind]} text={kindLabel(kind)} />
        ))}
      </Stack>

      <div className={styles.grid} data-testid="panel-version-diff">
        {tiles.map((tile) => {
          const snapshot = tile.variant === 'ghost' ? tile.item.base : (tile.item.next ?? tile.item.base);
          const isSelected = selectedId === tile.item.id;
          return (
            <button
              key={tile.key}
              type="button"
              className={cx(
                styles.tile,
                styles[tile.item.kind],
                tile.variant === 'ghost' && styles.ghost,
                isSelected && styles.selected
              )}
              style={gridStyle(tile.pos)}
              onClick={() => setSelectedId(tile.item.id)}
              data-testid={
                tile.variant === 'ghost'
                  ? `panel-version-diff-ghost-${tile.item.id}`
                  : `panel-version-diff-tile-${tile.item.id}`
              }
              aria-pressed={isSelected}
            >
              <span className={styles.tileTitle}>{snapshot?.title || `Panel ${tile.item.id}`}</span>
              <Badge color={KIND_BADGE_COLOR[tile.item.kind]} text={kindLabel(tile.item.kind)} />
            </button>
          );
        })}
      </div>

      {selected && (
        <Box borderColor="strong" borderStyle="solid" padding={2} data-testid="panel-version-diff-details">
          <Stack direction="column" gap={1}>
            <Stack alignItems="center" gap={1}>
              <Text element="h5">{selected.next?.title || selected.base?.title || `Panel ${selected.id}`}</Text>
              <Badge color={KIND_BADGE_COLOR[selected.kind]} text={kindLabel(selected.kind)} />
            </Stack>
            {selected.kind === 'changed' || selected.changes.length > 0 ? (
              <dl className={styles.detailsList}>
                {selected.changes.map((change) => (
                  <div key={change.field} className={styles.detailRow}>
                    <dt>{fieldLabel(change.field)}</dt>
                    <dd>
                      <span className={styles.before}>{change.before}</span>
                      <span aria-hidden="true"> → </span>
                      <span className={styles.after}>{change.after}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Text color="secondary">
                {selected.kind === 'added' && (
                  <Trans i18nKey="dashboard-scene.panel-version-diff.added-detail">This panel was added.</Trans>
                )}
                {selected.kind === 'removed' && (
                  <Trans i18nKey="dashboard-scene.panel-version-diff.removed-detail">This panel was removed.</Trans>
                )}
                {selected.kind === 'unchanged' && (
                  <Trans i18nKey="dashboard-scene.panel-version-diff.unchanged-detail">
                    No title, query, visualization, threshold, or layout changes.
                  </Trans>
                )}
              </Text>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

function buildTiles(items: PanelVersionDiffItem[]): Tile[] {
  const tiles: Tile[] = [];

  for (const item of items) {
    const moved = item.kind === 'moved' || item.changes.some((change) => change.field === 'layout');

    if (item.kind === 'removed' && item.base) {
      tiles.push({ key: `removed-${item.id}`, item, pos: item.base.gridPos, variant: 'current' });
      continue;
    }

    if (moved && item.base) {
      tiles.push({ key: `ghost-${item.id}`, item, pos: item.base.gridPos, variant: 'ghost' });
    }

    if (item.next) {
      tiles.push({ key: `next-${item.id}`, item, pos: item.next.gridPos, variant: 'current' });
    }
  }

  return tiles;
}

function gridStyle(pos: PanelGridPos): CSSProperties {
  return {
    gridColumn: `${pos.x + 1} / span ${Math.max(pos.w, 1)}`,
    gridRow: `${pos.y + 1} / span ${Math.max(pos.h, 1)}`,
  };
}

function kindLabel(kind: PanelChangeKind): string {
  switch (kind) {
    case 'added':
      return t('dashboard-scene.panel-version-diff.kind-added', 'added');
    case 'removed':
      return t('dashboard-scene.panel-version-diff.kind-removed', 'removed');
    case 'changed':
      return t('dashboard-scene.panel-version-diff.kind-changed', 'changed');
    case 'moved':
      return t('dashboard-scene.panel-version-diff.kind-moved', 'moved');
    case 'unchanged':
      return t('dashboard-scene.panel-version-diff.kind-unchanged', 'unchanged');
  }
}

function fieldLabel(field: PanelVersionDiffItem['changes'][number]['field']): string {
  switch (field) {
    case 'title':
      return t('dashboard-scene.panel-version-diff.field-title', 'Title');
    case 'query':
      return t('dashboard-scene.panel-version-diff.field-query', 'Query');
    case 'viz type':
      return t('dashboard-scene.panel-version-diff.field-viz-type', 'Visualization');
    case 'thresholds':
      return t('dashboard-scene.panel-version-diff.field-thresholds', 'Thresholds');
    case 'layout':
      return t('dashboard-scene.panel-version-diff.field-layout', 'Layout');
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  grid: css({
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLUMN_COUNT}, minmax(0, 1fr))`,
    gridAutoRows: theme.spacing(2),
    width: '100%',
    minHeight: theme.spacing(16),
    padding: theme.spacing(1),
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    overflow: 'auto',
    maxHeight: 480,
  }),
  tile: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(0.5),
    margin: 1,
    padding: theme.spacing(0.5, 1),
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.primary,
    color: theme.colors.text.primary,
    textAlign: 'left',
    cursor: 'pointer',
    overflow: 'hidden',
    minWidth: 0,
  }),
  tileTitle: css({
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  }),
  ghost: css({
    opacity: 0.45,
    borderStyle: 'dashed',
  }),
  selected: css({
    boxShadow: `0 0 0 1px ${theme.colors.primary.border}`,
    zIndex: 1,
  }),
  added: css({
    borderColor: theme.colors.success.border,
    background: theme.colors.success.transparent,
  }),
  removed: css({
    borderColor: theme.colors.error.border,
    background: theme.colors.error.transparent,
  }),
  changed: css({
    borderColor: theme.colors.warning.border,
    background: theme.colors.warning.transparent,
  }),
  moved: css({
    borderColor: theme.colors.info.border,
    background: theme.colors.info.transparent,
  }),
  unchanged: css({
    borderColor: theme.colors.border.medium,
  }),
  detailsList: css({
    margin: 0,
  }),
  detailRow: css({
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    fontSize: theme.typography.bodySmall.fontSize,
    dt: {
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.colors.text.secondary,
    },
    dd: {
      margin: 0,
      minWidth: 0,
      overflowWrap: 'anywhere',
    },
  }),
  before: css({
    color: theme.colors.error.text,
  }),
  after: css({
    color: theme.colors.success.text,
  }),
});
