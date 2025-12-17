
import { format, subMonths, addMonths, startOfMonth, endOfMonth, setDate, isAfter, isBefore, parseISO, differenceInMonths, eachDayOfInterval, getDay, isSameMonth, isSameDay, isValid, min, max } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Bucket, BucketData, User, BudgetGroup, BudgetGroupData, Transaction, SubCategory, BudgetTemplate, MonthConfig } from './types';

// Generate a unique ID using crypto API for safety
export const generateId = () => self.crypto.randomUUID();

// Format currency
export const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
};

// Calculate Date Range based on Payday
// If payday is 25, and month is July 2024: Range is June 25 - July 24.
export const getBudgetInterval = (monthKey: string, payday: number) => {
  const date = parseISO(`${monthKey}-01`);
  const start = setDate(subMonths(date, 1), payday);
  const end = setDate(date, payday - 1);
  return { start, end };
};

// --- REIMBURSEMENT HELPERS ---
export const calculateReimbursementMap = (transactions: Transaction[]) => {
    const map: Record<string, number> = {};
    transactions.forEach(t => {
        if (!t.isHidden && t.linkedExpenseId) { // Only count non-hidden reimbursements
            map[t.linkedExpenseId] = (map[t.linkedExpenseId] || 0) + t.amount;
        }
    });
    return map;
};

export const getEffectiveAmount = (t: Transaction, reimbursementMap: Record<string, number>) => {
    // If t is a reimbursement (has linkedExpenseId), its effective amount is 0 for statistics/budgeting purposes (it's netting out the expense).
    if (t.linkedExpenseId) return 0;
    
    const reimbursement = reimbursementMap[t.id] || 0;
    return t.amount + reimbursement;
};

/**
 * Retrieves the bucket data for a specific month.
 * UPDATED: Uses Template System for FIXED/DAILY buckets. GOAL buckets still use legacy inheritance/explicit data.
 */
export const getEffectiveBucketData = (bucket: Bucket, monthKey: string, templates: BudgetTemplate[] = [], configs: MonthConfig[] = []): { data: BucketData | null, isInherited: boolean, templateName?: string } => {
  
  // GLOBAL ARCHIVE CHECK: If bucket is archived before this month, it has no effective data.
  if (bucket.archivedDate) {
      const current = parseISO(`${monthKey}-01`);
      const archived = parseISO(`${bucket.archivedDate}-01`);
      if (isValid(current) && isValid(archived) && isAfter(current, archived)) {
          return { data: null, isInherited: false };
      }
  }

  // GOALs and Dreams are specific to the "timeline", so they don't use templates.
  if (bucket.type === 'GOAL') {
      // 1. Check exact month (O(1))
      if (bucket.monthlyData[monthKey]) {
         return { data: bucket.monthlyData[monthKey], isInherited: false, templateName: 'Mål' };
      }

      // 2. Search backwards max 36 months
      let currentSearchDate = parseISO(`${monthKey}-01`);
      if (!isValid(currentSearchDate)) return { data: null, isInherited: false };

      for (let i = 0; i < 36; i++) {
          currentSearchDate = subMonths(currentSearchDate, 1);
          const searchKey = format(currentSearchDate, 'yyyy-MM');
          
          const foundData = bucket.monthlyData[searchKey];
          if (foundData) {
              if (foundData.isExplicitlyDeleted) return { data: null, isInherited: false };
              return { data: foundData, isInherited: true, templateName: 'Mål (Arv)' };
          }
      }
      return { data: null, isInherited: false };
  }

  // FIXED / DAILY: Use Template System
  
  // 1. Check for MonthConfig specific override
  const config = configs.find(c => c.monthKey === monthKey);
  if (config?.bucketOverrides && config.bucketOverrides[bucket.id] !== undefined) {
      return { 
          data: config.bucketOverrides[bucket.id], 
          isInherited: false,
          templateName: 'Avvikelse' 
      };
  }

  // 2. Find Active Template
  let templateId = config?.templateId;
  let templateName = '';
  
  if (!templateId) {
      const defaultTemplate = templates.find(t => t.isDefault);
      templateId = defaultTemplate?.id;
      templateName = defaultTemplate?.name || 'Standard';
  } else {
      const t = templates.find(t => t.id === templateId);
      templateName = t?.name || 'Okänd mall';
  }

  const template = templates.find(t => t.id === templateId);
  
  // Check if template has data for this bucket
  if (template && template.bucketValues && template.bucketValues[bucket.id]) {
      return { 
          data: template.bucketValues[bucket.id],
          isInherited: true,
          templateName: templateName
      };
  }

  // 3. Fallback to Legacy System (Directly on object)
  if (bucket.monthlyData?.[monthKey]) {
      return { data: bucket.monthlyData[monthKey], isInherited: false, templateName: 'Legacy' };
  }
  
  // Legacy Inheritance Fallback
  let currentSearchDate = parseISO(`${monthKey}-01`);
  if (!isValid(currentSearchDate)) return { data: null, isInherited: false };

  for (let i = 0; i < 12; i++) {
      currentSearchDate = subMonths(currentSearchDate, 1);
      const searchKey = format(currentSearchDate, 'yyyy-MM');
      const foundData = bucket.monthlyData[searchKey];
      if (foundData) {
          if (foundData.isExplicitlyDeleted) return { data: null, isInherited: false };
          return { data: foundData, isInherited: true, templateName: 'Legacy (Arv)' };
      }
  }

  return { data: null, isInherited: false };
}

/**
 * UPDATED LOGIC: Get effective limit via Template System
 */
export const getEffectiveBudgetGroupData = (group: BudgetGroup, monthKey: string, templates: BudgetTemplate[] = [], configs: MonthConfig[] = []): { data: BudgetGroupData | null, isInherited: boolean, templateName?: string } => {
  // 1. Check for MonthConfig specific override
  const config = configs.find(c => c.monthKey === monthKey);
  if (config?.groupOverrides && config.groupOverrides[group.id] !== undefined) {
      return { 
          data: { limit: config.groupOverrides[group.id], isExplicitlyDeleted: false }, 
          isInherited: false,
          templateName: 'Avvikelse' 
      };
  }

  // 2. Find Active Template
  let templateId = config?.templateId;
  let templateName = '';
  
  if (!templateId) {
      const defaultTemplate = templates.find(t => t.isDefault);
      templateId = defaultTemplate?.id;
      templateName = defaultTemplate?.name || 'Standard';
  } else {
      const t = templates.find(t => t.id === templateId);
      templateName = t?.name || 'Okänd mall';
  }

  const template = templates.find(t => t.id === templateId);
  
  if (template && template.groupLimits[group.id] !== undefined) {
      return { 
          data: { limit: template.groupLimits[group.id], isExplicitlyDeleted: false },
          isInherited: true,
          templateName: template.name
      };
  }

  // 3. Fallback to Legacy System (Directly on object)
  if (group.monthlyData?.[monthKey]) {
      return { data: group.monthlyData[monthKey], isInherited: false, templateName: 'Legacy' };
  }

  return { data: null, isInherited: false };
};

/**
 * Get Effective SubCategory Budget via Template System
 */
export const getEffectiveSubCategoryBudget = (sub: SubCategory, monthKey: string, templates: BudgetTemplate[], configs: MonthConfig[]): number => {
    // 1. Override
    const config = configs.find(c => c.monthKey === monthKey);
    if (config?.subCategoryOverrides && config.subCategoryOverrides[sub.id] !== undefined) {
        return config.subCategoryOverrides[sub.id];
    }

    // 2. Template
    let templateId = config?.templateId;
    if (!templateId) {
        const defaultTemplate = templates.find(t => t.isDefault);
        templateId = defaultTemplate?.id;
    }
    const template = templates.find(t => t.id === templateId);
    if (template && template.subCategoryBudgets[sub.id] !== undefined) {
        return template.subCategoryBudgets[sub.id];
    }

    // 3. Legacy Fallback (Static prop on subcategory)
    return sub.deprecated_monthlyBudget || 0;
};


/**
 * Helper to get the most recent daily deduction value for a user.
 */
export const getLatestDailyDeduction = (user: User, monthKey: string): number => {
  const current = user.incomeData[monthKey]?.dailyDeduction;
  if (current !== undefined && current > 0) return current;

  let currentSearchDate = parseISO(`${monthKey}-01`);
  if (!isValid(currentSearchDate)) return 0;

  for (let i = 0; i < 24; i++) {
      currentSearchDate = subMonths(currentSearchDate, 1);
      const searchKey = format(currentSearchDate, 'yyyy-MM');
      const val = user.incomeData[searchKey]?.dailyDeduction;
      if (val !== undefined && val > 0) return val;
  }

  return 0;
};

// Calculate cost for a daily bucket within the interval
export const calculateDailyBucketCost = (bucket: Bucket, monthKey: string, payday: number): number => {
  if (bucket.type !== 'DAILY') return 0;
  
  const { data } = getEffectiveBucketData(bucket, monthKey);

  if (!data || data.isExplicitlyDeleted) return 0;

  const { start, end } = getBudgetInterval(monthKey, payday);
  const days = eachDayOfInterval({ start, end });
  
  let count = 0;
  days.forEach(day => {
    if (data.activeDays.includes(getDay(day))) {
      count++;
    }
  });
  
  return count * data.dailyAmount;
};

// Calculate cost for a daily bucket SO FAR (up to today) within the interval
export const calculateDailyBucketCostSoFar = (bucket: Bucket, monthKey: string, payday: number): number => {
  if (bucket.type !== 'DAILY') return 0;
  
  const { data } = getEffectiveBucketData(bucket, monthKey);

  if (!data || data.isExplicitlyDeleted) return 0;

  const { start, end } = getBudgetInterval(monthKey, payday);
  const today = new Date();
  
  if (isBefore(today, start)) return 0;

  const calcEnd = isBefore(today, end) ? today : end;
  const days = eachDayOfInterval({ start, end: calcEnd });
  
  let count = 0;
  days.forEach(day => {
    if (data.activeDays.includes(getDay(day))) {
      count++;
    }
  });
  
  return count * data.dailyAmount;
};

// Get cost for fixed bucket
export const calculateFixedBucketCost = (bucket: Bucket, monthKey: string): number => {
  if (bucket.type !== 'FIXED') return 0;
  const { data } = getEffectiveBucketData(bucket, monthKey);
  if (!data || data.isExplicitlyDeleted) return 0;
  return data.amount;
}

/**
 * Calculates the monthly contribution for a Goal.
 */
export const calculateGoalBucketCost = (bucket: Bucket, monthKey: string): number => {
  if (bucket.type !== 'GOAL' || !bucket.targetDate || !bucket.startSavingDate) return 0;

  if (bucket.paymentSource === 'BALANCE') return 0;

  const current = parseISO(`${monthKey}-01`);
  const start = parseISO(`${bucket.startSavingDate}-01`);
  const target = parseISO(`${bucket.targetDate}-01`);

  if (!isValid(current) || !isValid(start) || !isValid(target)) return 0;

  if (isBefore(current, start)) return 0;
  if (!isBefore(current, target)) return 0; 
  
  if (bucket.archivedDate) {
      const archived = parseISO(`${bucket.archivedDate}-01`);
      if (isAfter(current, archived)) return 0;
  }

  const specificData = bucket.monthlyData[monthKey];
  if (specificData && specificData.amount > 0 && !specificData.isExplicitlyDeleted) {
      return specificData.amount;
  }
  if (specificData && specificData.isExplicitlyDeleted) return 0;

  const totalMonths = differenceInMonths(target, start);
  if (totalMonths <= 0) return bucket.targetAmount;
  
  const baseRate = bucket.targetAmount / totalMonths;
  
  let accumulatedDelta = 0;
  let iterDate = start;
  
  while (isBefore(iterDate, current)) {
      const iterKey = format(iterDate, 'yyyy-MM');
      const pastData = bucket.monthlyData[iterKey];
      
      if (pastData) {
          const actual = pastData.isExplicitlyDeleted ? 0 : (pastData.amount || baseRate);
          accumulatedDelta += (actual - baseRate);
      }
      
      iterDate = addMonths(iterDate, 1);
  }

  const monthsPassed = differenceInMonths(current, start);
  const savedHypothetically = monthsPassed * baseRate;
  const actualSavedSoFar = savedHypothetically + accumulatedDelta;
  
  const remainingTarget = bucket.targetAmount - actualSavedSoFar;
  const monthsRemaining = differenceInMonths(target, current);
  
  if (monthsRemaining <= 0) return remainingTarget; 
  
  const newMonthlyRate = remainingTarget / monthsRemaining;
  
  return Math.max(0, newMonthlyRate);
};

// Check if a bucket is active/relevant for a specific month
export const isBucketActiveInMonth = (bucket: Bucket, monthKey: string): boolean => {
  
  // GLOBAL ARCHIVE CHECK (For all types)
  if (bucket.archivedDate) {
      const current = parseISO(`${monthKey}-01`);
      const archived = parseISO(`${bucket.archivedDate}-01`);
      if (isValid(current) && isValid(archived) && isAfter(current, archived)) return false;
  }

  if (bucket.type === 'GOAL') {
    if (!bucket.startSavingDate || !bucket.targetDate) return false;
    
    const current = parseISO(`${monthKey}-01`);
    const start = parseISO(`${bucket.startSavingDate}-01`);
    const target = parseISO(`${bucket.targetDate}-01`);
    
    if (!isValid(current) || !isValid(start) || !isValid(target)) return false;

    // Goal Logic: Active from start until target (exclusive of target for savings)
    return !isBefore(current, start) && isBefore(current, target);
  } else {
    // SPECIAL CASE: Linked Spending Bucket (Payout)
    if (bucket.linkedGoalId) {
       const data = bucket.monthlyData[monthKey];
       return !!data && !data.isExplicitlyDeleted;
    }

    const { data } = getEffectiveBucketData(bucket, monthKey);
    if (data && !data.isExplicitlyDeleted) return true;
    
    return false;
  }
}

// Calculate how much has been saved SO FAR (up to current month)
export const calculateSavedAmount = (bucket: Bucket, currentMonthKey: string): number => {
    if (bucket.type !== 'GOAL' || !bucket.targetDate || !bucket.startSavingDate) return 0;
    
    const start = parseISO(`${bucket.startSavingDate}-01`);
    const target = parseISO(`${bucket.targetDate}-01`);
    let current = parseISO(`${currentMonthKey}-01`);
    
    if (!isValid(start) || !isValid(target) || !isValid(current)) return 0;

    if (bucket.archivedDate) {
        const archived = parseISO(`${bucket.archivedDate}-01`);
        if (isAfter(current, archived)) {
            current = archived;
        }
    }

    let totalSaved = 0;
    let iterDate = start;
    
    const limitDate = isBucketActiveInMonth(bucket, format(current, 'yyyy-MM')) ? addMonths(current, 1) : current;

    while (isBefore(iterDate, limitDate)) {
        if (!isBefore(iterDate, target)) break;

        const key = format(iterDate, 'yyyy-MM');
        const cost = calculateGoalBucketCost(bucket, key);
        totalSaved += cost;
        
        iterDate = addMonths(iterDate, 1);
    }
    
    if (bucket.paymentSource === 'BALANCE') {
        return bucket.targetAmount;
    }
    
    return totalSaved;
}

// Get total income for a specific month
export const getTotalFamilyIncome = (users: User[], monthKey: string) => {
  let total = 0;
  users.forEach(u => {
    const data = u.incomeData[monthKey] || { salary: 0, childBenefit: 0, insurance: 0 };
    total += (data.salary || 0) + (data.childBenefit || 0) + (data.insurance || 0);
  });
  return total;
};

// Get individual income total
export const getUserIncome = (user: User, monthKey: string) => {
  const data = user.incomeData[monthKey] || { salary: 0, childBenefit: 0, insurance: 0 };
  return (data.salary || 0) + (data.childBenefit || 0) + (data.insurance || 0);
};

export const getMonthLabel = (monthKey: string) => {
  return format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: sv });
};

// --- NEW HELPER: 3 Month Average for SubCategory ---
export const getSubCategoryAverage = (
    subCatId: string, 
    currentMonth: string, 
    transactions: Transaction[], 
    reimbursementMap: Record<string, number>
): number => {
    const current = parseISO(`${currentMonth}-01`);
    const start = subMonths(current, 3);
    const end = subMonths(current, 1);
    
    const startStr = format(start, 'yyyy-MM-01');
    const endStr = format(endOfMonth(end), 'yyyy-MM-dd');

    const relevantTxs = transactions.filter(t => 
        t.categorySubId === subCatId && 
        !t.isHidden && 
        t.date >= startStr && 
        t.date <= endStr &&
        (t.type === 'EXPENSE' || (!t.type && t.amount < 0))
    );

    if (relevantTxs.length === 0) return 0;

    const total = relevantTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
    return Math.round(total / 3);
};
