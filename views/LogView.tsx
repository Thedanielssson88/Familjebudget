import React, { useState } from 'react';
import { useApp } from '../store';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CheckCircle, AlertCircle, FileText, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { cn } from '../components/components';

export const LogView: React.FC = () => {
    const { importLogs } = useApp();
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        const next = new Set(expandedLogs);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedLogs(next);
    };

    if (importLogs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500 animate-in fade-in">
                <FileText className="w-16 h-16 mb-4 opacity-50" />
                <h2 className="text-lg font-medium">Inga loggar än</h2>
                <p className="text-sm">Importerade filer kommer att synas här.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-24 animate-in slide-in-from-right duration-300">
            <header>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-white">Importhistorik</h1>
                <p className="text-slate-400">Logg över dina importer och eventuella fel.</p>
            </header>

            <div className="space-y-3">
                {importLogs.map(log => {
                    const isExpanded = expandedLogs.has(log.id);
                    const hasErrors = log.status === 'ERROR' || (log.errors && log.errors.length > 0);
                    const isSuccess = log.status === 'SUCCESS';

                    return (
                        <div key={log.id} className={cn(
                            "rounded-xl border overflow-hidden transition-all",
                            hasErrors ? "bg-rose-950/10 border-rose-500/30" : "bg-slate-800 border-slate-700"
                        )}>
                            <div 
                                onClick={() => toggleExpand(log.id)}
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-full", hasErrors ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>
                                        {hasErrors ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white flex items-center gap-2">
                                            {log.fileName}
                                            <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400 font-mono">
                                                {format(new Date(log.date), 'yyyy-MM-dd HH:mm')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            {isSuccess ? 
                                                `Importerade ${log.transactionCount} transaktioner.` : 
                                                (log.status === 'PARTIAL' ? `Delvis lyckad (${log.transactionCount} sparade).` : 'Misslyckades.')
                                            }
                                        </div>
                                    </div>
                                </div>
                                
                                {log.errors && log.errors.length > 0 && (
                                    <div className="text-rose-400 flex items-center gap-1 text-xs font-bold uppercase tracking-wider mr-2">
                                        {log.errors.length} Fel
                                    </div>
                                )}

                                <div className="text-slate-500">
                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="bg-slate-900/50 p-4 border-t border-slate-700/50 animate-in slide-in-from-top-2">
                                    {log.errors && log.errors.length > 0 ? (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">Felmeddelanden</h4>
                                            <ul className="space-y-1">
                                                {log.errors.map((err, idx) => (
                                                    <li key={idx} className="text-xs text-rose-300 flex items-start gap-2 bg-rose-900/20 p-2 rounded border border-rose-900/30">
                                                        <XCircle size={12} className="mt-0.5 shrink-0" />
                                                        {err}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic">Inga fel rapporterade.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};