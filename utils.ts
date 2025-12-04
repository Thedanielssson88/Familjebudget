import { format, subMonths, addMonths, startOfMonth, endOfMonth, setDate, isAfter, isBefore, parseISO, differenceInMonths, eachDayOfInterval, getDay, isSameMonth, isSameDay, isValid, min, max } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Bucket, BucketData, User } from './types';

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

/**
 * Retrieves the bucket data for a specific month.
 * Optimized to avoid sorting all keys. Iterates backwards from current month
 * to find the nearest previous configuration (Inheritance).
 */
export const getEffectiveBucketData = (bucket: Bucket, monthKey: string): { data: BucketData | null, isInherited: boolean } => {
  // 1. Check exact month (O(1))
  if (bucket.monthlyData[monthKey]) {
     return { data: bucket.monthlyData[monthKey], isInherited: false };
  }

  // 2. Search backwards max 36 months (3 years) to find inheritance.
  // This avoids sorting the entire monthlyData keys array which is expensive.
  let currentSearchDate = parseISO(`${monthKey}-01`);
  
  // Safety check for invalid dates
  if (!isValid(currentSearchDate)) return { data: null, isInherited: false };

  for (let i = 0; i < 36; i++) {
      currentSearchDate = subMonths(currentSearchDate, 1);
      const searchKey = format(currentSearchDate, 'yyyy-MM');
      
      const foundData = bucket.monthlyData[searchKey];
      if (foundData) {
          // If the chain was broken by deletion, don't inherit
          if (foundData.isExplicitlyDeleted) return { data: null, isInherited: false };
          
          // Return the previous month's data as inherited
          return { data: foundData, isInherited: true };
      }
  }

  return { data: null, isInherited: false };
}

/**
 * Helper to get the most recent daily deduction value for a user.
 * Used to pre-fill or calculate "inherited" deduction rates.
 */
export const getLatestDailyDeduction = (user: User, monthKey: string): number => {
  // 1. Check current month
  const current = user.incomeData[monthKey]?.dailyDeduction;
  if (current !== undefined && current > 0) return current;

  // 2. Search backwards (Optimized loop similar to bucket data)
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

  // If explicitly deleted or no data found in chain, cost is 0
  if (!data || data.isExplicitlyDeleted) return 0;

  const { start, end } = getBudgetInterval(monthKey, payday);
  const days = eachDayOfInterval({ start, end });
  
  let count = 0;
  days.forEach(day => {
    // getDay returns 0 for Sunday, 1 for Monday...
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

  // If explicitly deleted or no data found in chain, cost is 0
  if (!data || data.isExplicitlyDeleted) return 0;

  const { start, end } = getBudgetInterval(monthKey, payday);
  const today = new Date();
  
  // If today is before the start of the period, cost is 0
  if (isBefore(today, start)) return 0;

  // Determine the end date for calculation (either today or the end of the period, whichever is earlier)
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
  
  // If explicitly deleted or no data found in chain, cost is 0
  if (!data || data.isExplicitlyDeleted) return 0;
  
  return data.amount;
}

// Calculate monthly contribution for a future goal
export const calculateGoalBucketCost = (bucket: Bucket, monthKey: string): number => {
  if (bucket.type !== 'GOAL' || !bucket.targetDate || !bucket.startSavingDate) return 0;

  const current = parseISO(`${monthKey}-01`);
  const start = parseISO(`${bucket.startSavingDate}-01`);
  const target = parseISO(`${bucket.targetDate}-01`);

  if (!isValid(current) || !isValid(start) || !isValid(target)) return 0;

  // If we haven't started yet
  if (isBefore(current, start)) return 0;
  
  // If current month is Same or After the target month, saving should stop.
  // The user requirement says: "Choose Dec 2025 - July 2026. Count until June 2026."
  // So if current >= target, cost is 0.
  if (!isBefore(current, target)) return 0;

  const totalMonths = differenceInMonths(target, start); 
  
  if (totalMonths <= 0) return bucket.targetAmount;

  return bucket.targetAmount / totalMonths;
};

// Check if a bucket is active/relevant for a specific month
export const isBucketActiveInMonth = (bucket: Bucket, monthKey: string): boolean => {
  if (bucket.type === 'GOAL') {
    if (!bucket.startSavingDate || !bucket.targetDate) return false;
    
    const current = parseISO(`${monthKey}-01`);
    const start = parseISO(`${bucket.startSavingDate}-01`);
    const target = parseISO(`${bucket.targetDate}-01`);
    
    if (!isValid(current) || !isValid(start) || !isValid(target)) return false;

    // Goal Logic: Active from start until target (exclusive of target for savings)
    // Linked Goal Spending buckets: handled by the next check (linkedGoalId)
    return !isBefore(current, start) && isBefore(current, target);
  } else {
    // SPECIAL CASE: Linked Spending Bucket (Payout)
    // Should ONLY appear if it has data strictly in this month.
    // It should NOT inherit.
    if (bucket.linkedGoalId) {
       const data = bucket.monthlyData[monthKey];
       // Check if previous month was explicitly deleted, if so, stop propagation (though payout buckets usually don't propagate)
       // Actually for payout buckets, we only care about exact match.
       return !!data && !data.isExplicitlyDeleted;
    }

    // For Fixed/Daily: Use the inheritance logic
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
    const current = parseISO(`${currentMonthKey}-01`);
    
    if (!isValid(start) || !isValid(target) || !isValid(current)) return 0;

    // Total cost per month
    const monthlyCost = calculateGoalBucketCost(bucket, bucket.startSavingDate); // Hack: pass start date to get the raw rate
    
    // How many months have passed since start?
    // If current is before start, 0
    if (isBefore(current, start)) return 0;

    let monthsPassed = differenceInMonths(current, start);
    
    // We only save UP TO the target date (exclusive).
    // So max months is difference between target and start.
    const maxMonths = differenceInMonths(target, start);
    
    // Include current month if it is active (i.e., we are actively saving this month)
    if (isBucketActiveInMonth(bucket, currentMonthKey)) {
        monthsPassed += 1;
    }
    
    if (monthsPassed > maxMonths) monthsPassed = maxMonths;
    
    return monthlyCost * monthsPassed;
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