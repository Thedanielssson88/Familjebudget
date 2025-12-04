

export type MonthKey = string; // Format: "YYYY-MM"

export interface User {
  id: string;
  name: string;
  avatar: string; // Emoji or URL
  incomeData: Record<MonthKey, {
    salary: number;
    childBenefit: number;
    insurance: number;
    incomeLoss?: number; // Deprecated, calculated from days * deduction
    vabDays?: number; 
    dailyDeduction?: number; 
  }>;
}

export type BucketType = 'FIXED' | 'DAILY' | 'GOAL';

export interface BucketData {
  amount: number;      // For FIXED
  dailyAmount: number; // For DAILY
  activeDays: number[]; // For DAILY
  isExplicitlyDeleted?: boolean; // If true, hidden for this specific month
}

export interface Bucket {
  id: string;
  accountId: string;
  name: string;
  type: BucketType;
  isSavings: boolean; // If true, builds capital. If false, is an expense.
  paymentSource?: 'INCOME' | 'BALANCE'; // 'INCOME' = Deducted from monthly flow. 'BALANCE' = Deducted from account assets (transfer/spend).
  backgroundImage?: string; // URL for the dream card background
  linkedGoalId?: string; // If this bucket is a generated spending post, this ID links to the parent Goal

  // Configuration per month. Values here are isolated per month.
  monthlyData: Record<MonthKey, BucketData>;

  // For Goal (Future Expense) - These define the lifespan of the goal
  targetAmount: number;
  targetDate: string; // YYYY-MM
  startSavingDate: string; // YYYY-MM
}

export interface Account {
  id: string;
  name: string;
  icon: string;
  startBalances: Record<MonthKey, number>; // Manual override or carried over
}

export interface AppSettings {
  payday: number; // Day of month (e.g., 25)
}

export interface GlobalState {
  users: User[];
  accounts: Account[];
  buckets: Bucket[];
  settings: AppSettings;
  selectedMonth: string; // YYYY-MM
}