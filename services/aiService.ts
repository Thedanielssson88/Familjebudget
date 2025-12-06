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
      // Handle both named export and default export scenarios depending on CDN
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
        Jag har en lista med banktransaktioner. Jag vill att du mappar varje transaktion till:
        1. En Budgetpost (Bucket) - Varifrån pengarna tas.
        2. En Huvudkategori (MainCategory) - Vad det är för typ av utgift.
        3. En Underkategori (SubCategory) - Specifikt vad det är.

        BUDGETPOSTER (Buckets):
        ${bucketsList}
        
        HUVUDKATEGORIER:
        ${mainCatsList}
        
        UNDERKATEGORIER:
        ${subCatsList}

        TRANSAKTIONER:
        ${transactionList}

        INSTRUKTIONER:
        1. Analysera texten i varje transaktion.
        2. Välj bäst passande IDn.
        3. Om du är osäker, svara med null för det fältet.
        4. Svara ENDAST med ett JSON-objekt där nyckeln är Transaktions-ID och värdet är ett objekt { bucketId, mainCatId, subCatId }.
        
        Exempel:
        {
          "tx_1": { "bucketId": "b1", "mainCatId": "mc1", "subCatId": "sc1" },
          "tx_2": { "bucketId": null, "mainCatId": "mc2", "subCatId": null }
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