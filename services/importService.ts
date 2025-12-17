
import { format } from 'date-fns';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory, TransactionType } from '../types';
import { generateId } from '../utils';
import { db } from '../db';
import * as XLSX from 'xlsx'; // Använd statisk import för stabilitet

// --- PARSING ---

const parseAmount = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Hantera svenska format "1.234,50" eller "-123,00"
    let str = val.toString();
    // Ta bort punkter (tusentalsavgränsare) och mellanslag
    str = str.replace(/\./g, '').replace(/\s/g, ''); 
    // Ersätt komma med punkt
    str = str.replace(',', '.');
    return parseFloat(str) || 0;
};

const parseDate = (val: any): string => {
    if (!val) return format(new Date(), 'yyyy-MM-dd');
    
    // Om det redan är ett datumobjekt
    if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd');
    }
    
    // Om det är Excel serienummer (t.ex. 45300)
    if (typeof val === 'number' && val > 20000) {
        const date = new Date((val - (25567 + 2)) * 86400 * 1000);
        return format(date, 'yyyy-MM-dd');
    }

    const str = val.toString().trim();
    // Matcha YYYY-MM-DD
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
    return str; // Fallback
};

export const parseBankFile = async (file: File, accountId: string): Promise<Transaction[]> => {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    
    if (isCsv) {
        try {
            const PapaModule = await import('papaparse');
            const Papa = PapaModule.default || PapaModule;

            return new Promise((resolve, reject) => {
                Papa.parse(file, {
                    encoding: "ISO-8859-1", // Standard för svenska banker
                    skipEmptyLines: true,
                    complete: (results: any) => {
                        try {
                            // Hitta raden med rubriker
                            const headerRowIndex = results.data.findIndex((row: any) => 
                                Array.isArray(row) && row.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                            );

                            if (headerRowIndex === -1) {
                                console.warn("Kunde inte hitta rubriken 'Datum'.");
                                return resolve([]);
                            }

                            const headerRow = results.data[headerRowIndex];
                            
                            // Dynamisk kolumnmappning
                            const dateIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('datum'));
                            const textIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('text') || c?.toString().toLowerCase().includes('rubrik'));
                            const amountIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('belopp'));
                            const balanceIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('saldo') || c?.toString().toLowerCase().includes('balance'));

                            // Fallback om vi inte hittar exakta rubriker (gissa baserat på din filstruktur)
                            const dIdx = dateIdx > -1 ? dateIdx : 1;
                            const tIdx = textIdx > -1 ? textIdx : 4;
                            const aIdx = amountIdx > -1 ? amountIdx : 5;

                            const dataRows = results.data.slice(headerRowIndex + 1);
                            
                            const transactions: Transaction[] = dataRows.map((row: any) => {
                                if (!Array.isArray(row) || row.length < Math.max(dIdx, tIdx, aIdx)) return null;

                                return {
                                    id: generateId(),
                                    accountId,
                                    date: parseDate(row[dIdx]),
                                    description: row[tIdx] || 'Okänd transaktion',
                                    amount: parseAmount(row[aIdx]),
                                    balance: balanceIdx > -1 ? parseAmount(row[balanceIdx]) : undefined,
                                    isVerified: false,
                                    source: 'import' as const
                                };
                            }).filter((t: Transaction | null) => t && t.amount !== 0);

                            resolve(transactions as Transaction[]);
                        } catch (err) {
                            console.error("Fel vid tolkning av CSV:", err);
                            reject(new Error("Kunde inte läsa CSV-datan."));
                        }
                    },
                    error: (err: any) => reject(err)
                });
            });
        } catch (error) {
            console.error("Kunde inte ladda PapaParse", error);
            throw new Error("Kunde inte ladda CSV-tolkaren.");
        }
    } else {
        // XLSX Hantering
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
                    
                    const headerRowIndex = jsonData.findIndex((row) => 
                        Array.isArray(row) && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                    );
                    
                    if (headerRowIndex === -1) {
                        const preview = jsonData.slice(0, 5).map(r => JSON.stringify(r)).join('\n');
                        reject(new Error(`Kunde inte hitta en rad med kolumnen 'Datum'.\n\nFöljande data hittades i början av filen:\n${preview}`));
                        return;
                    }

                    const headerRow = jsonData[headerRowIndex];
                    const dateIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('datum'));
                    const textIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('text') || c?.toString().toLowerCase().includes('rubrik'));
                    const amountIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('belopp'));
                    const balanceIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('saldo') || c?.toString().toLowerCase().includes('balance'));

                    const dIdx = dateIdx > -1 ? dateIdx : 0;
                    const tIdx = textIdx > -1 ? textIdx : 3;
                    const aIdx = amountIdx > -1 ? amountIdx : 4;

                    const dataRows = jsonData.slice(headerRowIndex + 1);
                    const transactions = dataRows.map((row) => ({
                         id: generateId(),
                         accountId,
                         date: parseDate(row[dIdx]),
                         description: (row[tIdx] || '').toString(),
                         amount: parseAmount(row[aIdx]),
                         balance: balanceIdx > -1 ? parseAmount(row[balanceIdx]) : undefined,
                         isVerified: false,
                         source: 'import' as const
                    })).filter(t => t.amount !== 0);

                    resolve(transactions);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error("Filen kunde inte läsas (läsfel)."));
            reader.readAsArrayBuffer(file);
        });
    }
};

// --- PIPELINE LOGIC ---

const applyHistoricalCategories = async (transactions: Transaction[]): Promise<Transaction[]> => {
    const enriched = await Promise.all(transactions.map(async (t): Promise<Transaction> => {
        if (t.matchType === 'rule') return t;

        try {
            const lastMatch = await db.transactions
                .where({ accountId: t.accountId, description: t.description })
                .filter(old => {
                    if (!old.type || (!old.bucketId && !old.categoryMainId)) return false;
                    const sameSign = (t.amount < 0 && old.amount < 0) || (t.amount >= 0 && old.amount >= 0);
                    return sameSign;
                })
                .reverse()
                .first();

            if (lastMatch) {
                return {
                    ...t,
                    type: lastMatch.type,
                    bucketId: lastMatch.bucketId,
                    categoryMainId: lastMatch.categoryMainId,
                    categorySubId: lastMatch.categorySubId,
                    matchType: 'history' as const
                };
            }
        } catch (e) {
            console.warn("History lookup failed for", t.description, e);
        }

        return t;
    }));
    return enriched;
};

export const runImportPipeline = async (
    rawTransactions: Transaction[],
    existingTransactions: Transaction[],
    rules: ImportRule[],
    buckets: Bucket[]
): Promise<{ newTransactions: Transaction[], updatedTransactions: Transaction[] }> => {
    
    // 1. DUPLICATE & UPDATE CHECK
    // Group existing transactions by Date, Amount, and Text to handle multi-matches
    const existingGroupMap = new Map<string, Transaction[]>();
    existingTransactions.forEach(t => {
        const hash = `${t.originalDate || t.date}_${t.amount}_${(t.originalText || t.description).trim()}`;
        if (!existingGroupMap.has(hash)) existingGroupMap.set(hash, []);
        existingGroupMap.get(hash)!.push(t);
    });

    const toCreate: Transaction[] = [];
    const toUpdate: Transaction[] = [];

    // Tracks which existing transactions have been "claimed" by this import batch
    // to correctly handle multiple identical transactions within the same file
    const claimedExistingIds = new Set<string>();

    rawTransactions.forEach(t => {
        const hash = `${t.date}_${t.amount}_${t.description.trim()}`;
        const candidates = existingGroupMap.get(hash) || [];
        
        let foundMatch = false;

        // A. Attempt to find an exact duplicate (Matches everything including Balance)
        if (t.balance !== undefined) {
            const exactDuplicate = candidates.find(c => 
                !claimedExistingIds.has(c.id) && 
                c.balance !== undefined && 
                Math.abs(c.balance - (t.balance ?? 0)) < 0.01
            );
            if (exactDuplicate) {
                claimedExistingIds.add(exactDuplicate.id);
                foundMatch = true;
                // It's a true duplicate, ignore it.
            }
        }

        // B. Attempt to find a "Balance Update" match
        // (Existing one lacks balance, incoming has balance)
        if (!foundMatch && t.balance !== undefined) {
            const updatable = candidates.find(c => 
                !claimedExistingIds.has(c.id) && 
                c.balance === undefined
            );
            if (updatable) {
                claimedExistingIds.add(updatable.id);
                toUpdate.push({ ...updatable, balance: t.balance });
                foundMatch = true;
            }
        }

        // C. Fallback for no-balance banks or identical transactions with missing balance data
        // If we have an unclaimed candidate with the same hash (and neither have balance or balances differ),
        // we assume it's a duplicate only if the count matches.
        if (!foundMatch && t.balance === undefined) {
            const unclaimed = candidates.find(c => !claimedExistingIds.has(c.id));
            if (unclaimed) {
                claimedExistingIds.add(unclaimed.id);
                foundMatch = true;
            }
        }

        // If no match found among existing records, it's a new transaction!
        if (!foundMatch) {
            toCreate.push(t);
        }
    });

    // 2. APPLY RULES (Highest Priority)
    let processed = toCreate.map((t): Transaction => {
        const lowerDesc = t.description.toLowerCase();
        const txSign = t.amount < 0 ? 'negative' : 'positive';

        const matchedRule = rules.find(r => {
            if (r.accountId && r.accountId !== t.accountId) return false;
            if (r.sign && r.sign !== txSign) return false;
            if (!r.sign) {
                if (t.amount < 0 && r.targetType === 'INCOME') return false;
                if (t.amount > 0 && r.targetType === 'EXPENSE') return false;
            }
            const kw = r.keyword.toLowerCase();
            if (r.matchType === 'exact') return lowerDesc === kw;
            if (r.matchType === 'starts_with') return lowerDesc.startsWith(kw);
            return lowerDesc.includes(kw); 
        });

        if (matchedRule) {
            const type: TransactionType = matchedRule.targetType || (matchedRule.targetBucketId ? 'TRANSFER' : 'EXPENSE');
            if (type === 'TRANSFER') {
                return { 
                    ...t, 
                    type: 'TRANSFER',
                    bucketId: matchedRule.targetBucketId,
                    categoryMainId: undefined,
                    categorySubId: undefined,
                    matchType: 'rule' as const,
                    ruleMatch: true 
                };
            } else {
                return { 
                    ...t, 
                    type: type, 
                    bucketId: undefined,
                    categoryMainId: matchedRule.targetCategoryMainId,
                    categorySubId: matchedRule.targetCategorySubId,
                    matchType: 'rule' as const,
                    ruleMatch: true 
                };
            }
        }
        return t;
    });

    // 3. APPLY HISTORY
    processed = await applyHistoricalCategories(processed);

    // 4. APPLY EVENT/TRIP AUTO-TAGGING
    processed = processed.map(t => {
        if (t.matchType === 'rule' || t.amount >= 0 || t.bucketId) return t;
        const eventMatch = buckets.find(b => 
            b.type === 'GOAL' && 
            b.autoTagEvent && 
            b.eventStartDate && 
            b.eventEndDate &&
            t.date >= b.eventStartDate && 
            t.date <= b.eventEndDate
        );
        if (eventMatch) {
            return {
                ...t,
                bucketId: eventMatch.id,
                matchType: t.matchType || 'event'
            };
        }
        return t;
    });

    // 5. SMART DETECTION & DEFAULTS
    processed = processed.map(t => {
        if (t.matchType === 'rule') return t;
        const lowerDesc = t.description.toLowerCase();
        if (!t.type) {
            const isTransferKeywords = ['överföring', 'till konto', 'omsättning', 'sparande', 'flytt', 'insättning', 'girering'];
            const isLikelyTransfer = isTransferKeywords.some(kw => lowerDesc.includes(kw));
            if (isLikelyTransfer) {
                const targetBucket = buckets.find(b => lowerDesc.includes(b.name.toLowerCase()));
                return {
                    ...t,
                    type: 'TRANSFER',
                    bucketId: targetBucket ? targetBucket.id : undefined,
                    matchType: targetBucket ? 'ai' : undefined
                };
            }
        }
        if (t.amount > 0 && !t.type) {
             return { ...t, type: 'INCOME', categoryMainId: '9', bucketId: undefined };
        }
        if (!t.type) {
            return { ...t, type: 'EXPENSE', bucketId: t.bucketId };
        }
        return t;
    });

    return { 
        newTransactions: processed,
        updatedTransactions: toUpdate
    };
};
