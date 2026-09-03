import { render, screen } from '@testing-library/react';

import { selectors } from '@grafana/e2e-selectors';
import { TestProvider } from 'test/helpers/TestProvider';
import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';

import { VersionHistoryComparison } from './VersionHistoryComparison';

const baseInfo: DecoratedRevisionModel = {
  id: 1,
  uid: 'abc',
  version: 1,
  created: '2024-01-01T00:00:00Z',
  createdBy: 'editor',
  message: '',
  data: {
    panels: [{ id: 1, title: 'Panel A', type: 'stat', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
  },
  createdDateString: '2024-01-01',
  ageString: '1 day ago',
};

const newInfo: DecoratedRevisionModel = {
  ...baseInfo,
  id: 2,
  version: 2,
  data: {
    panels: [{ id: 1, title: 'Panel B', type: 'stat', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
  },
};

describe('VersionHistoryComparison', () => {
  it('renders visual panel diff alongside restore and JSON diff', () => {
    render(
      <TestProvider>
        <VersionHistoryComparison
          baseInfo={baseInfo}
          newInfo={newInfo}
          diffData={{ lhs: baseInfo.data, rhs: newInfo.data }}
          isNewLatest={true}
          onRestore={jest.fn()}
        />
      </TestProvider>
    );

    expect(screen.getByText('Panel layout')).toBeInTheDocument();
    expect(screen.getByText('Restore to version 1')).toBeInTheDocument();
    expect(screen.getByText('View JSON diff')).toBeInTheDocument();
    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.compareRow)).toBeInTheDocument();
  });
});
