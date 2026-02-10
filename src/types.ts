
export interface TaxCodeReference {
  code: string;
  country: string; // 'US', 'IN', 'UK', etc.
  category: string;
  rate: number;
  keywords: string;
}

export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface Product {
  id?: number;
  user_id?: number; // Linked to AppUser
  name: string;
  user_description: string;
  image_base64: string | null;
  ai_vision_analysis: string;
  tax_code: string;
  country: string; // The country context used for classification
  created_at?: string;
  // New fields for dashboard enrichment
  confidence?: number;
  is_flagged?: boolean;
  hierarchy?: string;
  confidence_reasoning?: string;
  reasoning?: string;
  // Joined data from Firestore
  TaxCodeReference?: {
    category: string;
    rate: number;
  };
}

export interface ClassificationResult {
  tax_code: string;
  ai_vision_analysis: string;
  reasoning: string;
  confidence: number;
  is_flagged: boolean;
  mismatch_detected: boolean;
  hierarchy?: string;
  confidence_reasoning?: string;
}

export interface ExtractedProduct {
  name: string;
  country: string;
  description: string;
  image?: string; // Base64
  visual_analysis: string;
  // Derived classification
  tax_code?: string;
  confidence?: number;
  hierarchy?: string;
  confidence_reasoning?: string;
  reasoning?: string;
}

export interface ExtractedInsight {
  document_type: string;
  summary: string;
  products: ExtractedProduct[];
}


