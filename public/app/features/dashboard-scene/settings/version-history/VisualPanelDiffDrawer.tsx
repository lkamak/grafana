import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Drawer, Stack, Text, useStyles2 } from '@grafana/ui';

import { type FieldChange, type PanelDiffItem } from './visualDiff';

type Props = {
  item: PanelDiffItem | null;
  onClose: () => void;
};

export function VisualPanelDiffDrawer({ item, onClose }: Props) {
  if (!item) {
    return null;
  }

  const changes = item.fieldChanges.filter(
    (change) => change.oldValue !== change.newValue || change.oldValue !== undefined || change.newValue !== undefined
  );

  return (
    <Drawer
      title={item.title || t('dashboard-scene.version-history-visual.drawer-untitled', 'Untitled panel')}
      subtitle={t('dashboard-scene.version-history-visual.drawer-subtitle', 'Panel {{id}} changes', { id: item.id })}
      onClose={onClose}
      size="md"
    >
      {changes.length === 0 ? (
        <Text variant="bodySmall" color="secondary">
          <Trans i18nKey="dashboard-scene.version-history-visual.drawer-no-changes">
            No detailed field changes to show for this panel.
          </Trans>
        </Text>
      ) : (
        <Stack direction="column" gap={2}>
          {changes.map((change) => (
            <FieldChangeRow key={change.label} change={change} />
          ))}
        </Stack>
      )}
    </Drawer>
  );
}

function FieldChangeRow({ change }: { change: FieldChange }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.changeRow}>
      <Text weight="medium">{change.label}</Text>
      {change.oldValue !== undefined && (
        <Text variant="bodySmall" color="secondary">
          <Trans i18nKey="dashboard-scene.version-history-visual.field-was">Was:</Trans> {change.oldValue}
        </Text>
      )}
      {change.newValue !== undefined && (
        <Text variant="bodySmall">
          <Trans i18nKey="dashboard-scene.version-history-visual.field-now">Now:</Trans> {change.newValue}
        </Text>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  changeRow: css({
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
  }),
});
