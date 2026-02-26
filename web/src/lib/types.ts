// Shared types — mirrors @able-tracker/api types
// TODO: Replace with direct imports from shared package when workspace linking is set up

export type AbleCategory =
  | 'Education'
  | 'Housing'
  | 'Transportation'
  | 'Employment training & support'
  | 'Assistive technology & personal support'
  | 'Health, prevention & wellness'
  | 'Financial management & administrative'
  | 'Legal fees'
  | 'Oversight & monitoring'
  | 'Funeral & burial'
  | 'Basic living expenses';

export const ABLE_CATEGORIES = [
  'Education',
  'Housing',
  'Transportation',
  'Employment training & support',
  'Assistive technology & personal support',
  'Health, prevention & wellness',
  'Financial management & administrative',
  'Legal fees',
  'Oversight & monitoring',
  'Funeral & burial',
  'Basic living expenses',
] as const;

export interface Account {
  id: string;
  beneficiaryName: string;
  createdAt: string;
  createdBy: string;
}

export interface User {
  userId: string;
  accountId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'authorized_rep';
  cognitoSub: string;
}

export interface Expense {
  expenseId: string;
  accountId: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  category: AbleCategory;
  categoryConfidence: 'ai_confirmed' | 'ai_suggested' | 'user_selected';
  categoryNotes: string;
  receiptKey: string | null;
  submittedBy: string;
  paidBy: string;
  reimbursed: boolean;
  reimbursedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateExpenseInput = Omit<
  Expense,
  'expenseId' | 'createdAt' | 'updatedAt' | 'reimbursed' | 'reimbursedAt'
>;

export interface CategoryResult {
  suggestedCategory: AbleCategory;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  followUpQuestion: string | null;
}

export interface ReimbursementSummary {
  userId: string;
  displayName: string;
  totalOwed: number;
  expenseCount: number;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
