import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createDataFrame, LogLevel, type LogRowModel } from '@grafana/data';

import { LogPatternChips } from './LogPatternChips';
import { getTopLogPatterns, normalizeLogPattern, rowMatchesPattern } from './logPatternChips';

const makeRow = (entry: string, uid = entry): LogRowModel => ({
  uid,
  entryFieldIndex: 0,
  rowIndex: 0,
  dataFrame: createDataFrame({ fields: [] }),
  logLevel: LogLevel.info,
  entry,
  hasAnsi: false,
  hasUnescapedContent: false,
  labels: {},
  raw: entry,
  timeFromNow: '',
  timeEpochMs: 1,
  timeEpochNs: '1000000',
  timeLocal: '',
  timeUtc: '',
});

describe('logPatternChips', () => {
  it('normalizes variable tokens into a shared pattern', () => {
    expect(normalizeLogPattern('error connecting to 10.0.0.1 after 3 retries')).toBe(
      'error connecting to * after * retries'
    );
    expect(normalizeLogPattern('request 550e8400-e29b-41d4-a716-446655440000 at 2024-01-02T03:04:05Z failed')).toBe(
      'request * at * failed'
    );
  });

  it('returns top patterns with approximate counts', () => {
    const rows = [
      makeRow('error connecting to db', '1'),
      makeRow('error connecting to db', '2'),
      makeRow('error connecting to db', '3'),
      makeRow('user login succeeded', '4'),
    ];

    expect(getTopLogPatterns(rows)).toEqual([
      { id: 'error connecting to db', label: 'error connecting to db', count: 3 },
      { id: 'user login succeeded', label: 'user login succeeded', count: 1 },
    ]);
  });

  it('matches rows against a selected pattern', () => {
    const row = makeRow('timeout after 12 seconds');
    expect(rowMatchesPattern(row, 'timeout after * seconds')).toBe(true);
    expect(rowMatchesPattern(row, 'user login succeeded')).toBe(false);
  });
});

describe('LogPatternChips', () => {
  it('renders chips with labels and counts and toggles the filter', async () => {
    const user = userEvent.setup();
    const onSelectPattern = jest.fn();
    const rows = [
      makeRow('error connecting to db', '1'),
      makeRow('error connecting to db', '2'),
      makeRow('user login succeeded', '3'),
    ];

    const { rerender } = render(<LogPatternChips logRows={rows} onSelectPattern={onSelectPattern} />);

    expect(screen.getByRole('group', { name: 'Log patterns' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'error connecting to db (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'user login succeeded (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear pattern' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'error connecting to db (2)' }));
    expect(onSelectPattern).toHaveBeenCalledWith('error connecting to db');

    rerender(
      <LogPatternChips logRows={rows} selectedPattern="error connecting to db" onSelectPattern={onSelectPattern} />
    );

    expect(screen.getByRole('button', { name: 'error connecting to db (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clear pattern' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'error connecting to db (2)' }));
    expect(onSelectPattern).toHaveBeenCalledWith(undefined);

    await user.click(screen.getByRole('button', { name: 'Clear pattern' }));
    expect(onSelectPattern).toHaveBeenLastCalledWith(undefined);
  });

  it('renders nothing when there are no log rows', () => {
    render(<LogPatternChips logRows={[]} onSelectPattern={jest.fn()} />);
    expect(screen.queryByTestId('log-pattern-chips')).not.toBeInTheDocument();
  });
});
