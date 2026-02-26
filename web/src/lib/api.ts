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
