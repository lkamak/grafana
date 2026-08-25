import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PanelVersionDiff } from './PanelVersionDiff';

const lhs = {
  panels: [
    {
      id: 1,
      title: 'CPU',
      type: 'timeseries',
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      targets: [{ expr: 'rate(cpu[5m])' }],
      fieldConfig: {
        defaults: {
          thresholds: { mode: 'absolute', steps: [{ value: 80, color: 'red' }] },
        },
      },
    },
    {
      id: 2,
      title: 'Memory',
      type: 'gauge',
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      targets: [{ expr: 'mem' }],
    },
  ],
};

const rhs = {
  panels: [
    {
      id: 1,
      title: 'CPU usage',
      type: 'gauge',
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      targets: [{ expr: 'rate(cpu[1m])' }],
      fieldConfig: {
        defaults: {
          thresholds: { mode: 'absolute', steps: [{ value: 90, color: 'red' }] },
        },
      },
    },
    {
      id: 2,
      title: 'Memory',
      type: 'gauge',
      gridPos: { x: 0, y: 8, w: 12, h: 8 },
      targets: [{ expr: 'mem' }],
    },
    {
      id: 3,
      title: 'Errors',
      type: 'logs',
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      targets: [{ expr: '{job="api"}' }],
    },
  ],
};

describe('PanelVersionDiff', () => {
  it('renders visual status badges for added, changed, and moved panels', () => {
    render(<PanelVersionDiff lhs={lhs} rhs={rhs} />);

    expect(screen.getByTestId('panel-version-diff')).toBeInTheDocument();
    expect(screen.getByTestId('panel-version-diff-tile-1')).toHaveTextContent('changed');
    expect(screen.getByTestId('panel-version-diff-tile-2')).toHaveTextContent('moved');
    expect(screen.getByTestId('panel-version-diff-ghost-2')).toBeInTheDocument();
    expect(screen.getByTestId('panel-version-diff-tile-3')).toHaveTextContent('added');
  });

  it('keeps current tiles above moved-panel ghosts so destination panels stay clickable', async () => {
    const user = userEvent.setup();
    render(<PanelVersionDiff lhs={lhs} rhs={rhs} />);

    const ghost = screen.getByTestId('panel-version-diff-ghost-2');
    const added = screen.getByTestId('panel-version-diff-tile-3');

    expect(Number(window.getComputedStyle(ghost).zIndex)).toBeLessThan(Number(window.getComputedStyle(added).zIndex));

    await user.click(added);

    expect(screen.getByTestId('panel-version-diff-details')).toHaveTextContent('Errors');
  });

  it('shows human-readable field changes when a changed panel is clicked', async () => {
    const user = userEvent.setup();
    render(<PanelVersionDiff lhs={lhs} rhs={rhs} />);

    await user.click(screen.getByTestId('panel-version-diff-tile-1'));

    const details = screen.getByTestId('panel-version-diff-details');
    expect(details).toHaveTextContent('Title');
    expect(details).toHaveTextContent('CPU');
    expect(details).toHaveTextContent('CPU usage');
    expect(details).toHaveTextContent('Query');
    expect(details).toHaveTextContent('rate(cpu[5m])');
    expect(details).toHaveTextContent('rate(cpu[1m])');
    expect(details).toHaveTextContent('Visualization');
    expect(details).toHaveTextContent('timeseries');
    expect(details).toHaveTextContent('gauge');
    expect(details).toHaveTextContent('Thresholds');
    expect(details).toHaveTextContent('80 → red');
    expect(details).toHaveTextContent('90 → red');
  });
});
