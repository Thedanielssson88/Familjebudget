
import React, { useState } from 'react';
import { AppProvider, useApp } from './store';
import { IncomeView } from './views/IncomeView';
import { BudgetView } from './views/BudgetView';
import { DashboardView } from './views/DashboardView';
import { StatsView } from './views/StatsView';
import { DreamsView } from './views/DreamsView';
import { LayoutGrid, Wallet, PieChart, ArrowLeftRight, Calendar, Settings, Sparkles } from 'lucide-react';
import { cn } from './components/components';
import { format, subMonths, addMonths } from 'date-fns';
import { sv } from 'date-fns/locale';

type View = 'income' | 'budget' | 'dashboard' | 'stats' | 'dreams';

const MainApp = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const { selectedMonth, setMonth, settings, setPayday } = useApp();
  const [showSettings, setShowSettings] = useState(false);

  // Month navigation
  const changeMonth = (delta: number) => {
    const current = new Date(`${selectedMonth}-01`);
    const newDate = delta > 0 ? addMonths(current, 1) : subMonths(current, 1);
    setMonth(format(newDate, 'yyyy-MM'));
  };

  const renderView = () => {
    switch (currentView) {
      case 'income': return <IncomeView />;
      case 'budget': return <BudgetView />;
      case 'dashboard': return <DashboardView />;
      case 'stats': return <StatsView />;
      case 'dreams': return <DreamsView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-blue-500/30">
      {/* TOP BAR */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <div className="bg-blue-600 rounded-lg p-1.5">
                <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">FamilyFlow</span>
        </div>
        <div className="flex items-center bg-slate-800 rounded-full px-1 py-1">
            <button onClick={() => changeMonth(-1)} className="p-2 hover:text-white text-slate-400 transition-colors">←</button>
            <span className="text-sm font-semibold px-2 w-28 text-center capitalize">
                {format(new Date(`${selectedMonth}-01`), 'MMM yyyy', { locale: sv })}
            </span>
            <button onClick={() => changeMonth(1)} className="p-2 hover:text-white text-slate-400 transition-colors">→</button>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-slate-400 hover:text-white">
            <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* SETTINGS DRAWER (Simple inline for now) */}
      {showSettings && (
          <div className="bg-slate-900 border-b border-slate-800 p-4 animate-in slide-in-from-top-2">
              <h3 className="font-bold text-sm text-slate-400 uppercase mb-2">Inställningar</h3>
              <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                  <span>Lönedag (brytdatum)</span>
                  <input 
                    type="number" 
                    min="1" max="28" 
                    value={settings.payday} 
                    onChange={(e) => setPayday(Number(e.target.value))}
                    className="bg-slate-900 w-16 text-center py-1 rounded border border-slate-700"
                  />
              </div>
          </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="container mx-auto max-w-lg p-4 min-h-[calc(100vh-140px)]">
        {renderView()}
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-lg border-t border-slate-800 pb-safe pt-2 px-4 pb-6 z-50">
        <div className="flex justify-between items-center max-w-lg mx-auto">
            <NavButton active={currentView === 'income'} onClick={() => setCurrentView('income')} icon={<Wallet />} label="Inkomst" />
            <NavButton active={currentView === 'budget'} onClick={() => setCurrentView('budget')} icon={<ArrowLeftRight />} label="Budget" />
            <NavButton active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<LayoutGrid />} label="Översikt" />
            <NavButton active={currentView === 'dreams'} onClick={() => setCurrentView('dreams')} icon={<Sparkles />} label="Drömmar" />
            <NavButton active={currentView === 'stats'} onClick={() => setCurrentView('stats')} icon={<PieChart />} label="Statistik" />
        </div>
      </nav>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
    <button 
        onClick={onClick}
        className={cn("flex flex-col items-center gap-1 transition-all duration-200 w-16", active ? "text-blue-400 scale-110" : "text-slate-500 hover:text-slate-300")}
    >
        <div className={cn("p-1 rounded-xl transition-all", active && "bg-blue-500/10")}>
            {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: active ? 2.5 : 2 })}
        </div>
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);

const App = () => (
  <AppProvider>
    <MainApp />
  </AppProvider>
);

export default App;
