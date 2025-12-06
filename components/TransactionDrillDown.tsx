import React from 'react';
import { Modal } from './components';
import { useBudgetActuals } from '../hooks/useBudgetActuals';
import { formatMoney } from '../utils';
import { Transaction } from '../types';

interface Props {
    bucketId?: string;
    bucketName: string;
    month: string;
    payday: number;
    onClose: () => void;
}

export const TransactionDrillDown: React.FC<Props> = ({ bucketId, bucketName, month, payday, onClose }) => {
  const actuals = useBudgetActuals(month, payday);
  
  // Filtrera fram transaktionerna för denna bucket
  // Om bucketId saknas (t.ex. om vi klickar på ett konto), visa inget eller hantera det
  const transactions = (actuals?.transactions || [])
    .filter(t => t.bucketId === bucketId)
    .sort((a, b) => b.date.localeCompare(a.date)); // Nyast först

  const totalSpent = transactions.reduce((sum, t) => {
      if (t.amount < 0) return sum + Math.abs(t.amount);
      return sum - t.amount;
  }, 0);

  return (
    <Modal isOpen={true} onClose={onClose} title={`Transaktioner: ${bucketName}`}>
       <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
             <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Totalt Bokfört</span>
             <span className="text-2xl font-bold text-white font-mono">{formatMoney(totalSpent)}</span>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
             {transactions.length === 0 ? (
                 <div className="text-center py-8">
                    <p className="text-slate-500 italic">Inga transaktioner bokförda på denna post.</p>
                    <p className="text-xs text-slate-600 mt-2">Gå till fliken "Import" för att hämta bankdata.</p>
                 </div>
             ) : (
                 transactions.map(t => (
                     <div key={t.id} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors">
                         <div className="overflow-hidden mr-4">
                             <div className="text-white font-medium truncate">{t.description}</div>
                             <div className="text-xs text-slate-500 font-mono">{t.date}</div>
                         </div>
                         <div className="font-mono font-bold text-slate-200 whitespace-nowrap">
                             {formatMoney(t.amount)}
                         </div>
                     </div>
                 ))
             )}
          </div>
       </div>
    </Modal>
  );
};