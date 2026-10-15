import { fireEvent, render, screen } from '@testing-library/react';

import { VersionHistoryComparison } from './VersionHistoryComparison';

jest.mock('./LazyDiffViewer', () => ({
  __esModule: true,
  default: () => <div data-testid="lazy-diff-viewer" />,
}));

const baseInfo = {
  version: 1,
  createdBy: 'editor',
  ageString: '1 day ago',
  message: '',
} as const;

const newInfo = {
  version: 2,
  createdBy: 'editor',
  ageString: 'now',
  message: '',
} as const;

describe('VersionHistoryComparison', () => {
  it('renders panel diff badges and expands changed panel details on click', () => {
    const lhs = {
      panels: [
        {
          id: 7,
          type: 'timeseries',
          title: 'CPU',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'rate(foo)' }],
          fieldConfig: { defaults: {}, overrides: [] },
        },
      ],
    };
    const rhs = {
      panels: [
        {
          id: 7,
          type: 'stat',
          title: 'CPU by host',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'rate(bar)' }],
          fieldConfig: { defaults: {}, overrides: [] },
        },
      ],
    };

    render(
      <VersionHistoryComparison
        baseInfo={baseInfo as never}
        newInfo={newInfo as never}
        diffData={{ lhs, rhs }}
        isNewLatest={false}
        onRestore={jest.fn()}
      />
    );

    expect(screen.getByTestId('panel-diff-visualization')).toBeInTheDocument();
    expect(screen.getByTestId('panel-diff-badge-7')).toHaveTextContent('Changed');

    fireEvent.click(screen.getByTestId('panel-diff-card-7'));
    const changes = screen.getByTestId('panel-diff-changes-7');
    expect(changes).toBeInTheDocument();
    expect(changes).toHaveTextContent('CPU → CPU by host');
  });
});
