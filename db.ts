import Dexie, { type Table } from 'dexie';
import { User, Account, Bucket, AppSettings, Transaction, ImportRule, MainCategory, SubCategory } from './types';

export class FamilyFlowDB extends Dexie {
  users!: Table<User, string>;
  accounts!: Table<Account, string>;
  buckets!: Table<Bucket, string>;
  settings!: Table<AppSettings & { id?: number }, number>;
  transactions!: Table<Transaction, string>;
  importRules!: Table<ImportRule, string>;
  
  mainCategories!: Table<MainCategory, string>;
  subCategories!: Table<SubCategory, string>;

  constructor() {
    super('FamilyFlowDB');
    
    // Define schema and indexes
    (this as any).version(4).stores({
      users: 'id',
      accounts: 'id',
      buckets: 'id, type, isSavings, accountId',
      settings: '++id',
      transactions: 'id, accountId, date, bucketId, categoryMainId, categorySubId, isVerified, description, [accountId+description]',
      importRules: 'id, keyword',
      mainCategories: 'id',
      subCategories: 'id, mainCategoryId'
    });
  }
}

export const db = new FamilyFlowDB();