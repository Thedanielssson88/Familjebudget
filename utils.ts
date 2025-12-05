
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

/**
 * Calculates the monthly contribution for a Goal.
 * It considers historical actuals (manual overrides) to adjust the future rate.
 */
export const calculateGoalBucketCost = (bucket: Bucket, monthKey: string): number => {
  if (bucket.type !== 'GOAL' || !bucket.targetDate || !bucket.startSavingDate) return 0;

  const current = parseISO(`${monthKey}-01`);
  const start = parseISO(`${bucket.startSavingDate}-01`);
  const target = parseISO(`${bucket.targetDate}-01`);

  if (!isValid(current) || !isValid(start) || !isValid(target)) return 0;

  // 1. If currently inactive/finished
  if (isBefore(current, start)) return 0;
  if (!isBefore(current, target)) return 0; // Stop on target month
  if (bucket.archivedDate) {
      const archived = parseISO(`${bucket.archivedDate}-01`);
      if (isAfter(current, archived)) return 0;
  }

  // 2. MANUAL OVERRIDE CHECK
  // If the user has explicitly set an amount for this specific month, return it.
  // This allows "paying less this month" without complex recalculation logic here.
  const specificData = bucket.monthlyData[monthKey];
  if (specificData && specificData.amount > 0 && !specificData.isExplicitlyDeleted) {
      return specificData.amount;
  }
  if (specificData && specificData.isExplicitlyDeleted) return 0;

  // 3. DYNAMIC CALCULATION
  // We need to find out how much is left to save, and divide by remaining months.
  
  let savedSoFar = 0;
  
  // Iterate from start date up to (but not including) the current calculation month
  // to sum up what *should* have been saved or *was* saved.
  let iterDate = start;
  while (isBefore(iterDate, current)) {
      const iterKey = format(iterDate, 'yyyy-MM');
      
      // Recursive call? No, that's dangerous. 
      // We calculate the cost for that past month.
      // Ideally, we'd memoize this, but for <60 iterations it's fast enough.
      
      // Check for specific override in past
      const pastData = bucket.monthlyData[iterKey];
      if (pastData && pastData.isExplicitlyDeleted) {
          // Saved 0 this month
      } else if (pastData && pastData.amount > 0) {
          savedSoFar += pastData.amount;
      } else {
          // If no override, what was the rate *back then*? 
          // This is hard because the rate changes if we miss a payment.
          // SIMPLIFICATION: We assume the standard rate was paid if no data exists.
          // But wait, if we are in the future, we don't know the rate yet.
          
          // Better approach: 
          // "Theoretical Saved" is tricky. 
          // Let's rely on the fact that if it wasn't overridden, it was the "Standard Rate" calculated *at that time*.
          // But that's circular.
          
          // NEW APPROACH:
          // The "Standard Rate" for *this* month is:
          // (Target - (Sum of ALL Past Actuals)) / Months Remaining.
          // "Past Actuals" -> If data exists, use it. If not, assume we paid the *current plan's average*.
          // Actually, if no data exists for a past month, it implies we paid "the plan".
          // But if we want to change the plan today, we assume past was paid?
          
          // Let's try: SavedSoFar = Sum of overrides. 
          // For months without overrides, we can't easily guess.
          
          // Let's try the Inverse:
          // We calculate the *Uniform Monthly Rate* required from Start to End.
          // Then we subtract any *Deficits* or add *Surpluses* from past months.
          
          // Even simpler:
          // We assume "Perfect History" unless overridden.
          // Base Rate = Target / TotalMonths.
          // For every past month:
          //    If override exists: delta = override - Base Rate.
          //    Accumulate deltas.
          // Remaining Needed = Target - (BaseRate * MonthsPassed + AccumulatedDeltas).
          // New Rate = Remaining Needed / Months Remaining.
      }
      iterDate = addMonths(iterDate, 1);
  }

  // IMPLEMENTATION OF "EVEN SIMPLER" APPROACH:
  const totalMonths = differenceInMonths(target, start);
  if (totalMonths <= 0) return bucket.targetAmount;
  
  const baseRate = bucket.targetAmount / totalMonths;
  
  let accumulatedDelta = 0;
  iterDate = start;
  
  while (isBefore(iterDate, current)) {
      const iterKey = format(iterDate, 'yyyy-MM');
      const pastData = bucket.monthlyData[iterKey];
      
      if (pastData) {
          const actual = pastData.isExplicitlyDeleted ? 0 : (pastData.amount || baseRate);
          // If amount is set, we compare to baseRate.
          // Wait, if amount is NOT set in data, it means it was "inherited" or default.
          // But Goals don't inherit in my system usually. 
          
          // If we saved an override amount, the delta is (Actual - Base).
          accumulatedDelta += (actual - baseRate);
      }
      // If NO data exists for a past month, we assume we paid the Base Rate. Delta is 0.
      
      iterDate = addMonths(iterDate, 1);
  }

  // How much do we have left to save relative to the "Base Plan"?
  // If we saved EXTRA (positive delta), we need to save LESS now.
  // If we saved LESS (negative delta), we need to save MORE now.
  
  // Remaining base cost for this month + spread of the deficit
  // Actually:
  // Total Target
  // - (MonthsPassed * BaseRate) -> What we should have saved by plan
  // - accumulatedDelta -> The extra/missing from overrides
  // = Remaining Target
  
  const monthsPassed = differenceInMonths(current, start);
  const savedHypothetically = monthsPassed * baseRate;
  const actualSavedSoFar = savedHypothetically + accumulatedDelta;
  
  const remainingTarget = bucket.targetAmount - actualSavedSoFar;
  const monthsRemaining = differenceInMonths(target, current);
  
  if (monthsRemaining <= 0) return remainingTarget; // Should be paid off
  
  const newMonthlyRate = remainingTarget / monthsRemaining;
  
  return Math.max(0, newMonthlyRate);
};

// Check if a bucket is active/relevant for a specific month
export const isBucketActiveInMonth = (bucket: Bucket, monthKey: string): boolean => {
  if (bucket.type === 'GOAL') {
    if (!bucket.startSavingDate || !bucket.targetDate) return false;
    
    const current = parseISO(`${monthKey}-01`);
    const start = parseISO(`${bucket.startSavingDate}-01`);
    const target = parseISO(`${bucket.targetDate}-01`);
    
    if (!isValid(current) || !isValid(start) || !isValid(target)) return false;

    // Archived Logic: If archived, it stops being active AFTER the archive month.
    if (bucket.archivedDate) {
        const archived = parseISO(`${bucket.archivedDate}-01`);
        if (isAfter(current, archived)) return false;
    }

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
    let current = parseISO(`${currentMonthKey}-01`);
    
    if (!isValid(start) || !isValid(target) || !isValid(current)) return 0;

    // CAP logic for Archived goals
    if (bucket.archivedDate) {
        const archived = parseISO(`${bucket.archivedDate}-01`);
        if (isAfter(current, archived)) {
            current = archived;
        }
    }

    // Sum up actual costs (using calculateGoalBucketCost) for every month until now
    let totalSaved = 0;
    let iterDate = start;
    
    // We iterate up to and INCLUDING current month if it is active
    // Wait, the UI usually shows "Saved Amount" as "What is in the bank".
    // If we are in current month, and budget isn't "closed", do we count it?
    // Usually yes, we project what we *will* have saved by end of month.
    
    const limitDate = isBucketActiveInMonth(bucket, format(current, 'yyyy-MM')) ? addMonths(current, 1) : current;

    while (isBefore(iterDate, limitDate)) {
        // Stop if we hit target
        if (!isBefore(iterDate, target)) break;

        const key = format(iterDate, 'yyyy-MM');
        // calculateGoalBucketCost handles overrides logic
        const cost = calculateGoalBucketCost(bucket, key);
        totalSaved += cost;
        
        iterDate = addMonths(iterDate, 1);
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
