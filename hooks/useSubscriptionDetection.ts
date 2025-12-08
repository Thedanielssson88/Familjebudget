import { useMemo } from 'react';
import { Transaction } from '../types';
import { differenceInDays, parseISO, getDate } from 'date-fns';

export interface SubscriptionCandidate {
  id: string;
  name: string;
  avgAmount: number;
  frequency: 'monthly' | 'yearly';
  occurrences: number;
  lastDate: string;
  transactions: Transaction[];
  accountId: string;
  confidence: 'high' | 'medium';
}

export const useSubscriptionDetection = (transactions: Transaction[]) => {
  return useMemo(() => {
    // 1. Gruppera transaktioner på beskrivning
    const groups: Record<string, Transaction[]> = {};
    
    transactions.forEach(t => {
      // Ignorera inkomster och väldigt små belopp (<10 kr kan vara skräp)
      if (t.amount >= 0 || Math.abs(t.amount) < 10) return; 

      // Enkel rensning: Ta bort datumformat och korta sifferkoder om det behövs
      // Vi använder trim() men behåller namnet intakt för att inte gruppera olika butiker av misstag
      const cleanName = t.description.trim(); 
      
      if (!groups[cleanName]) groups[cleanName] = [];
      groups[cleanName].push(t);
    });

    const candidates: SubscriptionCandidate[] = [];

    // 2. Analysera varje grupp
    Object.entries(groups).forEach(([name, txs]) => {
      // Måste ha historik (minst 3 dragningar för att se mönster)
      if (txs.length < 3) return;

      // Sortera datum (Nyast först)
      const sorted = txs.sort((a, b) => b.date.localeCompare(a.date));
      
      // --- REGEL 1: BELOPPS-STABILITET ---
      // Räkna ut hur mycket beloppet varierar. Prenumerationer är ofta exakta.
      const amounts = sorted.map(t => Math.abs(t.amount));
      const totalAmount = amounts.reduce((sum, a) => sum + a, 0);
      const avgAmount = totalAmount / amounts.length;
      
      // Räkna ut varians
      const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      
      // Om standardavvikelsen är hög (> 10% av beloppet), är det troligen mat/shopping.
      const isStableAmount = stdDev < (avgAmount * 0.1);

      // --- REGEL 2: FREKVENS-KOLL ---
      // Hitta datumspannet (första till sista transaktionen)
      const firstDate = parseISO(sorted[sorted.length - 1].date);
      const lastDate = parseISO(sorted[0].date);
      const daysSpan = Math.abs(differenceInDays(lastDate, firstDate));
      
      if (daysSpan === 0) return;

      // Uppskatta antal per månad
      const monthsSpan = Math.max(1, daysSpan / 30);
      const txPerMonth = txs.length / monthsSpan;

      // Om vi snittar mer än 2.5 köp i månaden är det troligen en vana (kaffe/mat), inte en prenumeration.
      if (txPerMonth > 2.5) return; 

      // --- REGEL 3: INTERVALL-KOLL (Månadsvis) ---
      let intervalSum = 0;
      let intervalsCount = 0;
      let isRoughlyMonthly = true;

      for (let i = 0; i < Math.min(sorted.length - 1, 5); i++) {
         const d1 = parseISO(sorted[i].date);
         const d2 = parseISO(sorted[i+1].date);
         const diff = Math.abs(differenceInDays(d1, d2));
         
         intervalSum += diff;
         intervalsCount++;

         // Om ett glapp är mindre än 20 dagar eller större än 45 dagar, bryt.
         if (diff < 20 || diff > 45) {
             isRoughlyMonthly = false;
         }
      }
      
      const avgInterval = intervalsCount > 0 ? intervalSum / intervalsCount : 0;
      // Dubbelkolla snittet också
      if (avgInterval < 25 || avgInterval > 35) isRoughlyMonthly = false;

      // --- SLUTLIG BEDÖMNING ---
      
      // Fall A: Perfekt prenumeration (Exakt belopp + Månadsvis intervall)
      if (isStableAmount && isRoughlyMonthly) {
          candidates.push({
              id: name,
              name: name,
              avgAmount: Math.round(avgAmount),
              frequency: 'monthly',
              occurrences: txs.length,
              lastDate: sorted[0].date,
              transactions: sorted,
              accountId: sorted[0].accountId,
              confidence: 'high'
          });
          return;
      }

      // Fall B: Varierande belopp men perfekt datum (t.ex. Elräkning / Mobilräkning)
      // Vi tillåter varierande belopp OM det sker strikt en gång i månaden (låg frekvens)
      if (!isStableAmount && isRoughlyMonthly && txPerMonth <= 1.2) {
           candidates.push({
              id: name,
              name: name,
              avgAmount: Math.round(avgAmount),
              frequency: 'monthly',
              occurrences: txs.length,
              lastDate: sorted[0].date,
              transactions: sorted,
              accountId: sorted[0].accountId,
              confidence: 'medium'
          });
      }
    });

    // Sortera på dyrast först
    return candidates.sort((a, b) => b.avgAmount - a.avgAmount);
  }, [transactions]);
};