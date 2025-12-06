import { format } from 'date-fns';
import { Transaction, ImportRule, Bucket, MainCategory, SubCategory } from '../types';
import { generateId } from '../utils';
import { db } from '../db';
import { categorizeTransactionsWithAi } from './aiService';

// --- PARSING ---

const parseAmount = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // Handle Swedish "1.234,50" or "-123,00"
    // Remove dots (thousand separators) and replace comma with dot
    let str = val.toString();
    str = str.replace(/\./g, ''); 
    str = str.replace(',', '.');
    return parseFloat(str) || 0;
};

const parseDate = (val: any): string => {
    // Return YYYY-MM-DD
    if (!val) return format(new Date(), 'yyyy-MM-dd');
    // If it's a JS date object (from XLSX)
    if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd');
    }
    // Simple parsing for "2025-01-01"
    const str = val.toString().trim();
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
    return str; // Fallback
};

export const parseBankFile = async (file: File, accountId: string): Promise<Transaction[]> => {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    
    if (isCsv) {
        try {
            // Dynamic import for PapaParse
            const PapaModule = await import('papaparse');
            // Handle ESM/CommonJS default export differences
            const Papa = PapaModule.default || PapaModule;

            return new Promise((resolve, reject) => {
                Papa.parse(file, {
                    encoding: "ISO-8859-1", // Standard for Swedish banks
                    skipEmptyLines: true,
                    complete: (results: any) => {
                        // Search for the header row containing "Datum"
                        const headerRowIndex = results.data.findIndex((row: any) => 
                            Array.isArray(row) && row.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                        );

                        if (headerRowIndex === -1) {
                            console.warn("Could not find 'Datum' header row.");
                            return resolve([]);
                        }

                        const dataRows = results.data.slice(headerRowIndex + 1);
                        const transactions: Transaction[] = dataRows.map((row: any) => {
                            // Assuming standard layout based on description: 0: Date, 3: Text, 4: Amount
                            // Adjust indices if needed or make dynamic based on header
                            return {
                                id: generateId(),
                                accountId,
                                date: parseDate(row[0]),
                                description: row[3] || 'Okänd transaktion',
                                amount: parseAmount(row[4]),
                                isVerified: false,
                                source: 'import' as const
                            };
                        }).filter((t: Transaction) => t.amount !== 0); // Filter out empty lines or zero transactions

                        resolve(transactions);
                    },
                    error: (err: any) => reject(err)
                });
            });
        } catch (error) {
            console.error("Failed to load PapaParse", error);
            throw new Error("Kunde inte ladda CSV-tolkaren.");
        }
    } else {
        try {
            // Dynamic import for XLSX
            const XLSXModule = await import('xlsx');
            const XLSX = XLSXModule.default || XLSXModule;

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target?.result as ArrayBuffer);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
                        
                        const headerRowIndex = jsonData.findIndex((row) => 
                            row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('datum'))
                        );
                        
                        if (headerRowIndex === -1) return resolve([]);

                        const dataRows = jsonData.slice(headerRowIndex + 1);
                        const transactions: Transaction[] = dataRows.map((row) => ({
                             id: generateId(),
                             accountId,
                             date: parseDate(row[0]),
                             description: (row[3] || '').toString(),
                             amount: parseAmount(row[4]),
                             isVerified: false,
                             source: 'import' as const
                        })).filter(t => t.amount !== 0);

                        resolve(transactions);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        } catch (error) {
            console.error("Failed to load XLSX", error);
            throw new Error("Kunde inte ladda Excel-tolkaren.");
        }
    }
};

// --- PIPELINE LOGIC ---

/**
 * Attempts to find previous transactions with same description and account
 * to re-use their categorization.
 */
const applyHistoricalCategories = async (transactions: Transaction[]): Promise<Transaction[]> => {
    // Process in parallel
    const enriched = await Promise.all(transactions.map(async (t) => {
        // If already categorized by a Rule, skip history check
        if (t.bucketId || t.categoryMainId) return t;

        try {
            // Find most recent transaction with same description on same account that has categorization
            const lastMatch = await db.transactions
                .where({ accountId: t.accountId, description: t.description })
                .filter(old => !!old.bucketId || !!old.categoryMainId)
                .reverse()
                .first();

            if (lastMatch) {
                return {
                    ...t,
                    bucketId: lastMatch.bucketId,
                    categoryMainId: lastMatch.categoryMainId,
                    categorySubId: lastMatch.categorySubId,
                    matchType: 'history' as const
                };
            }
        } catch (e) {
            // Fail silently and continue
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
    buckets: Bucket[],
    mainCategories: MainCategory[],
    subCategories: SubCategory[]
): Promise<Transaction[]> => {
    
    // 1. DUPLICATE CHECK
    // Simple hash: date + amount + description
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
            return lowerDesc.includes(kw); // Default contains
        });

        if (matchedRule) {
            return { 
                ...t, 
                bucketId: matchedRule.targetBucketId || t.bucketId,
                categoryMainId: matchedRule.targetCategoryMainId || t.categoryMainId,
                categorySubId: matchedRule.targetCategorySubId || t.categorySubId,
                matchType: 'rule' as const,
                ruleMatch: true 
            };
        }
        return t;
    });

    // 3. APPLY HISTORY (Smart Matching)
    // Only applied to those not yet matched by rules
    processed = await applyHistoricalCategories(processed);

    // 4. APPLY AI (Lowest Priority, only for completely unassigned)
    try {
        // Filter list sent to AI to save tokens/time
        // We only send items that have NO categorization yet.
        const unassigned = processed.filter(t => !t.bucketId && !t.categoryMainId);
        
        if (unassigned.length > 0) {
            // Using static import now that aiService is safe
            const aiMapping = await categorizeTransactionsWithAi(unassigned, buckets, mainCategories, subCategories);
            
            processed = processed.map(t => {
                if (t.bucketId || t.categoryMainId) return t; // Already ruled or history matched
                
                const suggestion = aiMapping[t.id];
                if (suggestion) {
                    return { 
                        ...t, 
                        bucketId: suggestion.bucketId, 
                        categoryMainId: suggestion.mainCatId,
                        categorySubId: suggestion.subCatId,
                        matchType: 'ai' as const,
                        aiSuggested: true 
                    };
                }
                return t;
            });
        }
    } catch (e) {
        console.error("AI Step skipped due to error", e);
    }

    return processed;
};