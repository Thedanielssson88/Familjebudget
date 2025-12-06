import Dexie, { type Table } from 'dexie';
import { User, Account, Bucket, AppSettings, Transaction, ImportRule } from './types';

export class FamilyFlowDB extends Dexie {
  users!: Table<User, string>;
  accounts!: Table<Account, string>;
  buckets!: Table<Bucket, string>;
  settings!: Table<AppSettings & { id?: number }, number>;
  transactions!: Table<Transaction, string>;
  importRules!: Table<ImportRule, string>;

  constructor() {
    super('FamilyFlowDB');
    
    // Define schema and indexes
    (this as any).version(2).stores({
      users: 'id',
      accounts: 'id',
      buckets: 'id, type, isSavings, accountId',
      settings: '++id',
      transactions: 'id, accountId, date, categoryId, isVerified',
      importRules: 'id'
    });
  }
}

export const db = new FamilyFlowDB();