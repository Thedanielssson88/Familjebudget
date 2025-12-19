
import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './store';
import { BudgetView } from './views/BudgetView';
import { DashboardView } from './views/DashboardView'; 
import { HomeDashboardView } from './views/HomeDashboardView'; 
import { StatsView } from './views/StatsView';
import { DreamsView } from './views/DreamsView';
import { TransactionsView } from './views/TransactionsView';
import { SettingsCategories } from './views/SettingsCategories';
import { SettingsAccounts } from './views/SettingsAccounts'; 
import { HousingCalculator } from './views/HousingCalculator';
import { LayoutGrid, Wallet, PieChart, ArrowLeftRight, Calendar, Settings, Sparkles, Cloud, RefreshCw, Trash2, Download, Receipt, Database, AlertTriangle, Home, ChevronDown, Plus, Layout, X, Check } from 'lucide-react';
import { cn, Button, Modal, Input } from './components/components';
import { format, subMonths, addMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { initGoogleDrive, loginToGoogle, listBackups, createBackupFile, loadBackupFile, deleteBackupFile, DriveFile } from './services/googleDrive';

type View = 'home' | 'budget' | 'dashboard' | 'dreams' | 'transactions' | 'housing-calculator';

const MainApp = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const { 
    selectedMonth, setMonth, settings, setPayday, updateSettings, 
    getExportData, importData, deleteAllTransactions, users, updateUserName,
    budgets, activeBudgetId, setActiveBudget, addBudget, deleteBudget
  } = useApp();
  
  const [showSettings, setShowSettings] = useState(false);
  const [showBudgetPicker, setShowBudgetPicker] = useState(false);
  const [isAddingBudget, setIsAddingBudget] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetIcon, setNewBudgetIcon] = useState('🏠');
  
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
          const success = await importData(jsonContent);
          
          if (success) {
              setBackupStatus('Återställd! Laddar om...');
              setTimeout(() => {
                  window.location.reload(); 
              }, 2000);
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

  const handleAddBudget = async () => {
      if (!newBudgetName.trim()) return;
      const id = await addBudget(newBudgetName, newBudgetIcon);
      setActiveBudget(id);
      setIsAddingBudget(false);
      setShowBudgetPicker(false);
      setNewBudgetName('');
  };

  const handleDeleteBudget = async (id: string, name: string) => {
      if (confirm(`Är du helt säker på att du vill radera budgeten "${name}"? All data på kontot kommer försvinna.`)) {
          await deleteBudget(id);
      }
  };

  const activeBudget = budgets.find(b => b.id === activeBudgetId);
  
  const renderView = () => {
    switch (currentView) {
      case 'home': return <HomeDashboardView onNavigate={setCurrentView} />;
      case 'budget': return <BudgetView />; 
      case 'dashboard': return <DashboardView />;
      case 'dreams': return <DreamsView onNavigate={setCurrentView} />;
      case 'housing-calculator': return <HousingCalculator onBack={() => setCurrentView('dreams')} />;
      case 'transactions': return <TransactionsView />;
      default: return <HomeDashboardView onNavigate={setCurrentView} />;
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
            <span className="font-bold text-lg tracking-tight hidden sm:inline">FamilyFlow</span>
        </div>
        
        <div className="flex items-center bg-slate-800 rounded-full px-1 py-1">
            <button onClick={() => changeMonth(-1)} className="p-2 hover:text-white text-slate-400 transition-colors">←</button>
            <span className="text-sm font-semibold px-2 w-24 sm:w-28 text-center capitalize overflow-hidden whitespace-nowrap">
                {format(new Date(`${selectedMonth}-01`), 'MMM yyyy', { locale: sv })}
            </span>
            <button onClick={() => changeMonth(1)} className="p-2 hover:text-white text-slate-400 transition-colors">→</button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
            {/* BUDGET SWITCHER */}
            <button 
                onClick={() => setShowBudgetPicker(true)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 transition-all active:scale-95 group"
            >
                <span className="text-lg leading-none">{activeBudget?.icon}</span>
                <span className="text-xs font-bold text-white hidden md:inline">{activeBudget?.name}</span>
                <ChevronDown size={14} className="text-slate-500 group-hover:text-slate-300" />
            </button>

            <button onClick={() => {setShowSettings(!showSettings); setShowBudgetPicker(false);}} className={cn("p-2 rounded-xl transition-colors", showSettings ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800")}>
                <Settings className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* BUDGET PICKER OVERLAY */}
      {showBudgetPicker && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowBudgetPicker(false)}>
              <div className="bg-surface w-full max-w-xs rounded-3xl border border-slate-700 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Välj Budget</h3>
                      <button onClick={() => setShowBudgetPicker(false)} className="text-slate-500 hover:text-white"><X size={18}/></button>
                  </div>
                  <div className="p-2 space-y-1">
                      {budgets.map(b => (
                          <div key={b.id} className="group flex items-center gap-1">
                              <button 
                                onClick={() => {setActiveBudget(b.id); setShowBudgetPicker(false);}}
                                className={cn(
                                    "flex-1 flex items-center gap-3 p-3 rounded-xl transition-all",
                                    b.id === activeBudgetId ? "bg-blue-600 text-white shadow-lg" : "hover:bg-slate-800 text-slate-300"
                                )}
                              >
                                  <span className="text-xl leading-none">{b.icon}</span>
                                  <span className="font-bold text-sm">{b.name}</span>
                                  {b.id === activeBudgetId && <Check size={16} className="ml-auto" />}
                              </button>
                              {budgets.length > 1 && (
                                  <button 
                                    onClick={() => handleDeleteBudget(b.id, b.name)}
                                    className="p-3 text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                      <Trash2 size={16}/>
                                  </button>
                              )}
                          </div>
                      ))}
                      <button 
                        onClick={() => setIsAddingBudget(true)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-blue-400 font-bold text-sm transition-all"
                      >
                          <Plus size={18} />
                          <span>Lägg till privat budget</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* NEW BUDGET MODAL */}
      <Modal isOpen={isAddingBudget} onClose={() => setIsAddingBudget(false)} title="Ny Privat Budget">
          <div className="space-y-4">
              <p className="text-sm text-slate-400">Skapa en separat ekonomisk profil för t.ex. ditt egna företag eller personlig fickpeng.</p>
              <Input label="Namn" value={newBudgetName} onChange={e => setNewBudgetName(e.target.value)} placeholder="Min Egen Budget" autoFocus />
              <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Välj Ikon</label>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                      {['🏠', '👤', '💼', '💳', '📈', '🚀', '🛠️'].map(emoji => (
                          <button 
                            key={emoji}
                            onClick={() => setNewBudgetIcon(emoji)}
                            className={cn(
                                "text-2xl p-3 rounded-xl border transition-all",
                                newBudgetIcon === emoji ? "bg-blue-600 border-blue-400 scale-110 shadow-lg" : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                            )}
                          >
                              {emoji}
                          </button>
                      ))}
                  </div>
              </div>
              <Button onClick={handleAddBudget} className="w-full" disabled={!newBudgetName.trim()}>Skapa Budget</Button>
          </div>
      </Modal>

      {/* SETTINGS DRAWER */}
      {showSettings && (
          <div className="bg-slate-900 border-b border-slate-800 p-4 animate-in slide-in-from-top-2 space-y-6 max-h-[85vh] overflow-y-auto shadow-2xl no-scrollbar">
              
              {/* General Settings */}
              <div>
                <h3 className="font-bold text-sm text-slate-400 uppercase mb-2">Inställningar ({activeBudget?.name})</h3>
                <div className="space-y-4">
                    {/* Profilinställningar */}
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-3 mb-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Profil i denna budget</h4>
                        {users.map(user => (
                            <div key={user.id} className="space-y-2">
                                <label className="text-xs text-slate-500">{user.id === users[0].id ? "Huvudanvändare" : "Användare"}</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={user.name} 
                                        onChange={(e) => updateUserName(user.id, e.target.value)}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                                    />
                                    <button className="text-xl bg-slate-900 px-3 rounded-lg border border-slate-700">{user.avatar}</button>
                                </div>
                            </div>
                        ))}
                    </div>

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
                            <span className="text-sm">Överföringar (Via Regel)</span>
                            <div 
                                className={cn("w-10 h-6 rounded-full p-1 cursor-pointer transition-colors", settings.autoApproveTransfer ? "bg-emerald-500" : "bg-slate-700")}
                                onClick={() => updateSettings({ autoApproveTransfer: !settings.autoApproveTransfer })}
                            >
                                <div className={cn("w-4 h-4 bg-white rounded-full shadow-md transform transition-transform", settings.autoApproveTransfer ? "translate-x-4" : "")} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <span className="text-sm flex flex-col">
                                <span>Smarta Överföringar</span>
                                <span className="text-[10px] text-slate-500">Länka liknande par automatiskt</span>
                            </span>
                            <div 
                                className={cn("w-10 h-6 rounded-full p-1 cursor-pointer transition-colors", settings.autoApproveSmartTransfers ? "bg-emerald-500" : "bg-slate-700")}
                                onClick={() => updateSettings({ autoApproveSmartTransfers: !settings.autoApproveSmartTransfers })}
                            >
                                <div className={cn("w-4 h-4 bg-white rounded-full shadow-md transform transition-transform", settings.autoApproveSmartTransfers ? "translate-x-4" : "")} />
                            </div>
                        </div>
                    </div>

                    {/* Account Management */}
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-4">
                        <SettingsAccounts />
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
                                 Här kan du rensa all historik i <strong>denna</strong> budget. Kategorier och regler sparas.
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
                      <Cloud className="w-4 h-4" /> Cloud Backup (Global)
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
      {currentView !== 'housing-calculator' && (
          <nav className="fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-lg border-t border-slate-800 pb-safe pt-2 px-2 pb-6 z-50">
            <div className="flex justify-between items-center max-w-lg mx-auto">
                <NavButton active={currentView === 'home'} onClick={() => setCurrentView('home')} icon={<Home />} label="Hem" />
                <NavButton active={currentView === 'budget'} onClick={() => setCurrentView('budget')} icon={<PieChart />} label="Budget" />
                <NavButton active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<LayoutGrid />} label="Översikt" />
                <NavButton active={currentView === 'dreams' || currentView === 'housing-calculator'} onClick={() => setCurrentView('dreams')} icon={<Sparkles />} label="Drömmar" />
                <NavButton active={currentView === 'transactions'} onClick={() => setCurrentView('transactions')} icon={<Receipt />} label="Import" />
            </div>
          </nav>
      )}
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
    <button 
        onClick={onClick}
        className={cn("flex flex-col items-center gap-1 transition-all duration-200 w-16", active ? "text-blue-400 scale-110" : "text-slate-500 hover:text-slate-300")}
    >
        <div className={cn("p-1 rounded-xl transition-all", active && "bg-blue-500/10")}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 22, strokeWidth: active ? 2.5 : 2 })}
        </div>
        <span className="text-[9px] font-medium">{label}</span>
    </button>
);

const App = () => (
  <AppProvider>
    <MainApp />
  </AppProvider>
);

export default App;
