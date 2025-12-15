
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../store';
import { formatMoney, getEffectiveAmount, calculateReimbursementMap } from '../utils';
import { Input, Button, cn, Modal } from '../components/components';
import { Home, Calculator, ArrowRight, TrendingUp, TrendingDown, DollarSign, RefreshCw, AlertTriangle, Settings, CheckSquare, Square, PieChart, Repeat, ChevronDown, ChevronRight, Search, Wallet } from 'lucide-react';
import { subMonths, format, parseISO } from 'date-fns';

// Helper to normalize descriptions (remove dates, digits at end, etc to group "Hyra Jan" and "Hyra Feb")
const cleanDescription = (desc: string) => {
    let name = desc.trim();
    // Remove common date formats (YYYY-MM-DD, YYMM, etc) roughly
    name = name.replace(/\d{4}-\d{2}-\d{2}/g, '');
    name = name.replace(/\d{4}-\d{2}/g, '');
    // Remove trailing numbers (often ref numbers)
    name = name.replace(/\s\d+$/, ''); 
    // Remove "Kortköp" etc
    name = name.replace(/kortköp/gi, '').replace(/reserverat belopp/gi, '');
    return name.trim().toLowerCase();
};

// Helper for formatting inputs with spaces (e.g. 4 000 000)
const formatDisplay = (val: number) => {
    if (!val && val !== 0) return '';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

const parseDisplay = (val: string) => {
    const clean = val.replace(/\s/g, '');
    return Number(clean);
};

export const HousingCalculator: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { transactions, mainCategories, subCategories, budgetGroups } = useApp();
    
    // --- STATE ---
    const [currentCost, setCurrentCost] = useState(0); 
    
    // Source Selection State
    const [selectedMatchers, setSelectedMatchers] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('housing_calc_matchers') || '[]');
        } catch { return []; }
    });
    
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

    // --- HOUSING INPUTS (PERSISTED) ---
    // We try to load from localStorage, otherwise defaults
    const [price, setPrice] = useState(() => Number(localStorage.getItem('housing_price')) || 4000000);
    const [downPayment, setDownPayment] = useState(() => {
        const saved = localStorage.getItem('housing_downpayment');
        return saved ? Number(saved) : 600000;
    });
    const [monthlyFee, setMonthlyFee] = useState(() => Number(localStorage.getItem('housing_fee')) || 3500);
    const [operatingCost, setOperatingCost] = useState(() => Number(localStorage.getItem('housing_operating')) || 500);
    const [interestRate, setInterestRate] = useState(() => Number(localStorage.getItem('housing_interest')) || 4.0);

    // Calculated Results
    const [loanAmount, setLoanAmount] = useState(0);
    const [loanRatio, setLoanRatio] = useState(0);
    const [interestCostNet, setInterestCostNet] = useState(0); 
    const [amortization, setAmortization] = useState(0);
    const [totalNewCost, setTotalNewCost] = useState(0);

    const reimbursementMap = useMemo(() => calculateReimbursementMap(transactions), [transactions]);

    // --- PERSISTENCE EFFECT ---
    useEffect(() => {
        localStorage.setItem('housing_price', price.toString());
        localStorage.setItem('housing_downpayment', downPayment.toString());
        localStorage.setItem('housing_fee', monthlyFee.toString());
        localStorage.setItem('housing_operating', operatingCost.toString());
        localStorage.setItem('housing_interest', interestRate.toString());
    }, [price, downPayment, monthlyFee, operatingCost, interestRate]);

    // --- ANALYZE HISTORY FOR MODAL ---
    const historyData = useMemo(() => {
        const today = new Date();
        const startSearch = format(subMonths(today, 3), 'yyyy-MM-01');
        const endSearch = format(subMonths(today, 0), 'yyyy-MM-01'); // Up to start of this month

        const relevantTxs = transactions.filter(t => 
            !t.isHidden &&
            t.date >= startSearch && 
            t.date < endSearch &&
            (t.type === 'EXPENSE' || t.amount < 0)
        );

        // Group by Budget Group -> Cleaned Description
        const groupMap = new Map<string, Map<string, { total: number, count: number, example: string }>>();

        relevantTxs.forEach(t => {
            const eff = Math.abs(getEffectiveAmount(t, reimbursementMap));
            if (eff === 0) return;

            let groupId = 'other';
            if (t.categorySubId) {
                const sub = subCategories.find(s => s.id === t.categorySubId);
                if (sub && sub.budgetGroupId) groupId = sub.budgetGroupId;
            }

            if (!groupMap.has(groupId)) groupMap.set(groupId, new Map());
            
            const clean = cleanDescription(t.description);
            const entry = groupMap.get(groupId)!;
            
            if (!entry.has(clean)) {
                entry.set(clean, { total: 0, count: 0, example: t.description });
            }
            
            const data = entry.get(clean)!;
            data.total += eff;
            data.count += 1;
        });

        return groupMap;
    }, [transactions, subCategories, reimbursementMap]);

    // --- SAVE SOURCES ---
    const toggleMatcher = (matcher: string) => {
        const newMatchers = selectedMatchers.includes(matcher) 
            ? selectedMatchers.filter(x => x !== matcher)
            : [...selectedMatchers, matcher];
        setSelectedMatchers(newMatchers);
        localStorage.setItem('housing_calc_matchers', JSON.stringify(newMatchers));
    };

    const toggleGroupExpand = (id: string) => {
        const next = new Set(expandedGroupIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpandedGroupIds(next);
    };

    // --- AUTO-FETCH CURRENT COST ---
    useEffect(() => {
        // Calculate average housing cost for last 3 full months
        const today = new Date();
        const startSearch = format(subMonths(today, 3), 'yyyy-MM-01');
        const endSearch = format(subMonths(today, 0), 'yyyy-MM-01'); // Up to start of this month

        let housingTxs = [];

        if (selectedMatchers.length > 0) {
            // CUSTOM SELECTION MODE
            housingTxs = transactions.filter(t => {
                if (t.isHidden) return false;
                if (t.date < startSearch || t.date >= endSearch) return false;
                
                // 1. Check Bucket Match (Legacy support if user had selected them before)
                if (t.bucketId && selectedMatchers.includes(`BUCKET:${t.bucketId}`)) return true;

                // 2. Check Description Match
                if (t.type === 'EXPENSE' || t.amount < 0) {
                    const clean = cleanDescription(t.description);
                    if (selectedMatchers.includes(`TEXT:${clean}`)) return true;
                }

                return false;
            });
        } else {
            // FALLBACK: AUTO-DETECT "BOENDE" CATEGORY (Legacy behavior if nothing selected)
            const housingCatId = mainCategories.find(c => c.name.toLowerCase().includes('boende'))?.id || '1';
            
            housingTxs = transactions.filter(t => 
                !t.isHidden &&
                t.date >= startSearch && 
                t.date < endSearch &&
                (t.categoryMainId === housingCatId) &&
                (t.type === 'EXPENSE' || t.amount < 0)
            );
        }

        if (housingTxs.length > 0) {
            const total = housingTxs.reduce((sum, t) => sum + Math.abs(getEffectiveAmount(t, reimbursementMap)), 0);
            const avg = Math.round(total / 3); // 3 month average
            setCurrentCost(avg);
        } else {
            setCurrentCost(0); 
        }
    }, [transactions, mainCategories, subCategories, reimbursementMap, selectedMatchers]);

    // --- CALCULATION ENGINE ---
    useEffect(() => {
        // 1. Loan
        const loan = Math.max(0, price - downPayment);
        setLoanAmount(loan);

        // 2. LTV (Belåningsgrad)
        const ratio = price > 0 ? (loan / price) * 100 : 0;
        setLoanRatio(ratio);

        // 3. Interest (Net after 30% deduction)
        const yearlyInterest = loan * (interestRate / 100);
        const monthlyInterestBrutto = yearlyInterest / 12;
        const taxDeduction = monthlyInterestBrutto * 0.30; 
        setInterestCostNet(monthlyInterestBrutto - taxDeduction);

        // 4. Amortization (Swedish Rules)
        // >70% LTV = 2%, >50% LTV = 1%
        let amortPercent = 0;
        if (ratio > 70) amortPercent = 0.02;
        else if (ratio > 50) amortPercent = 0.01;
        
        const yearlyAmort = loan * amortPercent;
        setAmortization(yearlyAmort / 12);

        // 5. Total Monthly Cost
        setTotalNewCost((monthlyInterestBrutto - taxDeduction) + (yearlyAmort / 12) + monthlyFee + operatingCost);

    }, [price, downPayment, monthlyFee, interestRate, operatingCost]);

    const totalDiff = totalNewCost - currentCost;
    const minDownPayment = price * 0.15;
    const isDownPaymentLow = downPayment < minDownPayment;
    
    // Percentage for Slider
    const downPaymentPercent = price > 0 ? Math.round((downPayment / price) * 100) : 0;

    // Cost Excluding Amortization
    const costExclAmort = interestCostNet + monthlyFee + operatingCost;
    const diffExclAmort = costExclAmort - currentCost;

    return (
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-right duration-300">
            <header className="flex items-center gap-2 mb-2">
                <button onClick={onBack} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                    <ArrowRight className="rotate-180 w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-200">Boendekalkyl</h1>
                    <p className="text-slate-400 text-xs">Jämför nuvarande boende med drömmen.</p>
                </div>
            </header>

            {/* COMPARISON CARD */}
            <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl relative overflow-hidden">
                <div className="relative z-10 grid grid-cols-2 gap-8 text-center">
                    <div onClick={() => setIsSourceModalOpen(true)} className="cursor-pointer group relative">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center justify-center gap-1 group-hover:text-orange-400 transition-colors">
                            Idag (Snitt) <Settings size={10} />
                        </div>
                        <div className="text-2xl font-bold text-slate-300 group-hover:text-white transition-colors">{formatMoney(currentCost)}</div>
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[9px] text-orange-400 whitespace-nowrap transition-opacity">
                            Klicka för att välja
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Nytt Boende</div>
                        <div className="text-3xl font-bold text-white">{formatMoney(totalNewCost)}</div>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-700 flex justify-center items-center gap-3">
                    <div className={cn("p-2 rounded-full", totalDiff > 0 ? "bg-rose-500/20" : "bg-emerald-500/20")}>
                        {totalDiff > 0 ? <TrendingUp className="text-rose-400 w-5 h-5"/> : <TrendingDown className="text-emerald-400 w-5 h-5"/>}
                    </div>
                    <div className="text-left">
                        <div className="text-xs text-slate-400 uppercase font-bold">Månadseffekt (Total)</div>
                        <div className={cn("text-xl font-bold font-mono leading-none", totalDiff > 0 ? "text-rose-400" : "text-emerald-400")}>
                            {totalDiff > 0 ? '+' : ''}{formatMoney(totalDiff)}
                        </div>
                    </div>
                </div>
                
                {/* Background FX */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
            </div>

            {/* SCENARIO INPUTS */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Scenario</h3>
                
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-5">
                    
                    {/* Price */}
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pris (Kr)</label>
                        <input 
                            type="text"
                            inputMode="numeric"
                            value={formatDisplay(price)}
                            onChange={e => {
                                const newPrice = parseDisplay(e.target.value);
                                setPrice(newPrice);
                            }}
                            className="bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-lg font-mono placeholder:text-slate-600"
                        />
                    </div>

                    {/* Down Payment & Slider */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Kontantinsats</label>
                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded", isDownPaymentLow ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>
                                {downPaymentPercent}%
                            </span>
                        </div>
                        <div className="relative">
                            <input 
                                type="text"
                                inputMode="numeric"
                                value={formatDisplay(downPayment)} 
                                onChange={e => setDownPayment(parseDisplay(e.target.value))} 
                                className={cn(
                                    "bg-slate-900/50 border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 w-full text-lg font-mono placeholder:text-slate-600 mb-2",
                                    isDownPaymentLow ? "border-rose-500/50 text-rose-200 focus:ring-rose-500" : "border-slate-700 focus:ring-blue-500"
                                )}
                            />
                            {isDownPaymentLow && (
                                <div className="absolute -top-6 right-0 text-[10px] text-rose-400 flex items-center gap-1">
                                    <AlertTriangle size={10} /> Minst {formatMoney(minDownPayment)}
                                </div>
                            )}
                        </div>
                        
                        {/* Percentage Slider */}
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-500 w-6">0%</span>
                            <input 
                                type="range" 
                                min="0" max="100" step="1"
                                value={downPaymentPercent}
                                onChange={(e) => {
                                    const pct = Number(e.target.value);
                                    setDownPayment(Math.round(price * (pct / 100)));
                                }}
                                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <span className="text-[10px] text-slate-500 w-6 text-right">100%</span>
                        </div>
                    </div>

                    {/* Interest Slider */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Ränta (Stressa kalkylen)</label>
                            <span className="text-orange-400 font-bold text-sm bg-orange-500/10 px-2 py-0.5 rounded">{interestRate.toFixed(2)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="1" max="10" step="0.1"
                            value={interestRate}
                            onChange={(e) => setInterestRate(Number(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-1 font-mono">
                            <span>1%</span>
                            <span>3%</span>
                            <span>5%</span>
                            <span>7%</span>
                            <span>10%</span>
                        </div>
                    </div>

                    {/* Fees */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Månadsavgift</label>
                            <input 
                                type="text"
                                inputMode="numeric"
                                value={formatDisplay(monthlyFee)} 
                                onChange={e => setMonthlyFee(parseDisplay(e.target.value))} 
                                className="bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-sm font-mono placeholder:text-slate-600 mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Drift</label>
                            <input 
                                type="text"
                                inputMode="numeric"
                                value={formatDisplay(operatingCost)} 
                                onChange={e => setOperatingCost(parseDisplay(e.target.value))} 
                                className="bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-sm font-mono placeholder:text-slate-600 mt-1"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* BREAKDOWN */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Kostnadsanalys (Månad)</h3>
                
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden divide-y divide-slate-700/50">
                    <div className="p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-500/20 p-1.5 rounded text-blue-400"><DollarSign size={16}/></div>
                            <div>
                                <span className="text-sm text-slate-300 block">Ränta (Netto)</span>
                                <span className="text-[10px] text-slate-500">Efter 30% avdrag</span>
                            </div>
                        </div>
                        <span className="font-mono text-white">{formatMoney(interestCostNet)}</span>
                    </div>
                    
                    <div className="p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/20 p-1.5 rounded text-emerald-400"><TrendingDown size={16}/></div>
                            <div>
                                <span className="text-sm text-slate-300 block">Amortering</span>
                                <span className="text-[10px] text-slate-500">
                                    {loanRatio.toFixed(0)}% belåning ({loanRatio > 70 ? '2%' : (loanRatio > 50 ? '1%' : '0%')} krav)
                                </span>
                            </div>
                        </div>
                        <span className="font-mono text-white">{formatMoney(amortization)}</span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-500/20 p-1.5 rounded text-amber-400"><Home size={16}/></div>
                            <span className="text-sm text-slate-300">Avgift & Drift</span>
                        </div>
                        <span className="font-mono text-white">{formatMoney(monthlyFee + operatingCost)}</span>
                    </div>

                    {/* NEW ROW: Cost Excluding Amortization */}
                    <div className="p-3 bg-slate-900/30 border-t border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-700 p-1.5 rounded text-slate-300"><Wallet size={16}/></div>
                            <div>
                                <span className="text-sm font-bold text-white block">Kostnad exkl. amortering</span>
                                <span className="text-[10px] text-slate-500">Ränta + Avgift + Drift</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-mono font-bold text-white">{formatMoney(costExclAmort)}</div>
                            <div className={cn("text-[10px] font-bold", diffExclAmort > 0 ? "text-rose-400" : "text-emerald-400")}>
                                {diffExclAmort > 0 ? '+' : ''}{formatMoney(diffExclAmort)} mot idag
                            </div>
                        </div>
                    </div>
                </div>
                
                {loanRatio > 85 && (
                    <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl flex gap-3 items-start mt-2">
                        <TrendingUp className="text-rose-400 w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-xs text-rose-200">
                            <strong>Högt lån!</strong> Belåningsgraden är {loanRatio.toFixed(1)}%. Bankerna lånar oftast bara ut upp till 85%. Ni behöver {formatMoney((loanAmount - (price * 0.85)))} till i kontantinsats.
                        </div>
                    </div>
                )}
            </div>

            {/* SOURCE SELECTION MODAL */}
            <Modal isOpen={isSourceModalOpen} onClose={() => setIsSourceModalOpen(false)} title="Välj kostnader">
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                    <p className="text-xs text-slate-400">
                        Markera de poster som utgör din nuvarande boendekostnad. Snittet baseras på de senaste 3 månadernas utfall.
                    </p>

                    {/* SECTION: BUDGET GROUPS (Drill down to Descriptions) */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <PieChart size={12}/> Utgifter per Budgetgrupp
                        </h4>
                        {budgetGroups.map(bg => {
                            const groupTxs = historyData.get(bg.id);
                            if (!groupTxs || groupTxs.size === 0) return null;

                            const isExpanded = expandedGroupIds.has(bg.id);
                            
                            // Check if ANY item in this group is selected to show active state on header
                            const hasActiveSelection = Array.from(groupTxs.keys()).some(clean => selectedMatchers.includes(`TEXT:${clean}`));

                            return (
                                <div key={bg.id} className={cn("rounded-xl border overflow-hidden", isExpanded ? "border-slate-600" : "border-slate-700")}>
                                    <div 
                                        className={cn("p-3 flex items-center justify-between cursor-pointer hover:bg-slate-700/50", hasActiveSelection ? "bg-orange-900/10" : "bg-slate-800")}
                                        onClick={() => toggleGroupExpand(bg.id)}
                                    >
                                        <div className="flex items-center gap-2">
                                            {isExpanded ? <ChevronDown size={16} className="text-orange-400"/> : <ChevronRight size={16} className="text-slate-500"/>}
                                            <span className={cn("font-bold text-sm", hasActiveSelection ? "text-orange-300" : "text-white")}>{bg.icon} {bg.name}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">{groupTxs.size} källor hittade</span>
                                    </div>

                                    {isExpanded && (
                                        <div className="bg-slate-900/50 p-2 space-y-1">
                                            {Array.from(groupTxs.entries()).map(([cleanDesc, stats]) => {
                                                const matcher = `TEXT:${cleanDesc}`;
                                                const isSelected = selectedMatchers.includes(matcher);
                                                const avgCost = Math.round(stats.total / 3);

                                                return (
                                                    <div 
                                                        key={cleanDesc}
                                                        onClick={() => toggleMatcher(matcher)}
                                                        className={cn("flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors", isSelected ? "bg-orange-500/10" : "")}
                                                    >
                                                        {isSelected ? <CheckSquare size={16} className="text-orange-400 shrink-0" /> : <Square size={16} className="text-slate-600 shrink-0" />}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm text-slate-200 truncate">{stats.example}</div>
                                                            <div className="text-[10px] text-slate-500 flex justify-between">
                                                                <span>Hittad {stats.count} ggr (3 mån)</span>
                                                                <span className="font-mono text-slate-400">Snitt: {formatMoney(avgCost)}/mån</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700">
                    <Button onClick={() => setIsSourceModalOpen(false)} className="w-full">Klar</Button>
                </div>
            </Modal>
        </div>
    );
};
