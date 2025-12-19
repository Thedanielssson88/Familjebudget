
import Dexie, { type Table } from 'dexie';
import { User, Account, Bucket, AppSettings, Transaction, ImportRule, MainCategory, SubCategory, BudgetGroup, IgnoredSubscription, BudgetTemplate, MonthConfig, Budget } from './types';

export class FamilyFlowDB extends Dexie {
  budgets!: Table<Budget, string>;
  users!: Table<User, string>;
  accounts!: Table<Account, string>;
  buckets!: Table<Bucket, string>;
  settings!: Table<AppSettings & { id?: number }, number>;
  transactions!: Table<Transaction, string>;
  importRules!: Table<ImportRule, string>;
  
  mainCategories!: Table<MainCategory, string>;
  subCategories!: Table<SubCategory, string>;
  budgetGroups!: Table<BudgetGroup, string>;
  ignoredSubscriptions!: Table<IgnoredSubscription, string>;
  
  budgetTemplates!: Table<BudgetTemplate, string>;
  monthConfigs!: Table<MonthConfig, string>;

  constructor() {
    super('FamilyFlowDB');
    
    // Cast 'this' to 'any' to avoid potential environment-specific TS errors with version()
    (this as any).version(11).stores({
      budgets: 'id',
      users: 'id, budgetId',
      accounts: 'id, budgetId',
      buckets: 'id, budgetId, type, isSavings, accountId',
      settings: '++id',
      transactions: 'id, budgetId, accountId, date, bucketId, categoryMainId, categorySubId, isVerified, description, linkedTransactionId, linkedExpenseId, [accountId+description]',
      importRules: 'id, budgetId, keyword, accountId',
      mainCategories: 'id',
      subCategories: 'id, mainCategoryId, budgetGroupId',
      budgetGroups: 'id, budgetId',
      ignoredSubscriptions: 'id, budgetId',
      budgetTemplates: 'id, budgetId',
      monthConfigs: 'monthKey, budgetId'
    });
  }
}

export const db = new FamilyFlowDB();
