import { css } from '@emotion/css';
import { useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Badge, Drawer, Icon, RadioButtonGroup, Stack, Text, useStyles2 } from '@grafana/ui';
import { selectors } from '@grafana/e2e-selectors';

import {
  computeVisualPanelVersionDiff,
  getDefaultTabId,
  type GridPos,
  type PanelDiffEntry,
  type PanelDiffStatus,
  type PanelFieldChange,
} from './panelVersionDiff';

const GRID_COLUMNS = 24;

type VisualDashboardDiffProps = {
  baseData: object;
  newData: object;
};

export function VisualDashboardDiff({ baseData, newData }: VisualDashboardDiffProps) {
  const diff = useMemo(() => computeVisualPanelVersionDiff(baseData, newData), [baseData, newData]);
  const [selectedTabId, setSelectedTabId] = useState(() => getDefaultTabId(diff));
  const [selectedPanel, setSelectedPanel] = useState<PanelDiffEntry | null>(null);
  const styles = useStyles2(getStyles);

  const activeTab = diff.tabs.find((tab) => tab.tabId === selectedTabId) ?? diff.tabs[0];
  const tabOptions = diff.tabs.map((tab) => ({
    label: tab.tabTitle || t('dashboard-scene.version-history-visual.default-tab', 'Dashboard'),
    value: tab.tabId,
  }));

  if (!activeTab || activeTab.panels.length === 0) {
    return (
      <Text variant="bodySmall" color="secondary">
        <Trans i18nKey="dashboard-scene.version-history-visual.no-panels">
          No panels to compare in this dashboard version pair.
        </Trans>
      </Text>
    );
  }

  const { stacks, flowing } = groupGridTiles(activeTab.panels);

  return (
    <Stack direction="column" gap={2}>
      <Stack alignItems="center" justifyContent="space-between" wrap="wrap">
        <Text variant="h5">
          <Trans i18nKey="dashboard-scene.version-history-visual.title">Visual panel diff</Trans>
        </Text>
        <Stack gap={2} wrap="wrap">
          <LegendItem status="added" />
          <LegendItem status="removed" />
          <LegendItem status="changed" />
          <LegendItem status="moved" />
          <LegendItem status="unchanged" />
        </Stack>
      </Stack>

      {diff.hasTabs && tabOptions.length > 1 && (
        <RadioButtonGroup
          options={tabOptions}
          value={selectedTabId}
          onChange={(value) => setSelectedTabId(String(value))}
        />
      )}

      <div className={styles.canvas} data-testid={selectors.pages.Dashboard.Settings.VersionHistory.visualDiffCanvas}>
        {activeTab.panels.map((entry) => {
          const movedPosition = entry.fieldChanges.some((change) => change.field === 'position');
          const ghostPos =
            (entry.status === 'moved' || (entry.status === 'changed' && movedPosition)) && entry.base?.gridPos
              ? entry.base.gridPos
              : undefined;
          if (ghostPos) {
            return <PanelGhostTile key={`ghost-${entry.id}`} gridPos={ghostPos} styles={styles} />;
          }
          return null;
        })}
        {stacks.map(({ gridPos, entries }) => {
          if (entries.length === 1) {
            return (
              <PanelDiffTile
                key={String(entries[0].id)}
                entry={entries[0]}
                styles={styles}
                onSelect={() => setSelectedPanel(entries[0])}
              />
            );
          }

          return (
            <div
              key={`stack-${gridPos.x}-${gridPos.y}-${gridPos.w}-${gridPos.h}`}
              className={styles.tileStack}
              style={{
                gridColumn: `${gridPos.x + 1} / span ${gridPos.w}`,
                gridRow: `${gridPos.y + 1} / span ${gridPos.h}`,
              }}
            >
              {entries.map((entry) => (
                <PanelDiffTile
                  key={String(entry.id)}
                  entry={entry}
                  styles={styles}
                  stacked
                  onSelect={() => setSelectedPanel(entry)}
                />
              ))}
            </div>
          );
        })}
        {flowing.map((entry) => (
          <PanelDiffTile
            key={String(entry.id)}
            entry={entry}
            styles={styles}
            onSelect={() => setSelectedPanel(entry)}
          />
        ))}
      </div>

      {selectedPanel && <PanelDetailDrawer entry={selectedPanel} onClose={() => setSelectedPanel(null)} />}
    </Stack>
  );
}

function LegendItem({ status }: { status: PanelDiffStatus }) {
  const styles = useStyles2(getLegendStyles);
  return (
    <Stack gap={0.5} alignItems="center">
      <Icon type="mono" name="circle" className={styles[status]} size="xs" />
      <Text variant="bodySmall">{statusLabel(status)}</Text>
    </Stack>
  );
}

function statusLabel(status: PanelDiffStatus): string {
  switch (status) {
    case 'added':
      return t('dashboard-scene.version-history-visual.status-added', 'Added');
    case 'removed':
      return t('dashboard-scene.version-history-visual.status-removed', 'Removed');
    case 'changed':
      return t('dashboard-scene.version-history-visual.status-changed', 'Changed');
    case 'moved':
      return t('dashboard-scene.version-history-visual.status-moved', 'Moved');
    default:
      return t('dashboard-scene.version-history-visual.status-unchanged', 'Unchanged');
  }
}

function gridPosKey(pos: GridPos): string {
  return `${pos.x}:${pos.y}:${pos.w}:${pos.h}`;
}

function groupGridTiles(panels: PanelDiffEntry[]) {
  const stacks = new Map<string, { gridPos: GridPos; entries: PanelDiffEntry[] }>();
  const flowing: PanelDiffEntry[] = [];

  for (const entry of panels) {
    const panel = entry.current ?? entry.base;
    const gridPos = entry.current?.gridPos ?? entry.base?.gridPos;
    if (panel?.autoGridIndex !== undefined || !gridPos) {
      flowing.push(entry);
      continue;
    }
    const key = gridPosKey(gridPos);
    const stack = stacks.get(key);
    if (stack) {
      stack.entries.push(entry);
    } else {
      stacks.set(key, { gridPos, entries: [entry] });
    }
  }

  return { stacks: [...stacks.values()], flowing };
}

function PanelGhostTile({ gridPos, styles }: { gridPos: GridPos; styles: ReturnType<typeof getStyles> }) {
  return (
    <div
      className={styles.ghostTile}
      style={{
        gridColumn: `${gridPos.x + 1} / span ${gridPos.w}`,
        gridRow: `${gridPos.y + 1} / span ${gridPos.h}`,
      }}
      aria-hidden
    />
  );
}

function PanelDiffTile({
  entry,
  styles,
  onSelect,
  stacked,
}: {
  entry: PanelDiffEntry;
  styles: ReturnType<typeof getStyles>;
  onSelect: () => void;
  stacked?: boolean;
}) {
  const panel = entry.current ?? entry.base;
  const autoIndex = panel?.autoGridIndex;
  const gridPos = entry.current?.gridPos ?? entry.base?.gridPos;

  if (stacked || autoIndex !== undefined || !gridPos) {
    return (
      <button
        type="button"
        className={stacked ? styles.stackedTile(entry.status) : styles.autoTile(entry.status)}
        onClick={onSelect}
        data-testid={selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(String(entry.id))}
      >
        <PanelTileContent entry={entry} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.tile(entry.status)}
      style={{
        gridColumn: `${gridPos.x + 1} / span ${gridPos.w}`,
        gridRow: `${gridPos.y + 1} / span ${gridPos.h}`,
      }}
      onClick={onSelect}
      data-testid={selectors.pages.Dashboard.Settings.VersionHistory.visualDiffPanel(String(entry.id))}
    >
      <PanelTileContent entry={entry} />
    </button>
  );
}

function PanelTileContent({ entry }: { entry: PanelDiffEntry }) {
  const title = entry.title || t('dashboard-scene.version-history-visual.untitled-panel', 'Untitled panel');
  return (
    <Stack direction="column" gap={0.5} height="100%">
      <Stack justifyContent="space-between" alignItems="flex-start">
        <Text variant="bodySmall" weight="medium">
          {title}
        </Text>
        <Badge text={statusLabel(entry.status)} color={badgeColor(entry.status)} />
      </Stack>
      {entry.current?.vizType && (
        <Text variant="bodySmall" color="secondary">
          {entry.current.vizType}
        </Text>
      )}
    </Stack>
  );
}

function badgeColor(status: PanelDiffStatus): 'green' | 'red' | 'orange' | 'blue' | 'dark-grey' {
  switch (status) {
    case 'added':
      return 'green';
    case 'removed':
      return 'red';
    case 'changed':
      return 'orange';
    case 'moved':
      return 'blue';
    default:
      return 'dark-grey';
  }
}

function PanelDetailDrawer({ entry, onClose }: { entry: PanelDiffEntry; onClose: () => void }) {
  const title = entry.title || t('dashboard-scene.version-history-visual.untitled-panel', 'Untitled panel');

  return (
    <Drawer title={title} subtitle={statusLabel(entry.status)} onClose={onClose} size="md">
      {entry.fieldChanges.length === 0 ? (
        <Text color="secondary">
          <Trans i18nKey="dashboard-scene.version-history-visual.no-field-changes">
            No field changes for this panel.
          </Trans>
        </Text>
      ) : (
        <Stack direction="column" gap={2}>
          {entry.fieldChanges.map((change) => (
            <FieldChangeRow key={change.field} change={change} />
          ))}
        </Stack>
      )}
    </Drawer>
  );
}

function FieldChangeRow({ change }: { change: PanelFieldChange }) {
  const fieldLabel = fieldLabelFor(change.field);
  return (
    <Stack direction="column" gap={0.5}>
      <Text weight="medium">{fieldLabel}</Text>
      <Stack gap={1} alignItems="center" wrap="wrap">
        <Text variant="bodySmall" color="secondary">
          {change.before ?? '—'}
        </Text>
        <Icon name="arrow-right" size="sm" />
        <Text variant="bodySmall">{change.after ?? '—'}</Text>
      </Stack>
    </Stack>
  );
}

function fieldLabelFor(field: PanelFieldChange['field']): string {
  switch (field) {
    case 'title':
      return t('dashboard-scene.version-history-visual.field-title', 'Title');
    case 'query':
      return t('dashboard-scene.version-history-visual.field-query', 'Query');
    case 'vizType':
      return t('dashboard-scene.version-history-visual.field-viz-type', 'Visualization');
    case 'thresholds':
      return t('dashboard-scene.version-history-visual.field-thresholds', 'Thresholds');
    case 'position':
      return t('dashboard-scene.version-history-visual.field-position', 'Position');
    case 'libraryPanel':
      return t('dashboard-scene.version-history-visual.field-library-panel', 'Library panel');
    default:
      return field;
  }
}

const getStyles = (theme: GrafanaTheme2) => {
  const statusBorder = (status: PanelDiffStatus) => {
    switch (status) {
      case 'added':
        return theme.colors.success.border;
      case 'removed':
        return theme.colors.error.border;
      case 'changed':
        return theme.colors.warning.border;
      case 'moved':
        return theme.colors.info.border;
      default:
        return theme.colors.border.weak;
    }
  };

  return {
    canvas: css({
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
      gap: theme.spacing(1),
      position: 'relative',
      minHeight: theme.spacing(12),
      padding: theme.spacing(1),
      background: theme.colors.background.secondary,
      borderRadius: theme.shape.radius.default,
      border: `1px solid ${theme.colors.border.weak}`,
    }),
    tileStack: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(0.5),
      minHeight: theme.spacing(6),
    }),
    tile: (status: PanelDiffStatus) =>
      css({
        display: 'block',
        width: '100%',
        height: '100%',
        minHeight: theme.spacing(6),
        padding: theme.spacing(1),
        textAlign: 'left',
        cursor: 'pointer',
        background: theme.colors.background.primary,
        border: `2px solid ${statusBorder(status)}`,
        borderRadius: theme.shape.radius.default,
        color: theme.colors.text.primary,
        '&:hover': {
          background: theme.colors.action.hover,
        },
      }),
    stackedTile: (status: PanelDiffStatus) =>
      css({
        display: 'block',
        width: '100%',
        flex: 1,
        minHeight: theme.spacing(6),
        padding: theme.spacing(1),
        textAlign: 'left',
        cursor: 'pointer',
        background: theme.colors.background.primary,
        border: `2px solid ${statusBorder(status)}`,
        borderRadius: theme.shape.radius.default,
        color: theme.colors.text.primary,
        '&:hover': {
          background: theme.colors.action.hover,
        },
      }),
    autoTile: (status: PanelDiffStatus) =>
      css({
        display: 'block',
        width: '100%',
        minHeight: theme.spacing(8),
        padding: theme.spacing(1),
        textAlign: 'left',
        cursor: 'pointer',
        background: theme.colors.background.primary,
        border: `2px solid ${statusBorder(status)}`,
        borderRadius: theme.shape.radius.default,
        gridColumn: 'span 8',
        color: theme.colors.text.primary,
        '&:hover': {
          background: theme.colors.action.hover,
        },
      }),
    ghostTile: css({
      border: `2px dashed ${theme.colors.warning.main}`,
      borderRadius: theme.shape.radius.default,
      background: theme.colors.warning.transparent,
      pointerEvents: 'none',
      opacity: 0.55,
    }),
  };
};

const getLegendStyles = (theme: GrafanaTheme2) => ({
  added: css({ color: theme.colors.success.main }),
  removed: css({ color: theme.colors.error.main }),
  changed: css({ color: theme.colors.warning.main }),
  moved: css({ color: theme.colors.info.main }),
  unchanged: css({ color: theme.colors.text.secondary }),
});
