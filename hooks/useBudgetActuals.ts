import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { getBudgetInterval } from '../utils';

export const useBudgetActuals = (selectedMonth: string, payday: number) => {
  return useLiveQuery(async () => {
    const { start, end } = getBudgetInterval(selectedMonth, payday);
    
    // Hämta alla transaktioner i intervallet
    // Vi använder start och end datum strängar för jämförelse (YYYY-MM-DD)
    // Eftersom datum i DB är strängar, fungerar lexiografisk jämförelse bra
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const transactions = await db.transactions
      .where('date')
      .between(startStr, endStr, true, true)
      .toArray();

    // Summera per Bucket och per Konto
    const spentByBucket: Record<string, number> = {};
    const spentByAccount: Record<string, number> = {};

    transactions.forEach(t => {
      // Vi antar att utgifter är negativa belopp eller positiva belopp som ska dras av.
      // I denna app verkar "amount" på transaktioner ofta vara absolutbelopp eller negativa?
      // Låt oss anta att vi summerar absolutbeloppet av alla transaktioner som matchar.
      
      // OBS: En inkomst (retur) bör minska spenderat belopp.
      // Om importen sparar utgifter som negativa tal:
      // -100 (utgift) -> ökar spent med 100
      // +100 (retur) -> minskar spent med 100
      
      // Om importen sparar utgifter som positiva tal (mindre troligt för bank-csv, men möjligt):
      // Vi kör en säkerhetslogik: Utgifter brukar vara negativa i CSV.
      
      let impact = 0;
      
      // Om beloppet är negativt (vanligast för utgift), gör det positivt för "spent"
      if (t.amount < 0) {
          impact = Math.abs(t.amount);
      } else {
          // Positivt belopp är oftast en insättning/retur, vilket ska MINSKA utgifterna.
          impact = -t.amount;
      }

      if (t.bucketId) {
        spentByBucket[t.bucketId] = (spentByBucket[t.bucketId] || 0) + impact;
      }
      
      // Aggregera även på konto om bucketId saknas men accountId finns (för översikt)
      // Men oftast vill vi summera ALLT på kontot för att se totalen
      if (t.accountId) {
        spentByAccount[t.accountId] = (spentByAccount[t.accountId] || 0) + impact;
      }
    });

    return { spentByBucket, spentByAccount, transactions };
  }, [selectedMonth, payday]);
};