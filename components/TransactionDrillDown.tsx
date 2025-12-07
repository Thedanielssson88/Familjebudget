import React from 'react';
import { Modal, cn } from './components';
import { useBudgetActuals } from '../hooks/useBudgetActuals';
import { formatMoney } from '../utils';
import { Transaction } from '../types';

interface Props {
    bucketId?: string;
    bucketName: string;
    month: string;
    payday: number;
    onClose: () => void;
    filterType?: 'TRANSFER' | 'EXPENSE' | 'INCOME';
}

export const TransactionDrillDown: React.FC<Props> = ({ bucketId, bucketName, month, payday, onClose, filterType }) => {
  const actuals = useBudgetActuals(month, payday);
  
  // Filtrera fram transaktionerna för denna bucket
  const transactions = (actuals?.transactions || [])
    .filter(t => t.bucketId === bucketId)
    .filter(t => !filterType || t.type === filterType)
    .sort((a, b) => b.date.localeCompare(a.date)); // Nyast först

  const isTransferView = filterType === 'TRANSFER';

  const totalSpent = transactions.reduce((sum, t) => {
      if (isTransferView) {
          // For transfers, we sum the absolute magnitude (Funding)
          return sum + Math.abs(t.amount);
      }
      // For expenses, we sum the consumption (negative amounts = positive cost)
      if (t.amount < 0) return sum + Math.abs(t.amount);
      return sum - t.amount;
  }, 0);

  return (
    <Modal isOpen={true} onClose={onClose} title={`Transaktioner: ${bucketName}`}>
       <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
             <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">
                 {isTransferView ? 'Totalt Överfört' : 'Totalt Bokfört'}
             </span>
             <span className="text-2xl font-bold text-white font-mono">
                 {isTransferView && '+'}{formatMoney(totalSpent)}
             </span>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
             {transactions.length === 0 ? (
                 <div className="text-center py-8">
                    <p className="text-slate-500 italic">Inga transaktioner hittades.</p>
                 </div>
             ) : (
                 transactions.map(t => {
                     // Logic for display amount:
                     // Transfers: Always show Positive (Inflow/Funding)
                     // Expenses: Show actual signed amount (usually negative)
                     
                     let displayAmount = t.amount;
                     let showPlus = false;

                     if (isTransferView) {
                         displayAmount = Math.abs(t.amount);
                         showPlus = true;
                     } 
                     
                     return (
                         <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors">
                             <div className="overflow-hidden mr-4">
                                 <div className="text-white font-medium truncate">{t.description}</div>
                                 <div className="text-xs text-slate-500 font-mono">{t.date}</div>
                             </div>
                             <div className={cn("font-mono font-bold whitespace-nowrap", showPlus ? "text-emerald-400" : "text-slate-200")}>
                                 {showPlus && '+'}{formatMoney(displayAmount)}
                             </div>
                         </div>
                     );
                 })
             )}
          </div>
       </div>
    </Modal>
  );
};