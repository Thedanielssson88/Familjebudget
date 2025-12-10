
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
    
    // New: Account Level Transfer Stats
    const accountTransferNet: Record<string, number> = {};
    const accountUnallocatedNet: Record<string, number> = {};

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

      // Check if it is a specific user bucket or a special system category
      const isSpecialBucket = t.bucketId === 'INTERNAL' || t.bucketId === 'PAYOUT';

      if (t.bucketId && !isSpecialBucket) {
        // Split by Type for specific views
        if (t.type === 'TRANSFER' || t.type === 'INCOME') {
            // For Cash Flow / Funding:
            // Any transfer or income associated with a bucket is considered a "Funding Event".
            // We use Absolute Value to show magnitude of funding.
            transfersByBucket[t.bucketId] = (transfersByBucket[t.bucketId] || 0) + Math.abs(t.amount);
        } else if (t.type === 'EXPENSE') {
            // For Expenses:
            // Standard consumption logic.
            expensesByBucket[t.bucketId] = (expensesByBucket[t.bucketId] || 0) + consumptionImpact;
        }

        // Total aggregate (Legacy/Consumption focused)
        spentByBucket[t.bucketId] = (spentByBucket[t.bucketId] || 0) + consumptionImpact;
      } else {
          // No Bucket ID OR Special Bucket (Internal/Payout)
          if ((t.type === 'TRANSFER' || t.type === 'INCOME') && t.accountId) {
              accountUnallocatedNet[t.accountId] = (accountUnallocatedNet[t.accountId] || 0) + t.amount;
          }
      }
      
      if (t.accountId) {
        spentByAccount[t.accountId] = (spentByAccount[t.accountId] || 0) + consumptionImpact;
        
        // Calculate Net Transfer Flow per Account (All transfers/income in minus all transfers out)
        if (t.type === 'TRANSFER' || t.type === 'INCOME') {
            accountTransferNet[t.accountId] = (accountTransferNet[t.accountId] || 0) + t.amount;
        }
      }
    });

    return { spentByBucket, transfersByBucket, expensesByBucket, spentByAccount, accountTransferNet, accountUnallocatedNet, transactions };
  }, [selectedMonth, payday]);
};
