import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { Expenses } from '../../src/pages/Expenses';

function renderExpenses() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('Expenses Page', () => {
  it('renders the Expenses heading', () => {
    renderExpenses();
    expect(
      screen.getByRole('heading', { name: /expenses/i }),
    ).toBeInTheDocument();
  });

  it('shows an empty state message when there are no expenses', () => {
    renderExpenses();
    expect(
      screen.getByText(/no expenses yet/i),
    ).toBeInTheDocument();
  });

  it('has accessible heading structure', () => {
    renderExpenses();
    const heading = screen.getByRole('heading', { name: /expenses/i });
    expect(heading.tagName).toMatch(/^H[1-6]$/);
  });
});
