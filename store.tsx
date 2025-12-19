
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from './db';
import { 
  User, Account, Bucket, MainCategory, SubCategory, 
  BudgetGroup, BudgetTemplate, MonthConfig, Transaction, 
  ImportRule, IgnoredSubscription, AppSettings, MonthKey, BucketData, Budget
} from './types';
import { generateId, getEffectiveBucketData } from './utils';
import { format, addMonths, parseISO } from 'date-fns';
import { DEFAULT_MAIN_CATEGORIES, DEFAULT_SUB_CATEGORIES } from './constants/defaultCategories';

interface AppContextType {
  budgets: Budget[];
  activeBudgetId: string;
  users: User[];
  accounts: Account[];
  buckets: Bucket[];
  mainCategories: MainCategory[];
  subCategories: SubCategory[];
  budgetGroups: BudgetGroup[];
  budgetTemplates: BudgetTemplate[];
  monthConfigs: MonthConfig[];
  settings: AppSettings;
  selectedMonth: MonthKey;
  transactions: Transaction[];
  importRules: ImportRule[];
  ignoredSubscriptions: IgnoredSubscription[];

  setActiveBudget: (id: string) => void;
  addBudget: (name: string, icon: string) => Promise<string>;
  deleteBudget: (id: string) => Promise<void>;
  updateBudget: (budget: Budget) => Promise<void>;
  
  setMonth: (month: MonthKey) => void;
  updateUserIncome: (userId: string, month: MonthKey, type: 'salary'|'childBenefit'|'insurance'|'vabDays'|'dailyDeduction', amount: number) => Promise<void>;
  updateUserName: (userId: string, name: string) => Promise<void>;
  
  addAccount: (name: string, type: string, icon: string) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  addBucket: (bucket: Bucket) => Promise<void>;
  updateBucket: (bucket: Bucket) => Promise<void>;
  deleteBucket: (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => Promise<void>;
  archiveBucket: (id: string, month: MonthKey) => Promise<void>;

  addMainCategory: (name: string) => Promise<void>;
  deleteMainCategory: (id: string) => Promise<void>;
  addSubCategory: (mainId: string, name: string, isSavings?: boolean) => Promise<void>;
  deleteSubCategory: (id: string) => Promise<void>;
  updateSubCategory: (sub: SubCategory) => Promise<void>;
  resetCategoriesToDefault: () => Promise<void>;

  addBudgetGroup: (name: string, limit: number, icon: string, forecastType: 'FIXED' | 'VARIABLE') => Promise<void>;
  updateBudgetGroup: (group: BudgetGroup) => Promise<void>;
  deleteBudgetGroup: (id: string) => Promise<void>;

  addTransactions: (txs: Transaction[]) => Promise<void>;
  updateTransaction: (tx: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteAllTransactions: () => Promise<void>;

  addImportRule: (rule: ImportRule) => Promise<void>;
  deleteImportRule: (id: string) => Promise<void>;
  updateImportRule: (rule: ImportRule) => Promise<void>;

  addIgnoredSubscription: (id: string) => Promise<void>;

  setPayday: (day: number) => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  
  getExportData: () => Promise<string>;
  importData: (json: string) => Promise<boolean>;

  setBudgetLimit: (type: 'GROUP'|'SUB'|'BUCKET', id: string, amount: number | BucketData, month: MonthKey, mode: 'TEMPLATE' | 'OVERRIDE') => Promise<void>;
  toggleMonthLock: (month: MonthKey) => Promise<void>;
  assignTemplateToMonth: (month: MonthKey, templateId: string) => Promise<void>;
  clearBudgetOverride: (type: 'GROUP'|'SUB'|'BUCKET', id: string, month: MonthKey) => Promise<void>;
  
  addTemplate: (name: string, sourceMonth: MonthKey) => Promise<void>;
  updateTemplate: (template: BudgetTemplate) => Promise<void>;
  resetMonthToTemplate: (month: MonthKey) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [activeBudgetId, setActiveBudgetId] = useState<string>('');
  
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [budgetGroups, setBudgetGroups] = useState<BudgetGroup[]>([]);
  const [budgetTemplates, setBudgetTemplates] = useState<BudgetTemplate[]>([]);
  const [monthConfigs, setMonthConfigs] = useState<MonthConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ payday: 25 });
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(format(new Date(), 'yyyy-MM'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importRules, setImportRules] = useState<ImportRule[]>([]);
  const [ignoredSubscriptions, setIgnoredSubscriptions] = useState<IgnoredSubscription[]>([]);

  // Load Budgets & Initial Sync
  useEffect(() => {
    const init = async () => {
      let b = await db.budgets.toArray();
      if (b.length === 0) {
          const defaultBudget: Budget = { id: 'default', name: 'Gemensam', icon: '🏠', isDefault: true };
          await db.budgets.add(defaultBudget);
          b = [defaultBudget];
          
          // Migration of orphan records to the new default budget
          const tablesToMigrate = ['users', 'accounts', 'buckets', 'budgetGroups', 'budgetTemplates', 'monthConfigs', 'transactions', 'importRules', 'ignoredSubscriptions'] as const;
          for (const table of tablesToMigrate) {
              await (db[table] as any).toCollection().modify((item: any) => {
                  if (!item.budgetId) item.budgetId = 'default';
              });
          }
      }
      setBudgets(b);
      
      const savedId = localStorage.getItem('last_active_budget_id');
      const startId = (savedId && b.find(x => x.id === savedId)) ? savedId : b[0].id;
      setActiveBudgetId(startId);
    };
    init();
  }, []);

  // Load Budget-Specific Data whenever the active budget changes
  useEffect(() => {
    if (!activeBudgetId) return;
    localStorage.setItem('last_active_budget_id', activeBudgetId);

    const loadData = async () => {
      // 1. Users
      const u = await db.users.where('budgetId').equals(activeBudgetId).toArray();
      if (u.length === 0) {
          const initialUser: User = { id: generateId(), budgetId: activeBudgetId, name: 'Jag', avatar: '👤', incomeData: {} };
          await db.users.add(initialUser);
          setUsers([initialUser]);
      } else {
          setUsers(u);
      }

      // 2. Filtered data by activeBudgetId
      setAccounts(await db.accounts.where('budgetId').equals(activeBudgetId).toArray());
      setBuckets(await db.buckets.where('budgetId').equals(activeBudgetId).toArray());
      setBudgetGroups(await db.budgetGroups.where('budgetId').equals(activeBudgetId).toArray());
      
      const bt = await db.budgetTemplates.where('budgetId').equals(activeBudgetId).toArray();
      if (bt.length === 0) {
          const defaultTemplate: BudgetTemplate = { 
              id: generateId(), 
              budgetId: activeBudgetId,
              name: 'Standard', 
              isDefault: true, 
              groupLimits: {}, 
              subCategoryBudgets: {}, 
              bucketValues: {} 
          };
          await db.budgetTemplates.add(defaultTemplate);
          setBudgetTemplates([defaultTemplate]);
      } else {
          setBudgetTemplates(bt);
      }

      setMonthConfigs(await db.monthConfigs.where('budgetId').equals(activeBudgetId).toArray());
      setTransactions(await db.transactions.where('budgetId').equals(activeBudgetId).toArray());
      setImportRules(await db.importRules.where('budgetId').equals(activeBudgetId).toArray());
      setIgnoredSubscriptions(await db.ignoredSubscriptions.where('budgetId').equals(activeBudgetId).toArray());

      // Global Settings
      const s = await db.settings.toArray();
      if (s.length > 0) setSettings(s[0]);
    };

    loadData();
  }, [activeBudgetId]);

  // Load Categories (Shared across budgets)
  useEffect(() => {
      const loadCategories = async () => {
          const mc = await db.mainCategories.toArray();
          if (mc.length === 0) {
              await db.mainCategories.bulkAdd(DEFAULT_MAIN_CATEGORIES);
              setMainCategories(DEFAULT_MAIN_CATEGORIES);
          } else {
              setMainCategories(mc);
          }

          const sc = await db.subCategories.toArray();
          if (sc.length === 0) {
              await db.subCategories.bulkAdd(DEFAULT_SUB_CATEGORIES);
              setSubCategories(DEFAULT_SUB_CATEGORIES);
          } else {
              setSubCategories(sc);
          }
      };
      loadCategories();
  }, []);

  const setActiveBudget = (id: string) => setActiveBudgetId(id);

  const addBudget = async (name: string, icon: string) => {
      const id = generateId();
      const newBudget: Budget = { id, name, icon };
      await db.budgets.add(newBudget);
      setBudgets(prev => [...prev, newBudget]);
      return id;
  };

  const updateBudget = async (budget: Budget) => {
      await db.budgets.put(budget);
      setBudgets(prev => prev.map(b => b.id === budget.id ? budget : b));
  };

  const deleteBudget = async (id: string) => {
      if (budgets.length <= 1) return;
      await (db as any).transaction('rw', ['budgets', 'users', 'accounts', 'buckets', 'budgetGroups', 'budgetTemplates', 'monthConfigs', 'transactions', 'importRules', 'ignoredSubscriptions'], async () => {
          await db.budgets.delete(id);
          await db.users.where('budgetId').equals(id).delete();
          await db.accounts.where('budgetId').equals(id).delete();
          await db.buckets.where('budgetId').equals(id).delete();
          await db.budgetGroups.where('budgetId').equals(id).delete();
          await db.budgetTemplates.where('budgetId').equals(id).delete();
          await db.monthConfigs.where('budgetId').equals(id).delete();
          await db.transactions.where('budgetId').equals(id).delete();
          await db.importRules.where('budgetId').equals(id).delete();
          await db.ignoredSubscriptions.where('budgetId').equals(id).delete();
      });
      setBudgets(prev => prev.filter(b => b.id !== id));
      if (activeBudgetId === id) {
          const next = budgets.find(b => b.id !== id);
          if (next) setActiveBudgetId(next.id);
      }
  };

  const setMonth = (month: MonthKey) => setSelectedMonth(month);

  const updateUserIncome = async (userId: string, month: MonthKey, type: string, amount: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const newData = { ...user.incomeData };
    const currentEntry = newData[month] || { salary: 0, childBenefit: 0, insurance: 0 };
    newData[month] = { ...currentEntry, [type]: amount };
    const updated = { ...user, incomeData: newData };
    await db.users.put(updated);
    setUsers(prev => prev.map(u => u.id === userId ? updated : u));
  };

  const updateUserName = async (userId: string, name: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const updated = { ...user, name };
    await db.users.put(updated);
    setUsers(prev => prev.map(u => u.id === userId ? updated : u));
  };

  const addAccount = async (name: string, type: string, icon: string) => {
    const acc: Account = { id: generateId(), budgetId: activeBudgetId, name, type, icon, startBalances: {} };
    await db.accounts.add(acc);
    setAccounts(prev => [...prev, acc]);
  };

  const updateAccount = async (account: Account) => {
    await db.accounts.put(account);
    setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
  };

  const deleteAccount = async (id: string) => {
    await db.accounts.delete(id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const addBucket = async (bucket: Bucket) => {
    const b = { ...bucket, budgetId: activeBudgetId };
    await db.buckets.add(b);
    setBuckets(prev => [...prev, b]);
  };

  const updateBucket = async (bucket: Bucket) => {
    await db.buckets.put(bucket);
    setBuckets(prev => prev.map(b => b.id === bucket.id ? bucket : b));
  };

  const deleteBucket = async (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => {
    if (scope === 'ALL') {
        await db.buckets.delete(id);
        await db.transactions.where('bucketId').equals(id).modify({ bucketId: undefined });
        setBuckets(prev => prev.filter(b => b.id !== id));
        setTransactions(prev => prev.map(t => t.bucketId === id ? { ...t, bucketId: undefined } : t));
        return;
    }

    const bucket = buckets.find(b => b.id === id);
    if (!bucket) return;

    const newMonthlyData = { ...bucket.monthlyData };
    
    if (scope === 'THIS_MONTH') {
        const { data: effectiveData } = getEffectiveBucketData(bucket, month, budgetTemplates, monthConfigs);
        const currentData = effectiveData || { amount: 0, dailyAmount: 0, activeDays: [] };
        newMonthlyData[month] = { ...currentData, amount: 0, dailyAmount: 0, isExplicitlyDeleted: true };
        const nextMonth = format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM');
        if (!newMonthlyData[nextMonth]) {
            newMonthlyData[nextMonth] = { ...currentData, isExplicitlyDeleted: false };
        }
        const updatedBucket = { ...bucket, monthlyData: newMonthlyData };
        await db.buckets.put(updatedBucket);
        setBuckets(prev => prev.map(b => b.id === id ? updatedBucket : b));
    } else if (scope === 'THIS_AND_FUTURE') {
        const date = parseISO(`${month}-01`);
        const lastActiveMonth = format(addMonths(date, -1), 'yyyy-MM');
        const updatedBucket = { ...bucket, archivedDate: lastActiveMonth };
        await db.buckets.put(updatedBucket);
        setBuckets(prev => prev.map(b => b.id === id ? updatedBucket : b));
    }
  };

  const archiveBucket = async (id: string, month: MonthKey) => {
    const bucket = buckets.find(b => b.id === id);
    if (!bucket) return;
    const updated = { ...bucket, archivedDate: month };
    await db.buckets.put(updated);
    setBuckets(prev => prev.map(b => b.id === id ? updated : b));
  };

  const addMainCategory = async (name: string) => {
    const cat: MainCategory = { id: generateId(), name };
    await db.mainCategories.add(cat);
    setMainCategories(prev => [...prev, cat]);
  };

  const deleteMainCategory = async (id: string) => {
    await db.mainCategories.delete(id);
    setMainCategories(prev => prev.filter(c => c.id !== id));
  };

  const addSubCategory = async (mainId: string, name: string, isSavings?: boolean) => {
    const sub: SubCategory = { id: generateId(), mainCategoryId: mainId, name, isSavings };
    await db.subCategories.add(sub);
    setSubCategories(prev => [...prev, sub]);
  };

  const deleteSubCategory = async (id: string) => {
    await db.subCategories.delete(id);
    setSubCategories(prev => prev.filter(s => s.id !== id));
  };

  const updateSubCategory = async (sub: SubCategory) => {
    await db.subCategories.put(sub);
    setSubCategories(prev => prev.map(s => s.id === sub.id ? sub : s));
  };

  const resetCategoriesToDefault = async () => {
    await db.mainCategories.clear();
    await db.subCategories.clear();
    await db.mainCategories.bulkAdd(DEFAULT_MAIN_CATEGORIES);
    await db.subCategories.bulkAdd(DEFAULT_SUB_CATEGORIES);
    setMainCategories(DEFAULT_MAIN_CATEGORIES);
    setSubCategories(DEFAULT_SUB_CATEGORIES);
  };

  const addBudgetGroup = async (name: string, limit: number, icon: string, forecastType: 'FIXED' | 'VARIABLE') => {
    const group: BudgetGroup = { 
        id: generateId(), 
        budgetId: activeBudgetId,
        name, 
        icon, 
        forecastType,
        monthlyData: { [selectedMonth]: { limit } } 
    };
    await db.budgetGroups.add(group);
    setBudgetGroups(prev => [...prev, group]);
  };

  const updateBudgetGroup = async (group: BudgetGroup) => {
    await db.budgetGroups.put(group);
    setBudgetGroups(prev => prev.map(g => g.id === group.id ? group : g));
  };

  const deleteBudgetGroup = async (id: string) => {
    await db.budgetGroups.delete(id);
    setBudgetGroups(prev => prev.filter(g => g.id !== id));
  };

  const addTransactions = async (txs: Transaction[]) => {
    const withBudgetId = txs.map(t => ({ ...t, budgetId: activeBudgetId }));
    await db.transactions.bulkAdd(withBudgetId);
    setTransactions(prev => [...prev, ...withBudgetId]);
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
    await db.transactions.where('budgetId').equals(activeBudgetId).delete();
    setTransactions([]);
  };

  const addImportRule = async (rule: ImportRule) => {
    const r = { ...rule, budgetId: activeBudgetId };
    await db.importRules.add(r);
    setImportRules(prev => [...prev, r]);
  };

  const deleteImportRule = async (id: string) => {
    await db.importRules.delete(id);
    setImportRules(prev => prev.filter(r => r.id !== id));
  };

  const updateImportRule = async (rule: ImportRule) => {
    await db.importRules.put(rule);
    setImportRules(prev => prev.map(r => r.id === rule.id ? rule : r));
  };

  const addIgnoredSubscription = async (id: string) => {
    const sub = { id, budgetId: activeBudgetId };
    await db.ignoredSubscriptions.add(sub);
    setIgnoredSubscriptions(prev => [...prev, sub]);
  };

  const setPayday = async (day: number) => {
    const newSettings = { ...settings, payday: day };
    await db.settings.put(newSettings, 1);
    setSettings(newSettings);
  };

  const updateSettings = async (newS: Partial<AppSettings>) => {
    const updated = { ...settings, ...newS };
    await db.settings.put(updated, 1);
    setSettings(updated);
  };

  const getExportData = async () => {
    const data = {
      budgets: await db.budgets.toArray(),
      users: await db.users.toArray(),
      accounts: await db.accounts.toArray(),
      buckets: await db.buckets.toArray(),
      mainCategories: await db.mainCategories.toArray(),
      subCategories: await db.subCategories.toArray(),
      budgetGroups: await db.budgetGroups.toArray(),
      budgetTemplates: await db.budgetTemplates.toArray(),
      monthConfigs: await db.monthConfigs.toArray(),
      settings: await db.settings.toArray(),
      transactions: await db.transactions.toArray(),
      importRules: await db.importRules.toArray(),
      ignoredSubscriptions: await db.ignoredSubscriptions.toArray(),
    };
    return JSON.stringify(data);
  };

  const importData = async (json: string) => {
    try {
      const data = JSON.parse(json);
      await (db as any).transaction('rw', ['budgets', 'users', 'accounts', 'buckets', 'mainCategories', 'subCategories', 'budgetGroups', 'budgetTemplates', 'monthConfigs', 'settings', 'transactions', 'importRules', 'ignoredSubscriptions'], async () => {
          await db.budgets.clear(); await db.budgets.bulkAdd(data.budgets || []);
          await db.users.clear(); await db.users.bulkAdd(data.users || []);
          await db.accounts.clear(); await db.accounts.bulkAdd(data.accounts || []);
          await db.buckets.clear(); await db.buckets.bulkAdd(data.buckets || []);
          await db.mainCategories.clear(); await db.mainCategories.bulkAdd(data.mainCategories || []);
          await db.subCategories.clear(); await db.subCategories.bulkAdd(data.subCategories || []);
          await db.budgetGroups.clear(); await db.budgetGroups.bulkAdd(data.budgetGroups || []);
          await db.budgetTemplates.clear(); await db.budgetTemplates.bulkAdd(data.budgetTemplates || []);
          await db.monthConfigs.clear(); await db.monthConfigs.bulkAdd(data.monthConfigs || []);
          await db.settings.clear(); await db.settings.bulkAdd(data.settings || []);
          await db.transactions.clear(); await db.transactions.bulkAdd(data.transactions || []);
          await db.importRules.clear(); await db.importRules.bulkAdd(data.importRules || []);
          await db.ignoredSubscriptions.clear(); await db.ignoredSubscriptions.bulkAdd(data.ignoredSubscriptions || []);
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const setBudgetLimit = async (type: 'GROUP'|'SUB'|'BUCKET', id: string, amount: number | BucketData, month: MonthKey, mode: 'TEMPLATE' | 'OVERRIDE') => {
    if (mode === 'TEMPLATE') {
        const config = monthConfigs.find(c => c.monthKey === month);
        const templateId = config?.templateId || budgetTemplates.find(t => t.isDefault)?.id;
        const template = budgetTemplates.find(t => t.id === templateId);
        if (template) {
            const updated = { ...template };
            if (type === 'GROUP') updated.groupLimits[id] = amount as number;
            if (type === 'SUB') updated.subCategoryBudgets[id] = amount as number;
            if (type === 'BUCKET') updated.bucketValues[id] = amount as BucketData;
            await db.budgetTemplates.put(updated);
            setBudgetTemplates(prev => prev.map(t => t.id === template.id ? updated : t));
        }
    } else {
        const config = monthConfigs.find(c => c.monthKey === month) || { monthKey: month, budgetId: activeBudgetId, templateId: budgetTemplates.find(t => t.isDefault)?.id || '' };
        const updated = { ...config };
        if (type === 'GROUP') { updated.groupOverrides = { ...(updated.groupOverrides || {}), [id]: amount as number }; }
        if (type === 'SUB') { updated.subCategoryOverrides = { ...(updated.subCategoryOverrides || {}), [id]: amount as number }; }
        if (type === 'BUCKET') { updated.bucketOverrides = { ...(updated.bucketOverrides || {}), [id]: amount as BucketData }; }
        await db.monthConfigs.put(updated);
        setMonthConfigs(prev => {
            const filtered = prev.filter(c => c.monthKey !== month);
            return [...filtered, updated];
        });
    }
  };

  const toggleMonthLock = async (month: MonthKey) => {
    const config = monthConfigs.find(c => c.monthKey === month) || { monthKey: month, budgetId: activeBudgetId, templateId: budgetTemplates.find(t => t.isDefault)?.id || '' };
    const updated = { ...config, isLocked: !config.isLocked };
    await db.monthConfigs.put(updated);
    setMonthConfigs(prev => {
        const filtered = prev.filter(c => c.monthKey !== month);
        return [...filtered, updated];
    });
  };

  const assignTemplateToMonth = async (month: MonthKey, templateId: string) => {
    const config = monthConfigs.find(c => c.monthKey === month) || { monthKey: month, budgetId: activeBudgetId, templateId };
    const updated = { ...config, templateId, groupOverrides: {}, subCategoryOverrides: {}, bucketOverrides: {} };
    await db.monthConfigs.put(updated);
    setMonthConfigs(prev => {
        const filtered = prev.filter(c => c.monthKey !== month);
        return [...filtered, updated];
    });
  };

  const clearBudgetOverride = async (type: 'GROUP'|'SUB'|'BUCKET', id: string, month: MonthKey) => {
    const config = monthConfigs.find(c => c.monthKey === month);
    if (!config) return;
    const updated = { ...config };
    if (type === 'GROUP' && updated.groupOverrides) delete updated.groupOverrides[id];
    if (type === 'SUB' && updated.subCategoryOverrides) delete updated.subCategoryOverrides[id];
    if (type === 'BUCKET' && updated.bucketOverrides) delete updated.bucketOverrides[id];
    await db.monthConfigs.put(updated);
    setMonthConfigs(prev => prev.map(c => c.monthKey === month ? updated : c));
  };

  const addTemplate = async (name: string, sourceMonth: MonthKey) => {
      const config = monthConfigs.find(c => c.monthKey === sourceMonth);
      const activeTemplateId = config?.templateId || budgetTemplates.find(t => t.isDefault)?.id;
      const activeTemplate = budgetTemplates.find(t => t.id === activeTemplateId);
      const newTemplate: BudgetTemplate = {
          id: generateId(),
          budgetId: activeBudgetId,
          name,
          isDefault: false,
          groupLimits: { ...(activeTemplate?.groupLimits || {}), ...(config?.groupOverrides || {}) },
          subCategoryBudgets: { ...(activeTemplate?.subCategoryBudgets || {}), ...(config?.subCategoryOverrides || {}) },
          bucketValues: { ...(activeTemplate?.bucketValues || {}), ...(config?.bucketOverrides || {}) }
      };
      await db.budgetTemplates.add(newTemplate);
      setBudgetTemplates(prev => [...prev, newTemplate]);
  };

  const updateTemplate = async (template: BudgetTemplate) => {
      await db.budgetTemplates.put(template);
      setBudgetTemplates(prev => prev.map(t => t.id === template.id ? template : t));
  };

  const resetMonthToTemplate = async (month: MonthKey) => {
      const config = monthConfigs.find(c => c.monthKey === month);
      if (!config) return;
      const updated = { ...config, groupOverrides: {}, subCategoryOverrides: {}, bucketOverrides: {} };
      await db.monthConfigs.put(updated);
      setMonthConfigs(prev => prev.map(c => c.monthKey === month ? updated : c));
  };

  const value = {
    budgets, activeBudgetId, setActiveBudget, addBudget, deleteBudget, updateBudget,
    users, accounts, buckets, mainCategories, subCategories, budgetGroups, budgetTemplates, monthConfigs, settings, selectedMonth, transactions, importRules, ignoredSubscriptions,
    setMonth, updateUserIncome, updateUserName, addAccount, updateAccount, deleteAccount, addBucket, updateBucket, deleteBucket, archiveBucket, addMainCategory, deleteMainCategory, addSubCategory, deleteSubCategory, updateSubCategory, resetCategoriesToDefault,
    addBudgetGroup, updateBudgetGroup, deleteBudgetGroup, addTransactions, updateTransaction, deleteTransaction, deleteAllTransactions, addImportRule, deleteImportRule, updateImportRule, addIgnoredSubscription,
    setPayday, updateSettings, getExportData, importData, setBudgetLimit, toggleMonthLock, assignTemplateToMonth, clearBudgetOverride, addTemplate, updateTemplate, resetMonthToTemplate
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
