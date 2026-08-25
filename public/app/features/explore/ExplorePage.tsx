import { css, cx } from '@emotion/css';
import { useEffect } from 'react';

import { type GrafanaTheme2, PageLayoutType } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { ErrorBoundaryAlert, LoadingPlaceholder, useStyles2 } from '@grafana/ui';
import { SplitPaneWrapper } from 'app/core/components/SplitPaneWrapper/SplitPaneWrapper';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { useNavModel } from 'app/core/hooks/useNavModel';
import { type GrafanaRouteComponentProps } from 'app/core/navigation/types';
import { type ExploreQueryParams } from 'app/types/explore';
import { useSelector } from 'app/types/store';

import { Page } from '../../core/components/Page/Page';

import { CorrelationEditorModeBar } from './CorrelationEditorModeBar';
import { ExploreActions } from './ExploreActions';
import { ExploreDrawer } from './ExploreDrawer';
import { ExploreHelperCallout } from './ExploreHelperCallout';
import { ExplorePaneContainer } from './ExplorePaneContainer';
import { useQueriesDrawerContext } from './QueriesDrawer/QueriesDrawerContext';
import RichHistoryContainer from './RichHistory/RichHistoryContainer';
import { useExplorePageContext } from './hooks/useExplorePageContext';
import { useExplorePageTitle } from './hooks/useExplorePageTitle';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSplitSizeUpdater } from './hooks/useSplitSizeUpdater';
import { useStateSync } from './hooks/useStateSync';
import { useTimeSrvFix } from './hooks/useTimeSrvFix';
import { isSplit, selectCorrelationDetails, selectPanesEntries } from './state/selectors';

const MIN_PANE_WIDTH = 200;

export default function ExplorePage(props: GrafanaRouteComponentProps<{}, ExploreQueryParams>) {
  return <ExplorePageContent {...props} />;
}

function ExplorePageContent(props: GrafanaRouteComponentProps<{}, ExploreQueryParams>) {
  const styles = useStyles2(getStyles);
  useTimeSrvFix();
  useStateSync(props.queryParams);
  // We want  to set the title according to the URL and not to the state because the URL itself may lag
  // (due to how useStateSync above works) by a few milliseconds.
  // When a URL is pushed to the history, the browser also saves the title of the page and
  // if we were to update the URL on state change, the title would not match the URL.
  // Ultimately the URL is the single source of truth from which state is derived, the page title is not different
  useExplorePageTitle(props.queryParams);
  const { chrome } = useGrafana();
  const navModel = useNavModel('explore');
  const { updateSplitSize, widthCalc } = useSplitSizeUpdater(MIN_PANE_WIDTH);

  const panes = useSelector(selectPanesEntries);
  const hasSplit = useSelector(isSplit);
  const correlationDetails = useSelector(selectCorrelationDetails);
  const { drawerOpened, setDrawerOpened } = useQueriesDrawerContext();
  const showCorrelationEditorBar = correlationDetails?.editorMode || false;

  useEffect(() => {
    //This is needed for breadcrumbs and topnav.
    //We should probably abstract this out at some point
    chrome.update({
      sectionNav: navModel,
    });
  }, [chrome, navModel]);

  useKeyboardShortcuts();
  useExplorePageContext(panes);

  return (
    <Page layout={PageLayoutType.Custom}>
      <div
        className={cx(styles.pageScrollbarWrapper, {
          [styles.correlationsEditorIndicator]: showCorrelationEditorBar,
        })}
      >
        <h1 className="sr-only">
          <Trans i18nKey="nav.explore.title">Explore</Trans>
        </h1>
        <ExploreActions />
        <ExploreHelperCallout />
        {showCorrelationEditorBar && <CorrelationEditorModeBar panes={panes} />}
        <div className={styles.splitPaneContainer}>
          <SplitPaneWrapper
            splitOrientation="vertical"
            paneSize={widthCalc}
            minSize={MIN_PANE_WIDTH}
            maxSize={MIN_PANE_WIDTH * -1}
            primary="second"
            splitVisible={hasSplit}
            paneStyle={{ overflow: 'auto', display: 'flex', flexDirection: 'column' }}
            onDragFinished={(size) => size && updateSplitSize(size)}
          >
            {panes.map(([exploreId, pane]) => {
              return (
                <ErrorBoundaryAlert boundaryName="explore-pane" key={exploreId} style="page">
                  {pane.initialized ? (
                    <ExplorePaneContainer exploreId={exploreId} />
                  ) : (
                    <LoadingPlaceholder text={t('explore.pane.loading-placeholder', 'Loading...')} />
                  )}
                </ErrorBoundaryAlert>
              );
            })}
          </SplitPaneWrapper>
        </div>
        {drawerOpened && (
          <ExploreDrawer>
            <RichHistoryContainer
              onClose={() => {
                setDrawerOpened(false);
              }}
            />
          </ExploreDrawer>
        )}
      </div>
    </Page>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    pageScrollbarWrapper: css({
      width: '100%',
      flexGrow: 1,
      minHeight: 0,
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }),
    splitPaneContainer: css({
      flex: 1,
      minHeight: 0,
      position: 'relative',
    }),
    correlationsEditorIndicator: css({
      borderLeft: `4px solid ${theme.colors.primary.main}`,
      borderRight: `4px solid ${theme.colors.primary.main}`,
      borderBottom: `4px solid ${theme.colors.primary.main}`,
      overflow: 'scroll',
    }),
  };
};
