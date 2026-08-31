import { fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';

import { selectors } from '@grafana/e2e-selectors';
import { TestProvider } from 'test/helpers/TestProvider';

import { PanelVersionDiff } from './PanelVersionDiff';

function renderDiff(props: Partial<React.ComponentProps<typeof PanelVersionDiff>> = {}) {
  const base = {
    panels: [
      {
        id: 1,
        title: 'CPU usage',
        type: 'timeseries',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [{ expr: 'cpu_usage' }],
      },
      {
        id: 2,
        title: 'Memory',
        type: 'stat',
        gridPos: { x: 12, y: 0, w: 12, h: 8 },
        targets: [{ expr: 'memory_usage' }],
      },
    ],
  };

  const next = {
    panels: [
      {
        id: 1,
        title: 'CPU load',
        type: 'timeseries',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [{ expr: 'cpu_load' }],
      },
      {
        id: 2,
        title: 'Memory',
        type: 'stat',
        gridPos: { x: 0, y: 8, w: 12, h: 8 },
        targets: [{ expr: 'memory_usage' }],
      },
      {
        id: 3,
        title: 'Errors',
        type: 'stat',
        gridPos: { x: 12, y: 8, w: 12, h: 8 },
        targets: [{ expr: 'errors_total' }],
      },
    ],
  };

  return render(
    <TestProvider>
      <PanelVersionDiff lhs={base} rhs={next} baseVersion={1} newVersion={2} {...props} />
    </TestProvider>
  );
}

describe('PanelVersionDiff', () => {
  it('renders side-by-side canvases with version labels', () => {
    renderDiff();

    expect(screen.getByText('Panel layout')).toBeInTheDocument();
    expect(screen.getByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.baseCanvas)).toBeInTheDocument();
    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.newCanvas)).toBeInTheDocument();
  });

  it('shows added panel only on the newer canvas', () => {
    renderDiff();

    expect(
      screen.queryByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('3', 'base'))
    ).not.toBeInTheDocument();
    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('3', 'next'))).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('shows removed panel only on the older canvas', () => {
    renderDiff({
      lhs: {
        panels: [
          { id: 1, title: 'Only old', type: 'stat', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] },
          { id: 2, title: 'Removed', type: 'stat', gridPos: { x: 12, y: 0, w: 12, h: 8 }, targets: [] },
        ],
      },
      rhs: {
        panels: [{ id: 1, title: 'Only old', type: 'stat', gridPos: { x: 0, y: 0, w: 12, h: 8 }, targets: [] }],
      },
    });

    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('2', 'base'))).toBeInTheDocument();
    expect(
      screen.queryByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('2', 'next'))
    ).not.toBeInTheDocument();
  });

  it('shows field diffs when clicking a changed panel', () => {
    renderDiff();

    fireEvent.click(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('1', 'next')));

    const details = screen.getByText('Title').closest('dl');
    expect(details).not.toBeNull();
    expect(within(details!).getByText('CPU usage')).toBeInTheDocument();
    expect(within(details!).getByText('CPU load')).toBeInTheDocument();
    expect(screen.getByText('Query')).toBeInTheDocument();
  });

  it('renders tab picker and filters panels by selected tab', () => {
    const tabbedDashboard = () => ({
      elements: {
        'panel-overview': {
          spec: {
            title: 'Overview panel',
            vizConfig: { group: 'stat' },
            data: { spec: { queries: [] } },
          },
        },
        'panel-details': {
          spec: {
            title: 'Details panel',
            vizConfig: { group: 'stat' },
            data: { spec: { queries: [] } },
          },
        },
      },
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              metadata: { name: 'overview' },
              spec: {
                title: 'Overview',
                layout: {
                  kind: 'GridLayout',
                  spec: {
                    items: [{ spec: { element: { name: 'panel-overview' }, x: 0, y: 0, width: 12, height: 8 } }],
                  },
                },
              },
            },
            {
              metadata: { name: 'details' },
              spec: {
                title: 'Details',
                layout: {
                  kind: 'GridLayout',
                  spec: {
                    items: [{ spec: { element: { name: 'panel-details' }, x: 0, y: 0, width: 12, height: 8 } }],
                  },
                },
              },
            },
          ],
        },
      },
    });

    renderDiff({
      lhs: tabbedDashboard(),
      rhs: tabbedDashboard(),
    });

    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.tabPicker)).toBeInTheDocument();
    expect(screen.getAllByText('Overview panel')).toHaveLength(2);
    expect(screen.queryByText('Details panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Details' }));

    expect(screen.queryByText('Overview panel')).not.toBeInTheDocument();
    expect(screen.getAllByText('Details panel')).toHaveLength(2);
  });
});
