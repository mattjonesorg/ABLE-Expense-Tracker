import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

describe('App', () => {
  it('should render the home page', () => {
    render(<App />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
