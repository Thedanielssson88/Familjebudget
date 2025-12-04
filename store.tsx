import React, { createContext, useContext, useEffect, useState } from 'react';
import { Account, AppSettings, Bucket, GlobalState, User, MonthKey } from './types';
import { format, addMonths, parseISO } from 'date-fns';
import { getEffectiveBucketData } from './utils';

interface AppContextType extends GlobalState {
  addUser: (name: string, avatar: string) => void;
  updateUserIncome: (userId: string, month: MonthKey, type: 'salary'|'childBenefit'|'insurance', value: number) => void;
  updateUserName: (userId: string, name: string) => void;
  addAccount: (name: string, icon: string) => void;
  addBucket: (bucket: Bucket) => void;
  updateBucket: (bucket: Bucket) => void;
  deleteBucket: (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => void;
  confirmBucketAmount: (id: string, month: MonthKey) => void;
  setMonth: (month: MonthKey) => void;
  setPayday: (day: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'familyflow_db_v3'; // Bumped version

const defaultSettings: AppSettings = { payday: 25 };

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  // Load from LS
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      setUsers(parsed.users || []);
      setAccounts(parsed.accounts || []);
      setBuckets(parsed.buckets || []);
      setSettings(parsed.settings || defaultSettings);
    } else {
        // Seed demo data
        const demoUsers = [
            { id: '1', name: 'Anna', avatar: '👩', incomeData: {} },
            { id: '2', name: 'Erik', avatar: '👨', incomeData: {} }
        ];
        const demoAccounts = [
            { id: 'acc1', name: 'Hushållskonto', icon: '🏠', startBalances: {} },
            { id: 'acc2', name: 'Bil & Transport', icon: '🚗', startBalances: {} },
            { id: 'acc3', name: 'Buffert', icon: '💰', startBalances: {} }
        ];
        
        // Initial month for demo data
        const currentMonth = format(new Date(), 'yyyy-MM');
        
        const demoBuckets: Bucket[] = [
            { 
              id: 'b1', accountId: 'acc1', name: 'Mat (Hemköp)', type: 'FIXED', isSavings: false, 
              monthlyData: {
                [currentMonth]: { amount: 6000, dailyAmount: 0, activeDays: [] }
              },
              targetAmount: 0, targetDate: '', startSavingDate: '' 
            },
            { 
              id: 'b2', accountId: 'acc1', name: 'Luncher', type: 'DAILY', isSavings: false, 
              monthlyData: {
                [currentMonth]: { amount: 0, dailyAmount: 135, activeDays: [1,2,3,4,5] }
              },
              targetAmount: 0, targetDate: '', startSavingDate: '' 
            },
            { 
              id: 'b3', accountId: 'acc3', name: 'Sommarsemester 2025', type: 'GOAL', isSavings: true, 
              monthlyData: {},
              targetAmount: 30000, targetDate: '2025-06', startSavingDate: '2024-01' 
            },
        ];
        setUsers(demoUsers);
        setAccounts(demoAccounts);
        setBuckets(demoBuckets);
    }
    setIsLoaded(true);
  }, []);

  // Save to LS
  useEffect(() => {
    if (!isLoaded) return;
    const state = { users, accounts, buckets, settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [users, accounts, buckets, settings, isLoaded]);

  const addUser = (name: string, avatar: string) => {
    setUsers([...users, { id: Math.random().toString(), name, avatar, incomeData: {} }]);
  };

  const updateUserIncome = (userId: string, month: MonthKey, type: 'salary'|'childBenefit'|'insurance', value: number) => {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const currentMonthData = u.incomeData[month] || { salary: 0, childBenefit: 0, insurance: 0 };
      return {
        ...u,
        incomeData: {
          ...u.incomeData,
          [month]: { ...currentMonthData, [type]: value }
        }
      };
    }));
  };

  const updateUserName = (userId: string, name: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, name } : u));
  };

  const addAccount = (name: string, icon: string) => {
    setAccounts(prev => [...prev, { id: Math.random().toString(), name, icon, startBalances: {} }]);
  };

  const addBucket = (bucket: Bucket) => setBuckets(prev => {
      // Prevent duplicates if rapid clicks
      if (prev.find(b => b.id === bucket.id)) return prev;
      return [...prev, bucket];
  });
  
  const updateBucket = (bucket: Bucket) => {
    setBuckets(prev => prev.map(b => b.id === bucket.id ? bucket : b));
  };

  const confirmBucketAmount = (id: string, month: MonthKey) => {
      setBuckets(prev => prev.map(b => {
          if (b.id !== id) return b;
          
          const { data, isInherited } = getEffectiveBucketData(b, month);
          // If we have inherited data, explicit save it to current month to "Confirm" it
          if (isInherited && data) {
              return {
                  ...b,
                  monthlyData: {
                      ...b.monthlyData,
                      [month]: { ...data, isExplicitlyDeleted: false }
                  }
              }
          }
          return b;
      }));
  };

  const deleteBucket = (id: string, month: MonthKey, scope: 'THIS_MONTH' | 'THIS_AND_FUTURE' | 'ALL') => {
    if (scope === 'ALL') {
        setBuckets(prev => prev.filter(b => b.id !== id));
        return;
    }

    setBuckets(prev => {
      return prev.map(b => {
        if (b.id !== id) return b;
        
        const newMonthlyData = { ...b.monthlyData };
        // We need to know what we are deleting. If inherited, we first materialize it then delete.
        const { data: effectiveData } = getEffectiveBucketData(b, month);
        const currentData = effectiveData || { amount: 0, dailyAmount: 0, activeDays: [] };

        if (scope === 'THIS_MONTH') {
            // 1. Mark current month as explicitly deleted
            newMonthlyData[month] = { ...currentData, amount: 0, dailyAmount: 0, isExplicitlyDeleted: true };
            
            // 2. To prevent propagation logic from hiding the NEXT month (because current is deleted),
            // we must ensure the NEXT month exists and is valid (cloning current data before deletion).
            // Only do this if next month doesn't already exist.
            const nextMonth = format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM');
            if (!newMonthlyData[nextMonth]) {
                // Restore the original settings for next month
                newMonthlyData[nextMonth] = { ...currentData, isExplicitlyDeleted: false };
            }
        } else if (scope === 'THIS_AND_FUTURE') {
            // Soft delete this month
            newMonthlyData[month] = { ...currentData, amount: 0, dailyAmount: 0, isExplicitlyDeleted: true };
            
            // Soft delete any EXISTING future entries to ensure they don't override the stop
            Object.keys(newMonthlyData).forEach(key => {
                if (key > month) {
                    newMonthlyData[key] = { ...newMonthlyData[key], isExplicitlyDeleted: true, amount: 0, dailyAmount: 0 };
                }
            });
        }
        
        return { ...b, monthlyData: newMonthlyData };
      });
    });
  };

  const setPayday = (day: number) => setSettings({ ...settings, payday: day });

  if (!isLoaded) return <div className="min-h-screen bg-background flex items-center justify-center text-white">Laddar FamilyFlow...</div>;

  return (
    <AppContext.Provider value={{
      users, accounts, buckets, settings, selectedMonth,
      addUser, updateUserIncome, updateUserName, addAccount, addBucket, updateBucket, deleteBucket, confirmBucketAmount, setMonth: setSelectedMonth, setPayday
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