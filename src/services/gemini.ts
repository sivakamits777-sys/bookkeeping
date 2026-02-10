import { TaxCodeReference, ClassificationResult, ExtractedInsight } from '../types';

const fetchWithRetry = async (url: string, options: RequestInit, retries: number = 3, backoff: number = 1000): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    if (res.ok) return res;
    
    // Throw error for non-ok responses to trigger retry
    throw new Error(`Request failed with status ${res.status}`);
  } catch (error) {
    if (retries <= 0) throw error;
    
    console.warn(`Fetch failed, retrying in ${backoff}ms... (${retries} retries left)`, error);
    await new Promise(resolve => setTimeout(resolve, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
};

export const classifyProductWithGemini = async (
  name: string,
  description: string,
  base64Image: string | null,
  countryName: string,
  taxCodes: TaxCodeReference[]
): Promise<ClassificationResult> => {
  const res = await fetchWithRetry('/api/classify', {
    method: 'POST',
    body: JSON.stringify({ name, description, base64Image, countryName, taxCodes })
  });
  return res.json();
};

export const recalculateConfidence = async (
  name: string,
  description: string,
  base64Image: string | null,
  countryName: string,
  assignedTaxCode: TaxCodeReference
): Promise<{ confidence: number; ai_vision_analysis: string; confidence_reasoning: string }> => {
  const res = await fetchWithRetry('/api/classify', {
    method: 'POST',
    body: JSON.stringify({ name, description, base64Image, countryName, assignedTaxCode })
  });
  return res.json();
};

export const processDocumentWithGemini = async (
  pdfBase64: string,
  defaultCountry: string,
  taxCodes: TaxCodeReference[]
): Promise<ExtractedInsight & { raw_results: any[] }> => {
  const res = await fetchWithRetry('/api/document', {
    method: 'POST',
    body: JSON.stringify({ pdfBase64, defaultCountry, taxCodes })
  });
  return res.json();
};
