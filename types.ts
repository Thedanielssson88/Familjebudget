

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
  archivedDate?: string; // YYYY-MM. If set, the bucket is considered finished/inactive after this month.

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

// --- NEW CATEGORY INTERFACES ---
export interface MainCategory {
  id: string;
  name: string;
  description?: string;
}

export interface BudgetGroupData {
    limit: number;
    isExplicitlyDeleted?: boolean;
}

export interface BudgetGroup {
  id: string;
  name: string;
  // monthlyLimit: number; // DEPRECATED: Replaced by monthlyData
  monthlyData: Record<MonthKey, BudgetGroupData>; 
  isCatchAll?: boolean; // If true, this is the "Other/Unbudgeted" group
  icon?: string; 
}

export interface SubCategory {
  id: string;
  name: string;
  mainCategoryId: string;
  description?: string;
  monthlyBudget?: number; // Kept for reference, but BudgetGroup limit is primary
  budgetGroupId?: string; // Links this specific category to a high-level budget group
}

export type TransactionType = 'EXPENSE' | 'TRANSFER' | 'INCOME';

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  description: string;
  
  type?: TransactionType; // New: Distinguish between consumption (Expense) and movement (Transfer)

  // Funding / Budgeting (Used if type == TRANSFER)
  bucketId?: string; // Where the money comes from (Budget Post).
  
  // Statistics / Categorization (Used if type == EXPENSE)
  categoryMainId?: string; // What kind of expense is this? (e.g. "Food")
  categorySubId?: string;  // Specifics (e.g. "Groceries")

  isVerified: boolean; // If the user has approved/reviewed it
  source: 'manual' | 'import';
  originalText?: string;
  rowId?: string; // Helper to track CSV rows
  
  // UI Helpers for Import Review
  matchType?: 'rule' | 'history' | 'ai'; // How was this categorized?
  aiSuggested?: boolean; // Deprecated, use matchType
  ruleMatch?: boolean; // Deprecated, use matchType
}

export interface ImportRule {
  id: string;
  keyword: string;
  matchType: 'contains' | 'exact' | 'starts_with';
  
  // Rule actions
  targetType?: TransactionType;
  targetBucketId?: string;
  targetCategoryMainId?: string;
  targetCategorySubId?: string;
}

export interface AppSettings {
  payday: number; // Day of month (e.g., 25)
}

export interface GlobalState {
  users: User[];
  accounts: Account[];
  buckets: Bucket[];
  
  // Categories & Groups
  mainCategories: MainCategory[];
  subCategories: SubCategory[];
  budgetGroups: BudgetGroup[];

  settings: AppSettings;
  selectedMonth: string; // YYYY-MM
  transactions: Transaction[];
  importRules: ImportRule[];
}