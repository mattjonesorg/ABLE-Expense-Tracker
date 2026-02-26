import { describe, it, expect } from 'vitest';
import { createExpense, categorizeExpense } from '../../src/lib/api';
import type { ExpenseFormInput, CategorizeInput } from '../../src/lib/api';

describe('Mock API Client', () => {
  describe('createExpense', () => {
    it('returns an Expense with the provided fields', async () => {
      const input: ExpenseFormInput = {
        vendor: 'Test Vendor',
        description: 'Test description',
        amount: 2599,
        date: '2026-02-26',
        paidBy: 'John Doe',
        category: 'Education',
        categoryConfidence: 'user_selected',
        receiptFile: null,
      };

      const result = await createExpense(input);

      expect(result.vendor).toBe('Test Vendor');
      expect(result.description).toBe('Test description');
      expect(result.amount).toBe(2599);
      expect(result.date).toBe('2026-02-26');
      expect(result.paidBy).toBe('John Doe');
      expect(result.category).toBe('Education');
      expect(result.categoryConfidence).toBe('user_selected');
    });

    it('returns an Expense with generated ID', async () => {
      const input: ExpenseFormInput = {
        vendor: 'Shop',
        description: 'Items',
        amount: 1000,
        date: '2026-01-15',
        paidBy: 'Jane',
        category: null,
        categoryConfidence: 'user_selected',
        receiptFile: null,
      };

      const result = await createExpense(input);

      expect(result.expenseId).toBeTruthy();
      expect(result.expenseId).toContain('exp_mock_');
    });

    it('sets reimbursed to false by default', async () => {
      const input: ExpenseFormInput = {
        vendor: 'Shop',
        description: 'Items',
        amount: 1000,
        date: '2026-01-15',
        paidBy: 'Jane',
        category: 'Housing',
        categoryConfidence: 'user_selected',
        receiptFile: null,
      };

      const result = await createExpense(input);

      expect(result.reimbursed).toBe(false);
      expect(result.reimbursedAt).toBeNull();
    });

    it('defaults category to Basic living expenses when null', async () => {
      const input: ExpenseFormInput = {
        vendor: 'Shop',
        description: 'Items',
        amount: 1000,
        date: '2026-01-15',
        paidBy: 'Jane',
        category: null,
        categoryConfidence: 'user_selected',
        receiptFile: null,
      };

      const result = await createExpense(input);

      expect(result.category).toBe('Basic living expenses');
    });
  });

  describe('categorizeExpense', () => {
    it('returns a CategoryResult', async () => {
      const input: CategorizeInput = {
        vendor: 'University Bookstore',
        description: 'Textbooks for fall semester',
      };

      const result = await categorizeExpense(input);

      expect(result.suggestedCategory).toBeTruthy();
      expect(result.confidence).toBeTruthy();
      expect(result.reasoning).toBeTruthy();
    });

    it('suggests Education for school-related expenses', async () => {
      const input: CategorizeInput = {
        vendor: 'University Bookstore',
        description: 'Textbooks',
      };

      const result = await categorizeExpense(input);

      expect(result.suggestedCategory).toBe('Education');
    });

    it('suggests Housing for rent-related expenses', async () => {
      const input: CategorizeInput = {
        vendor: 'Apartment Complex',
        description: 'Monthly rent payment',
      };

      const result = await categorizeExpense(input);

      expect(result.suggestedCategory).toBe('Housing');
    });

    it('suggests Transportation for rideshare expenses', async () => {
      const input: CategorizeInput = {
        vendor: 'Uber',
        description: 'Ride to appointment',
      };

      const result = await categorizeExpense(input);

      expect(result.suggestedCategory).toBe('Transportation');
    });

    it('suggests Health for medical expenses', async () => {
      const input: CategorizeInput = {
        vendor: 'City Pharmacy',
        description: 'Prescription medications',
      };

      const result = await categorizeExpense(input);

      expect(result.suggestedCategory).toBe('Health, prevention & wellness');
    });

    it('defaults to Basic living expenses for unrecognized expenses', async () => {
      const input: CategorizeInput = {
        vendor: 'Generic Store',
        description: 'Miscellaneous items',
      };

      const result = await categorizeExpense(input);

      expect(result.suggestedCategory).toBe('Basic living expenses');
    });
  });
});
