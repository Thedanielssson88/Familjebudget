import Dexie, { type Table } from 'dexie';
import { User, Account, Bucket, AppSettings } from './types';

export class FamilyFlowDB extends Dexie {
  users!: Table<User, string>;
  accounts!: Table<Account, string>;
  buckets!: Table<Bucket, string>;
  settings!: Table<AppSettings & { id?: number }, number>;

  constructor() {
    super('FamilyFlowDB');
    
    // Define schema and indexes
    (this as any).version(1).stores({
      users: 'id',
      accounts: 'id',
      buckets: 'id, type, isSavings, accountId', // Index for frequent queries
      settings: '++id' // Singleton table for settings
    });
  }
}

export const db = new FamilyFlowDB();