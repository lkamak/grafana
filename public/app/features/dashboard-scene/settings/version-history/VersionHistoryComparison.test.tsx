import { fireEvent, render, screen } from '@testing-library/react';

import { TestProvider } from 'test/helpers/TestProvider';
import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';

import { VersionHistoryComparison } from './VersionHistoryComparison';

function revision(version: number, data: object): DecoratedRevisionModel {
  return {
    id: version,
    checked: false,
    uid: 'dash-uid',
    version,
    created: '2026-01-01T00:00:00Z',
    createdBy: 'editor',
    message: '',
    data,
    createdDateString: '2026-01-01',
    ageString: '1 month ago',
  };
}

const lhs = {
  panels: [{ id: 1, title: 'CPU', type: 'timeseries', gridPos: { x: 0, y: 0, w: 12, h: 8 } }],
};
const rhs = {
  panels: [{ id: 1, title: 'CPU usage', type: 'timeseries', gridPos: { x: 0, y: 0, w: 12, h: 8 } }],
};

describe('VersionHistoryComparison', () => {
  it('renders visual panel diff, restore, and JSON diff section', () => {
    render(
      <TestProvider>
        <VersionHistoryComparison
          baseInfo={revision(1, lhs)}
          newInfo={revision(2, rhs)}
          diffData={{ lhs, rhs }}
          isNewLatest
          onRestore={async () => true}
        />
      </TestProvider>
    );

    expect(screen.getByTestId('visual-panel-diff-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restore to version 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('panel-diff-id:1'));
    expect(screen.getByTestId('panel-diff-detail')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();

    expect(screen.getByText('View JSON diff')).toBeInTheDocument();
  });
});
