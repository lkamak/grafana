import { SceneTimeRange } from '@grafana/scenes';

import { buildRevisionPanelPreviewScene } from './buildRevisionPanelPreviewScene';
import { type VisualPanelSnapshot } from './getVisualDashboardDiff';

describe('buildRevisionPanelPreviewScene', () => {
  const timeRange = { from: 'now-1h', to: 'now', timeZone: 'browser' };

  it('builds an embedded non-editable v1 one-panel scene', () => {
    const snapshot: VisualPanelSnapshot = {
      key: '1',
      title: 'CPU',
      type: 'timeseries',
      panel: {
        id: 1,
        title: 'CPU',
        type: 'timeseries',
        targets: [],
        gridPos: { x: 3, y: 2, w: 10, h: 6 },
      },
      layout: { x: 3, y: 2, w: 10, h: 6 },
    };

    const scene = buildRevisionPanelPreviewScene(snapshot, timeRange, {
      sourceDashboard: { title: 'Source', panels: [] },
    });

    expect(scene.state.meta.isEmbedded).toBe(true);
    expect(scene.state.meta.canEdit).toBe(false);
    expect(scene.state.$timeRange).toBeInstanceOf(SceneTimeRange);
    expect(scene.state.$timeRange?.state.from).toBe('now-1h');
  });

  it('builds an embedded non-editable v2 one-panel scene', () => {
    const snapshot: VisualPanelSnapshot = {
      key: 'panel-1',
      title: 'V2 Panel',
      type: 'timeseries',
      panel: {
        kind: 'Panel',
        spec: {
          id: 1,
          title: 'V2 Panel',
          description: '',
          links: [],
          data: { kind: 'QueryGroup', spec: { queries: [], transformations: [], queryOptions: {} } },
          vizConfig: { kind: 'VizConfig', group: 'timeseries', version: '', spec: { options: {}, fieldConfig: { defaults: {}, overrides: [] } } },
        },
      },
      layout: { x: 0, y: 0, width: 12, height: 8 },
    };

    const scene = buildRevisionPanelPreviewScene(snapshot, timeRange);

    expect(scene.state.meta.isEmbedded).toBe(true);
    expect(scene.state.meta.canEdit).toBe(false);
    expect(scene.state.title).toBe('Version preview');
  });
});
