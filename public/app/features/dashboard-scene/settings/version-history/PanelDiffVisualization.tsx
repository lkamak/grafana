import { css, cx } from '@emotion/css';
import { useMemo, useState } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Badge, TabsBar, Tab, useStyles2 } from '@grafana/ui';

import {
  type DashboardPanelDiffVisual,
  type PanelDiffItem,
  type PanelDiffSection,
  type PanelDiffStatus,
  type PanelDiffTab,
} from './panelDiff';

const GRID_COLUMNS = 24;
const ROW_HEIGHT_PX = 30;

type Props = {
  diff: DashboardPanelDiffVisual;
};

export function PanelDiffVisualization({ diff }: Props) {
  const styles = useStyles2(getStyles);
  const tabSections = useMemo(() => {
    const tabs = new Map<string, PanelDiffTab>();
    for (const section of diff.sections) {
      if (section.tab && !tabs.has(section.tab.key)) {
        tabs.set(section.tab.key, section.tab);
      }
    }
    return [...tabs.values()];
  }, [diff.sections]);
  const [selectedTabKey, setSelectedTabKey] = useState<string | undefined>(tabSections[0]?.key);

  const sectionsToRender = useMemo(() => {
    if (!diff.hasTabs) {
      return diff.sections;
    }
    const selected = selectedTabKey ?? tabSections[0]?.key;
    if (!selected) {
      return [];
    }
    return diff.sections.filter((section) => !section.tab || section.tab.key === selected);
  }, [diff.hasTabs, diff.sections, selectedTabKey, tabSections]);

  return (
    <div className={styles.wrapper} data-testid="panel-diff-visualization">
      {diff.hasTabs && tabSections.length > 0 && (
        <TabsBar className={styles.tabsBar}>
          {tabSections.map((section) => (
            <Tab
              key={section.key}
              label={section.label || section.key}
              active={section.key === (selectedTabKey ?? tabSections[0]?.key)}
              onChangeTab={() => setSelectedTabKey(section.key)}
            />
          ))}
        </TabsBar>
      )}

      {sectionsToRender.map((section) => (
        <PanelDiffSectionView key={section.key} section={section} />
      ))}
    </div>
  );
}

function PanelDiffSectionView({ section }: { section: PanelDiffSection }) {
  const styles = useStyles2(getStyles);

  if (section.displayMode === 'stack') {
    return (
      <div className={styles.section}>
        {section.label && section.kind === 'row' && <h4 className={styles.sectionTitle}>{section.label}</h4>}
        <div className={styles.stack}>
          {section.items.map((item) => (
            <PanelDiffCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    );
  }

  const maxRow = section.items.reduce((max, item) => Math.max(max, item.position.y + item.position.h), 0);

  return (
    <div className={styles.section}>
      {section.label && (section.kind === 'row' || section.kind === 'tab') && (
        <h4 className={styles.sectionTitle}>{section.label}</h4>
      )}
      <div
        className={styles.canvas}
        style={{
          minHeight: Math.max(maxRow, 1) * ROW_HEIGHT_PX,
        }}
      >
        {section.items.map((item) => (
          <PanelDiffCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function PanelDiffCard({ item }: { item: PanelDiffItem }) {
  const styles = useStyles2(getStyles);
  const [expanded, setExpanded] = useState(false);
  const statusLabel = statusText(item.status);
  const canExpand = item.status !== 'unchanged' && item.changes.length > 0;

  const style =
    item.displayMode === 'grid'
      ? {
          gridColumn: `${item.position.x + 1} / span ${item.position.w}`,
          gridRow: `${item.position.y + 1} / span ${item.position.h}`,
        }
      : undefined;

  return (
    <>
      {item.previousPosition && item.displayMode === 'grid' && (
        <div
          className={styles.footprint}
          style={{
            gridColumn: `${item.previousPosition.x + 1} / span ${item.previousPosition.w}`,
            gridRow: `${item.previousPosition.y + 1} / span ${item.previousPosition.h}`,
          }}
          aria-hidden
        />
      )}
      <div
        className={cx(styles.card, styles[`card_${item.status}`], canExpand && styles.cardClickable)}
        style={style}
        data-testid={`panel-diff-card-${item.id}`}
        data-status={item.status}
        onClick={() => canExpand && setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
      >
        <div className={styles.cardHeader}>
          <Badge text={statusLabel} color={badgeColor(item.status)} data-testid={`panel-diff-badge-${item.id}`} />
          <span className={styles.vizType}>{item.vizType || t('panel-diff.unknown-viz', 'Unknown')}</span>
        </div>
        <div className={styles.cardTitle}>{item.title || t('panel-diff.untitled-panel', 'Untitled panel')}</div>
        {expanded && item.changes.length > 0 && (
          <ul className={styles.changeList} data-testid={`panel-diff-changes-${item.id}`}>
            {item.changes.map((change, idx) => (
              <li key={`${change.label}-${idx}`}>
                {change.from != null && change.to != null ? (
                  <>
                    <strong>{change.label}:</strong> {change.from} → {change.to}
                  </>
                ) : change.to != null ? (
                  <>
                    <strong>{change.label}:</strong> {change.to}
                  </>
                ) : (
                  <>
                    <strong>{change.label}:</strong> {change.from}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function statusText(status: PanelDiffStatus): string {
  switch (status) {
    case 'added':
      return t('panel-diff.status.added', 'Added');
    case 'removed':
      return t('panel-diff.status.removed', 'Removed');
    case 'changed':
      return t('panel-diff.status.changed', 'Changed');
    default:
      return t('panel-diff.status.unchanged', 'Unchanged');
  }
}

function badgeColor(status: PanelDiffStatus): 'green' | 'red' | 'orange' | 'blue' {
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

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  }),
  tabsBar: css({
    marginBottom: theme.spacing(1),
  }),
  section: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  }),
  sectionTitle: css({
    margin: 0,
    fontSize: theme.typography.h5.fontSize,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  canvas: css({
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
    gridAutoRows: `${ROW_HEIGHT_PX}px`,
    gap: theme.spacing(0.5),
    position: 'relative',
    padding: theme.spacing(1),
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.weak}`,
  }),
  stack: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  }),
  footprint: css({
    border: `2px dashed ${theme.colors.warning.main}`,
    borderRadius: theme.shape.radius.default,
    opacity: 0.55,
    pointerEvents: 'none',
    zIndex: 0,
  }),
  card: css({
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.colors.border.medium}`,
    background: theme.colors.background.primary,
    minHeight: ROW_HEIGHT_PX * 2,
    overflow: 'auto',
  }),
  cardClickable: css({
    cursor: 'pointer',
    '&:hover': {
      borderColor: theme.colors.primary.border,
    },
  }),
  card_added: css({
    borderColor: theme.colors.success.border,
    background: theme.colors.success.transparent,
  }),
  card_removed: css({
    borderColor: theme.colors.error.border,
    background: theme.colors.error.transparent,
    opacity: 0.85,
  }),
  card_changed: css({
    borderColor: theme.colors.warning.border,
    background: theme.colors.warning.transparent,
  }),
  card_unchanged: css({
    opacity: 0.75,
  }),
  cardHeader: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  }),
  cardTitle: css({
    fontWeight: theme.typography.fontWeightMedium,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  vizType: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  changeList: css({
    margin: 0,
    paddingLeft: theme.spacing(2),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    wordBreak: 'break-word',
  }),
});
