import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { App } from '../src/App';

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );
}

describe('App', () => {
  it('should render the app title in the shell', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText('ABLE Tracker')).toBeInTheDocument();
    });
  });

  it('should render the Dashboard page at the root route', async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /dashboard/i }),
      ).toBeInTheDocument();
    });
  });
});
