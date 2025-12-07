import { Bucket, Transaction, MainCategory, SubCategory } from "../types";

// This service handles the "Smart" part of the import pipeline
export const categorizeTransactionsWithAi = async (
  transactions: Transaction[], 
  buckets: Bucket[],
  mainCategories: MainCategory[],
  subCategories: SubCategory[]
): Promise<Record<string, { bucketId?: string, mainCatId?: string, subCatId?: string }>> => {
  
  // Filter out transactions that already have assignments
  const unknown = transactions.filter(t => !t.bucketId && !t.categoryMainId);
  if (unknown.length === 0) return {};

  try {
      // Dynamically import the SDK only when needed to prevent load errors if network fails
      const module = await import("@google/genai");
      const GoogleGenAI = module.GoogleGenAI || (module.default && module.default.GoogleGenAI);

      if (!GoogleGenAI) {
        throw new Error("Could not find GoogleGenAI class in imported module");
      }
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
          console.error("API Key not found in environment");
          return {};
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Prepare lists for AI
      const bucketsList = buckets.map(b => `ID: "${b.id}", Namn: "${b.name}"`).join("\n");
      const mainCatsList = mainCategories.map(c => `ID: "${c.id}", Namn: "${c.name}"`).join("\n");
      const subCatsList = subCategories.map(c => `ID: "${c.id}", ParentID: "${c.mainCategoryId}", Namn: "${c.name}"`).join("\n");
      
      const transactionList = unknown.map(t => `- ID: "${t.id}", Text: "${t.description}", Belopp: ${t.amount}`).join("\n");

      const prompt = `
        Jag har en lista med banktransaktioner. Jag vill att du klassificerar varje transaktion enligt följande logik:

        1. ÄR DETTA EN ÖVERFÖRING MELLAN KONTON (Funding)?
           - T.ex. "Överföring till Matkonto", "Sparande", "Buffert".
           - Om JA: Välj en matchande Budgetpost (Bucket) ID. Sätt Main/Sub Category till null.
        
        2. ÄR DETTA EN UTGIFT/KONSUMTION?
           - T.ex. "ICA Maxi", "Circle K", "Netflix", "Hyra".
           - Om JA: Välj en matchande Huvudkategori och Underkategori ID. Sätt Bucket ID till null.

        BUDGETPOSTER (Endast för överföringar):
        ${bucketsList}
        
        KATEGORIER (Endast för utgifter):
        ${mainCatsList}
        
        UNDERKATEGORIER (Endast för utgifter):
        ${subCatsList}

        TRANSAKTIONER:
        ${transactionList}

        INSTRUKTIONER:
        1. Analysera texten i varje transaktion.
        2. Avgör om det är TRANSFER (Bucket) eller EXPENSE (Category).
        3. Svara ENDAST med ett JSON-objekt där nyckeln är Transaktions-ID och värdet är ett objekt { bucketId, mainCatId, subCatId }.
        
        Exempel:
        {
          "tx_1": { "bucketId": "b1", "mainCatId": null, "subCatId": null },  // Överföring
          "tx_2": { "bucketId": null, "mainCatId": "mc2", "subCatId": "sc1" } // Utgift
        }
      `;

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
    return {};
  }
};