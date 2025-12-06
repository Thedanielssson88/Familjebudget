import { GoogleGenAI } from "@google/genai";
import { Bucket, Transaction } from "../types";

// This service handles the "Smart" part of the import pipeline
export const categorizeTransactionsWithAi = async (
  transactions: Transaction[], 
  buckets: Bucket[]
): Promise<Record<string, string>> => {
  
  // Filter out transactions that already have a category (from rules)
  const unknown = transactions.filter(t => !t.categoryId);
  if (unknown.length === 0) return {};

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Prepare a lean list of categories to send to AI
  const categoriesList = buckets.map(b => `ID: "${b.id}", Namn: "${b.name}"`).join("\n");
  
  // Prepare the transaction list (limit to 50 at a time to avoid token limits if necessary, 
  // but usually a CSV import is small enough for one batch or we can loop outside)
  const transactionList = unknown.map(t => `- ID: "${t.id}", Text: "${t.description}", Belopp: ${t.amount}`).join("\n");

  const prompt = `
    Jag har en lista med banktransaktioner och en lista med budgetkategorier.
    Din uppgift är att para ihop varje transaktion med den mest logiska kategorin baserat på transaktionstexten.

    KATEGORIER:
    ${categoriesList}

    TRANSAKTIONER:
    ${transactionList}

    INSTRUKTIONER:
    1. Analysera texten i varje transaktion (t.ex. "ICA", "Netflix", "Hyresvärd").
    2. Välj det Kategori-ID som passar bäst.
    3. Om du är osäker, gissa den mest sannolika. Om det är omöjligt att gissa, svara med null för den transaktionen.
    4. Svara ENDAST med ett JSON-objekt där nyckeln är Transaktions-ID och värdet är Kategori-ID (eller null).
    
    Exempelformat på svar:
    {
      "transaktion_id_1": "kategori_id_A",
      "transaktion_id_2": null
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text || "{}";
    const result = JSON.parse(jsonText);
    return result;

  } catch (error) {
    console.error("AI Categorization failed:", error);
    return {}; // Fail silently/gracefully by returning no matches
  }
};