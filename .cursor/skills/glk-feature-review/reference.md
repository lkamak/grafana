# GLK feature review — reference

## Version history / visual diff file map

| Area | Path |
|------|------|
| Compare orchestration | `public/app/features/dashboard-scene/settings/VersionsEditView.tsx` |
| Compare UI shell | `public/app/features/dashboard-scene/settings/version-history/VersionHistoryComparison.tsx` |
| Visual canvas | `public/app/features/dashboard-scene/settings/version-history/VisualDashboardDiff.tsx` |
| Diff model (v1/v2) | `public/app/features/dashboard-scene/settings/version-history/panelVersionDiff.ts` |
| Legacy JSON diff | `public/app/features/dashboard-scene/settings/version-history/utils.ts`, `DiffGroup.tsx` |
| E2E selectors | `packages/grafana-e2e-selectors/src/selectors/pages.ts` → `Dashboard.Settings.VersionHistory` |
| i18n | `public/locales/en-US/grafana.json` → `dashboard-scene.version-history-visual` |

## Visual version diff — review checklist

Verify fixes or consciously accept these risks:

1. **Cross-format compare (v1 vs v2)** — `computeVisualPanelVersionDiff` must not classify the same logical panels as removed+added when one revision is v1 (`panels`) and the other is v2 (`layout` + `elements`). Check `extractPanelsByTab` / `isV2Dashboard` around `panelVersionDiff.ts`.
2. **Tab correlation** — Tab buckets should not rely only on index IDs (`tab-0`) if tab reorder/insert between versions should still compare panels correctly.
3. **Drawer vs tab state** — Changing the visual-diff tab should clear or revalidate `selectedPanel` so the drawer cannot show a panel from another tab.
4. **Grid row height** — Moved panels must render in the correct row (y offset), including v2 `RowsLayout` y stacking.
5. **Query / threshold display** — Drawer uses readable summaries (`A: expr`, threshold steps), not raw JSON blobs.

## Tests (GLK-4)

```bash
yarn jest --no-watch \
  public/app/features/dashboard-scene/settings/version-history/panelVersionDiff.test.ts \
  public/app/features/dashboard-scene/settings/version-history/VisualDashboardDiff.test.tsx
```

Add or extend cases when fixing Bugbot findings in the diff model or UI.

## Jira

- Example ticket: **GLK-4** — Visual dashboard version diff on `fe-anysphere-demo.atlassian.net`, target repo `lkamak/grafana` (`main`).
- Open GLK issues: `assignee = currentUser() AND statusCategory != Done` via Atlassian MCP.

## Meeting context

Sep 14 enablement demo used this feature; tab stacking / ghost-panel displacement were called out as UI bugs to iterate on (Granola notes on dashboard visual diff).
