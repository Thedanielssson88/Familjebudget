import React, { createContext, useContext, useEffect, useState } from 'react';
import { Account, AppSettings, Bucket, GlobalState, User, MonthKey, Transaction, ImportRule, MainCategory, SubCategory } from './types';
import { format, addMonths, parseISO } from 'date-fns';
import { getEffectiveBucketData, generateId } from './utils';
import { z } from 'zod';
import { db } from './db';
import { DEFAULT_MAIN_CATEGORIES, DEFAULT_SUB_CATEGORIES } from './constants/defaultCategories';

// --- ZOD SCHEMAS FOR VALIDATION (Still used for Import/Backup) ---

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
  payday: z.number()
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
  description: z.string().optional()
});

const TransactionSchema = z.object({
    id: z.string(),
    accountId: z.string(),
    date: z.string(),
    amount: z.number(),
    description: z.string(),
    bucketId: z.string().optional(),
    categoryMainId: z.string().optional(),
    categorySubId: z.string().optional(),
    isVerified: z.boolean(),
    source: z.enum(['manual', 'import'])
});

const ImportRuleSchema = z.object({
    id: z.string(),
    keyword: z.string(),
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
  subCategories: z.array(SubCategorySchema).optional().default([])
});

// --- END SCHEMAS ---

interface AppContextType extends GlobalState {
  addUser: (name: string, avatar: string) => void;
  updateUserIncome: (userId: string, month: MonthKey, type: 'salary'|'childBenefit'|'insurance'|'vabDays'|'dailyDeduction'|'incomeLoss', value: number) => void;
  updateUserName: (userId: string, name: string) => void;
  addAccount: (name: string, icon: string) => void;
  addBucket: (bucket: Bucket) => void;
  updateBucket: (bucket: Bucket) => void;
  deleteBucket: (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => void;
  archiveBucket: (id: string, month: MonthKey) => void;
  confirmBucketAmount: (id: string, month: MonthKey) => void;
  setMonth: (month: MonthKey) => void;
  setPayday: (day: number) => void;
  // Transaction & Rule Methods
  addTransactions: (txs: Transaction[]) => Promise<void>;
  updateTransaction: (tx: Transaction) => Promise<void>;
  addImportRule: (rule: ImportRule) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  // Category Methods
  addMainCategory: (name: string) => Promise<void>;
  deleteMainCategory: (id: string) => Promise<void>;
  addSubCategory: (mainCatId: string, name: string) => Promise<void>;
  deleteSubCategory: (id: string) => Promise<void>;
  resetCategoriesToDefault: () => Promise<void>;
  // Backup features
  getExportData: () => Promise<string>; 
  importData: (json: string) => Promise<boolean>; 
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'familyflow_db_v3'; 
const defaultSettings: AppSettings = { payday: 25 };

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
                    await (db as any).transaction('rw', db.users, db.accounts, db.buckets, db.settings, db.transactions, db.importRules, db.mainCategories, db.subCategories, async () => {
                        await db.users.bulkAdd(data.users);
                        await db.accounts.bulkAdd(data.accounts);
                        await db.buckets.bulkAdd(data.buckets);
                        await db.settings.put({ ...data.settings, id: 1 });
                        if (data.transactions) await db.transactions.bulkAdd(data.transactions);
                        if (data.importRules) await db.importRules.bulkAdd(data.importRules);
                        if (data.mainCategories) await db.mainCategories.bulkAdd(data.mainCategories);
                        if (data.subCategories) await db.subCategories.bulkAdd(data.subCategories);
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

                await (db as any).transaction('rw', db.users, db.accounts, db.buckets, db.settings, db.mainCategories, db.subCategories, async () => {
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
        
        // MIGRATION: Map old categoryId to bucketId if needed
        const migratedTransactions = dbTransactions.map(t => {
            const anyT = t as any;
            if (anyT.categoryId && !t.bucketId) {
                return { ...t, bucketId: anyT.categoryId, categoryId: undefined };
            }
            return t;
        });
        
        // MIGRATION: Update Rules
        const migratedRules = dbRules.map(r => {
             const anyR = r as any;
             if (anyR.targetBucketId && !anyR.targetBucketId) {
                 return r;
             }
             return r;
        });

        setTransactions(migratedTransactions);
        setImportRules(migratedRules);

        if (dbSettings) {
            const { id, ...cleanSettings } = dbSettings;
            setSettings(cleanSettings);
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

  const setPayday = async (day: number) => {
      const newSettings = { ...settings, payday: day };
      await db.settings.put({ ...newSettings, id: 1 });
      setSettings(newSettings);
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

  const addImportRule = async (rule: ImportRule) => {
      await db.importRules.add(rule);
      setImportRules(prev => [...prev, rule]);
  };
  
  // --- CATEGORY ACTIONS ---

  const addMainCategory = async (name: string) => {
      const newCat: MainCategory = { id: generateId(), name };
      await db.mainCategories.add(newCat);
      setMainCategories(prev => [...prev, newCat]);
  };

  const deleteMainCategory = async (id: string) => {
      // Also delete subcategories
      const subsToDelete = subCategories.filter(s => s.mainCategoryId === id).map(s => s.id);
      
      await (db as any).transaction('rw', db.mainCategories, db.subCategories, async () => {
          await db.mainCategories.delete(id);
          await db.subCategories.bulkDelete(subsToDelete);
      });
      
      setMainCategories(prev => prev.filter(c => c.id !== id));
      setSubCategories(prev => prev.filter(s => s.mainCategoryId !== id));
  };

  const addSubCategory = async (mainCategoryId: string, name: string) => {
      const newSub: SubCategory = { id: generateId(), mainCategoryId, name };
      await db.subCategories.add(newSub);
      setSubCategories(prev => [...prev, newSub]);
  };

  const deleteSubCategory = async (id: string) => {
      await db.subCategories.delete(id);
      setSubCategories(prev => prev.filter(s => s.id !== id));
  };
  
  const resetCategoriesToDefault = async () => {
      await (db as any).transaction('rw', db.mainCategories, db.subCategories, async () => {
          await db.mainCategories.clear();
          await db.subCategories.clear();
          await db.mainCategories.bulkAdd(DEFAULT_MAIN_CATEGORIES);
          await db.subCategories.bulkAdd(DEFAULT_SUB_CATEGORIES);
      });
      setMainCategories(DEFAULT_MAIN_CATEGORIES);
      setSubCategories(DEFAULT_SUB_CATEGORIES);
  };


  // --- BACKUP FUNCTIONS ---
  const getExportData = async () => {
      const dbUsers = await db.users.toArray();
      const dbAccounts = await db.accounts.toArray();
      const dbBuckets = await db.buckets.toArray();
      const dbSettings = await db.settings.get(1);
      const dbTxs = await db.transactions.toArray();
      const dbRules = await db.importRules.toArray();
      const dbMain = await db.mainCategories.toArray();
      const dbSub = await db.subCategories.toArray();
      
      const { id, ...cleanSettings } = dbSettings || defaultSettings;

      const state = { 
          users: dbUsers, 
          accounts: dbAccounts, 
          buckets: dbBuckets, 
          settings: cleanSettings,
          transactions: dbTxs,
          importRules: dbRules,
          mainCategories: dbMain,
          subCategories: dbSub
      };
      return JSON.stringify(state);
  };

  const importData = async (json: string): Promise<boolean> => {
      try {
          const raw = JSON.parse(json);
          const result = GlobalStateSchema.safeParse(raw);
          
          if (!result.success) {
              console.error("Backup file validation failed", result.error);
              alert("Filen är trasig eller har fel format.");
              return false;
          }
          
          const data = result.data;
          
          await (db as any).transaction('rw', db.users, db.accounts, db.buckets, db.settings, db.transactions, db.importRules, db.mainCategories, db.subCategories, async () => {
             await db.users.clear();
             await db.accounts.clear();
             await db.buckets.clear();
             await db.settings.clear();
             await db.transactions.clear();
             await db.importRules.clear();
             await db.mainCategories.clear();
             await db.subCategories.clear();

             await db.users.bulkAdd(data.users);
             await db.accounts.bulkAdd(data.accounts);
             await db.buckets.bulkAdd(data.buckets);
             if (data.settings) await db.settings.put({ ...data.settings, id: 1 });
             if (data.transactions) await db.transactions.bulkAdd(data.transactions);
             if (data.importRules) await db.importRules.bulkAdd(data.importRules);
             if (data.mainCategories) await db.mainCategories.bulkAdd(data.mainCategories);
             if (data.subCategories) await db.subCategories.bulkAdd(data.subCategories);
          });
          
          setUsers(data.users);
          setAccounts(data.accounts);
          setBuckets(data.buckets);
          if (data.settings) setSettings(data.settings);
          setTransactions(data.transactions || []);
          setImportRules(data.importRules || []);
          setMainCategories(data.mainCategories || []);
          setSubCategories(data.subCategories || []);
          
          return true;
      } catch (e) {
          console.error("Failed to import data", e);
          alert("Kunde inte läsa filen (JSON Parse Error).");
          return false;
      }
  };

  if (!isLoaded) return <div className="min-h-screen bg-background flex items-center justify-center text-white">Laddar FamilyFlow från databas...</div>;

  return (
    <AppContext.Provider value={{
      users, accounts, buckets, settings, selectedMonth, transactions, importRules, mainCategories, subCategories,
      addUser, updateUserIncome, updateUserName, addAccount, addBucket, updateBucket, deleteBucket, archiveBucket, confirmBucketAmount, setMonth: setSelectedMonth, setPayday,
      addTransactions, updateTransaction, addImportRule, deleteTransaction, 
      addMainCategory, deleteMainCategory, addSubCategory, deleteSubCategory, resetCategoriesToDefault,
      getExportData, importData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};