
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
  accountId: string; // Can be empty string to inherit from Group
  name: string;
  type: BucketType;
  icon?: string; // NEW: Custom emoji
  isSavings: boolean; // If true, builds capital. If false, is an expense.
  paymentSource?: 'INCOME' | 'BALANCE'; // 'INCOME' = Deducted from monthly flow. 'BALANCE' = Deducted from account assets (transfer/spend).
  backgroundImage?: string; // URL for the dream card background
  linkedGoalId?: string; // If this bucket is a generated spending post, this ID links to the parent Goal
  archivedDate?: string; // YYYY-MM. If set, the bucket is considered finished/inactive after this month.
  
  // NEW: Link to Operating Budget
  budgetGroupId?: string; 

  // Configuration per month. Values here are isolated per month.
  monthlyData: Record<MonthKey, BucketData>;

  // For Goal (Future Expense) - These define the lifespan of the goal
  targetAmount: number;
  targetDate: string; // YYYY-MM
  startSavingDate: string; // YYYY-MM

  // Event / Trip Mode
  eventStartDate?: string; // YYYY-MM-DD
  eventEndDate?: string;   // YYYY-MM-DD
  autoTagEvent?: boolean;  // Automatically link transactions in this date range to this bucket
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
  monthlyData: Record<MonthKey, BudgetGroupData>; 
  // LINK TO CASH FLOW: Which buckets fund this group? (Deprecated mechanism, prefer budgetGroupId on Bucket)
  linkedBucketIds?: string[];
  
  // NEW: Which account funds the standard subcategories in this group?
  defaultAccountId?: string;

  isCatchAll?: boolean; // If true, this is the "Other/Unbudgeted" group
  icon?: string;
  forecastType?: 'FIXED' | 'VARIABLE' | 'SAVINGS'; // Determines how forecast calculates projection
}

export interface SubCategory {
  id: string;
  name: string;
  mainCategoryId: string;
  icon?: string; // NEW: Custom emoji
  description?: string;
  deprecated_monthlyBudget?: number; // RENAMED: Use getEffectiveSubCategoryBudget instead
  budgetGroupId?: string; // Links this specific category to a high-level budget group
  accountId?: string; // Specific account override. If undefined, uses budgetGroup.defaultAccountId
  isSavings?: boolean; // NEW: Marks this category as savings/investment in the waterfall
}

// --- NEW: BUDGET TEMPLATES ---
export interface BudgetTemplate {
    id: string;
    name: string; // "Standard", "Sommar", "Jul"
    isDefault: boolean;
    // Map GroupID -> Limit
    groupLimits: Record<string, number>;
    // Map SubCategoryID -> Budget
    subCategoryBudgets: Record<string, number>;
    // Map BucketID -> Data (For Fixed/Daily only)
    bucketValues: Record<string, BucketData>;
}

export interface MonthConfig {
    monthKey: string; // "2025-06"
    templateId: string;
    // Overrides specific to this month (Optional)
    groupOverrides?: Record<string, number>;
    subCategoryOverrides?: Record<string, number>;
    bucketOverrides?: Record<string, BucketData>;
    isLocked?: boolean; 
}

export type TransactionType = 'EXPENSE' | 'TRANSFER' | 'INCOME';

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  description: string;
  
  balance?: number; // Account balance after transaction

  type?: TransactionType; // New: Distinguish between consumption (Expense) and movement (Transfer)
  
  linkedTransactionId?: string; // If matched with another transaction (e.g. internal transfer)
  linkedExpenseId?: string; // NEW: If this is a reimbursement, points to the original expense transaction ID

  // Funding / Budgeting (Used if type == TRANSFER)
  bucketId?: string; // Where the money comes from (Budget Post).
  
  // Statistics / Categorization (Used if type == EXPENSE)
  categoryMainId?: string; // What kind of expense is this? (e.g. "Food")
  categorySubId?: string;  // Specifics (e.g. "Groceries")

  isVerified: boolean; // If the user has approved/reviewed it
  source: 'manual' | 'import';
  originalText?: string;
  originalDate?: string; // If date is modified manually, keep original here for duplicate detection
  rowId?: string; // Helper to track CSV rows
  
  // UI Helpers for Import Review
  matchType?: 'rule' | 'history' | 'ai' | 'event'; // How was this categorized?
  aiSuggested?: boolean; // Deprecated, use matchType
  ruleMatch?: boolean; // Deprecated, use matchType
  isManuallyApproved?: boolean; // Transient state for UI during import
  
  isHidden?: boolean; // If true, ignored in calculations and history
}

export interface ImportRule {
  id: string;
  keyword: string;
  matchType: 'contains' | 'exact' | 'starts_with';
  accountId?: string; // Optional: If set, rule only applies to this account
  
  // Rule actions
  targetType?: TransactionType;
  targetBucketId?: string;
  targetCategoryMainId?: string;
  targetCategorySubId?: string;
  
  // Sign constraint
  sign?: 'positive' | 'negative'; // Only match transactions with this sign
}

export interface IgnoredSubscription {
    id: string; // Usually the description
}

export interface AppSettings {
  payday: number; // Day of month (e.g., 25)
  // Auto-approval settings for import
  autoApproveIncome?: boolean;
  autoApproveTransfer?: boolean;
  autoApproveExpense?: boolean;
  autoApproveSmartTransfers?: boolean; // New setting
}

export interface GlobalState {
  users: User[];
  accounts: Account[];
  buckets: Bucket[];
  
  // Categories & Groups
  mainCategories: MainCategory[];
  subCategories: SubCategory[];
  budgetGroups: BudgetGroup[];

  // Templates
  budgetTemplates: BudgetTemplate[];
  monthConfigs: MonthConfig[];

  settings: AppSettings;
  selectedMonth: string; // YYYY-MM
  transactions: Transaction[];
  importRules: ImportRule[];
  ignoredSubscriptions: IgnoredSubscription[];
}
