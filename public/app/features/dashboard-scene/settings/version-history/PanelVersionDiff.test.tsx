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

  it('places overlapping current tiles on separate rows so tab panels stay visible and clickable', async () => {
    const user = userEvent.setup();
    const dashboard = tabsDashboard([
      { id: 1, title: 'CPU', y: 0, height: 8 },
      { id: 2, title: 'Memory', y: 0, height: 8 },
    ]);

    render(<PanelVersionDiff lhs={dashboard} rhs={dashboard} />);

    const cpu = screen.getByTestId('panel-version-diff-tile-1');
    const memory = screen.getByTestId('panel-version-diff-tile-2');

    expect(cpu).toHaveStyle({ gridRow: '1 / span 8' });
    expect(memory).toHaveStyle({ gridRow: '9 / span 8' });

    await user.click(memory);

    expect(screen.getByTestId('panel-version-diff-details')).toHaveTextContent('Memory');
  });

  it('keeps a panel at its destination when it moves into a slot freed by a removal', async () => {
    const user = userEvent.setup();
    const previous = {
      panels: [
        { id: 1, title: 'CPU', type: 'timeseries', gridPos: { x: 0, y: 0, w: 12, h: 8 } },
        { id: 2, title: 'Memory', type: 'gauge', gridPos: { x: 12, y: 0, w: 12, h: 8 } },
      ],
    };
    const next = {
      panels: [{ id: 2, title: 'Memory', type: 'gauge', gridPos: { x: 0, y: 0, w: 12, h: 8 } }],
    };

    render(<PanelVersionDiff lhs={previous} rhs={next} />);

    const removed = screen.getByTestId('panel-version-diff-tile-1');
    const moved = screen.getByTestId('panel-version-diff-tile-2');

    expect(moved).toHaveStyle({
      gridColumn: '1 / span 12',
      gridRow: '1 / span 8',
    });
    expect(removed).toHaveStyle({
      gridColumn: '1 / span 12',
      gridRow: '9 / span 8',
    });
    expect(screen.getByTestId('panel-version-diff-ghost-2')).toHaveStyle({
      gridColumn: '13 / span 12',
      gridRow: '1 / span 8',
    });

    await user.click(removed);

    expect(screen.getByTestId('panel-version-diff-details')).toHaveTextContent('This panel was removed');
  });
});

function tabsDashboard(tabs: Array<{ id: number; title: string; y: number; height: number }>) {
  const elements: Record<string, unknown> = {};
  const tabItems = tabs.map((tab) => {
    const elementName = `panel-${tab.id}`;
    elements[elementName] = {
      kind: 'Panel',
      spec: {
        id: tab.id,
        title: tab.title,
        vizConfig: { kind: 'VizConfig', group: 'timeseries', spec: { fieldConfig: { defaults: {} } } },
        data: { kind: 'QueryGroup', spec: { queries: [] } },
      },
    };

    return {
      kind: 'TabsLayoutTab',
      spec: {
        title: tab.title,
        layout: {
          kind: 'GridLayout',
          spec: {
            items: [
              {
                kind: 'GridLayoutItem',
                spec: {
                  x: 0,
                  y: tab.y,
                  width: 12,
                  height: tab.height,
                  element: { kind: 'ElementReference', name: elementName },
                },
              },
            ],
          },
        },
      },
    };
  });

  return {
    elements,
    layout: {
      kind: 'TabsLayout',
      spec: { tabs: tabItems },
    },
  };
}
