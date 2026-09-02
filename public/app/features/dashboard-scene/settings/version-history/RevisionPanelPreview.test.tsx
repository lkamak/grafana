import { act, render } from '@testing-library/react';

import { SceneObjectBase, SceneTimeRange, sceneGraph } from '@grafana/scenes';
import { getDashboardSrv } from 'app/features/dashboard/services/DashboardSrv';

import { DashboardScene } from '../../scene/DashboardScene';
import { type DashboardLayoutManager } from '../../scene/types/DashboardLayoutManager';

import { RevisionPanelPreview } from './RevisionPanelPreview';
import { buildRevisionPanelPreviewScene } from './buildRevisionPanelPreviewScene';
import { type VisualPanelSnapshot } from './getVisualDashboardDiff';

jest.mock('./buildRevisionPanelPreviewScene', () => ({
  buildRevisionPanelPreviewScene: jest.fn(),
}));

class PreviewBody extends SceneObjectBase {
  public static Component = () => <div data-testid="revision-panel-preview-body" />;
}

function buildPreviewScene(from = 'now-1h', to = 'now') {
  return new DashboardScene({
    title: 'preview',
    meta: { isEmbedded: true },
    $timeRange: new SceneTimeRange({ from, to }),
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    body: new PreviewBody({}) as unknown as DashboardLayoutManager,
  });
}

const snapshot: VisualPanelSnapshot = {
  key: '1',
  title: 'CPU',
  type: 'timeseries',
  panel: { id: 1, title: 'CPU', type: 'timeseries' },
};

describe('RevisionPanelPreview', () => {
  const mockedBuild = buildRevisionPanelPreviewScene as jest.MockedFunction<typeof buildRevisionPanelPreviewScene>;

  afterEach(() => {
    jest.restoreAllMocks();
    mockedBuild.mockReset();
  });

  it('does not activate the preview DashboardScene or overwrite the current dashboard', () => {
    const scene = buildPreviewScene();
    mockedBuild.mockReturnValue(scene);
    const activateSpy = jest.spyOn(DashboardScene.prototype, 'activate');
    const previous = getDashboardSrv().getCurrent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDashboardSrv().setCurrent({ uid: 'open-dash' } as any);

    const sharedTimeRange = new SceneTimeRange({ from: 'now-1h', to: 'now' });
    const { unmount } = render(<RevisionPanelPreview snapshot={snapshot} sharedTimeRange={sharedTimeRange} />);

    expect(activateSpy).not.toHaveBeenCalled();
    expect(getDashboardSrv().getCurrent()?.uid).toBe('open-dash');

    unmount();
    expect(getDashboardSrv().getCurrent()?.uid).toBe('open-dash');

    getDashboardSrv().setCurrent(previous);
  });

  it('applies later time-picker changes through onTimeRangeChange', () => {
    const scene = buildPreviewScene();
    mockedBuild.mockReturnValue(scene);
    const previewTimeRange = sceneGraph.getTimeRange(scene);
    const onTimeRangeChange = jest.spyOn(previewTimeRange, 'onTimeRangeChange');
    const sharedTimeRange = new SceneTimeRange({ from: 'now-1h', to: 'now' });

    render(<RevisionPanelPreview snapshot={snapshot} sharedTimeRange={sharedTimeRange} />);

    act(() => {
      sharedTimeRange.setState({ from: 'now-6h', to: 'now' });
    });

    expect(onTimeRangeChange).toHaveBeenCalled();
    const lastCall = onTimeRangeChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.raw.from).toBe('now-6h');
    expect(lastCall?.raw.to).toBe('now');
    expect(previewTimeRange.state.from).toBe('now-6h');
    expect(previewTimeRange.state.to).toBe('now');
  });
});
