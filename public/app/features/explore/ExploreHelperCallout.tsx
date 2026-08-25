import { css } from '@emotion/css';
import { useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Alert, useStyles2 } from '@grafana/ui';

export function ExploreHelperCallout() {
  const styles = useStyles2(getStyles);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Alert
        severity="info"
        title={t('explore.lightbox-demo-callout.title', 'Lightbox demo')}
        onRemove={() => setDismissed(true)}
        bottomSpacing={0}
      >
        {t('explore.lightbox-demo-callout.body', 'Try a query here. This environment is for the workshop.')}
      </Alert>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    padding: theme.spacing(1, 2, 0, 2),
    flexShrink: 0,
  }),
});
