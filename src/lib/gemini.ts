/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CATEGORIZATION_PROMPT = `
You are a financial expert. Analyze the following bank transactions and categorize them.
For each transaction, determine:
1. Type: 'income' or 'expense'.
2. Category: Choose from standard categories like 'Food & Dining', 'Shopping', 'Housing', 'Transportation', 'Utilities', 'Entertainment', 'Health', 'Travel', 'Salary', 'Investment', 'Transfer', or 'Other'.
3. If you are unsure about the category, use 'Other'.

Return the data as a JSON array of objects.
`;

export async function categorizeTransactions(rawText: string): Promise<Partial<Transaction>[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: CATEGORIZATION_PROMPT + "\n\nTransactions Text:\n" + rawText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              description: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ['income', 'expense'] },
              category: { type: Type.STRING },
            },
            required: ['date', 'description', 'amount', 'type', 'category']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error categorizing transactions:", error);
    return [];
  }
}
