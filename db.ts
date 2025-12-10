import Dexie, { type Table } from 'dexie';
import { User, Account, Bucket, AppSettings, Transaction, ImportRule, MainCategory, SubCategory, BudgetGroup, IgnoredSubscription } from './types';

export class FamilyFlowDB extends Dexie {
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

  constructor() {
    super('FamilyFlowDB');
    
    // Define schema and indexes
    (this as any).version(8).stores({
      users: 'id',
      accounts: 'id',
      buckets: 'id, type, isSavings, accountId',
      settings: '++id',
      transactions: 'id, accountId, date, bucketId, categoryMainId, categorySubId, isVerified, description, linkedTransactionId, [accountId+description]',
      importRules: 'id, keyword, accountId',
      mainCategories: 'id',
      subCategories: 'id, mainCategoryId, budgetGroupId',
      budgetGroups: 'id',
      ignoredSubscriptions: 'id'
    });
  }
}

export const db = new FamilyFlowDB();