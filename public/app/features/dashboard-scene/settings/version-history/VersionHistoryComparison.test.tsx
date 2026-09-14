import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VersionHistoryComparison } from './VersionHistoryComparison';

jest.mock('./LazyDiffViewer', () => ({
  __esModule: true,
  default: () => <div>json-diff-viewer</div>,
}));

const baseInfo = {
  version: 1,
  createdBy: 'editor',
  ageString: '1 hour ago',
  message: '',
  id: 1,
  checked: false,
  uid: 'dash',
  created: '2024-01-01T00:00:00Z',
  createdDateString: '2024-01-01',
  data: {},
};

const newInfo = {
  ...baseInfo,
  version: 2,
};

describe('VersionHistoryComparison', () => {
  it('renders visual diff panel statuses and opens change drawer', async () => {
    const user = userEvent.setup();
    const lhs = {
      schemaVersion: 39,
      panels: [
        {
          id: 1,
          title: 'Old title',
          type: 'timeseries',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'old_query' }],
        },
      ],
    };
    const rhs = {
      schemaVersion: 39,
      panels: [
        {
          id: 1,
          title: 'New title',
          type: 'stat',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'new_query' }],
          fieldConfig: { defaults: { thresholds: { steps: [{ value: null, color: 'green' }] } } },
        },
      ],
    };

    render(
      <VersionHistoryComparison
        baseInfo={{ ...baseInfo, data: lhs }}
        newInfo={{ ...newInfo, data: rhs }}
        diffData={{ lhs, rhs }}
        isNewLatest={true}
        onRestore={async () => true}
      />
    );

    const panel = screen.getByTestId('visual-diff-panel-1');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Changed');

    await user.click(panel);

    expect(screen.getByText(/Title/)).toBeInTheDocument();
    expect(screen.getByText(/Old title → New title/)).toBeInTheDocument();
    expect(screen.getByText(/old_query → new_query/)).toBeInTheDocument();
  });

  it('shows Changed and Moved when a panel is relocated and its content changes', () => {
    const lhs = {
      schemaVersion: 39,
      panels: [
        {
          id: 1,
          title: 'Old title',
          type: 'timeseries',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'a' }],
        },
      ],
    };
    const rhs = {
      schemaVersion: 39,
      panels: [
        {
          id: 1,
          title: 'New title',
          type: 'timeseries',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [{ refId: 'A', expr: 'a' }],
        },
      ],
    };

    render(
      <VersionHistoryComparison
        baseInfo={{ ...baseInfo, data: lhs }}
        newInfo={{ ...newInfo, data: rhs }}
        diffData={{ lhs, rhs }}
        isNewLatest={true}
        onRestore={async () => true}
      />
    );

    const panel = screen.getByTestId('visual-diff-panel-1');
    expect(panel).toHaveTextContent('Changed');
    expect(panel).toHaveTextContent('Moved');
  });
});
