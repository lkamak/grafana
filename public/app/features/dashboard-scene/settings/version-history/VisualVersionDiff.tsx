import { css, cx } from '@emotion/css';
import { useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { RadioButtonGroup, Stack, Tag, Text, useStyles2 } from '@grafana/ui';

import { VisualPanelDiffDrawer } from './VisualPanelDiffDrawer';
import {
  type PanelDiffItem,
  type PanelDiffStatus,
  buildVisualDiff,
  getCanvasHeight,
  gridItemStyle,
} from './visualDiff';

type Props = {
  lhs: object;
  rhs: object;
};

export function VisualVersionDiff({ lhs, rhs }: Props) {
  const styles = useStyles2(getStyles);
  const diffResult = useMemo(() => buildVisualDiff(lhs, rhs), [lhs, rhs]);
  const [selectedTabId, setSelectedTabId] = useState(diffResult.tabs[0]?.id ?? 'default');
  const [selectedPanel, setSelectedPanel] = useState<PanelDiffItem | null>(null);

  const activeTabId = diffResult.tabs.some((tab) => tab.id === selectedTabId)
    ? selectedTabId
    : (diffResult.tabs[0]?.id ?? 'default');

  const items = diffResult.itemsByTab[activeTabId] ?? [];
  const layoutKind = diffResult.layoutKindByTab[activeTabId] ?? 'grid';
  const canvasHeight = getCanvasHeight(items);

  const tabOptions = diffResult.tabs.map((tab) => ({
    label: tab.title,
    value: tab.id,
  }));

  return (
    <Stack direction="column" gap={2} data-testid="visual-version-diff">
      <Text variant="h5">
        <Trans i18nKey="dashboard-scene.version-history-visual.title">Visual panel diff</Trans>
      </Text>

      <Stack gap={1} wrap="wrap">
        {statusLegend.map(({ status, labelKey, defaultLabel, colorIndex }) => (
          <Tag
            key={status}
            name={t(labelKey, defaultLabel)}
            colorIndex={colorIndex}
            aria-label={t(labelKey, defaultLabel)}
          />
        ))}
      </Stack>

      {diffResult.isTabbed && tabOptions.length > 1 && (
        <RadioButtonGroup
          options={tabOptions}
          value={activeTabId}
          onChange={(value) => setSelectedTabId(String(value))}
        />
      )}

      {layoutKind === 'autoGrid' ? (
        <AutoGridPanelList items={items} onSelect={setSelectedPanel} styles={styles} />
      ) : (
        <div className={styles.canvas} style={{ height: canvasHeight }} data-testid="visual-version-diff-canvas">
          {items.flatMap((item) => renderGridItems(item, styles, setSelectedPanel))}
        </div>
      )}

      {selectedPanel && <VisualPanelDiffDrawer item={selectedPanel} onClose={() => setSelectedPanel(null)} />}
    </Stack>
  );
}

const statusLegend: Array<{
  status: PanelDiffStatus;
  labelKey: string;
  defaultLabel: string;
  colorIndex: number;
}> = [
  {
    status: 'added',
    labelKey: 'dashboard-scene.version-history-visual.legend-added',
    defaultLabel: 'Added',
    colorIndex: 2,
  },
  {
    status: 'removed',
    labelKey: 'dashboard-scene.version-history-visual.legend-removed',
    defaultLabel: 'Removed',
    colorIndex: 6,
  },
  {
    status: 'changed',
    labelKey: 'dashboard-scene.version-history-visual.legend-changed',
    defaultLabel: 'Changed',
    colorIndex: 1,
  },
  {
    status: 'moved',
    labelKey: 'dashboard-scene.version-history-visual.legend-moved',
    defaultLabel: 'Moved',
    colorIndex: 4,
  },
  {
    status: 'unchanged',
    labelKey: 'dashboard-scene.version-history-visual.legend-unchanged',
    defaultLabel: 'Unchanged',
    colorIndex: 7,
  },
];

function renderGridItems(
  item: PanelDiffItem,
  styles: ReturnType<typeof getStyles>,
  onSelect: (item: PanelDiffItem) => void
) {
  const nodes = [];

  if (item.moved && item.previousGridPos) {
    nodes.push(
      <PanelCard
        key={`${item.id}-ghost`}
        item={item}
        ghost
        gridPos={item.previousGridPos}
        styles={styles}
        onSelect={onSelect}
      />
    );
  }

  if (item.status === 'removed' && item.gridPos) {
    nodes.push(
      <PanelCard key={`${item.id}-removed`} item={item} gridPos={item.gridPos} styles={styles} onSelect={onSelect} />
    );
    return nodes;
  }

  if (item.gridPos) {
    nodes.push(
      <PanelCard key={`${item.id}-main`} item={item} gridPos={item.gridPos} styles={styles} onSelect={onSelect} />
    );
  }

  return nodes;
}

function PanelCard({
  item,
  gridPos,
  ghost,
  styles,
  onSelect,
}: {
  item: PanelDiffItem;
  gridPos: NonNullable<PanelDiffItem['gridPos']>;
  ghost?: boolean;
  styles: ReturnType<typeof getStyles>;
  onSelect: (item: PanelDiffItem) => void;
}) {
  const position = gridItemStyle(gridPos);
  const interactive = item.status !== 'unchanged';

  return (
    <button
      type="button"
      className={cx(
        styles.panelCard,
        ghost && styles.panelGhost,
        styles[`status_${item.status}` as keyof ReturnType<typeof getStyles>]
      )}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      }}
      disabled={!interactive}
      onClick={() => interactive && onSelect(item)}
      data-testid={`visual-panel-${item.id}${ghost ? '-ghost' : ''}`}
      data-status={item.status}
    >
      <Stack direction="column" gap={0.5} height="100%">
        <Text variant="bodySmall" weight="medium" truncate>
          {item.title || t('dashboard-scene.version-history-visual.untitled-panel', 'Untitled panel')}
        </Text>
        <Text variant="bodySmall" color="secondary" truncate>
          {item.vizType}
        </Text>
        <Stack gap={0.5} wrap="wrap">
          <StatusTag status={item.status} />
          {item.moved && item.status === 'changed' && <StatusTag status="moved" />}
        </Stack>
      </Stack>
    </button>
  );
}

function StatusTag({ status }: { status: PanelDiffStatus }) {
  const colorIndex = statusLegend.find((entry) => entry.status === status)?.colorIndex ?? 7;
  const labelKey = statusLegend.find((entry) => entry.status === status)?.labelKey;
  const defaultLabel = statusLegend.find((entry) => entry.status === status)?.defaultLabel ?? status;

  return <Tag name={labelKey ? t(labelKey, defaultLabel) : status} colorIndex={colorIndex} />;
}

function AutoGridPanelList({
  items,
  onSelect,
  styles,
}: {
  items: PanelDiffItem[];
  onSelect: (item: PanelDiffItem) => void;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <div className={styles.autoGridList} data-testid="visual-version-diff-auto-grid">
      {items.map((item) => {
        const interactive = item.status !== 'unchanged';
        return (
          <button
            key={item.id}
            type="button"
            className={cx(styles.autoGridCard, styles[`status_${item.status}` as keyof ReturnType<typeof getStyles>])}
            disabled={!interactive}
            onClick={() => interactive && onSelect(item)}
            data-testid={`visual-panel-${item.id}`}
            data-status={item.status}
          >
            <Stack direction="column" gap={0.5}>
              <Text weight="medium">
                {item.title || t('dashboard-scene.version-history-visual.untitled-panel', 'Untitled panel')}
              </Text>
              <Text variant="bodySmall" color="secondary">
                {item.vizType}
              </Text>
              <StatusTag status={item.status} />
            </Stack>
          </button>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  const statusBorder = (color: string) =>
    css({
      borderColor: color,
    });

  return {
    canvas: css({
      position: 'relative',
      width: '100%',
      marginTop: theme.spacing(1),
    }),
    panelCard: css({
      position: 'absolute',
      boxSizing: 'border-box',
      padding: theme.spacing(1),
      borderRadius: theme.shape.radius.default,
      border: `2px solid ${theme.colors.border.weak}`,
      background: theme.colors.background.primary,
      textAlign: 'left',
      cursor: 'pointer',
      overflow: 'hidden',
      '&:disabled': {
        cursor: 'default',
        opacity: 0.85,
      },
    }),
    panelGhost: css({
      borderStyle: 'dashed',
      opacity: 0.45,
      pointerEvents: 'none',
      zIndex: 0,
    }),
    status_added: statusBorder(theme.colors.success.text),
    status_removed: statusBorder(theme.colors.error.text),
    status_changed: statusBorder(theme.colors.warning.text),
    status_moved: statusBorder(theme.colors.info.text),
    status_unchanged: statusBorder(theme.colors.border.weak),
    autoGridList: css({
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(1),
    }),
    autoGridCard: css({
      minWidth: 200,
      padding: theme.spacing(1.5),
      borderRadius: theme.shape.radius.default,
      border: `2px solid ${theme.colors.border.weak}`,
      background: theme.colors.background.primary,
      textAlign: 'left',
      cursor: 'pointer',
      '&:disabled': {
        cursor: 'default',
        opacity: 0.85,
      },
    }),
  };
};
