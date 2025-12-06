import React from 'react';
import { cn } from './components';

interface Props {
  spent: number;
  total: number;
  label?: string; // T.ex. "Kvar: 500 kr"
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  compact?: boolean; // För list-vy
}

export const BudgetProgressBar: React.FC<Props> = ({ spent, total, label, onClick, className, compact }) => {
  // Hantera 0-budget
  const percent = total > 0 ? Math.min((spent / total) * 100, 100) : (spent > 0 ? 100 : 0);
  const isOverBudget = spent > total && total > 0;
  
  let color = "bg-emerald-500";
  if (percent > 85) color = "bg-amber-500";
  if (percent >= 100 || isOverBudget) color = "bg-rose-500";

  // För "compact" läge, visa bara baren
  if (compact) {
      return (
        <div className={cn("h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden relative cursor-pointer group", className)} onClick={onClick}>
            <div 
                className={cn("h-full transition-all duration-500 rounded-full group-hover:brightness-110", color)} 
                style={{ width: `${percent}%` }}
            />
        </div>
      );
  }

  return (
    <div className={cn("w-full cursor-pointer group select-none", className)} onClick={onClick}>
      <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1 group-hover:text-white transition-colors">
        <span>Utfall {Math.round(percent)}%</span>
        <span>{label}</span>
      </div>
      <div className="h-2 w-full bg-slate-700/50 rounded-full overflow-hidden relative shadow-inner">
        <div 
          className={cn("h-full transition-all duration-500 rounded-full shadow-lg", color)} 
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};