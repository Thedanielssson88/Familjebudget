import { format } from 'date-fns';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory } from '../types';
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

                            // Fallback om vi inte hittar exakta rubriker (gissa baserat på din filstruktur)
                            // Din fil: ,Datum,Kategori,Underkategori,Text,Belopp...
                            // Index blir då: 1, 2, 3, 4, 5
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
                        // Create a helpful error message listing found headers (first 5 rows)
                        const preview = jsonData.slice(0, 5).map(r => JSON.stringify(r)).join('\n');
                        reject(new Error(`Kunde inte hitta en rad med kolumnen 'Datum'.\n\nFöljande data hittades i början av filen:\n${preview}`));
                        return;
                    }

                    const headerRow = jsonData[headerRowIndex];
                    const dateIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('datum'));
                    const textIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('text') || c?.toString().toLowerCase().includes('rubrik'));
                    const amountIdx = headerRow.findIndex((c: any) => c?.toString().toLowerCase().includes('belopp'));

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

/**
 * Looks up the most recent transaction with the same description to find how it was categorized previously.
 */
const applyHistoricalCategories = async (transactions: Transaction[]): Promise<Transaction[]> => {
    const enriched = await Promise.all(transactions.map(async (t): Promise<Transaction> => {
        // If it was already matched by a RULE, do not override with history.
        if (t.matchType === 'rule') return t;

        try {
            // Find last transaction with same description that was categorized (has verified data)
            const lastMatch = await db.transactions
                .where({ accountId: t.accountId, description: t.description })
                .filter(old => !!old.type && (!!old.bucketId || !!old.categoryMainId))
                .reverse()
                .first();

            if (lastMatch) {
                // If the historical match exists, copy its properties exactly.
                return {
                    ...t,
                    type: lastMatch.type, // Copy type (Transfer vs Expense)
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
): Promise<Transaction[]> => {
    
    // 1. DUPLICATE CHECK
    const existingHashes = new Set(existingTransactions.map(t => `${t.date}_${t.amount}_${t.description}`));
    
    let processed = rawTransactions.filter(t => {
        const hash = `${t.date}_${t.amount}_${t.description}`;
        return !existingHashes.has(hash);
    });

    // 2. APPLY RULES (Highest Priority)
    processed = processed.map(t => {
        const lowerDesc = t.description.toLowerCase();
        const matchedRule = rules.find(r => {
            const kw = r.keyword.toLowerCase();
            if (r.matchType === 'exact') return lowerDesc === kw;
            if (r.matchType === 'starts_with') return lowerDesc.startsWith(kw);
            return lowerDesc.includes(kw); 
        });

        if (matchedRule) {
            const type = matchedRule.targetType || (matchedRule.targetBucketId ? 'TRANSFER' : 'EXPENSE');
            
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
                    type: 'EXPENSE',
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

    // 3. APPLY HISTORY (Second Highest Priority)
    // This MUST run before defaults are applied, so we don't accidentally ignore history.
    processed = await applyHistoricalCategories(processed);

    // 4. SMART DETECTION & DEFAULTS (Fallback)
    processed = processed.map(t => {
        // If already matched by Rule or History, skip.
        if (t.matchType === 'rule' || t.matchType === 'history') return t;

        const lowerDesc = t.description.toLowerCase();

        // A. Smart Transfer Detection (Keywords)
        const isTransferKeywords = ['överföring', 'till konto', 'omsättning', 'sparande', 'flytt', 'insättning', 'girering'];
        const isLikelyTransfer = isTransferKeywords.some(kw => lowerDesc.includes(kw));

        if (isLikelyTransfer) {
            // Find a Bucket that matches the description name
            const targetBucket = buckets.find(b => lowerDesc.includes(b.name.toLowerCase()));
            
            return {
                ...t,
                type: 'TRANSFER',
                bucketId: targetBucket ? targetBucket.id : undefined,
                categoryMainId: undefined,
                categorySubId: undefined,
                matchType: targetBucket ? 'ai' : undefined // Using 'ai' icon to indicate smart guess
            };
        }

        // B. Default to Income
        if (t.amount > 0) {
             return { ...t, type: 'INCOME', categoryMainId: '9', bucketId: undefined }; // 9 = Inkomster
        }
        
        // C. Default to Consumption (Expense)
        return { 
            ...t, 
            type: 'EXPENSE', 
            bucketId: undefined 
        };
    });

    return processed;
};