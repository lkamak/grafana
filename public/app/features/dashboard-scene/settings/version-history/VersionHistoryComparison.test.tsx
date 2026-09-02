import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { config } from '@grafana/runtime';
import { SceneTimeRange } from '@grafana/scenes';
import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';

import { VersionHistoryComparison } from './VersionHistoryComparison';

jest.mock('./RevisionPanelPreview', () => ({
  LazyRevisionPanelPreview: ({ snapshot }: { snapshot: { title: string } }) => (
    <div data-testid="mock-panel-preview">{snapshot.title}</div>
  ),
  RevisionPanelPreview: () => null,
}));

jest.mock('./LazyDiffViewer', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-json-diff">json</div>,
}));

const baseInfo: DecoratedRevisionModel = {
  id: 1,
  version: 1,
  checked: true,
  uid: 'dash',
  created: '2024-01-01T00:00:00Z',
  createdBy: 'admin',
  message: 'first',
  createdDateString: '2024-01-01',
  ageString: '1 year ago',
  data: {
    title: 'Dash',
    panels: [{ id: 1, title: 'CPU', type: 'timeseries', targets: [{ refId: 'A' }], gridPos: { x: 0, y: 0, w: 12, h: 8 } }],
  },
};

const newInfo: DecoratedRevisionModel = {
  ...baseInfo,
  id: 2,
  version: 2,
  message: 'second',
  ageString: '1 day ago',
  data: {
    title: 'Dash',
    panels: [
      {
        id: 1,
        title: 'CPU',
        type: 'timeseries',
        targets: [{ refId: 'A' }, { refId: 'B' }],
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
      },
      { id: 2, title: 'New panel', type: 'stat', gridPos: { x: 12, y: 0, w: 12, h: 8 } },
    ],
  },
};

const removedInfo: DecoratedRevisionModel = {
  ...newInfo,
  id: 3,
  version: 3,
  data: {
    title: 'Dash',
    panels: [
      {
        id: 1,
        title: 'CPU',
        type: 'timeseries',
        targets: [{ refId: 'A' }, { refId: 'B' }],
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
      },
    ],
  },
};

describe('VersionHistoryComparison', () => {
  const originalToggle = config.featureToggles.dashboardVisualVersionDiff;
  const sharedTimeRange = new SceneTimeRange({ from: 'now-6h', to: 'now' });
  const onRestore = jest.fn().mockResolvedValue(true);

  afterEach(() => {
    config.featureToggles.dashboardVisualVersionDiff = originalToggle;
  });

  it('keeps the legacy summary+JSON layout when the feature toggle is off', () => {
    config.featureToggles.dashboardVisualVersionDiff = false;

    render(
      <VersionHistoryComparison
        baseInfo={baseInfo}
        newInfo={newInfo}
        diffData={{ lhs: baseInfo.data, rhs: newInfo.data }}
        isNewLatest={true}
        onRestore={onRestore}
      />
    );

    expect(screen.queryByRole('tab', { name: 'Visual' })).not.toBeInTheDocument();
    expect(screen.getByText(/Restore to version/)).toBeInTheDocument();
    expect(screen.getByText(/View JSON diff/)).toBeInTheDocument();
  });

  it('shows Visual / Changes / JSON tabs when the feature toggle is on', async () => {
    config.featureToggles.dashboardVisualVersionDiff = true;
    const user = userEvent.setup();

    render(
      <VersionHistoryComparison
        baseInfo={baseInfo}
        newInfo={newInfo}
        diffData={{ lhs: baseInfo.data, rhs: newInfo.data }}
        isNewLatest={true}
        onRestore={onRestore}
        sharedTimeRange={sharedTimeRange}
      />
    );

    expect(screen.getByTestId('version-history-comparison-visual')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visual' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Changes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'JSON' })).toBeInTheDocument();
    expect(screen.getByText(/Restore to version/)).toBeInTheDocument();
    expect(screen.getByText(/Live preview uses current data sources/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    expect(screen.getByTestId('mock-json-diff')).toBeInTheDocument();
  });

  it('renders filter chips and single-sided rows for added/removed panels', async () => {
    config.featureToggles.dashboardVisualVersionDiff = true;
    const user = userEvent.setup();

    render(
      <VersionHistoryComparison
        baseInfo={newInfo}
        newInfo={removedInfo}
        diffData={{ lhs: newInfo.data, rhs: removedInfo.data }}
        isNewLatest={true}
        onRestore={onRestore}
        sharedTimeRange={sharedTimeRange}
      />
    );

    expect(screen.getByText(/Changed \(/)).toBeInTheDocument();
    expect(screen.getByText(/Added \(/)).toBeInTheDocument();
    expect(screen.getByText(/Removed \(/)).toBeInTheDocument();

    // Show removed filter (off by default? wait - removed is in default activeFilters)
    // Default filters include removed, so the removed panel row should be visible.
    expect(screen.getByTestId('visual-diff-missing-rhs')).toBeInTheDocument();
    expect(screen.getByText(/Panel removed in newer version/)).toBeInTheDocument();

    // Toggle off removed filter
    await user.click(screen.getByRole('button', { name: /Removed/ }));
    expect(screen.queryByTestId('visual-diff-missing-rhs')).not.toBeInTheDocument();
  });

  it('shows an empty state when only dashboard-level fields changed', () => {
    config.featureToggles.dashboardVisualVersionDiff = true;
    const lhs = { title: 'A', panels: [{ id: 1, title: 'P', type: 'text', gridPos: { x: 0, y: 0, w: 12, h: 4 } }] };
    const rhs = { title: 'B', panels: [{ id: 1, title: 'P', type: 'text', gridPos: { x: 0, y: 0, w: 12, h: 4 } }] };

    render(
      <VersionHistoryComparison
        baseInfo={{ ...baseInfo, data: lhs }}
        newInfo={{ ...newInfo, data: rhs }}
        diffData={{ lhs, rhs }}
        isNewLatest={false}
        onRestore={onRestore}
        sharedTimeRange={sharedTimeRange}
      />
    );

    expect(screen.getByText(/No panel changes between these versions/)).toBeInTheDocument();
    expect(screen.getByText(/Dashboard-level changes/)).toBeInTheDocument();
  });
});
