import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getBudgetInterval } from '../utils';

export const useBudgetActuals = (selectedMonth: string, payday: number) => {
  return useLiveQuery(async () => {
    const { start, end } = getBudgetInterval(selectedMonth, payday);
    
    // Hämta alla transaktioner i intervallet
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const transactions = await db.transactions
      .where('date')
      .between(startStr, endStr, true, true)
      .toArray();

    // Aggregates
    const spentByBucket: Record<string, number> = {};
    const transfersByBucket: Record<string, number> = {};
    const expensesByBucket: Record<string, number> = {};
    const spentByAccount: Record<string, number> = {};

    transactions.forEach(t => {
      // Calculate generic impact for legacy spentByBucket (Consumption View)
      // Negative transaction (outflow) -> Positive Impact (Money spent)
      // Positive transaction (inflow) -> Negative Impact (Refund)
      let consumptionImpact = 0;
      if (t.amount < 0) {
          consumptionImpact = Math.abs(t.amount);
      } else {
          consumptionImpact = -t.amount;
      }

      if (t.bucketId) {
        // Split by Type for specific views
        if (t.type === 'TRANSFER') {
            // For Cash Flow / Funding:
            // Any transfer associated with a bucket is considered a "Funding Event".
            // Whether it is negative (from Main Account) or positive (arriving in Goal Account),
            // it represents money allocated to this bucket. We use Absolute Value to show magnitude of funding.
            transfersByBucket[t.bucketId] = (transfersByBucket[t.bucketId] || 0) + Math.abs(t.amount);
        } else if (t.type === 'EXPENSE') {
            // For Expenses:
            // Standard consumption logic.
            expensesByBucket[t.bucketId] = (expensesByBucket[t.bucketId] || 0) + consumptionImpact;
        }

        // Total aggregate (Legacy/Consumption focused)
        // We generally don't want Transfers to count as "Spent" in the generic sense if we are looking at consumption,
        // but some views might rely on this. 
        // Given the new strict separation, we populate this mainly with Expenses + consumption logic.
        spentByBucket[t.bucketId] = (spentByBucket[t.bucketId] || 0) + consumptionImpact;
      }
      
      if (t.accountId) {
        spentByAccount[t.accountId] = (spentByAccount[t.accountId] || 0) + consumptionImpact;
      }
    });

    return { spentByBucket, transfersByBucket, expensesByBucket, spentByAccount, transactions };
  }, [selectedMonth, payday]);
};