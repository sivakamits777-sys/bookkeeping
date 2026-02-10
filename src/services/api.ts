import { AppUser, Product, TaxCodeReference } from '../types';

export const checkEmailExists = async (email: string): Promise<{ exists: boolean, role?: string }> => {
  const res = await fetch('/api/auth/check-email', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
  if (!res.ok) return { exists: false };
  return res.json();
};

export const fetchAllUsers = async (): Promise<AppUser[]> => {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
};

// Secure Deletion
export const deleteUser = async (targetUserId: string, adminAuth: { adminId: string, adminPassword: string }): Promise<void> => {
  const res = await fetch('/api/users', {
    method: 'DELETE',
    body: JSON.stringify({
      targetUserId,
      adminId: adminAuth.adminId,
      adminPassword: adminAuth.adminPassword
    })
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to delete user');
  }
};

// ... (other functions)

export const loginUser = async (email: string, password: string, portalType: 'user' | 'admin' = 'user'): Promise<AppUser> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, portalType })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
};

export const signupUser = async (email: string, password: string, name: string): Promise<AppUser> => {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Signup failed');
  }
  return res.json();
};

export const sendOtp = async (email: string, otp: string) => {
  const res = await fetch('/api/auth/otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp })
  });
  return res.json();
};

export const updatePassword = async (email: string, newPassword: string): Promise<boolean> => {
  const res = await fetch('/api/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ email, newPassword })
  });
  return res.ok;
};

export const ensureUnknownCategory = async () => {
  await fetch('/api/tax-codes/ensure-unknown', { method: 'POST' });
};

export const fetchTaxCodes = async (countryCode?: string): Promise<TaxCodeReference[]> => {
  const url = countryCode ? `/api/tax-codes?country=${countryCode}` : '/api/tax-codes';
  const res = await fetch(url);
  return res.json();
};

export const findHighConfidenceMatch = async (name: string, country: string): Promise<Product | null> => {
  const res = await fetch(`/api/products/match?name=${encodeURIComponent(name)}&country=${encodeURIComponent(country)}`);
  if (!res.ok) return null;
  return res.json();
};

export const saveProduct = async (product: Product, userId: number): Promise<Product | null> => {
  const res = await fetch('/api/products', {
    method: 'POST',
    body: JSON.stringify({ product, userId })
  });
  return res.json();
};

export const updateProduct = async (id: number, updates: Partial<Product>): Promise<void> => {
  await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
};

export const fetchProducts = async (userId: number, role: 'admin' | 'user', targetUserId?: number): Promise<Product[]> => {
  let url = `/api/products?userId=${userId}&role=${role}`;
  if (targetUserId) {
    url += `&targetUserId=${targetUserId}`;
  }
  const res = await fetch(url);
  return res.json();
};

// Dummy init for compatibility
export const initFirebase = () => { };
