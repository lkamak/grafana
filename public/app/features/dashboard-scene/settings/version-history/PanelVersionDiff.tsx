import { css, cx } from '@emotion/css';
import { type CSSProperties, useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { Badge, Box, RadioButtonGroup, Stack, Text, useStyles2 } from '@grafana/ui';
import { GRID_COLUMN_COUNT } from 'app/core/constants';

import {
  type PanelChangeKind,
  type PanelGridPos,
  type PanelVersionDiffItem,
  type TabSelection,
  diffDashboardPanels,
  mergeDashboardTabGroups,
} from './panelVersionDiff';

type PanelVersionDiffProps = {
  lhs: object;
  rhs: object;
  baseVersion: number;
  newVersion: number;
};

type Side = 'base' | 'next';

const KIND_BADGE_COLOR: Record<PanelChangeKind, 'green' | 'red' | 'orange' | 'blue' | 'darkgrey'> = {
  added: 'green',
  removed: 'red',
  changed: 'orange',
  moved: 'blue',
  unchanged: 'darkgrey',
};

export function PanelVersionDiff({ lhs, rhs, baseVersion, newVersion }: PanelVersionDiffProps) {
  const styles = useStyles2(getStyles);
  const [selectedByGroup, setSelectedByGroup] = useState<TabSelection>({});
  const tabGroups = useMemo(() => mergeDashboardTabGroups(lhs, rhs, selectedByGroup), [lhs, rhs, selectedByGroup]);
  const items = useMemo(
    () => diffDashboardPanels(lhs, rhs, tabGroups ? selectedByGroup : undefined),
    [lhs, rhs, tabGroups, selectedByGroup]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId);

  if (items.length === 0 && !tabGroups) {
    return (
      <Text color="secondary">
        <Trans i18nKey="dashboard-scene.panel-version-diff.empty" defaults="No panels to compare in these versions." />
      </Text>
    );
  }

  return (
    <Stack direction="column" gap={2}>
      <Box>
        <Text element="h4">
          <Trans i18nKey="dashboard-scene.panel-version-diff.heading" defaults="Panel layout" />
        </Text>
        <Text color="secondary">
          <Trans
            i18nKey="dashboard-scene.panel-version-diff.description"
            defaults="Each panel is marked added, removed, changed, moved, or unchanged. Click a changed panel to see title, query, visualization, and threshold diffs."
          />
        </Text>
      </Box>

      {tabGroups && tabGroups.length > 0 && (
        <Stack direction="column" gap={1} data-testid={selectors.pages.Dashboard.Settings.Versions.tabPicker}>
          {tabGroups.map((group) => (
            <RadioButtonGroup
              key={group.id}
              options={group.tabs.map((tab) => ({ label: tab.title, value: tab.id }))}
              value={selectedByGroup[group.id] ?? group.tabs[0]?.id}
              onChange={(value) => {
                setSelectedByGroup((current) => ({ ...current, [group.id]: value }));
                setSelectedId(null);
              }}
            />
          ))}
        </Stack>
      )}

      <Stack gap={1}>
        {(['added', 'removed', 'changed', 'moved', 'unchanged'] as PanelChangeKind[]).map((kind) => (
          <Badge key={kind} color={KIND_BADGE_COLOR[kind]} text={kindLabel(kind)} />
        ))}
      </Stack>

      <Stack
        direction="row"
        gap={2}
        className={styles.compareRow}
        data-testid={selectors.pages.Dashboard.Settings.Versions.compareRow}
      >
        <VersionCanvas
          title={t('dashboard-scene.panel-version-diff.base-version', 'Version {{version}}', { version: baseVersion })}
          side="base"
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          styles={styles}
        />
        <VersionCanvas
          title={t('dashboard-scene.panel-version-diff.new-version', 'Version {{version}}', { version: newVersion })}
          side="next"
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          styles={styles}
        />
      </Stack>

      {selected && (
        <Box padding={2} backgroundColor="secondary" borderStyle="solid" borderColor="weak">
          <Text element="h5">{selected.next?.title || selected.base?.title || `Panel ${selected.id}`}</Text>
          {selected.kind === 'changed' || selected.changes.length > 0 ? (
            <dl className={styles.detailsList}>
              {selected.changes.map((change) => (
                <div key={change.field} className={styles.detailRow}>
                  <dt>{fieldLabel(change.field)}</dt>
                  <dd>
                    <span className={styles.before}>{change.before}</span>
                    {' → '}
                    <span className={styles.after}>{change.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Text color="secondary">
              {selected.kind === 'added' && (
                <Trans i18nKey="dashboard-scene.panel-version-diff.added-detail" defaults="This panel was added." />
              )}
              {selected.kind === 'removed' && (
                <Trans i18nKey="dashboard-scene.panel-version-diff.removed-detail" defaults="This panel was removed." />
              )}
              {selected.kind === 'unchanged' && (
                <Trans
                  i18nKey="dashboard-scene.panel-version-diff.unchanged-detail"
                  defaults="No title, query, visualization, threshold, or layout changes."
                />
              )}
              {selected.kind === 'moved' && selected.changes.length === 0 && (
                <Trans i18nKey="dashboard-scene.panel-version-diff.moved-detail" defaults="This panel was moved." />
              )}
            </Text>
          )}
        </Box>
      )}
    </Stack>
  );
}

type VersionCanvasProps = {
  title: string;
  side: Side;
  items: PanelVersionDiffItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  styles: ReturnType<typeof getStyles>;
};

function VersionCanvas({ title, side, items, selectedId, onSelect, styles }: VersionCanvasProps) {
  const tiles = useMemo(() => buildSideTiles(items, side), [items, side]);
  const canvasTestId =
    side === 'base'
      ? selectors.pages.Dashboard.Settings.Versions.baseCanvas
      : selectors.pages.Dashboard.Settings.Versions.newCanvas;

  return (
    <div className={styles.canvasColumn}>
      <Text weight="medium">{title}</Text>
      <div className={styles.grid} data-testid={canvasTestId}>
        {tiles.length === 0 && (
          <Text color="secondary" className={styles.emptyCanvas}>
            <Trans i18nKey="dashboard-scene.panel-version-diff.empty-canvas" defaults="No panels in this version." />
          </Text>
        )}
        {tiles.map((tile) => {
          const snapshot = tile.snapshot;
          const isSelected = selectedId === tile.item.id;
          const showDetails = tile.item.kind === 'changed' || tile.item.changes.length > 0;

          return (
            <button
              key={tile.key}
              type="button"
              className={cx(
                styles.tile,
                styles[tile.item.kind],
                isSelected && styles.selected,
                !showDetails && tile.item.kind !== 'added' && tile.item.kind !== 'removed' && styles.noClick
              )}
              style={gridStyle(tile.pos)}
              onClick={() => {
                if (showDetails || tile.item.kind === 'added' || tile.item.kind === 'removed') {
                  onSelect(tile.item.id);
                }
              }}
              data-testid={selectors.pages.Dashboard.Settings.Versions.panelTile(tile.item.id, side)}
              aria-pressed={isSelected}
            >
              <Badge color={KIND_BADGE_COLOR[tile.item.kind]} text={kindLabel(tile.item.kind)} />
              <span className={styles.tileTitle}>{snapshot?.title || `Panel ${tile.item.id}`}</span>
              {snapshot?.type && (
                <Text color="secondary" variant="bodySmall">
                  {snapshot.type}
                </Text>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SideTile = {
  key: string;
  item: PanelVersionDiffItem;
  pos: PanelGridPos;
  snapshot?: PanelVersionDiffItem['base'];
};

function buildSideTiles(items: PanelVersionDiffItem[], side: Side): SideTile[] {
  const tiles: SideTile[] = [];

  for (const item of items) {
    if (side === 'base') {
      if (item.kind === 'added') {
        continue;
      }
      if (item.base) {
        tiles.push({
          key: `base-${item.id}`,
          item,
          pos: item.base.gridPos,
          snapshot: item.base,
        });
      }
      continue;
    }

    if (item.kind === 'removed') {
      continue;
    }
    if (item.next) {
      tiles.push({
        key: `next-${item.id}`,
        item,
        pos: item.next.gridPos,
        snapshot: item.next,
      });
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
  compareRow: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing(2),
    width: '100%',
  }),
  canvasColumn: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minWidth: 0,
  }),
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
    position: 'relative',
  }),
  emptyCanvas: css({
    gridColumn: `1 / span ${GRID_COLUMN_COUNT}`,
    padding: theme.spacing(2),
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
  noClick: css({
    cursor: 'default',
  }),
  tileTitle: css({
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  }),
  selected: css({
    boxShadow: `0 0 0 1px ${theme.colors.primary.border}`,
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
