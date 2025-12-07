import React, { createContext, useContext, useEffect, useState } from 'react';
import { Account, AppSettings, Bucket, GlobalState, User, MonthKey, Transaction, ImportRule, MainCategory, SubCategory, BudgetGroup, BudgetGroupData } from './types';
import { format, addMonths, parseISO } from 'date-fns';
import { getEffectiveBucketData, generateId, isBucketActiveInMonth, calculateFixedBucketCost, calculateDailyBucketCost, calculateGoalBucketCost, getEffectiveBudgetGroupData } from './utils';
import { z } from 'zod';
import { db } from './db';
import { DEFAULT_MAIN_CATEGORIES, DEFAULT_SUB_CATEGORIES } from './constants/defaultCategories';

// --- ZOD SCHEMAS FOR VALIDATION (Still used for Import/Backup) ---
// ... (keep existing schemas unchanged)

const BucketDataSchema = z.object({
  amount: z.number().optional().default(0),
  dailyAmount: z.number().optional().default(0),
  activeDays: z.array(z.number()).optional().default([]),
  isExplicitlyDeleted: z.boolean().optional()
});

const BucketTypeSchema = z.enum(['FIXED', 'DAILY', 'GOAL']);
const PaymentSourceSchema = z.enum(['INCOME', 'BALANCE']);

const BucketSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  type: BucketTypeSchema,
  isSavings: z.boolean(),
  paymentSource: PaymentSourceSchema.optional(),
  backgroundImage: z.string().optional(),
  linkedGoalId: z.string().optional(),
  archivedDate: z.string().optional(),
  monthlyData: z.record(z.string(), BucketDataSchema),
  targetAmount: z.number().optional().default(0),
  targetDate: z.string().optional().default(''),
  startSavingDate: z.string().optional().default('')
});

const UserIncomeDataSchema = z.object({
  salary: z.number().optional().default(0),
  childBenefit: z.number().optional().default(0),
  insurance: z.number().optional().default(0),
  incomeLoss: z.number().optional().default(0),
  vabDays: z.number().optional().default(0),
  dailyDeduction: z.number().optional().default(0)
});

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  incomeData: z.record(z.string(), UserIncomeDataSchema)
});

const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  startBalances: z.record(z.string(), z.number()).optional().default({})
});

const AppSettingsSchema = z.object({
  payday: z.number(),
  autoApproveIncome: z.boolean().optional(),
  autoApproveTransfer: z.boolean().optional(),
  autoApproveExpense: z.boolean().optional(),
});

const MainCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional()
});

const SubCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  mainCategoryId: z.string(),
  description: z.string().optional(),
  budgetGroupId: z.string().optional(),
  monthlyBudget: z.number().optional()
});

const BudgetGroupDataSchema = z.object({
    limit: z.number(),
    isExplicitlyDeleted: z.boolean().optional()
});

const BudgetGroupSchema = z.object({
    id: z.string(),
    name: z.string(),
    // monthlyLimit: z.number(), // REMOVED
    monthlyData: z.record(z.string(), BudgetGroupDataSchema).optional().default({}),
    isCatchAll: z.boolean().optional(),
    icon: z.string().optional()
});

const TransactionSchema = z.object({
    id: z.string(),
    accountId: z.string(),
    date: z.string(),
    amount: z.number(),
    description: z.string(),
    type: z.enum(['EXPENSE', 'TRANSFER', 'INCOME']).optional(),
    bucketId: z.string().optional(),
    categoryMainId: z.string().optional(),
    categorySubId: z.string().optional(),
    isVerified: z.boolean(),
    source: z.enum(['manual', 'import'])
});

const ImportRuleSchema = z.object({
    id: z.string(),
    keyword: z.string(),
    targetType: z.enum(['EXPENSE', 'TRANSFER', 'INCOME']).optional(),
    targetBucketId: z.string().optional(),
    targetCategoryMainId: z.string().optional(),
    targetCategorySubId: z.string().optional(),
    matchType: z.enum(['contains', 'exact', 'starts_with'])
});

const GlobalStateSchema = z.object({
  users: z.array(UserSchema).optional().default([]),
  accounts: z.array(AccountSchema).optional().default([]),
  buckets: z.array(BucketSchema).optional().default([]),
  settings: AppSettingsSchema.optional().default({ payday: 25 }),
  transactions: z.array(TransactionSchema).optional().default([]),
  importRules: z.array(ImportRuleSchema).optional().default([]),
  mainCategories: z.array(MainCategorySchema).optional().default([]),
  subCategories: z.array(SubCategorySchema).optional().default([]),
  budgetGroups: z.array(BudgetGroupSchema).optional().default([])
});

// --- END SCHEMAS ---

interface AppContextType extends GlobalState {
  addUser: (name: string, avatar: string) => void;
  updateUserIncome: (userId: string, month: MonthKey, type: 'salary'|'childBenefit'|'insurance'|'vabDays'|'dailyDeduction'|'incomeLoss', value: number) => void;
  updateUserName: (userId: string, name: string) => void;
  addAccount: (name: string, icon: string) => void;
  updateAccount: (account: Account) => Promise<void>;
  addBucket: (bucket: Bucket) => void;
  updateBucket: (bucket: Bucket) => void;
  deleteBucket: (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => void;
  archiveBucket: (id: string, month: MonthKey) => void;
  confirmBucketAmount: (id: string, month: MonthKey) => void;
  copyFromNextMonth: (currentMonth: MonthKey) => Promise<void>;
  setMonth: (month: MonthKey) => void;
  setPayday: (day: number) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  // Transaction & Rule Methods
  addTransactions: (txs: Transaction[]) => Promise<void>;
  updateTransaction: (tx: Transaction) => Promise<void>;
  addImportRule: (rule: ImportRule) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteAllTransactions: () => Promise<void>;
  // Category Methods
  addMainCategory: (name: string) => Promise<string>;
  deleteMainCategory: (id: string) => Promise<void>;
  addSubCategory: (mainCatId: string, name: string) => Promise<string>;
  updateSubCategory: (subCat: SubCategory) => Promise<void>;
  deleteSubCategory: (id: string) => Promise<void>;
  resetCategoriesToDefault: () => Promise<void>;
  // Budget Group Methods
  addBudgetGroup: (name: string, limit: number, icon: string) => Promise<void>;
  updateBudgetGroup: (group: BudgetGroup) => Promise<void>;
  deleteBudgetGroup: (id: string, month?: MonthKey, scope?: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => Promise<void>;
  
  // Backup features
  getExportData: () => Promise<string>; 
  importData: (json: string) => Promise<boolean>; 
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'familyflow_db_v5'; 
const defaultSettings: AppSettings = { 
    payday: 25,
    autoApproveIncome: false,
    autoApproveTransfer: false,
    autoApproveExpense: true 
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importRules, setImportRules] = useState<ImportRule[]>([]);
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [budgetGroups, setBudgetGroups] = useState<BudgetGroup[]>([]);

  // Initial Load & Migration Logic
  useEffect(() => {
    const loadData = async () => {
      try {
        const userCount = await db.users.count();
        
        if (userCount === 0) {
            // Check LocalStorage for migration
            const storedLS = localStorage.getItem(STORAGE_KEY);
            if (storedLS) {
                console.log("Migrating data from LocalStorage to IndexedDB...");
                const parsedRaw = JSON.parse(storedLS);
                const result = GlobalStateSchema.safeParse(parsedRaw);

                if (result.success) {
                    const data = result.data;
                    await (db as any).transaction('rw', db.users, db.accounts, db.buckets, db.settings, db.transactions, db.importRules, db.mainCategories, db.subCategories, db.budgetGroups, async () => {
                        await db.users.bulkAdd(data.users);
                        await db.accounts.bulkAdd(data.accounts);
                        await db.buckets.bulkAdd(data.buckets);
                        await db.settings.put({ ...data.settings, id: 1 });
                        if (data.transactions) await db.transactions.bulkAdd(data.transactions);
                        if (data.importRules) await db.importRules.bulkAdd(data.importRules);
                        if (data.mainCategories) await db.mainCategories.bulkAdd(data.mainCategories);
                        if (data.subCategories) await db.subCategories.bulkAdd(data.subCategories);
                        if (data.budgetGroups) await db.budgetGroups.bulkAdd(data.budgetGroups);
                    });
                }
            } else {
                // Seed Demo Data
                console.log("Seeding demo data...");
                const currentMonth = format(new Date(), 'yyyy-MM');
                const demoUsers: User[] = [
                    { id: '1', name: 'Anna', avatar: '👩', incomeData: {} },
                    { id: '2', name: 'Erik', avatar: '👨', incomeData: {} }
                ];
                const demoAccounts: Account[] = [
                    { id: 'acc1', name: 'Hushållskonto', icon: '🏠', startBalances: {} },
                    { id: 'acc2', name: 'Bil & Transport', icon: '🚗', startBalances: {} },
                    { id: 'acc3', name: 'Buffert', icon: '💰', startBalances: {} }
                ];
                const demoBuckets: Bucket[] = [
                    { 
                        id: 'b1', accountId: 'acc1', name: 'Mat (Hemköp)', type: 'FIXED', isSavings: false, 
                        monthlyData: { [currentMonth]: { amount: 6000, dailyAmount: 0, activeDays: [] } },
                        targetAmount: 0, targetDate: '', startSavingDate: '' 
                    },
                    { 
                        id: 'b2', accountId: 'acc1', name: 'Luncher', type: 'DAILY', isSavings: false, 
                        monthlyData: { [currentMonth]: { amount: 0, dailyAmount: 135, activeDays: [1,2,3,4,5] } },
                        targetAmount: 0, targetDate: '', startSavingDate: '' 
                    },
                    { 
                        id: 'b3', accountId: 'acc3', name: 'Sommarsemester 2025', type: 'GOAL', isSavings: true, 
                        monthlyData: {},
                        targetAmount: 30000, targetDate: '2025-06', startSavingDate: '2024-01' 
                    },
                ];

                await (db as any).transaction('rw', db.users, db.accounts, db.buckets, db.settings, db.mainCategories, db.subCategories, db.budgetGroups, async () => {
                    await db.users.bulkAdd(demoUsers);
                    await db.accounts.bulkAdd(demoAccounts);
                    await db.buckets.bulkAdd(demoBuckets);
                    await db.settings.put({ ...defaultSettings, id: 1 });
                    
                    // Seed Categories if empty
                    const mains = await db.mainCategories.count();
                    if (mains === 0) {
                        await db.mainCategories.bulkAdd(DEFAULT_MAIN_CATEGORIES);
                        await db.subCategories.bulkAdd(DEFAULT_SUB_CATEGORIES);
                    }
                });
            }
        }

        // Fetch from DB to State
        const dbUsers = await db.users.toArray();
        const dbAccounts = await db.accounts.toArray();
        const dbBuckets = await db.buckets.toArray();
        const dbSettings = await db.settings.get(1);
        const dbTransactions = await db.transactions.toArray();
        const dbRules = await db.importRules.toArray();
        const dbMainCats = await db.mainCategories.toArray();
        const dbSubCats = await db.subCategories.toArray();
        const dbGroups = await db.budgetGroups.toArray();

        setUsers(dbUsers);
        setAccounts(dbAccounts);
        setBuckets(dbBuckets);
        
        // Check if categories are empty and load defaults if so (fallback for existing DBs)
        if (dbMainCats.length === 0) {
             await (db as any).transaction('rw', db.mainCategories, db.subCategories, async () => {
                await db.mainCategories.bulkAdd(DEFAULT_MAIN_CATEGORIES);
                await db.subCategories.bulkAdd(DEFAULT_SUB_CATEGORIES);
             });
             setMainCategories(DEFAULT_MAIN_CATEGORIES);
             setSubCategories(DEFAULT_SUB_CATEGORIES);
        } else {
             setMainCategories(dbMainCats);
             setSubCategories(dbSubCats);
        }

        // MIGRATION: Ensure at least one "Catch All" Budget Group exists
        let loadedGroups = dbGroups;
        const needsMigration = dbGroups.some((g: any) => typeof g.monthlyLimit === 'number' && !g.monthlyData);
        if (needsMigration) {
            console.log("Migrating Budget Groups to Monthly Data Structure...");
            const migratedGroups = dbGroups.map((g: any) => {
                if (g.monthlyData) return g;
                return {
                    ...g,
                    monthlyData: {
                        "2023-01": { limit: g.monthlyLimit || 0, isExplicitlyDeleted: false }
                    },
                    monthlyLimit: undefined // remove old field
                };
            });
            await db.budgetGroups.bulkPut(migratedGroups);
            loadedGroups = migratedGroups;
        }

        if (loadedGroups.length === 0) {
            const defaultGroups: BudgetGroup[] = [
                { id: generateId(), name: 'Hushåll & Drift', monthlyData: { "2023-01": { limit: 15000 } }, icon: '🏠' },
                { id: generateId(), name: 'Nöje & Lyx', monthlyData: { "2023-01": { limit: 5000 } }, icon: '🎉' },
                { id: generateId(), name: 'Övrigt / Obudgeterat', monthlyData: { "2023-01": { limit: 0 } }, isCatchAll: true, icon: '❓' }
            ];
            await db.budgetGroups.bulkAdd(defaultGroups);
            loadedGroups = defaultGroups;
        }
        setBudgetGroups(loadedGroups);
        
        const migratedTransactions = dbTransactions.map(t => {
            const anyT = t as any;
            if (anyT.categoryId && !t.bucketId) {
                return { ...t, bucketId: anyT.categoryId, categoryId: undefined };
            }
            return t;
        });
        
        const migratedRules = dbRules.map(r => {
             return r;
        });

        setTransactions(migratedTransactions);
        setImportRules(migratedRules);

        if (dbSettings) {
            const { id, ...cleanSettings } = dbSettings;
            // Merge with defaults to ensure new fields exist
            setSettings({ ...defaultSettings, ...cleanSettings });
        }
        
        setIsLoaded(true);
      } catch (e) {
        console.error("Database initialization failed", e);
      }
    };

    loadData();
  }, []);

  // --- ACTIONS ---

  const addUser = async (name: string, avatar: string) => {
    const newUser: User = { id: generateId(), name, avatar, incomeData: {} };
    await db.users.add(newUser);
    setUsers(prev => [...prev, newUser]);
  };

  const updateUserIncome = async (userId: string, month: MonthKey, type: 'salary'|'childBenefit'|'insurance'|'vabDays'|'dailyDeduction'|'incomeLoss', value: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const newIncomeData = { ...user.incomeData };
    const currentMonthData = newIncomeData[month] || { salary: 0, childBenefit: 0, insurance: 0 };
    newIncomeData[month] = { ...currentMonthData, [type]: value };

    if (type === 'dailyDeduction') {
        Object.keys(newIncomeData).forEach(key => {
            if (key > month && newIncomeData[key]) {
                newIncomeData[key] = { ...newIncomeData[key], dailyDeduction: value };
            }
        });
    }

    const updatedUser = { ...user, incomeData: newIncomeData };
    await db.users.put(updatedUser);
    setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
  };

  const updateUserName = async (userId: string, name: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const updatedUser = { ...user, name };
    await db.users.put(updatedUser);
    setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
  };

  const addAccount = async (name: string, icon: string) => {
    const newAccount: Account = { id: generateId(), name, icon, startBalances: {} };
    await db.accounts.add(newAccount);
    setAccounts(prev => [...prev, newAccount]);
  };

  const updateAccount = async (account: Account) => {
      await db.accounts.put(account);
      setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
  };

  const addBucket = async (bucket: Bucket) => {
      if (buckets.find(b => b.id === bucket.id)) return;
      await db.buckets.add(bucket);
      setBuckets(prev => [...prev, bucket]);
  };
  
  const updateBucket = async (bucket: Bucket) => {
    await db.buckets.put(bucket);
    setBuckets(prev => prev.map(b => b.id === bucket.id ? bucket : b));
  };

  const confirmBucketAmount = async (id: string, month: MonthKey) => {
      const bucket = buckets.find(b => b.id === id);
      if (!bucket) return;

      const { data, isInherited } = getEffectiveBucketData(bucket, month);
      
      if (isInherited && data) {
          const updatedBucket = {
              ...bucket,
              monthlyData: {
                  ...bucket.monthlyData,
                  [month]: { ...data, isExplicitlyDeleted: false }
              }
          }
          await db.buckets.put(updatedBucket);
          setBuckets(prev => prev.map(b => b.id === id ? updatedBucket : b));
      }
  };

  const deleteBucket = async (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => {
    if (scope === 'ALL') {
        await db.buckets.delete(id);
        setBuckets(prev => prev.filter(b => b.id !== id));
        return;
    }

    const bucket = buckets.find(b => b.id === id);
    if (!bucket) return;

    const newMonthlyData = { ...bucket.monthlyData };
    const { data: effectiveData } = getEffectiveBucketData(bucket, month);
    const currentData = effectiveData || { amount: 0, dailyAmount: 0, activeDays: [] };

    if (scope === 'THIS_MONTH') {
        newMonthlyData[month] = { ...currentData, amount: 0, dailyAmount: 0, isExplicitlyDeleted: true };
        const nextMonth = format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM');
        if (!newMonthlyData[nextMonth]) {
            newMonthlyData[nextMonth] = { ...currentData, isExplicitlyDeleted: false };
        }
    } else if (scope === 'THIS_AND_FUTURE') {
        newMonthlyData[month] = { ...currentData, amount: 0, dailyAmount: 0, isExplicitlyDeleted: true };
        Object.keys(newMonthlyData).forEach(key => {
            if (key > month) {
                newMonthlyData[key] = { ...newMonthlyData[key], isExplicitlyDeleted: true, amount: 0, dailyAmount: 0 };
            }
        });
    }

    const updatedBucket = { ...bucket, monthlyData: newMonthlyData };
    await db.buckets.put(updatedBucket);
    setBuckets(prev => prev.map(b => b.id === id ? updatedBucket : b));
  };

  const archiveBucket = async (id: string, month: MonthKey) => {
    const bucket = buckets.find(b => b.id === id);
    if (!bucket) return;
    const updatedBucket = { ...bucket, archivedDate: month };
    await db.buckets.put(updatedBucket);
    setBuckets(prev => prev.map(b => b.id === id ? updatedBucket : b));
  };
  
  const copyFromNextMonth = async (currentMonth: MonthKey) => {
      const nextMonth = format(addMonths(parseISO(`${currentMonth}-01`), 1), 'yyyy-MM');
      
      const newBuckets = [...buckets];
      const updates: Bucket[] = [];
      
      for (const bucket of newBuckets) {
          if (bucket.monthlyData[currentMonth]) continue;
          const nextData = bucket.monthlyData[nextMonth];
          if (nextData && !nextData.isExplicitlyDeleted) {
              bucket.monthlyData[currentMonth] = { ...nextData };
              updates.push(bucket);
          }
      }

      if (updates.length > 0) {
          await db.buckets.bulkPut(updates);
          setBuckets(newBuckets);
      }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
      const updated = { ...settings, ...newSettings };
      await db.settings.put({ ...updated, id: 1 });
      setSettings(updated);
  };

  // --- CATEGORY ACTIONS ---
  const addMainCategory = async (name: string): Promise<string> => {
      const id = generateId();
      const newCat: MainCategory = { id, name };
      await db.mainCategories.add(newCat);
      setMainCategories(prev => [...prev, newCat]);
      return id;
  };
  
  const deleteMainCategory = async (id: string) => {
      await db.mainCategories.delete(id);
      const subsToDelete = subCategories.filter(s => s.mainCategoryId === id).map(s => s.id);
      if (subsToDelete.length > 0) {
          await db.subCategories.bulkDelete(subsToDelete);
      }
      setMainCategories(prev => prev.filter(c => c.id !== id));
      setSubCategories(prev => prev.filter(s => s.mainCategoryId !== id));
  };

  const addSubCategory = async (mainCatId: string, name: string): Promise<string> => {
      const id = generateId();
      const newSub: SubCategory = { id, mainCategoryId: mainCatId, name };
      await db.subCategories.add(newSub);
      setSubCategories(prev => [...prev, newSub]);
      return id;
  };

  const updateSubCategory = async (subCat: SubCategory) => {
      await db.subCategories.put(subCat);
      setSubCategories(prev => prev.map(s => s.id === subCat.id ? subCat : s));
  };

  const deleteSubCategory = async (id: string) => {
      await db.subCategories.delete(id);
      setSubCategories(prev => prev.filter(s => s.id !== id));
  };

  const resetCategoriesToDefault = async () => {
      await db.mainCategories.clear();
      await db.subCategories.clear();
      await db.mainCategories.bulkAdd(DEFAULT_MAIN_CATEGORIES);
      await db.subCategories.bulkAdd(DEFAULT_SUB_CATEGORIES);
      setMainCategories(DEFAULT_MAIN_CATEGORIES);
      setSubCategories(DEFAULT_SUB_CATEGORIES);
  };

  // --- BUDGET GROUP ACTIONS ---
  
  const addBudgetGroup = async (name: string, limit: number, icon: string) => {
      const newGroup: BudgetGroup = { 
          id: generateId(), 
          name, 
          icon,
          monthlyData: {
             [selectedMonth]: { limit, isExplicitlyDeleted: false }
          }
      };
      await db.budgetGroups.add(newGroup);
      setBudgetGroups(prev => [...prev, newGroup]);
  };

  const updateBudgetGroup = async (group: BudgetGroup) => {
      await db.budgetGroups.put(group);
      setBudgetGroups(prev => prev.map(g => g.id === group.id ? group : g));
  };

  const deleteBudgetGroup = async (id: string, month: MonthKey = selectedMonth, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL' = 'ALL') => {
      if (scope === 'ALL') {
          await db.budgetGroups.delete(id);
          setBudgetGroups(prev => prev.filter(g => g.id !== id));
          const subsToUpdate = subCategories.filter(s => s.budgetGroupId === id);
          if (subsToUpdate.length > 0) {
              const updatedSubs = subsToUpdate.map(s => ({ ...s, budgetGroupId: undefined }));
              await db.subCategories.bulkPut(updatedSubs);
              setSubCategories(prev => prev.map(s => s.budgetGroupId === id ? { ...s, budgetGroupId: undefined } : s));
          }
          return;
      }

      const group = budgetGroups.find(g => g.id === id);
      if (!group) return;

      const newMonthlyData = { ...group.monthlyData };
      const { data: effectiveData } = getEffectiveBudgetGroupData(group, month);
      const currentData = effectiveData || { limit: 0 };

      if (scope === 'THIS_MONTH') {
           newMonthlyData[month] = { ...currentData, limit: 0, isExplicitlyDeleted: true };
           const nextMonth = format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM');
           if (!newMonthlyData[nextMonth]) {
               newMonthlyData[nextMonth] = { ...currentData, isExplicitlyDeleted: false };
           }
      } else if (scope === 'THIS_AND_FUTURE') {
           newMonthlyData[month] = { ...currentData, limit: 0, isExplicitlyDeleted: true };
           Object.keys(newMonthlyData).forEach(key => {
               if (key > month) {
                   newMonthlyData[key] = { ...newMonthlyData[key], limit: 0, isExplicitlyDeleted: true };
               }
           });
      }

      const updatedGroup = { ...group, monthlyData: newMonthlyData };
      await db.budgetGroups.put(updatedGroup);
      setBudgetGroups(prev => prev.map(g => g.id === id ? updatedGroup : g));
  };
  
  // --- TRANSACTION ACTIONS ---
  
  const addTransactions = async (txs: Transaction[]) => {
      await db.transactions.bulkAdd(txs);
      setTransactions(prev => [...prev, ...txs]);
  };

  const updateTransaction = async (tx: Transaction) => {
      await db.transactions.put(tx);
      setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));
  };
  
  const deleteTransaction = async (id: string) => {
      await db.transactions.delete(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const deleteAllTransactions = async () => {
      await db.transactions.clear();
      setTransactions([]);
  };

  const addImportRule = async (rule: ImportRule) => {
      await db.importRules.add(rule);
      setImportRules(prev => [...prev, rule]);
  };

  // --- BACKUP ---
  const getExportData = async () => {
      const data = {
          users, accounts, buckets, settings, transactions, importRules, mainCategories, subCategories, budgetGroups
      };
      return JSON.stringify(data, null, 2);
  };

  const importData = async (json: string): Promise<boolean> => {
      try {
          const data = JSON.parse(json);
          const result = GlobalStateSchema.safeParse(data);
          if (!result.success) {
              console.error("Invalid backup format", result.error);
              return false;
          }
          
          await (db as any).transaction('rw', db.users, db.accounts, db.buckets, db.settings, db.transactions, db.importRules, db.mainCategories, db.subCategories, db.budgetGroups, async () => {
              await db.users.clear(); await db.users.bulkAdd(data.users);
              await db.accounts.clear(); await db.accounts.bulkAdd(data.accounts);
              await db.buckets.clear(); await db.buckets.bulkAdd(data.buckets);
              await db.settings.clear(); await db.settings.put({ ...data.settings, id: 1 });
              
              if (data.transactions) { await db.transactions.clear(); await db.transactions.bulkAdd(data.transactions); }
              if (data.importRules) { await db.importRules.clear(); await db.importRules.bulkAdd(data.importRules); }
              if (data.mainCategories) { await db.mainCategories.clear(); await db.mainCategories.bulkAdd(data.mainCategories); }
              if (data.subCategories) { await db.subCategories.clear(); await db.subCategories.bulkAdd(data.subCategories); }
              if (data.budgetGroups) { await db.budgetGroups.clear(); await db.budgetGroups.bulkAdd(data.budgetGroups); }
          });
          
          return true;
      } catch (e) {
          console.error("Import failed", e);
          return false;
      }
  };

  const providerValue: AppContextType = {
    users, addUser, updateUserIncome, updateUserName,
    accounts, addAccount, updateAccount,
    buckets, addBucket, updateBucket, deleteBucket, confirmBucketAmount, archiveBucket, copyFromNextMonth,
    settings, setPayday: (day) => updateSettings({ payday: day }), updateSettings,
    selectedMonth, setMonth: setSelectedMonth,
    transactions, addTransactions, updateTransaction, deleteTransaction, deleteAllTransactions,
    importRules, addImportRule,
    // Categories
    mainCategories, addMainCategory, deleteMainCategory,
    subCategories, addSubCategory, updateSubCategory, deleteSubCategory, resetCategoriesToDefault,
    // Budget Groups
    budgetGroups, addBudgetGroup, updateBudgetGroup, deleteBudgetGroup,
    
    getExportData, importData
  };

  if (!isLoaded) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Laddar din ekonomi...</div>;

  return (
    <AppContext.Provider value={providerValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};