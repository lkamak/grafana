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
      <PanelVersionDiff
        lhs={props.lhs ?? base}
        rhs={props.rhs ?? next}
        baseVersion={props.baseVersion ?? 1}
        newVersion={props.newVersion ?? 2}
      />
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

  it('does not overlap tiles after a collapsed v1 row', () => {
    const collapsedDashboard = {
      panels: [
        {
          type: 'row',
          collapsed: true,
          gridPos: { x: 0, y: 0, w: 24, h: 1 },
          panels: [{ id: 1, title: 'Inside row', type: 'stat', gridPos: { x: 0, y: 1, w: 12, h: 8 }, targets: [] }],
        },
        { id: 2, title: 'After row', type: 'stat', gridPos: { x: 0, y: 1, w: 12, h: 8 }, targets: [] },
      ],
    };

    renderDiff({
      lhs: collapsedDashboard,
      rhs: collapsedDashboard,
    });

    const inside = screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('1', 'base'));
    const after = screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('2', 'base'));

    expect(inside.style.gridRow).toBe('2 / span 8');
    expect(after.style.gridRow).toBe('10 / span 8');
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

  it('renders a tab picker for tabs nested inside a rows layout', () => {
    const nestedTabDashboard = () => ({
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
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              spec: {
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
                              items: [
                                { spec: { element: { name: 'panel-overview' }, x: 0, y: 0, width: 12, height: 8 } },
                              ],
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
                              items: [
                                { spec: { element: { name: 'panel-details' }, x: 0, y: 0, width: 12, height: 8 } },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    });

    renderDiff({
      lhs: nestedTabDashboard(),
      rhs: nestedTabDashboard(),
    });

    expect(screen.queryByText('No panels to compare in these versions.')).not.toBeInTheDocument();
    expect(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.tabPicker)).toBeInTheDocument();
    expect(screen.getAllByText('Overview panel')).toHaveLength(2);
    expect(screen.queryByText('Details panel')).not.toBeInTheDocument();
  });

  it('keeps sibling tab groups independently selectable', () => {
    const dashboard = {
      elements: {
        cpu: { spec: { title: 'CPU panel', vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } } },
        memory: { spec: { title: 'Memory panel', vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } } },
        app: { spec: { title: 'App panel', vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } } },
        system: { spec: { title: 'System panel', vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } } },
      },
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [
            {
              spec: {
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        metadata: { name: 'cpu' },
                        spec: {
                          title: 'CPU',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'cpu' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                      {
                        metadata: { name: 'memory' },
                        spec: {
                          title: 'Memory',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'memory' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            {
              spec: {
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        metadata: { name: 'app' },
                        spec: {
                          title: 'App',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'app' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                      {
                        metadata: { name: 'system' },
                        spec: {
                          title: 'System',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'system' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    renderDiff({ lhs: dashboard, rhs: dashboard });

    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getAllByText('CPU panel')).toHaveLength(2);
    expect(screen.getAllByText('App panel')).toHaveLength(2);

    fireEvent.click(screen.getByRole('radio', { name: 'Memory' }));
    fireEvent.click(screen.getByRole('radio', { name: 'System' }));

    expect(screen.queryByText('CPU panel')).not.toBeInTheDocument();
    expect(screen.queryByText('App panel')).not.toBeInTheDocument();
    expect(screen.getAllByText('Memory panel')).toHaveLength(2);
    expect(screen.getAllByText('System panel')).toHaveLength(2);
  });

  it('compares the merged default tab on both canvases when first tabs differ', () => {
    renderDiff({
      lhs: tabbedDashboard([
        { id: 'overview', title: 'Overview', panelTitle: 'Overview panel' },
        { id: 'details', title: 'Details', panelTitle: 'Details panel' },
      ]),
      rhs: tabbedDashboard([
        { id: 'new-tab', title: 'New', panelTitle: 'New panel' },
        { id: 'overview', title: 'Overview', panelTitle: 'Overview panel' },
        { id: 'details', title: 'Details', panelTitle: 'Details panel' },
      ]),
    });

    expect(screen.getByRole('radio', { name: 'Overview' })).toBeChecked();
    expect(screen.getAllByText('Overview panel')).toHaveLength(2);
    expect(screen.queryByText('New panel')).not.toBeInTheDocument();
  });

  it('leaves a canvas empty when the selected tab is missing from that version', () => {
    renderDiff({
      lhs: tabbedDashboard([{ id: 'overview', title: 'Overview', panelTitle: 'Overview panel' }]),
      rhs: tabbedDashboard([
        { id: 'new-tab', title: 'New', panelTitle: 'New panel' },
        { id: 'overview', title: 'Overview', panelTitle: 'Overview panel' },
      ]),
    });

    fireEvent.click(screen.getByRole('radio', { name: 'New' }));

    expect(screen.queryByText('Overview panel')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(selectors.pages.Dashboard.Settings.Versions.panelTile('untitled:New panel:stat', 'base'))
    ).not.toBeInTheDocument();
    expect(screen.getByText('New panel')).toBeInTheDocument();
    expect(
      within(screen.getByTestId(selectors.pages.Dashboard.Settings.Versions.baseCanvas)).getByText(
        'No panels in this version.'
      )
    ).toBeInTheDocument();
  });

  it('shows nested tab panels when the parent tab is selected', () => {
    const dashboard = {
      elements: {
        innerA: { spec: { title: 'Inner A panel', vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } } },
        innerB: { spec: { title: 'Inner B panel', vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } } },
      },
      layout: {
        kind: 'TabsLayout',
        spec: {
          tabs: [
            {
              metadata: { name: 'parent' },
              spec: {
                title: 'Parent',
                layout: {
                  kind: 'TabsLayout',
                  spec: {
                    tabs: [
                      {
                        metadata: { name: 'inner-a' },
                        spec: {
                          title: 'Inner A',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'innerA' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                      {
                        metadata: { name: 'inner-b' },
                        spec: {
                          title: 'Inner B',
                          layout: {
                            kind: 'GridLayout',
                            spec: {
                              items: [{ spec: { element: { name: 'innerB' }, x: 0, y: 0, width: 12, height: 8 } }],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    renderDiff({ lhs: dashboard, rhs: dashboard });

    expect(screen.getAllByText('Inner A panel')).toHaveLength(2);
    expect(screen.queryByText('Inner B panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Inner B' }));

    expect(screen.queryByText('Inner A panel')).not.toBeInTheDocument();
    expect(screen.getAllByText('Inner B panel')).toHaveLength(2);
  });
});

function tabbedDashboard(tabs: Array<{ id: string; title: string; panelTitle: string }>) {
  const elements: Record<
    string,
    { spec: { title: string; vizConfig: { group: string }; data: { spec: { queries: never[] } } } }
  > = {};
  for (const tab of tabs) {
    elements[tab.id] = {
      spec: { title: tab.panelTitle, vizConfig: { group: 'stat' }, data: { spec: { queries: [] } } },
    };
  }

  return {
    elements,
    layout: {
      kind: 'TabsLayout',
      spec: {
        tabs: tabs.map((tab) => ({
          metadata: { name: tab.id },
          spec: {
            title: tab.title,
            layout: {
              kind: 'GridLayout',
              spec: {
                items: [{ spec: { element: { name: tab.id }, x: 0, y: 0, width: 12, height: 8 } }],
              },
            },
          },
        })),
      },
    },
  };
}
