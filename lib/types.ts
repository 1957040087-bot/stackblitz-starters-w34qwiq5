export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  note: string;
  date: string;
  createdAt?: any;
}

export interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  day: number;
  type: 'fixed' | 'saving';
  category: string;
}

export interface User {
  uid: string;
  displayName: string;
}

export interface MonthlyData {
  month: string;
  income: number;
  expense: number;
}
