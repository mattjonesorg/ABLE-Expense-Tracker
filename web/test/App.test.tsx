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
  it('should redirect unauthenticated users to the login page', async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sign in/i }),
      ).toBeInTheDocument();
    });
  });

  it('should not show protected navigation to unauthenticated users', async () => {
    renderApp();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sign in/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
