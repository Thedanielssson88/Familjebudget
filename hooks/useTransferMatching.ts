
import { useMemo } from 'react';
import { Transaction } from '../types';

export const useTransferMatching = (transactions: Transaction[]) => {
  return useMemo(() => {
    // 1. Filter out already linked transactions
    const candidates = transactions.filter(t => !t.linkedTransactionId);
    
    const matches: { from: Transaction, to: Transaction }[] = [];
    const usedIds = new Set<string>();

    // 2. Loop and find pairs
    candidates.forEach(t1 => {
      if (usedIds.has(t1.id)) return;

      // Search for counterpart:
      // - Different ID
      // - Not used
      // - Different Account
      // - Strict same date (as per request)
      // - Amount is inverse (t1 = -t2)
      const potentialMatch = candidates.find(t2 => {
        if (t1.id === t2.id) return false;
        if (usedIds.has(t2.id)) return false;
        if (t1.accountId === t2.accountId) return false; // Must be different accounts
        if (t1.date !== t2.date) return false; // Strict date matching
        
        return t1.amount === -t2.amount;
      });

      if (potentialMatch) {
        matches.push({
          from: t1.amount < 0 ? t1 : potentialMatch, // Outgoing
          to: t1.amount < 0 ? potentialMatch : t1,   // Incoming
        });
        usedIds.add(t1.id);
        usedIds.add(potentialMatch.id);
      }
    });

    return matches;
  }, [transactions]);
};
