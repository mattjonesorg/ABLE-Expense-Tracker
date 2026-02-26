/**
 * Mock API client for ABLE Tracker.
 * All functions return promises to mirror real API calls.
 * Will be replaced with real fetch-based API calls in issue #54.
 */

import type { Expense, AbleCategory, CategoryResult } from './types';

/** Input for creating a new expense via the form */
export interface ExpenseFormInput {
  vendor: string;
  description: string;
  /** Amount in cents (integer) */
  amount: number;
  /** Date as YYYY-MM-DD string */
  date: string;
  paidBy: string;
  category: AbleCategory | null;
  categoryConfidence: 'ai_confirmed' | 'ai_suggested' | 'user_selected';
  receiptFile: File | null;
}

/** Input for AI categorization */
export interface CategorizeInput {
  vendor: string;
  description: string;
}

/** Filters for listing expenses */
export interface ListExpensesFilters {
  category?: AbleCategory | '';
  startDate?: string;
  endDate?: string;
}

const MOCK_EXPENSES: Expense[] = [
  {
    expenseId: '01JBQE1A2B3C4D5E6F7G8H9J0K',
    accountId: 'acct_mock_001',
    date: '2026-02-15',
    vendor: 'City Transit Authority',
    description: 'Monthly bus pass',
    amount: 7500,
    category: 'Transportation',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Public transit pass is a qualified transportation expense.',
    receiptKey: null,
    submittedBy: 'user_001',
    paidBy: 'Matt',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-02-15T10:30:00Z',
    updatedAt: '2026-02-15T10:30:00Z',
  },
  {
    expenseId: '01JBQE2B3C4D5E6F7G8H9J0KL',
    accountId: 'acct_mock_001',
    date: '2026-02-10',
    vendor: 'Whole Foods Market',
    description: 'Weekly groceries',
    amount: 12350,
    category: 'Basic living expenses',
    categoryConfidence: 'ai_confirmed',
    categoryNotes: 'Groceries qualify as basic living expenses.',
    receiptKey: 'receipts/mock-002.jpg',
    submittedBy: 'user_001',
    paidBy: 'Sarah',
    reimbursed: true,
    reimbursedAt: '2026-02-12T14:00:00Z',
    createdAt: '2026-02-10T08:15:00Z',
    updatedAt: '2026-02-12T14:00:00Z',
  },
  {
    expenseId: '01JBQE3C4D5E6F7G8H9J0KLM',
    accountId: 'acct_mock_001',
    date: '2026-01-28',
    vendor: 'Dr. Smith Family Practice',
    description: 'Annual checkup copay',
    amount: 4000,
    category: 'Health, prevention & wellness',
    categoryConfidence: 'ai_suggested',
    categoryNotes: 'Medical copay is a qualified health expense.',
    receiptKey: 'receipts/mock-003.jpg',
    submittedBy: 'user_002',
    paidBy: 'Matt',
    reimbursed: false,
    reimbursedAt: null,
    createdAt: '2026-01-28T16:45:00Z',
    updatedAt: '2026-01-28T16:45:00Z',
  },
  {
    expenseId: '01JBQE4D5E6F7G8H9J0KLMN',
    accountId: 'acct_mock_001',
    date: '2026-01-15',
    vendor: 'State University',
    description: 'Spring semester tuition deposit',
    amount: 250000,
    category: 'Education',
    categoryConfidence: 'user_selected',
    categoryNotes: 'Tuition is a qualified education expense.',
    receiptKey: 'receipts/mock-004.pdf',
    submittedBy: 'user_001',
    paidBy: 'Matt',
    reimbursed: true,
    reimbursedAt: '2026-01-20T09:00:00Z',
    createdAt: '2026-01-15T12:00:00Z',
    updatedAt: '2026-01-20T09:00:00Z',
  },
];

/**
 * Create a new expense.
 * Mock: simulates a 200ms network delay then returns a mock Expense.
 */
export async function createExpense(data: ExpenseFormInput): Promise<Expense> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  const now = new Date().toISOString();

  return {
    expenseId: `exp_mock_${Date.now()}`,
    accountId: 'acct_mock_001',
    date: data.date,
    vendor: data.vendor,
    description: data.description,
    amount: data.amount,
    category: data.category ?? 'Basic living expenses',
    categoryConfidence: data.categoryConfidence,
    categoryNotes: '',
    receiptKey: null,
    submittedBy: 'user_mock_001',
    paidBy: data.paidBy,
    reimbursed: false,
    reimbursedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Categorize an expense using AI.
 * Mock: simulates a 500ms network delay then returns a suggestion.
 */
export async function categorizeExpense(
  data: CategorizeInput,
): Promise<CategoryResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Simple mock logic based on keywords
  let suggestedCategory: AbleCategory = 'Basic living expenses';

  const text = `${data.vendor} ${data.description}`.toLowerCase();
  if (text.includes('tutor') || text.includes('school') || text.includes('book')) {
    suggestedCategory = 'Education';
  } else if (text.includes('rent') || text.includes('mortgage') || text.includes('utility')) {
    suggestedCategory = 'Housing';
  } else if (text.includes('uber') || text.includes('lyft') || text.includes('gas')) {
    suggestedCategory = 'Transportation';
  } else if (text.includes('doctor') || text.includes('pharmacy') || text.includes('medical')) {
    suggestedCategory = 'Health, prevention & wellness';
  }

  return {
    suggestedCategory,
    confidence: 'high',
    reasoning: `Based on the vendor "${data.vendor}" and description, this appears to be a ${suggestedCategory} expense.`,
    followUpQuestion: null,
  };
}

/**
 * Fetch the list of expenses, optionally filtered.
 * Currently returns mock data. Will be replaced with real API calls.
 */
export async function listExpenses(
  filters?: ListExpensesFilters,
): Promise<Expense[]> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  let results = [...MOCK_EXPENSES];

  if (filters?.category) {
    results = results.filter((e) => e.category === filters.category);
  }

  if (filters?.startDate) {
    results = results.filter((e) => e.date >= filters.startDate!);
  }

  if (filters?.endDate) {
    results = results.filter((e) => e.date <= filters.endDate!);
  }

  return results;
}
