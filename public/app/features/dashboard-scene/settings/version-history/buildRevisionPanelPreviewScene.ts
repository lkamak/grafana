import { type SceneTimeRangeState } from '@grafana/scenes';
import {
  defaultTimeSettingsSpec,
  type Spec as DashboardV2Spec,
} from '@grafana/schema/apis/dashboard.grafana.app/v2';
import { isRecord } from 'app/core/utils/isRecord';
import { AnnoKeyEmbedded } from 'app/features/apiserver/types';
import { isDashboardV2Spec } from 'app/features/dashboard/api/utils';
import { type DashboardDataDTO } from 'app/types/dashboard';

import { type DashboardScene } from '../../scene/DashboardScene';
import { transformSaveModelSchemaV2ToScene } from '../../serialization/transformSaveModelSchemaV2ToScene';
import { transformSaveModelToScene } from '../../serialization/transformSaveModelToScene';

import { type VisualPanelSnapshot } from './getVisualDashboardDiff';

export type PreviewTimeRange = Pick<SceneTimeRangeState, 'from' | 'to' | 'timeZone'>;

/**
 * Builds an embedded, non-editable DashboardScene containing a single panel from a revision snapshot.
 * Used for side-by-side visual version compare without mounting full dashboard canvases.
 */
export function buildRevisionPanelPreviewScene(
  snapshot: VisualPanelSnapshot,
  timeRange: PreviewTimeRange,
  options?: { sourceDashboard?: object }
): DashboardScene {
  if (isV2Element(snapshot.panel)) {
    return buildV2PreviewScene(snapshot, timeRange, options?.sourceDashboard);
  }
  return buildV1PreviewScene(snapshot, timeRange, options?.sourceDashboard);
}

function isV2Element(panel: unknown): boolean {
  return isRecord(panel) && (panel.kind === 'Panel' || panel.kind === 'LibraryPanel');
}

function buildV1PreviewScene(
  snapshot: VisualPanelSnapshot,
  timeRange: PreviewTimeRange,
  sourceDashboard?: object
): DashboardScene {
  const panel = isRecord(snapshot.panel) ? { ...snapshot.panel } : {};
  // Force a single full-width layout cell so the preview row is consistent.
  panel.gridPos = { x: 0, y: 0, w: 24, h: 8 };

  const source = isRecord(sourceDashboard) ? sourceDashboard : {};
  const dashboard: DashboardDataDTO = {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    ...(source as DashboardDataDTO),
    title: typeof source.title === 'string' ? source.title : 'Version preview',
    panels: [panel],
    time: {
      from: timeRange.from,
      to: timeRange.to,
    },
    timezone: timeRange.timeZone,
    editable: false,
    // Drop variables/annotations that would fan out extra queries in a 1-panel preview.
    templating: { list: [] },
    annotations: { list: [] },
  };

  return transformSaveModelToScene({
    dashboard,
    meta: {
      isEmbedded: true,
      canEdit: false,
      canSave: false,
      canMakeEditable: false,
      showSettings: false,
    },
  });
}

function buildV2PreviewScene(
  snapshot: VisualPanelSnapshot,
  timeRange: PreviewTimeRange,
  sourceDashboard?: object
): DashboardScene {
  const sourceSpec: Partial<DashboardV2Spec> =
    sourceDashboard && isDashboardV2Spec(sourceDashboard) ? sourceDashboard : {};

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const element = snapshot.panel as DashboardV2Spec['elements'][string];

  const spec: DashboardV2Spec = {
    title: sourceSpec.title ?? 'Version preview',
    description: sourceSpec.description,
    cursorSync: sourceSpec.cursorSync ?? 'Off',
    editable: false,
    preload: false,
    links: [],
    tags: sourceSpec.tags ?? [],
    annotations: [],
    variables: [],
    liveNow: sourceSpec.liveNow,
    timeSettings: {
      ...defaultTimeSettingsSpec(),
      from: timeRange.from,
      to: timeRange.to,
      timezone: timeRange.timeZone ?? 'browser',
      hideTimepicker: true,
    },
    elements: {
      [snapshot.key]: element,
    },
    layout: {
      kind: 'GridLayout',
      spec: {
        items: [
          {
            kind: 'GridLayoutItem',
            spec: {
              x: 0,
              y: 0,
              width: 24,
              height: 8,
              element: {
                kind: 'ElementReference',
                name: snapshot.key,
              },
            },
          },
        ],
      },
    },
  };

  return transformSaveModelSchemaV2ToScene({
    kind: 'DashboardWithAccessInfo',
    apiVersion: 'dashboard.grafana.app/v2',
    metadata: {
      name: 'version-preview',
      resourceVersion: '0',
      creationTimestamp: new Date(0).toISOString(),
      annotations: {
        [AnnoKeyEmbedded]: 'true',
      },
    },
    spec,
    access: {
      canEdit: false,
      canSave: false,
      canDelete: false,
      canAdmin: false,
      canStar: false,
      canShare: false,
    },
  });
}
