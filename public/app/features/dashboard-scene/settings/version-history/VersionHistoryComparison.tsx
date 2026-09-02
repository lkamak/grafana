import { css, cx } from '@emotion/css';
import { useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { type SceneTimeRangeLike } from '@grafana/scenes';
import {
  Alert,
  Button,
  ModalsController,
  CollapsableSection,
  useStyles2,
  Stack,
  Icon,
  Box,
  Tab,
  TabsBar,
} from '@grafana/ui';
import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';
import { isDashboardV2Spec } from 'app/features/dashboard/api/utils';

import { DiffGroup } from './DiffGroup';
import LazyDiffViewer from './LazyDiffViewer';
import { RevertDashboardModal } from './RevertDashboardModal';
import { VisualVersionDiff } from './VisualVersionDiff';
import { jsonDiff } from './utils';

type DiffViewProps = {
  isNewLatest: boolean;
  newInfo: DecoratedRevisionModel;
  baseInfo: DecoratedRevisionModel;
  diffData: { lhs: object; rhs: object };
  onRestore: (version: DecoratedRevisionModel) => Promise<boolean>;
  /** Shared time range from the open dashboard; required when visual compare is enabled. */
  sharedTimeRange?: SceneTimeRangeLike;
};

type CompareTab = 'visual' | 'changes' | 'json';

export const VersionHistoryComparison = ({
  baseInfo,
  newInfo,
  diffData,
  isNewLatest,
  onRestore,
  sharedTimeRange,
}: DiffViewProps) => {
  const diff = jsonDiff(diffData.lhs, diffData.rhs);
  const styles = useStyles2(getStyles);
  const visualEnabled = Boolean(config.featureToggles.dashboardVisualVersionDiff);
  const hasMigratedToV2 = isDashboardV2Spec(diffData.rhs) && !isDashboardV2Spec(diffData.lhs);
  const [activeTab, setActiveTab] = useState<CompareTab>(visualEnabled ? 'visual' : 'changes');

  const versionHeader = (
    <Stack justifyContent="space-between" alignItems="center">
      <Stack alignItems="center">
        <span className={cx(styles.versionInfo, styles.noMarginBottom)}>
          <Trans
            i18nKey="dashboard-scene.version-history-comparison.old-version-updated"
            values={{ version: baseInfo.version, editor: baseInfo.createdBy, timeAgo: baseInfo.ageString }}
          >
            <strong>Version {'{{version}}'}</strong> updated by {'{{editor}}'} {'{{timeAgo}}'}
          </Trans>
          {baseInfo.message}
        </span>
        <Icon name="arrow-right" size="sm" />
        <span className={styles.versionInfo}>
          <Trans
            i18nKey="dashboard-scene.version-history-comparison.new-version-updated"
            values={{ version: newInfo.version, editor: newInfo.createdBy, timeAgo: newInfo.ageString }}
          >
            <strong>Version {'{{version}}'}</strong> updated by {'{{editor}}'} {'{{timeAgo}}'}
          </Trans>
          {newInfo.message}
        </span>
      </Stack>
      {isNewLatest && (
        <ModalsController>
          {({ showModal, hideModal }) => (
            <Button
              variant="destructive"
              icon="history"
              onClick={() => {
                showModal(RevertDashboardModal, {
                  version: baseInfo,
                  onRestore,
                  hideModal,
                });
              }}
            >
              <Trans
                i18nKey="dashboard-scene.version-history.comparison.button-restore"
                values={{ version: baseInfo.version }}
              >
                Restore to version {'{{version}}'}
              </Trans>
            </Button>
          )}
        </ModalsController>
      )}
    </Stack>
  );

  if (!visualEnabled) {
    return (
      <Stack direction="column" gap={1}>
        {versionHeader}
        {Object.entries(diff).map(([key, diffs]) => (
          <DiffGroup diffs={diffs} key={key} title={key} />
        ))}
        <Box paddingTop={2}>
          <CollapsableSection
            isOpen={false}
            label={t('dashboard-scene.version-history-comparison.label-view-json-diff', 'View JSON diff')}
          >
            <LazyDiffViewer
              oldValue={JSON.stringify(diffData.lhs, null, 2)}
              newValue={JSON.stringify(diffData.rhs, null, 2)}
            />
          </CollapsableSection>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap={1} data-testid="version-history-comparison-visual">
      {versionHeader}

      <TabsBar>
        <Tab
          label={t('dashboard-scene.version-history.tab-visual', 'Visual')}
          active={activeTab === 'visual'}
          onChangeTab={() => setActiveTab('visual')}
        />
        <Tab
          label={t('dashboard-scene.version-history.tab-changes', 'Changes')}
          active={activeTab === 'changes'}
          onChangeTab={() => setActiveTab('changes')}
        />
        <Tab
          label={t('dashboard-scene.version-history.tab-json', 'JSON')}
          active={activeTab === 'json'}
          onChangeTab={() => setActiveTab('json')}
        />
      </TabsBar>

      {activeTab === 'visual' && sharedTimeRange && (
        <VisualVersionDiff
          lhs={diffData.lhs}
          rhs={diffData.rhs}
          sharedTimeRange={sharedTimeRange}
          hasMigratedToV2={hasMigratedToV2}
        />
      )}

      {activeTab === 'changes' && (
        <Stack direction="column" gap={1}>
          {hasMigratedToV2 && (
            <Box paddingTop={1}>
              <Alert
                title={t(
                  'dashboard.save-dashboard-diff.title-because-dashboard-migrated-grafana-format',
                  'The diff is hard to read because the dashboard has been migrated to the new Grafana dashboard format'
                )}
                severity="info"
              />
            </Box>
          )}
          {Object.keys(diff).length === 0 ? (
            <Trans i18nKey="dashboard-scene.version-history.no-summary-changes">No summary changes</Trans>
          ) : (
            Object.entries(diff).map(([key, diffs]) => <DiffGroup diffs={diffs} key={key} title={key} />)
          )}
        </Stack>
      )}

      {activeTab === 'json' && (
        <Box paddingTop={1}>
          <LazyDiffViewer
            oldValue={JSON.stringify(diffData.lhs, null, 2)}
            newValue={JSON.stringify(diffData.rhs, null, 2)}
          />
        </Box>
      )}
    </Stack>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  versionInfo: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  noMarginBottom: css({
    marginBottom: 0,
  }),
});
