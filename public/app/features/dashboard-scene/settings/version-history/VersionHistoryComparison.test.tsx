import { render, screen } from '@testing-library/react';

import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';

import { VersionHistoryComparison } from './VersionHistoryComparison';

jest.mock('./LazyDiffViewer', () => ({
  __esModule: true,
  default: () => <div>json-diff-stub</div>,
}));

function revision(version: number, data: object): DecoratedRevisionModel {
  return {
    id: version,
    version,
    createdDateString: '2023-01-01',
    createdBy: 'admin',
    message: 'save',
    checked: true,
    uid: 'dash',
    created: '2023-01-01T00:00:00Z',
    data,
    ageString: '1 day ago',
  };
}

const lhs = {
  panels: [
    {
      id: 1,
      title: 'CPU',
      type: 'timeseries',
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      targets: [{ expr: 'up' }],
    },
  ],
};

const rhs = {
  panels: [
    {
      id: 1,
      title: 'CPU usage',
      type: 'timeseries',
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      targets: [{ expr: 'up' }],
    },
  ],
};

describe('VersionHistoryComparison', () => {
  it('keeps restore available while showing the visual panel diff', () => {
    render(
      <VersionHistoryComparison
        baseInfo={revision(1, lhs)}
        newInfo={revision(2, rhs)}
        diffData={{ lhs, rhs }}
        isNewLatest={true}
        onRestore={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Restore to version 1/i })).toBeInTheDocument();
    expect(screen.getByTestId('panel-version-diff')).toBeInTheDocument();
    expect(screen.getByText('View JSON diff')).toBeInTheDocument();
  });

  it('hides restore when the newer selected version is not latest', () => {
    render(
      <VersionHistoryComparison
        baseInfo={revision(1, lhs)}
        newInfo={revision(2, rhs)}
        diffData={{ lhs, rhs }}
        isNewLatest={false}
        onRestore={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Restore to version/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('panel-version-diff')).toBeInTheDocument();
  });
});
