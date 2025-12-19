
export type MonthKey = string; // Format: "YYYY-MM"

export interface Budget {
  id: string;
  name: string;
  icon: string;
  isDefault?: boolean;
}

export interface User {
  id: string;
  budgetId: string;
  name: string;
  avatar: string; // Emoji or URL
  incomeData: Record<MonthKey, {
    salary: number;
    childBenefit: number;
    insurance: number;
    incomeLoss?: number;
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
  budgetId: string;
  accountId: string; // Can be empty string to inherit from Group
  name: string;
  type: BucketType;
  icon?: string;
  isSavings: boolean;
  paymentSource?: 'INCOME' | 'BALANCE';
  backgroundImage?: string;
  linkedGoalId?: string;
  archivedDate?: string;
  
  budgetGroupId?: string; 

  monthlyData: Record<MonthKey, BucketData>;

  targetAmount: number;
  targetDate: string; // YYYY-MM
  startSavingDate: string; // YYYY-MM

  eventStartDate?: string; // YYYY-MM-DD
  eventEndDate?: string;   // YYYY-MM-DD
  autoTagEvent?: boolean;
}

export interface Account {
  id: string;
  budgetId: string;
  name: string;
  icon: string;
  type?: string; // NEW: Account type (CHECKING, SAVINGS, CREDIT)
  startBalances: Record<MonthKey, number>;
}

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
  budgetId: string;
  name: string;
  monthlyData: Record<MonthKey, BudgetGroupData>; 
  linkedBucketIds?: string[];
  defaultAccountId?: string;
  isCatchAll?: boolean;
  icon?: string;
  forecastType?: 'FIXED' | 'VARIABLE' | 'SAVINGS';
}

export interface SubCategory {
  id: string;
  name: string;
  mainCategoryId: string;
  icon?: string;
  description?: string;
  deprecated_monthlyBudget?: number;
  budgetGroupId?: string; // Links this specific category to a high-level budget group. Note: Links are per-budget in the current implementation but categories are shared.
  accountId?: string;
  isSavings?: boolean;
}

export interface BudgetTemplate {
    id: string;
    budgetId: string;
    name: string;
    isDefault: boolean;
    groupLimits: Record<string, number>;
    subCategoryBudgets: Record<string, number>;
    bucketValues: Record<string, BucketData>;
}

export interface MonthConfig {
    monthKey: string; // "2025-06"
    budgetId: string;
    templateId: string;
    groupOverrides?: Record<string, number>;
    subCategoryOverrides?: Record<string, number>;
    bucketOverrides?: Record<string, BucketData>;
    isLocked?: boolean; 
}

export type TransactionType = 'EXPENSE' | 'TRANSFER' | 'INCOME';

export interface Transaction {
  id: string;
  budgetId: string;
  accountId: string;
  date: string;
  amount: number;
  description: string;
  balance?: number;
  type?: TransactionType;
  linkedTransactionId?: string;
  linkedExpenseId?: string;
  bucketId?: string;
  categoryMainId?: string;
  categorySubId?: string;
  isVerified: boolean;
  source: 'manual' | 'import';
  originalText?: string;
  originalDate?: string;
  rowId?: string;
  matchType?: 'rule' | 'history' | 'ai' | 'event';
  aiSuggested?: boolean;
  ruleMatch?: boolean;
  isManuallyApproved?: boolean;
  isHidden?: boolean;
}

export interface ImportRule {
  id: string;
  budgetId: string;
  keyword: string;
  matchType: 'contains' | 'exact' | 'starts_with';
  accountId?: string;
  targetType?: TransactionType;
  targetBucketId?: string;
  targetCategoryMainId?: string;
  targetCategorySubId?: string;
  sign?: 'positive' | 'negative';
}

export interface IgnoredSubscription {
    id: string;
    budgetId: string;
}

export interface AppSettings {
  payday: number;
  autoApproveIncome?: boolean;
  autoApproveTransfer?: boolean;
  autoApproveExpense?: boolean;
  autoApproveSmartTransfers?: boolean;
}

export interface GlobalState {
  users: User[];
  accounts: Account[];
  buckets: Bucket[];
  mainCategories: MainCategory[];
  subCategories: SubCategory[];
  budgetGroups: BudgetGroup[];
  budgetTemplates: BudgetTemplate[];
  monthConfigs: MonthConfig[];
  settings: AppSettings;
  selectedMonth: string;
  transactions: Transaction[];
  importRules: ImportRule[];
  ignoredSubscriptions: IgnoredSubscription[];
}
