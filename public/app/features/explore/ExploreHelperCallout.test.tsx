import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExploreHelperCallout } from './ExploreHelperCallout';

describe('ExploreHelperCallout', () => {
  it('renders the helper callout on first load', () => {
    render(<ExploreHelperCallout />);

    expect(screen.getByRole('status', { name: 'Lightbox demo' })).toBeInTheDocument();
    expect(screen.getByText('Try a query here. This environment is for the workshop.')).toBeInTheDocument();
  });

  it('can be dismissed without leaving leftover UI', async () => {
    const user = userEvent.setup();
    render(<ExploreHelperCallout />);

    await user.click(screen.getByRole('button', { name: 'Close alert' }));

    expect(screen.queryByRole('status', { name: 'Lightbox demo' })).not.toBeInTheDocument();
  });
});
