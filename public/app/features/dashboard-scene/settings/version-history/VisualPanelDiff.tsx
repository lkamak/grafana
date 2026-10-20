import { css, cx } from '@emotion/css';
import { useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Badge, RadioButtonGroup, Stack, useStyles2 } from '@grafana/ui';

import {
  type PanelDiffEntry,
  type PanelDiffStatus,
  type RowDiffSection,
  computeVisualPanelDiff,
} from './panelDiff';

type VisualPanelDiffProps = {
  lhs: unknown;
  rhs: unknown;
};

export function VisualPanelDiff({ lhs, rhs }: VisualPanelDiffProps) {
  const styles = useStyles2(getStyles);
  const diffResult = useMemo(() => computeVisualPanelDiff(lhs, rhs), [lhs, rhs]);
  const [selectedTab, setSelectedTab] = useState(diffResult.tabs[0]?.title ?? 'Dashboard');
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);

  const activeTab = diffResult.tabs.find((tab) => tab.title === selectedTab) ?? diffResult.tabs[0];

  const tabOptions = diffResult.tabs.map((tab) => ({
    label: tab.title,
    value: tab.title,
    description:
      tab.tabStatus === 'added'
        ? t('dashboard-scene.visual-panel-diff.tab-added', 'Added tab')
        : tab.tabStatus === 'removed'
          ? t('dashboard-scene.visual-panel-diff.tab-removed', 'Removed tab')
          : undefined,
  }));

  const selectedEntry = useMemo(() => {
    if (!activeTab || !selectedEntryKey) {
      return null;
    }
    const all = [...activeTab.rows.flatMap((r) => r.entries), ...activeTab.autoGridEntries];
    return all.find((e) => e.key === selectedEntryKey) ?? null;
  }, [activeTab, selectedEntryKey]);

  if (!activeTab) {
    return null;
  }

  return (
    <Stack direction="column" gap={2}>
      {diffResult.usesTabs && diffResult.tabs.length > 0 && (
        <Stack alignItems="center" gap={2}>
          <span className={styles.tabLabel}>
            <Trans i18nKey="dashboard-scene.visual-panel-diff.tab-picker-label">Tab</Trans>
          </span>
          <RadioButtonGroup options={tabOptions} value={selectedTab} onChange={setSelectedTab} />
          {activeTab.tabStatus !== 'both' && (
            <Badge
              text={
                activeTab.tabStatus === 'added'
                  ? t('dashboard-scene.visual-panel-diff.badge-tab-added', 'Added')
                  : t('dashboard-scene.visual-panel-diff.badge-tab-removed', 'Removed')
              }
              color={activeTab.tabStatus === 'added' ? 'green' : 'red'}
            />
          )}
        </Stack>
      )}

      {activeTab.rows.map((row) => (
        <RowSchematic
          key={row.title}
          row={row}
          selectedKey={selectedEntryKey}
          onSelect={(entry) => {
            if (entry.status === 'unchanged') {
              setSelectedEntryKey(null);
              return;
            }
            setSelectedEntryKey(entry.key === selectedEntryKey ? null : entry.key);
          }}
        />
      ))}

      {activeTab.autoGridEntries.length > 0 && (
        <Stack direction="column" gap={1}>
          <h4 className={styles.rowTitle}>
            <Trans i18nKey="dashboard-scene.visual-panel-diff.auto-grid-title">Auto layout panels</Trans>
          </h4>
          <Stack wrap="wrap" gap={1}>
            {activeTab.autoGridEntries.map((entry) => (
              <AutoGridCard
                key={entry.key}
                entry={entry}
                selected={selectedEntryKey === entry.key}
                onSelect={() => {
                  if (entry.status === 'unchanged') {
                    setSelectedEntryKey(null);
                    return;
                  }
                  setSelectedEntryKey(entry.key === selectedEntryKey ? null : entry.key);
                }}
              />
            ))}
          </Stack>
        </Stack>
      )}

      {selectedEntry && selectedEntry.status !== 'unchanged' && (
        <PanelChangeDetail entry={selectedEntry} />
      )}
    </Stack>
  );
}

type RowSchematicProps = {
  row: RowDiffSection;
  selectedKey: string | null;
  onSelect: (entry: PanelDiffEntry) => void;
};

function RowSchematic({ row, selectedKey, onSelect }: RowSchematicProps) {
  const styles = useStyles2(getStyles);

  if (row.entries.length === 0) {
    return null;
  }

  return (
    <Stack direction="column" gap={1}>
      {row.title !== 'Panels' && <h4 className={styles.rowTitle}>{row.title}</h4>}
      <div
        className={styles.grid}
        style={{ gridTemplateRows: `repeat(${row.gridMaxY}, minmax(28px, auto))` }}
        data-testid="visual-panel-diff-grid"
      >
        {row.entries.map((entry) => (
          <PanelGridCells key={entry.key} entry={entry} selected={selectedKey === entry.key} onSelect={() => onSelect(entry)} />
        ))}
      </div>
    </Stack>
  );
}

type PanelGridCellsProps = {
  entry: PanelDiffEntry;
  selected: boolean;
  onSelect: () => void;
};

function PanelGridCells({ entry, selected, onSelect }: PanelGridCellsProps) {
  const styles = useStyles2(getStyles);
  const snap = entry.current ?? entry.previous;
  if (!snap || snap.layoutKind !== 'grid') {
    return null;
  }

  const showGhost =
    entry.status === 'changed' &&
    entry.previous &&
    entry.current &&
    (entry.previous.x !== entry.current.x ||
      entry.previous.y !== entry.current.y ||
      entry.previous.w !== entry.current.w ||
      entry.previous.h !== entry.current.h);

  return (
    <>
      {showGhost && entry.previous && (
        <div
          className={cx(styles.panelCard, styles.ghost)}
          style={{
            gridColumn: `${entry.previous.x + 1} / span ${entry.previous.w}`,
            gridRow: `${entry.previous.y + 1} / span ${entry.previous.h}`,
          }}
          aria-hidden
        />
      )}
      <button
        type="button"
        className={cx(styles.panelCard, styles[entry.status], selected && styles.selected)}
        style={{
          gridColumn: `${snap.x + 1} / span ${snap.w}`,
          gridRow: `${snap.y + 1} / span ${snap.h}`,
        }}
        onClick={onSelect}
        data-testid={`panel-diff-${entry.key}`}
      >
        <span className={styles.panelTitle}>{entry.title}</span>
        <Badge text={statusLabel(entry.status)} color={statusColor(entry.status)} />
      </button>
    </>
  );
}

function AutoGridCard({
  entry,
  selected,
  onSelect,
}: {
  entry: PanelDiffEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const styles = useStyles2(getStyles);
  return (
    <button
      type="button"
      className={cx(styles.autoGridCard, styles[entry.status], selected && styles.selected)}
      onClick={onSelect}
      data-testid={`panel-diff-autogrid-${entry.key}`}
    >
      <span className={styles.panelTitle}>{entry.title}</span>
      <Badge text={statusLabel(entry.status)} color={statusColor(entry.status)} />
    </button>
  );
}

function PanelChangeDetail({ entry }: { entry: PanelDiffEntry }) {
  const styles = useStyles2(getStyles);

  if (entry.changes.length === 0 && entry.status === 'added') {
    return (
      <div className={styles.detail} data-testid="panel-diff-detail">
        <strong>{entry.title}</strong>
        <p>
          <Trans i18nKey="dashboard-scene.visual-panel-diff.panel-added">Panel was added in the newer version.</Trans>
        </p>
      </div>
    );
  }

  if (entry.changes.length === 0 && entry.status === 'removed') {
    return (
      <div className={styles.detail} data-testid="panel-diff-detail">
        <strong>{entry.title}</strong>
        <p>
          <Trans i18nKey="dashboard-scene.visual-panel-diff.panel-removed">
            Panel was removed in the newer version.
          </Trans>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.detail} data-testid="panel-diff-detail">
      <strong>{entry.title}</strong>
      <ul className={styles.changeList}>
        {entry.changes.map((change) => (
          <li key={change.field}>
            <span className={styles.changeField}>{fieldLabel(change.field)}</span>
            {change.before !== undefined && change.after !== undefined ? (
              <span>
                {change.before} → {change.after}
              </span>
            ) : change.after !== undefined ? (
              <span>{change.after}</span>
            ) : (
              <span>{change.before}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(status: PanelDiffStatus): string {
  switch (status) {
    case 'added':
      return t('dashboard-scene.visual-panel-diff.status-added', 'Added');
    case 'removed':
      return t('dashboard-scene.visual-panel-diff.status-removed', 'Removed');
    case 'changed':
      return t('dashboard-scene.visual-panel-diff.status-changed', 'Changed');
    default:
      return t('dashboard-scene.visual-panel-diff.status-unchanged', 'Unchanged');
  }
}

function statusColor(status: PanelDiffStatus): 'green' | 'red' | 'orange' | 'blue' {
  switch (status) {
    case 'added':
      return 'green';
    case 'removed':
      return 'red';
    case 'changed':
      return 'orange';
    default:
      return 'blue';
  }
}

function fieldLabel(field: string): string {
  switch (field) {
    case 'title':
      return t('dashboard-scene.visual-panel-diff.field-title', 'Title');
    case 'viz':
      return t('dashboard-scene.visual-panel-diff.field-viz', 'Visualization');
    case 'query':
      return t('dashboard-scene.visual-panel-diff.field-query', 'Query');
    case 'thresholds':
      return t('dashboard-scene.visual-panel-diff.field-thresholds', 'Thresholds');
    case 'position':
      return t('dashboard-scene.visual-panel-diff.field-position', 'Position');
    default:
      return field;
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  tabLabel: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  rowTitle: css({
    margin: 0,
    fontSize: theme.typography.h5.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  grid: css({
    display: 'grid',
    gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.weak}`,
  }),
  panelCard: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.medium}`,
    background: theme.colors.background.primary,
    cursor: 'pointer',
    textAlign: 'left',
    minHeight: theme.spacing(3),
    '&:hover': {
      boxShadow: theme.shadows.z1,
    },
  }),
  autoGridCard: css({
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1, 1.5),
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.medium}`,
    background: theme.colors.background.primary,
    cursor: 'pointer',
  }),
  panelTitle: css({
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  }),
  ghost: css({
    borderStyle: 'dashed',
    opacity: 0.45,
    pointerEvents: 'none',
    background: 'transparent',
  }),
  selected: css({
    outline: `2px solid ${theme.colors.primary.border}`,
    outlineOffset: 1,
  }),
  added: css({
    borderColor: theme.colors.success.border,
    background: theme.colors.success.transparent,
  }),
  removed: css({
    borderColor: theme.colors.error.border,
    background: theme.colors.error.transparent,
    opacity: 0.85,
  }),
  changed: css({
    borderColor: theme.colors.warning.border,
    background: theme.colors.warning.transparent,
  }),
  unchanged: css({
    opacity: 0.55,
  }),
  detail: css({
    padding: theme.spacing(2),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
  }),
  changeList: css({
    margin: theme.spacing(1, 0, 0),
    paddingLeft: theme.spacing(2),
  }),
  changeField: css({
    fontWeight: theme.typography.fontWeightMedium,
    marginRight: theme.spacing(1),
  }),
});
