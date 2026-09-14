import { css, cx } from '@emotion/css';
import { useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Alert,
  Badge,
  Drawer,
  RadioButtonGroup,
  Stack,
  Text,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { GRID_CELL_HEIGHT, GRID_CELL_VMARGIN, GRID_COLUMN_COUNT } from 'app/core/constants';

import { buildVisualDiff, tabHasDiffEntries } from './diffPanels';
import { type PanelChangeKind, type PanelDiffEntry, type PanelDiffStatus } from './types';

function changeKindLabel(kind: PanelChangeKind): string {
  switch (kind) {
    case 'title':
      return t('dashboard-scene.visual-version-diff.change-title', 'Title');
    case 'query':
      return t('dashboard-scene.visual-version-diff.change-query', 'Query');
    case 'vizType':
      return t('dashboard-scene.visual-version-diff.change-viz-type', 'Visualization');
    case 'thresholds':
      return t('dashboard-scene.visual-version-diff.change-thresholds', 'Thresholds');
    case 'position':
      return t('dashboard-scene.visual-version-diff.change-position', 'Position');
    case 'tab':
      return t('dashboard-scene.visual-version-diff.change-tab', 'Tab');
    default:
      return kind;
  }
}

type VisualVersionDiffProps = {
  baseSpec: object;
  newSpec: object;
};

export function VisualVersionDiff({ baseSpec, newSpec }: VisualVersionDiffProps) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const diff = useMemo(() => buildVisualDiff(baseSpec, newSpec), [baseSpec, newSpec]);

  const tabsWithEntries = useMemo(
    () => diff.tabs.filter((tab) => tabHasDiffEntries(tab, diff.entriesByTab)),
    [diff]
  );

  const [selectedTabId, setSelectedTabId] = useState<string>(() => tabsWithEntries[0]?.id ?? 'default');
  const [selectedEntry, setSelectedEntry] = useState<PanelDiffEntry | null>(null);

  const activeTabId = tabsWithEntries.some((tab) => tab.id === selectedTabId)
    ? selectedTabId
    : tabsWithEntries[0]?.id ?? 'default';

  const entries = diff.entriesByTab[activeTabId] ?? [];
  const gridEntries = entries.filter((entry) => entry.layoutMode === 'grid');
  const flowEntries = entries.filter((entry) => entry.layoutMode === 'flow');

  const gridHeight = useMemo(() => {
    let max = 0;
    for (const entry of gridEntries) {
      const pos = entry.status === 'removed' ? entry.basePanel?.gridPos ?? entry.panel.gridPos : entry.panel.gridPos;
      if (pos) {
        max = Math.max(max, pos.y + pos.h);
      }
    }
    return max;
  }, [gridEntries]);

  if (!diff.canRenderVisual) {
    if (diff.mixedSchema) {
      return (
        <Alert
          severity="info"
          title={t(
            'dashboard-scene.visual-version-diff.mixed-schema-title',
            'Visual diff unavailable for mixed dashboard formats'
          )}
        >
          <Trans i18nKey="dashboard-scene.visual-version-diff.mixed-schema-body">
            These versions use different dashboard JSON formats. Use the JSON diff below to review changes.
          </Trans>
        </Alert>
      );
    }
    return null;
  }

  if (entries.length === 0 && tabsWithEntries.length === 0) {
    return null;
  }

  const tabOptions = tabsWithEntries.map((tab) => ({ label: tab.title, value: tab.id }));

  return (
    <Stack direction="column" gap={2}>
      <Stack gap={2} wrap="wrap">
        <Badge text={t('dashboard-scene.visual-version-diff.legend-added', 'Added')} color="green" />
        <Badge text={t('dashboard-scene.visual-version-diff.legend-removed', 'Removed')} color="red" />
        <Badge text={t('dashboard-scene.visual-version-diff.legend-changed', 'Changed')} color="orange" />
        <Badge text={t('dashboard-scene.visual-version-diff.legend-unchanged', 'Unchanged')} color="blue" />
      </Stack>

      {tabOptions.length > 1 && (
        <RadioButtonGroup options={tabOptions} value={activeTabId} onChange={setSelectedTabId} />
      )}

      {gridEntries.length > 0 && (
        <div
          className={styles.gridCanvas}
          style={{
            height: gridHeight * (GRID_CELL_HEIGHT + GRID_CELL_VMARGIN),
          }}
        >
          {gridEntries.map((entry) => {
            const gridPos =
              entry.status === 'removed'
                ? entry.basePanel?.gridPos ?? entry.panel.gridPos
                : entry.panel.gridPos;
            if (!gridPos) {
              return null;
            }
            const status = entry.status;
            const isInteractive = status === 'changed' || status === 'added' || entry.moved;
            return (
              <button
                key={`${entry.panel.matchKey}-${status}-${gridPos.x}-${gridPos.y}`}
                type="button"
                className={cx(
                  styles.panelCard,
                  panelCardStyle(theme, status, entry.status === 'removed'),
                  entry.moved && status !== 'removed' && styles.movedOutline
                )}
                style={{
                  gridColumn: `${gridPos.x + 1} / span ${gridPos.w}`,
                  gridRow: `${gridPos.y + 1} / span ${gridPos.h}`,
                }}
                onClick={() => isInteractive && setSelectedEntry(entry)}
                disabled={!isInteractive}
                data-testid={`visual-diff-panel-${entry.panel.id}`}
              >
                <Stack direction="column" gap={0.5}>
                  <Stack justifyContent="space-between" alignItems="flex-start">
                    <Text weight="medium" truncate>
                      {entry.panel.title || t('dashboard-scene.visual-version-diff.untitled-panel', 'Untitled panel')}
                    </Text>
                    <Stack gap={0.5}>
                      <StatusBadge status={status} moved={entry.moved && status !== 'removed'} />
                    </Stack>
                  </Stack>
                  <Text variant="bodySmall" color="secondary">
                    {entry.panel.vizType || t('dashboard-scene.visual-version-diff.unknown-viz', 'Unknown')}
                  </Text>
                </Stack>
              </button>
            );
          })}
        </div>
      )}

      {flowEntries.length > 0 && (
        <div className={styles.flowCanvas}>
          {flowEntries.map((entry) => {
            const status = entry.status;
            const isInteractive = status === 'changed' || status === 'added' || entry.moved;
            return (
              <button
                key={`flow-${entry.panel.matchKey}-${status}`}
                type="button"
                className={cx(styles.flowCard, panelCardStyle(theme, status, status === 'removed'))}
                onClick={() => isInteractive && setSelectedEntry(entry)}
                disabled={!isInteractive}
              >
                <Stack direction="column" gap={0.5}>
                  <Stack justifyContent="space-between">
                    <Text weight="medium">{entry.panel.title}</Text>
                    <StatusBadge status={status} moved={entry.moved && status !== 'removed'} />
                  </Stack>
                  <Text variant="bodySmall" color="secondary">
                    {entry.panel.vizType}
                  </Text>
                </Stack>
              </button>
            );
          })}
        </div>
      )}

      {selectedEntry && (
        <Drawer
          title={selectedEntry.panel.title}
          subtitle={t('dashboard-scene.visual-version-diff.drawer-subtitle', 'Panel changes')}
          onClose={() => setSelectedEntry(null)}
        >
          <Stack direction="column" gap={2}>
            {selectedEntry.changes.length === 0 ? (
              <Text>
                {selectedEntry.moved
                  ? t('dashboard-scene.visual-version-diff.moved-only', 'This panel was moved.')
                  : t('dashboard-scene.visual-version-diff.no-details', 'No detailed changes recorded.')}
              </Text>
            ) : (
              selectedEntry.changes.map((change) => (
                <div key={change.kind}>
                  <Text weight="medium">{changeKindLabel(change.kind)}</Text>
                  <Text variant="bodySmall" color="secondary">
                    {change.before} → {change.after}
                  </Text>
                </div>
              ))
            )}
          </Stack>
        </Drawer>
      )}
    </Stack>
  );
}

function StatusBadge({ status, moved }: { status: PanelDiffStatus; moved: boolean }) {
  if (moved) {
    return <Badge text={t('dashboard-scene.visual-version-diff.status-moved', 'Moved')} color="purple" />;
  }
  switch (status) {
    case 'added':
      return <Badge text={t('dashboard-scene.visual-version-diff.status-added', 'Added')} color="green" />;
    case 'removed':
      return <Badge text={t('dashboard-scene.visual-version-diff.status-removed', 'Removed')} color="red" />;
    case 'changed':
      return <Badge text={t('dashboard-scene.visual-version-diff.status-changed', 'Changed')} color="orange" />;
    default:
      return <Badge text={t('dashboard-scene.visual-version-diff.status-unchanged', 'Unchanged')} color="blue" />;
  }
}

function panelCardStyle(theme: GrafanaTheme2, status: PanelDiffStatus, removedGhost: boolean) {
  if (removedGhost) {
    return css({
      borderStyle: 'dashed',
      borderColor: theme.colors.error.border,
      background: theme.colors.background.secondary,
    });
  }
  switch (status) {
    case 'added':
      return css({
        borderColor: theme.colors.success.border,
        background: theme.colors.background.secondary,
      });
    case 'changed':
      return css({
        borderColor: theme.colors.warning.border,
        background: theme.colors.background.secondary,
      });
    case 'removed':
      return css({
        borderStyle: 'dashed',
        borderColor: theme.colors.error.border,
        background: theme.colors.background.secondary,
      });
    default:
      return css({
        borderColor: theme.colors.border.weak,
        background: theme.colors.background.secondary,
      });
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  gridCanvas: css({
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLUMN_COUNT}, minmax(0, 1fr))`,
    gridAutoRows: `${GRID_CELL_HEIGHT}px`,
    gap: `${GRID_CELL_VMARGIN}px 0`,
    position: 'relative',
    width: '100%',
  }),
  panelCard: css({
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1),
    textAlign: 'left',
    cursor: 'pointer',
    minHeight: 0,
    overflow: 'hidden',
    '&:disabled': {
      cursor: 'default',
    },
  }),
  movedOutline: css({
    boxShadow: `inset 0 0 0 2px ${theme.colors.primary.border}`,
  }),
  flowCanvas: css({
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  }),
  flowCard: css({
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1.5),
    minWidth: '200px',
    textAlign: 'left',
    cursor: 'pointer',
    '&:disabled': {
      cursor: 'default',
    },
  }),
});
