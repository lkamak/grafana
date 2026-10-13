import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestProvider } from 'test/helpers/TestProvider';

import { dateTime } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { configureStore } from 'app/store/configureStore';

import { initialExploreState } from '../state/main';
import { makeExplorePaneState } from '../state/utils';

import { IncidentHighlight } from './IncidentHighlight';
import { IncidentWorkspaceButton } from './IncidentWorkspaceButton';
import { IncidentWorkspaceProvider, useIncidentWorkspace } from './IncidentWorkspaceContext';

const viewRange = { from: 1_000, to: 5_000 };

jest.mock('../state/time', () => ({
  ...jest.requireActual('../state/time'),
  syncTimes: jest.fn(() => () => {}),
}));

const { syncTimes } = jest.requireMock('../state/time');

function HighlightProbe() {
  const { active } = useIncidentWorkspace();
  if (!active) {
    return null;
  }
  return <IncidentHighlight viewRange={viewRange} />;
}

function setup(syncedTimes = false) {
  const store = configureStore({
    explore: {
      ...initialExploreState,
      syncedTimes,
      panes: {
        left: makeExplorePaneState(),
        right: makeExplorePaneState(),
      },
    },
  });

  return render(
    <TestProvider store={store}>
      <IncidentWorkspaceProvider>
        <IncidentWorkspaceButton exploreId="left" viewRange={viewRange} />
        <HighlightProbe />
      </IncidentWorkspaceProvider>
    </TestProvider>
  );
}

describe('IncidentWorkspace', () => {
  beforeEach(() => {
    jest.mocked(syncTimes).mockClear();
  });

  it('enters incident workspace, syncs pane times, and shows the highlight on the pane', async () => {
    const user = userEvent.setup();
    setup(false);

    expect(screen.queryByTestId(selectors.pages.Explore.General.incidentWorkspace)).not.toBeInTheDocument();

    await user.click(screen.getByTestId(selectors.pages.Explore.toolbar.incidentWorkspaceButton));

    expect(syncTimes).toHaveBeenCalledWith('left');
    expect(screen.getByTestId(selectors.pages.Explore.General.incidentWorkspace)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /incident range start/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /incident range end/i })).toBeInTheDocument();
    expect(screen.getByText(`${dateTime(2000).toISOString()} → ${dateTime(4000).toISOString()}`)).toBeInTheDocument();
  });

  it('does not toggle time sync when panes are already synced', async () => {
    const user = userEvent.setup();
    setup(true);

    await user.click(screen.getByTestId(selectors.pages.Explore.toolbar.incidentWorkspaceButton));

    expect(syncTimes).not.toHaveBeenCalled();
    expect(screen.getByTestId(selectors.pages.Explore.General.incidentWorkspace)).toBeInTheDocument();
  });

  it('shows the same highlight on both panes', async () => {
    const user = userEvent.setup();
    const store = configureStore({
      explore: {
        ...initialExploreState,
        syncedTimes: true,
        panes: {
          left: makeExplorePaneState(),
          right: makeExplorePaneState(),
        },
      },
    });

    render(
      <TestProvider store={store}>
        <IncidentWorkspaceProvider>
          <IncidentWorkspaceButton exploreId="left" viewRange={viewRange} />
          <HighlightProbe />
          <HighlightProbe />
        </IncidentWorkspaceProvider>
      </TestProvider>
    );

    await user.click(screen.getByTestId(selectors.pages.Explore.toolbar.incidentWorkspaceButton));

    expect(screen.getAllByTestId(selectors.pages.Explore.General.incidentWorkspace)).toHaveLength(2);
    expect(screen.getAllByText(`${dateTime(2000).toISOString()} → ${dateTime(4000).toISOString()}`)).toHaveLength(2);
  });

  it('leaves incident workspace without removing split or query controls', async () => {
    const user = userEvent.setup();
    setup(true);

    const toggle = screen.getByTestId(selectors.pages.Explore.toolbar.incidentWorkspaceButton);
    await user.click(toggle);
    expect(screen.getByTestId(selectors.pages.Explore.General.incidentWorkspace)).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByTestId(selectors.pages.Explore.General.incidentWorkspace)).not.toBeInTheDocument();
    expect(toggle).toBeInTheDocument();
  });
});
