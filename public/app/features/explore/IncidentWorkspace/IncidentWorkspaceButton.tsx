import { type AbsoluteTimeRange } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t, Trans } from '@grafana/i18n';
import { ToolbarButton } from '@grafana/ui';
import { useDispatch, useSelector } from 'app/types/store';

import { syncTimes } from '../state/time';

import { useIncidentWorkspace } from './IncidentWorkspaceContext';

interface Props {
  exploreId: string;
  viewRange: AbsoluteTimeRange;
}

export function IncidentWorkspaceButton({ exploreId, viewRange }: Props) {
  const dispatch = useDispatch();
  const syncedTimes = useSelector((state) => state.explore.syncedTimes);
  const { active, enter, exit } = useIncidentWorkspace();

  const onClick = () => {
    if (active) {
      exit();
      return;
    }
    if (!syncedTimes) {
      dispatch(syncTimes(exploreId));
    }
    enter(viewRange);
  };

  return (
    <ToolbarButton
      variant={active ? 'active' : 'canvas'}
      icon="heart-rate"
      data-testid={selectors.pages.Explore.toolbar.incidentWorkspaceButton}
      tooltip={
        active
          ? t('explore.incident-workspace.exit-tooltip', 'Leave incident workspace')
          : t(
              'explore.incident-workspace.enter-tooltip',
              'Lock split panes to one time range and highlight an incident'
            )
      }
      onClick={onClick}
      aria-pressed={active}
    >
      <Trans i18nKey="explore.incident-workspace.button">Incident workspace</Trans>
    </ToolbarButton>
  );
}
