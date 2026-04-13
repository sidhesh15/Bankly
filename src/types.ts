/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionType = 'income' | 'expense' | 'unknown';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  isResolved: boolean;
}

export interface AnalysisResult {
  id?: string;
  transactions: Transaction[];
  totalIncome: number;
  totalExpenses: number;
  categories: Record<string, number>;
  incomeCategories?: Record<string, number>;
  fileName?: string;
  analyzedAt?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  budgets: Record<string, number>;
  createdAt: string;
}

export const DEFAULT_CATEGORIES = [
  'Food & Dining',
  'Shopping',
  'Housing',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Health',
  'Travel',
  'Salary',
  'Investment',
  'Transfer',
  'Other'
];
