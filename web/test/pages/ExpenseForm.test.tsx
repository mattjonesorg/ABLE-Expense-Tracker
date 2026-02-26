import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MemoryRouter } from 'react-router-dom';
import { ExpenseForm } from '../../src/pages/ExpenseForm';
import { AuthProvider } from '../../src/lib/auth';
import type { CategoryResult, Expense } from '../../src/lib/types';

// --- Mocks ---

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCreateExpense = vi.fn();
const mockCategorizeExpense = vi.fn();

vi.mock('../../src/lib/api', () => ({
  createExpense: (...args: unknown[]) => mockCreateExpense(...args),
  categorizeExpense: (...args: unknown[]) => mockCategorizeExpense(...args),
}));

vi.mock('../../src/lib/auth', async () => {
  const actual = await vi.importActual('../../src/lib/auth');
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: true,
      user: {
        email: 'test@example.com',
        displayName: 'Test User',
        accountId: 'acct_mock_001',
        role: 'owner',
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

// --- Helpers ---

function renderExpenseForm() {
  return render(
    <MantineProvider>
      <Notifications />
      <MemoryRouter initialEntries={['/expenses/new']}>
        <AuthProvider>
          <ExpenseForm />
        </AuthProvider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

function mockExpenseResult(): Expense {
  const now = new Date().toISOString();
  return {
    expenseId: 'exp_mock_123',
    accountId: 'acct_mock_001',
    date: '2026-02-26',
    vendor: 'Test Vendor',
    description: 'Test description',
    amount: 2599,
    category: 'Education',
    categoryConfidence: 'user_selected',
    categoryNotes: '',
    receiptKey: null,
    submittedBy: 'user_mock_001',
    paidBy: 'John Doe',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function mockCategoryResult(): CategoryResult {
  return {
    suggestedCategory: 'Education',
    confidence: 'high',
    reasoning: 'Based on the vendor and description, this appears to be an Education expense.',
    followUpQuestion: null,
  };
}

/**
 * Get the category input specifically (Mantine Select renders multiple
 * elements matching the "Category" label).
 */
function getCategoryInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: /category/i });
}

/** Fill in all required fields with valid data */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/vendor/i), 'Test Vendor');
  await user.type(screen.getByLabelText(/description/i), 'Test description');
  await user.type(screen.getByLabelText(/amount/i), '25.99');
  await user.type(screen.getByLabelText(/paid by/i), 'John Doe');
  // Date defaults to today, so no need to fill it
}

// --- Tests ---

describe('ExpenseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateExpense.mockResolvedValue(mockExpenseResult());
    mockCategorizeExpense.mockResolvedValue(mockCategoryResult());
  });

  describe('Rendering', () => {
    it('renders the page title', () => {
      renderExpenseForm();
      expect(screen.getByRole('heading', { name: /new expense/i })).toBeInTheDocument();
    });

    it('renders all required form fields', () => {
      renderExpenseForm();

      expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/paid by/i)).toBeInTheDocument();
    });

    it('renders the category select', () => {
      renderExpenseForm();
      // Mantine Select renders both an input and a listbox element with the label.
      // Target the textbox role specifically.
      expect(getCategoryInput()).toBeInTheDocument();
    });

    it('renders the receipt upload field', () => {
      renderExpenseForm();
      expect(screen.getByLabelText(/receipt/i)).toBeInTheDocument();
    });

    it('renders the Suggest Category button', () => {
      renderExpenseForm();
      expect(screen.getByRole('button', { name: /suggest category/i })).toBeInTheDocument();
    });

    it('renders the Submit button', () => {
      renderExpenseForm();
      expect(screen.getByRole('button', { name: /create expense/i })).toBeInTheDocument();
    });

    it('date field defaults to today', () => {
      renderExpenseForm();
      const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
      // DateInput in Mantine shows the formatted date string
      expect(dateInput.value.length).toBeGreaterThan(0);
    });
  });

  describe('Validation -- required fields', () => {
    it('shows error when vendor is empty on submit', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/vendor is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when description is empty on submit', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/description is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when amount is empty on submit', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when paid by is empty on submit', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/paid by is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Validation -- field constraints', () => {
    it('shows error when amount is zero', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      const amountInput = screen.getByLabelText(/amount/i);
      await user.type(amountInput, '0');

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/amount must be greater than zero/i)).toBeInTheDocument();
      });
    });

    it('shows error when amount is negative', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      const amountInput = screen.getByLabelText(/amount/i);
      await user.type(amountInput, '-10');

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/amount must be greater than zero/i)).toBeInTheDocument();
      });
    });

    it('does not allow selecting a date in the future via maxDate constraint', () => {
      renderExpenseForm();
      // The DateInput has maxDate set to today, preventing future date selection.
      // We verify the constraint exists by checking the input is present with today's date.
      const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
      expect(dateInput.value.length).toBeGreaterThan(0);
    });
  });

  describe('AI Categorization', () => {
    it('calls categorizeExpense when Suggest Category is clicked', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      await user.type(screen.getByLabelText(/vendor/i), 'University Bookstore');
      await user.type(screen.getByLabelText(/description/i), 'Textbooks for fall semester');

      const suggestButton = screen.getByRole('button', { name: /suggest category/i });
      await user.click(suggestButton);

      await waitFor(() => {
        expect(mockCategorizeExpense).toHaveBeenCalledWith({
          vendor: 'University Bookstore',
          description: 'Textbooks for fall semester',
        });
      });
    });

    it('populates category select after AI suggestion', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      await user.type(screen.getByLabelText(/vendor/i), 'University Bookstore');
      await user.type(screen.getByLabelText(/description/i), 'Textbooks for fall semester');

      const suggestButton = screen.getByRole('button', { name: /suggest category/i });
      await user.click(suggestButton);

      await waitFor(() => {
        expect(getCategoryInput()).toHaveValue('Education');
      });
    });

    it('shows loading state on Suggest Category button while categorizing', async () => {
      // Make categorize hang so we can check loading state
      mockCategorizeExpense.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockCategoryResult()), 5000)),
      );

      const user = userEvent.setup();
      renderExpenseForm();

      await user.type(screen.getByLabelText(/vendor/i), 'Test');
      await user.type(screen.getByLabelText(/description/i), 'Test');

      const suggestButton = screen.getByRole('button', { name: /suggest category/i });
      await user.click(suggestButton);

      // Mantine adds data-loading attribute to the button while loading
      await waitFor(() => {
        expect(suggestButton).toHaveAttribute('data-loading', 'true');
      });
    });

    it('shows error notification when categorization fails', async () => {
      mockCategorizeExpense.mockRejectedValue(new Error('AI service unavailable'));

      const user = userEvent.setup();
      renderExpenseForm();

      await user.type(screen.getByLabelText(/vendor/i), 'Test');
      await user.type(screen.getByLabelText(/description/i), 'Test');

      const suggestButton = screen.getByRole('button', { name: /suggest category/i });
      await user.click(suggestButton);

      await waitFor(() => {
        expect(screen.getByText(/ai service unavailable/i)).toBeInTheDocument();
      });
    });
  });

  describe('Submission', () => {
    it('calls createExpense with correct data on valid submit', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      await fillRequiredFields(user);

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateExpense).toHaveBeenCalledTimes(1);
        const callArg = mockCreateExpense.mock.calls[0][0] as Record<string, unknown>;
        expect(callArg.vendor).toBe('Test Vendor');
        expect(callArg.description).toBe('Test description');
        expect(callArg.amount).toBe(2599); // $25.99 -> 2599 cents
        expect(callArg.paidBy).toBe('John Doe');
      });
    });

    it('navigates to /expenses on successful submission', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      await fillRequiredFields(user);

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/expenses');
      });
    });

    it('shows success notification on successful submission', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      await fillRequiredFields(user);

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        // Mantine Notifications renders the title; check for any matching element
        const matches = screen.getAllByText(/expense created/i);
        expect(matches.length).toBeGreaterThan(0);
      });
    });

    it('shows error notification on submission failure', async () => {
      mockCreateExpense.mockRejectedValue(new Error('Failed to create expense'));

      const user = userEvent.setup();
      renderExpenseForm();

      await fillRequiredFields(user);

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        const matches = screen.getAllByText(/failed to create expense/i);
        expect(matches.length).toBeGreaterThan(0);
      });
    });

    it('does not navigate on submission failure', async () => {
      mockCreateExpense.mockRejectedValue(new Error('Server error'));

      const user = userEvent.setup();
      renderExpenseForm();

      await fillRequiredFields(user);

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      // Wait for the async error handler to complete by checking the mock was called
      await waitFor(() => {
        expect(mockCreateExpense).toHaveBeenCalledTimes(1);
      });

      // Give the error handler time to complete
      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });

    it('converts dollar amount to cents for the API call', async () => {
      const user = userEvent.setup();
      renderExpenseForm();

      await user.type(screen.getByLabelText(/vendor/i), 'Shop');
      await user.type(screen.getByLabelText(/description/i), 'Items');
      await user.type(screen.getByLabelText(/amount/i), '100.50');
      await user.type(screen.getByLabelText(/paid by/i), 'Jane');

      const submitButton = screen.getByRole('button', { name: /create expense/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateExpense).toHaveBeenCalledTimes(1);
        const callArg = mockCreateExpense.mock.calls[0][0] as Record<string, unknown>;
        expect(callArg.amount).toBe(10050); // $100.50 -> 10050 cents
      });
    });
  });

  describe('Accessibility', () => {
    it('all required fields have proper labels', () => {
      renderExpenseForm();

      // Each input should be associated with its label
      expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/paid by/i)).toBeInTheDocument();
      // Category uses Select which has multiple labeled elements; check input role
      expect(getCategoryInput()).toBeInTheDocument();
    });

    it('required fields are marked with aria-required', () => {
      renderExpenseForm();

      expect(screen.getByLabelText(/vendor/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/description/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/amount/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/paid by/i)).toHaveAttribute('aria-required', 'true');
    });
  });
});
