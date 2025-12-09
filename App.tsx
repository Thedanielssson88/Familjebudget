import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './store';
import { IncomeView } from './views/IncomeView';
import { BudgetView } from './views/BudgetView';
import { DashboardView } from './views/DashboardView';
import { StatsView } from './views/StatsView';
import { DreamsView } from './views/DreamsView';
import { TransactionsView } from './views/TransactionsView';
import { LogView } from './views/LogView';
import { SettingsCategories } from './views/SettingsCategories';
import { OperatingBudgetView } from './views/OperatingBudgetView';
import { LayoutGrid, Wallet, PieChart, ArrowLeftRight, Calendar, Settings, Sparkles, Cloud, RefreshCw, Trash2, Download, Receipt, Database, AlertTriangle, FileText } from 'lucide-react';
import { cn, Button } from './components/components';
import { format, subMonths, addMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { initGoogleDrive, loginToGoogle, listBackups, createBackupFile, loadBackupFile, deleteBackupFile, DriveFile } from './services/googleDrive';

type View = 'income' | 'budget' | 'dashboard' | 'dreams' | 'transactions' | 'logs';

const MainApp = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const { selectedMonth, setMonth, settings, setPayday, updateSettings, getExportData, importData, deleteAllTransactions } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  
  // Google Drive State
  const [driveInitialized, setDriveInitialized] = useState(false);
  const [isGoogleLoggedIn, setIsGoogleLoggedIn] = useState(false);
  const [backups, setBackups] = useState<DriveFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string>('');

  useEffect(() => {
    initGoogleDrive((available) => {
        setDriveInitialized(available);
    });
  }, []);

  // Month navigation
  const changeMonth = (delta: number) => {
    const current = new Date(`${selectedMonth}-01`);
    const newDate = delta > 0 ? addMonths(current, 1) : subMonths(current, 1);
    setMonth(format(newDate, 'yyyy-MM'));
  };

  const handleGoogleLogin = async () => {
    try {
        await loginToGoogle();
        setIsGoogleLoggedIn(true);
        refreshBackups();
    } catch (e) {
        console.error("Login failed", e);
    }
  };

  const refreshBackups = async () => {
      setIsLoadingBackups(true);
      try {
          const files = await listBackups();
          setBackups(files);
      } catch (e) {
          console.error("Failed to list backups", e);
      } finally {
          setIsLoadingBackups(false);
      }
  };

  const handleCreateBackup = async () => {
      setBackupStatus('Creating...');
      const data = await getExportData();
      const filename = `FamilyFlow_Backup_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
      
      try {
          await createBackupFile(data, filename);
          setBackupStatus('Backup sparad!');
          refreshBackups();
          setTimeout(() => setBackupStatus(''), 3000);
      } catch (e) {
          setBackupStatus('Fel vid sparande');
          console.error(e);
      }
  };

  const handleRestore = async (fileId: string) => {
      if (!confirm("Varning: Detta kommer ersätta all data i appen med backupen. Är du säker?")) return;
      
      setBackupStatus('Återställer...');
      try {
          const jsonContent = await loadBackupFile(fileId);
          // CRITICAL FIX: Await the import process to finish DB writes before reloading
          const success = await importData(jsonContent); 
          if (success) {
              setBackupStatus('Återställd!');
              // Small delay to ensure IndexedDB flush
              setTimeout(() => window.location.reload(), 100);
          } else {
              setBackupStatus('Filen var ogiltig');
          }
      } catch (e) {
          setBackupStatus('Fel vid återställning');
          console.error(e);
      }
  };

  const handleDeleteBackup = async (fileId: string) => {
      if (!confirm("Ta bort denna backup?")) return;
      try {
          await deleteBackupFile(fileId);
          refreshBackups();
      } catch (e) {
          console.error(e);
      }
  };

  const handleCleanupBackups = async () => {
      if (backups.length <= 1) return;
      if (!confirm(`Detta kommer radera ${backups.length - 1} gamla backups och bara spara den senaste. Fortsätt?`)) return;
      
      setBackupStatus('Rensar...');
      try {
          // backups are ordered by createdTime desc (newest first)
          // Keep index 0, delete rest
          const toDelete = backups.slice(1);
          for (const file of toDelete) {
              await deleteBackupFile(file.id);
          }
          await refreshBackups();
          setBackupStatus('Rensat!');
      } catch (e) {
          setBackupStatus('Fel vid rensning');
      }
  };

  const handleClearAllTransactions = async () => {
      if (confirm("VARNING: Är du säker på att du vill radera ALLA bokförda transaktioner?\n\nDetta går inte att ångra (om du inte har en backup). Alla historik och uppföljning försvinner.")) {
          await deleteAllTransactions();
      }
  };
  
  const renderView = () => {
    switch (currentView) {
      case 'income': return <IncomeView />;
      case 'budget': return <BudgetView />; 
      case 'dashboard': return <DashboardView />;
      case 'dreams': return <DreamsView />;
      case 'transactions': return <TransactionsView />;
      case 'logs': return <LogView />;
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
        <button onClick={() => setShowSettings(!showSettings)} className={cn("p-2 transition-colors", showSettings ? "text-blue-400" : "text-slate-400 hover:text-white")}>
            <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* SETTINGS DRAWER */}
      {showSettings && (
          <div className="bg-slate-900 border-b border-slate-800 p-4 animate-in slide-in-from-top-2 space-y-6 max-h-[85vh] overflow-y-auto shadow-2xl">
              
              {/* General Settings */}
              <div>
                <h3 className="font-bold text-sm text-slate-400 uppercase mb-2">Inställningar</h3>
                <div className="space-y-4">
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
                    
                    {/* Auto Approval Settings */}
                    <div className="space-y-3 pt-2 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <div className="mb-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Automatiskt Godkännande (Import)</h4>
                            <p className="text-[10px] text-slate-500">Gäller enbart om matchning finns i regler eller historik.</p>
                        </div>
                        
                        <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <span className="text-sm">Inkomster</span>
                            <div 
                                className={cn("w-10 h-6 rounded-full p-1 cursor-pointer transition-colors", settings.autoApproveIncome ? "bg-emerald-500" : "bg-slate-700")}
                                onClick={() => updateSettings({ autoApproveIncome: !settings.autoApproveIncome })}
                            >
                                <div className={cn("w-4 h-4 bg-white rounded-full shadow-md transform transition-transform", settings.autoApproveIncome ? "translate-x-4" : "")} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <span className="text-sm">Utgifter</span>
                            <div 
                                className={cn("w-10 h-6 rounded-full p-1 cursor-pointer transition-colors", settings.autoApproveExpense ? "bg-emerald-500" : "bg-slate-700")}
                                onClick={() => updateSettings({ autoApproveExpense: !settings.autoApproveExpense })}
                            >
                                <div className={cn("w-4 h-4 bg-white rounded-full shadow-md transform transition-transform", settings.autoApproveExpense ? "translate-x-4" : "")} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <span className="text-sm">Överföringar</span>
                            <div 
                                className={cn("w-10 h-6 rounded-full p-1 cursor-pointer transition-colors", settings.autoApproveTransfer ? "bg-emerald-500" : "bg-slate-700")}
                                onClick={() => updateSettings({ autoApproveTransfer: !settings.autoApproveTransfer })}
                            >
                                <div className={cn("w-4 h-4 bg-white rounded-full shadow-md transform transition-transform", settings.autoApproveTransfer ? "translate-x-4" : "")} />
                            </div>
                        </div>
                    </div>

                    {/* Category Management */}
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <SettingsCategories />
                    </div>

                    {/* Data Management - Danger Zone */}
                    <div className="bg-red-950/10 p-4 rounded-xl border border-red-900/20 space-y-3">
                         <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                             <AlertTriangle className="w-3 h-3" /> Datahantering (Farlig Zon)
                         </h4>
                         
                         <div className="space-y-2">
                             <p className="text-[10px] text-red-300/70">
                                 Här kan du rensa all historik. Kategorier och regler sparas.
                             </p>
                             <Button
                                variant="danger"
                                onClick={handleClearAllTransactions}
                                className="w-full text-xs py-3 h-auto justify-start bg-red-500/10 hover:bg-red-500 text-red-200 hover:text-white border-red-500/20"
                             >
                                 <Trash2 className="w-4 h-4 mr-2" />
                                 Radera alla transaktioner
                             </Button>
                         </div>
                    </div>
                </div>
              </div>

              {/* Cloud Backup */}
              <div>
                  <h3 className="font-bold text-sm text-slate-400 uppercase mb-2 flex items-center gap-2">
                      <Cloud className="w-4 h-4" /> Cloud Backup (Google Drive)
                  </h3>
                  
                  <div className="bg-slate-800 p-4 rounded-xl space-y-4">
                      {!driveInitialized ? (
                          <div className="text-sm text-slate-500">Initierar Google tjänster...</div>
                      ) : !isGoogleLoggedIn ? (
                          <Button onClick={handleGoogleLogin} className="w-full bg-white text-slate-900 hover:bg-slate-200">
                             <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-2" alt="G" />
                             Logga in med Google
                          </Button>
                      ) : (
                          <div className="space-y-4">
                              <div className="flex gap-2">
                                  <Button onClick={handleCreateBackup} className="flex-1" disabled={!!backupStatus}>
                                      {backupStatus || 'Säkerhetskopiera Nu'}
                                  </Button>
                                  <Button onClick={refreshBackups} variant="secondary" title="Uppdatera lista">
                                      <RefreshCw className={cn("w-4 h-4", isLoadingBackups && "animate-spin")} />
                                  </Button>
                              </div>

                              {backups.length > 0 && (
                                  <div className="border-t border-slate-700 pt-4">
                                      <div className="flex justify-between items-center mb-2">
                                          <span className="text-xs text-slate-400 uppercase font-bold">Dina Backups</span>
                                          {backups.length > 1 && (
                                              <button onClick={handleCleanupBackups} className="text-xs text-rose-400 hover:text-rose-300">
                                                  Rensa gamla
                                              </button>
                                          )}
                                      </div>
                                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                                          {backups.map(file => (
                                              <div key={file.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded text-sm">
                                                  <div className="truncate flex-1 mr-2">
                                                      <div className="font-mono text-xs text-slate-300">{file.name.replace('FamilyFlow_Backup_', '').replace('.json', '')}</div>
                                                  </div>
                                                  <div className="flex gap-1">
                                                      <button onClick={() => handleRestore(file.id)} className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded" title="Återställ">
                                                          <Download className="w-4 h-4" />
                                                      </button>
                                                      <button onClick={() => handleDeleteBackup(file.id)} className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded" title="Ta bort">
                                                          <Trash2 className="w-4 h-4" />
                                                      </button>
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}
                              
                              {backups.length === 0 && !isLoadingBackups && (
                                  <p className="text-xs text-slate-500 text-center italic">Inga backups hittades.</p>
                              )}
                          </div>
                      )}
                  </div>
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
            <NavButton active={currentView === 'budget'} onClick={() => setCurrentView('budget')} icon={<PieChart />} label="Budget" />
            <NavButton active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<LayoutGrid />} label="Översikt" />
            <NavButton active={currentView === 'dreams'} onClick={() => setCurrentView('dreams')} icon={<Sparkles />} label="Drömmar" />
            <NavButton active={currentView === 'transactions'} onClick={() => setCurrentView('transactions')} icon={<Receipt />} label="Import" />
            <NavButton active={currentView === 'logs'} onClick={() => setCurrentView('logs')} icon={<FileText />} label="Logg" />
        </div>
      </nav>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
    <button 
        onClick={onClick}
        className={cn("flex flex-col items-center gap-1 transition-all duration-200 w-12", active ? "text-blue-400 scale-110" : "text-slate-500 hover:text-slate-300")}
    >
        <div className={cn("p-1 rounded-xl transition-all", active && "bg-blue-500/10")}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 24, strokeWidth: active ? 2.5 : 2 })}
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