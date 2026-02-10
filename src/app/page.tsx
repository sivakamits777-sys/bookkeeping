
"use client";

import React, { useState, useEffect } from 'react';
import { fetchTaxCodes, saveProduct, fetchProducts, ensureUnknownCategory, loginUser, signupUser, checkEmailExists, sendOtp, updatePassword, updateProduct, findHighConfidenceMatch, initFirebase, fetchAllUsers, deleteUser } from '../services/api';
import { classifyProductWithGemini, recalculateConfidence } from '../services/gemini';
import { TaxCodeReference, Product, AppUser, ClassificationResult } from '../types';
import TaxReferenceList from '../components/TaxReferenceList';
import KnowledgeBaseManager from '../components/KnowledgeBaseManager';
import Chatbot from '../components/Chatbot';
import TaxCodeSelector from '../components/TaxCodeSelector';
import * as XLSX from 'xlsx';

// Custom Logo Component
const Logo: React.FC<{ className?: string, darkMode: boolean }> = ({ className = "h-8 w-8", darkMode }) => (
    <img
        src={darkMode ? "/logo.png" : "/logolight.png"}
        alt="Logo"
        className={`${className} object-contain`}
    />
);

const COUNTRIES = [
    { code: 'IN', name: 'India' }
];

const compressImage = (base64Str: string, maxWidth = 1000, maxHeight = 1000, quality = 0.75): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Str || !base64Str.startsWith('data:image/')) {
            resolve(base64Str);
            return;
        }
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

const App: React.FC = () => {
    // --- Theme State ---
    const [darkMode, setDarkMode] = useState(true);

    // --- Auth State ---
    const [user, setUser] = useState<AppUser | null>(null);

    // New State for Landing Page Selection
    const [landingSelection, setLandingSelection] = useState<'admin' | 'user' | null>(null);

    const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot_password'>('login');

    // Auth Form State
    const [authEmail, setAuthEmail] = useState('');
    const [authPass, setAuthPass] = useState('');
    const [authName, setAuthName] = useState('');
    const [newPassword, setNewPassword] = useState(''); // For reset flow
    const [authError, setAuthError] = useState('');
    const [authSuccess, setAuthSuccess] = useState(''); // For success messages
    const [authLoading, setAuthLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false); // Visibility toggle

    // OTP State
    const [otpSent, setOtpSent] = useState(false);
    const [isOtpVerified, setIsOtpVerified] = useState(false); // New state for 3-step flow
    const [otpInput, setOtpInput] = useState('');
    const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
    const [fallbackOtpDisplay, setFallbackOtpDisplay] = useState<string | null>(null);

    // --- App Data State ---
    const [isDbReady, setIsDbReady] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [taxCodes, setTaxCodes] = useState<TaxCodeReference[]>([]);

    // UI State
    const [showModal, setShowModal] = useState(false); // New Classification Modal
    const [showTaxRefModal, setShowTaxRefModal] = useState(false); // Tax Reference Modal
    const [showKBModal, setShowKBModal] = useState(false); // Knowledge Base Modal
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [filterFlagged, setFilterFlagged] = useState(false);

    // NEW UI STATES FOR ADMIN
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
    const [editTaxCode, setEditTaxCode] = useState('');
    // Admin Edit Fields
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editImage, setEditImage] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false); // Loading state for admin update

    // Classification Form State (Manual)
    const [productName, setProductName] = useState('');
    const [productDesc, setProductDesc] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState('IN');
    const [isProcessing, setIsProcessing] = useState(false);
    const [taxDocFile, setTaxDocFile] = useState<File | null>(null);

    // Validation / Mismatch State
    const [validationError, setValidationError] = useState<string | null>(null);
    const [pendingResult, setPendingResult] = useState<ClassificationResult | null>(null);

    // Bulk Upload State
    const [classificationMode, setClassificationMode] = useState<'manual' | 'bulk'>('manual');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkProcessingLog, setBulkProcessingLog] = useState<string[]>([]);
    const [bulkProgress, setBulkProgress] = useState(0);
    const [isBulkComplete, setIsBulkComplete] = useState(false);

    // User Management State
    const [showUsersModal, setShowUsersModal] = useState(false);
    const [usersList, setUsersList] = useState<AppUser[]>([]);
    const [viewingProductAs, setViewingProductAs] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<{ id: number, name: string } | null>(null);
    const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
    const [deleteUserError, setDeleteUserError] = useState<string | null>(null);
    const [isDeletingUser, setIsDeletingUser] = useState(false);

    // --- Initialization ---
    useEffect(() => {
        initFirebase();
    }, []);

    // Fetch data only when user is logged in
    // Fetch data only when user is logged in
    useEffect(() => {
        const loadData = async () => {
            if (!user) return;

            setDbError(null);
            setIsDbReady(false);

            try {
                await ensureUnknownCategory();
                // Load default codes for reference view
                const codes = await fetchTaxCodes();
                setTaxCodes(codes);

                // Fetch products filtered by role or impersonation
                const targetId = viewingProductAs ? viewingProductAs.id : undefined;
                const prods = await fetchProducts(user.id, user.role, targetId);
                setProducts(prods);

                setIsDbReady(true);
            } catch (e: any) {
                console.error("DB Load Error", e);
                setDbError(e.message || JSON.stringify(e));
            }
        };

        loadData();
    }, [user, viewingProductAs]);

    const resetManualForm = () => {
        setProductName('');
        setProductDesc('');
        setSelectedImage(null);
        setTaxDocFile(null);
        setValidationError(null);
        setPendingResult(null);
    };

    // --- Auth Handlers ---
    const resetAuthForm = () => {
        setAuthError('');
        setAuthSuccess('');
        setOtpSent(false);
        setIsOtpVerified(false);
        setOtpInput('');
        setGeneratedOtp(null);
        setFallbackOtpDisplay(null);
        setNewPassword('');
        setAuthEmail('');
        setAuthPass('');
        setAuthName('');
        setShowPassword(false);
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');
        setAuthSuccess('');
        setAuthLoading(true);

        try {
            if (authMode === 'login') {
                const portalType = landingSelection === 'admin' ? 'admin' : 'user';
                const loggedInUser = await loginUser(authEmail, authPass, portalType);

                // ROLE ENFORCEMENT
                if (landingSelection === 'admin' && loggedInUser.role !== 'admin') {
                    throw new Error("Access Denied: This account does not have administrator privileges.");
                }
                if (landingSelection === 'user' && loggedInUser.role === 'admin') {
                    // Optional restriction
                }

                setUser(loggedInUser);
            }
            else if (authMode === 'forgot_password') {
                // RESET PASSWORD FLOW
                if (!otpSent) {
                    // STEP 1: Verify Email Exists & Send OTP
                    const { exists, role } = await checkEmailExists(authEmail);
                    if (!exists) throw new Error("No account found with this email.");

                    // SECURITY: Role-Based Reset Restriction
                    const currentPortal = landingSelection === 'admin' ? 'admin' : 'user';
                    if (currentPortal === 'user' && role === 'admin') {
                        throw new Error("Access Denied: Admin passwords cannot be reset from the User Portal.");
                    }
                    if (currentPortal === 'admin' && role !== 'admin') {
                        throw new Error("Access Denied: Standard user passwords cannot be reset from the Admin Portal.");
                    }

                    // Generate OTP
                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                    setGeneratedOtp(code);

                    const response = await sendOtp(authEmail, code);

                    if (!response.success && response.isFallback) {
                        setFallbackOtpDisplay(code);
                        setAuthError("Email service unavailable (Dev Mode). Verification code shown below.");
                    } else if (!response.success) {
                        throw new Error("Failed to send verification email. Please check your connection.");
                    } else {
                        setAuthSuccess("Verification code sent to your email!");
                    }

                    setOtpSent(true);
                    return;
                }

                // STEP 2: Verify OTP
                if (!isOtpVerified) {
                    if (otpInput !== generatedOtp) {
                        throw new Error("Invalid verification code.");
                    }
                    setIsOtpVerified(true);
                    setAuthSuccess("Code verified! Please set your new password.");
                    return;
                }

                // STEP 3: Reset Password
                if (!newPassword || newPassword.length < 6) {
                    throw new Error("Password must be at least 6 characters.");
                }

                await updatePassword(authEmail, newPassword);

                setAuthSuccess("Password reset successfully! Please sign in.");
                setTimeout(() => {
                    setAuthMode('login');
                    resetAuthForm();
                }, 2000);
            }
            else {
                // SIGNUP FLOW (Only available for USER)
                if (landingSelection === 'admin') {
                    throw new Error("Admin signup is restricted.");
                }

                if (!authName) throw new Error("Name is required");

                if (!otpSent) {
                    // STEP 1: Verify Email Availability & Send OTP
                    if (authPass.length < 6) {
                        throw new Error("Password must be at least 6 characters long.");
                    }

                    const { exists } = await checkEmailExists(authEmail);
                    if (exists) throw new Error("This email is already registered. Please sign in.");

                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                    setGeneratedOtp(code);

                    const response = await sendOtp(authEmail, code);

                    if (!response.success && response.isFallback) {
                        setFallbackOtpDisplay(code);
                        setAuthError("Email service unavailable (Dev Mode). Verification code shown below.");
                    } else if (!response.success) {
                        throw new Error("Failed to send verification email. Please check your connection.");
                    } else {
                        setAuthSuccess("Verification code sent to your email!");
                    }

                    setOtpSent(true);
                    return;
                } else {
                    // STEP 2: Verify OTP & Create User
                    if (otpInput !== generatedOtp) {
                        throw new Error("Invalid verification code. Please try again.");
                    }

                    const newUser = await signupUser(authEmail, authPass, authName);
                    setAuthSuccess("Account created successfully! Welcome.");
                    setTimeout(() => {
                        setUser(newUser);
                    }, 1500);
                }
            }
        } catch (err: any) {
            setAuthError(err.message || "Authentication failed");
        } finally {
            setAuthLoading(false);
        }
    };

    const initiateLogout = () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = () => {
        setUser(null);
        setProducts([]);
        setIsDbReady(false);
        setDbError(null);
        setAuthEmail('');
        setAuthPass('');
        setAuthName('');
        resetAuthForm();
        setAuthMode('login');
        setLandingSelection(null); // Go back to landing page
        setShowLogoutConfirm(false);
    };

    // --- Classification Handlers ---

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const compressed = await compressImage(base64);
                setSelectedImage(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEditImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const compressed = await compressImage(base64);
                setEditImage(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleTaxDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setTaxDocFile(e.target.files[0]);
        }
    };

    const convertUrlToBase64 = async (url: string): Promise<string | null> => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const base64: string = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
            return await compressImage(base64);
        } catch (error) {
            console.warn("Failed to fetch image from URL", url, error);
            return null;
        }
    };

    const handleBulkFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setBulkFile(e.target.files[0]);
            setBulkProcessingLog([]);
            setBulkProgress(0);
        }
    };

    const processBulkFile = async () => {
        if (!bulkFile || !user) return;
        setIsProcessing(true);
        setIsBulkComplete(false);
        setBulkProcessingLog(['Starting file analysis...']);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    throw new Error("Sheet is empty");
                }

                setBulkProcessingLog(prev => [...prev, `Found ${jsonData.length} rows to process.`]);

                // Cache tax codes to avoid fetching inside loop
                const codesCache: Record<string, TaxCodeReference[]> = {};
                const getCodes = async (country: string) => {
                    const c = country || 'IN';
                    if (!codesCache[c]) {
                        codesCache[c] = await fetchTaxCodes(c);
                    }
                    return codesCache[c];
                };

                let processedCount = 0;
                const newProducts: Product[] = [];

                for (const row of jsonData) {
                    // Approximate column matching (case insensitive)
                    const getCol = (key: string) => {
                        const foundKey = Object.keys(row).find(k => k.toLowerCase().includes(key.toLowerCase()));
                        return foundKey ? row[foundKey] : '';
                    };

                    const serial = getCol('serial');
                    const countryRaw = getCol('country') || '';
                    const name = getCol('product name') || getCol('item name') || getCol('name');
                    const desc = getCol('description') || getCol('desc');
                    const imageUrl = getCol('image') || getCol('url') || getCol('link');

                    // Map country name to code if needed
                    let countryCode = (countryRaw || '').trim().toUpperCase();
                    if (countryCode === 'UNITED STATES') countryCode = 'US';
                    if (countryCode === 'INDIA') countryCode = 'IN';
                    // Fallback for valid code check
                    if (!COUNTRIES.find(c => c.code === countryCode)) countryCode = '';

                    if (!name || !serial || !countryCode) {
                        const missing: string[] = [];
                        if (!name) missing.push('Name');
                        if (!serial) missing.push('Serial Number');
                        if (!countryCode) missing.push('Country');
                        setBulkProcessingLog(prev => [...prev, `Row ${serial || processedCount + 1}: Skipped (Missing ${missing.join(', ')})`]);
                        processedCount++;
                        setBulkProgress((processedCount / jsonData.length) * 100);
                        continue;
                    }

                    let base64Image = null;
                    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
                        base64Image = await convertUrlToBase64(imageUrl);
                    }

                    try {
                        setBulkProcessingLog(prev => [...prev, `Row ${serial || processedCount + 1}: Analyzing "${name}"...`]);

                        const countryCodes = await getCodes(countryCode);
                        const countryName = COUNTRIES.find(c => c.code === countryCode)?.name || countryCode;

                        // CHECK EXISTING HIGH CONFIDENCE MATCH
                        const existingMatch = await findHighConfidenceMatch(name, countryCode);
                        let result: any;

                        let autoAssign = false;
                        if (existingMatch) {
                            // VERIFY DETAILS MATCH
                            const dbDesc = (existingMatch.user_description || '').trim().toLowerCase();
                            const inputDesc = (desc || '').trim().toLowerCase();
                            const isDescMatch = dbDesc === inputDesc;

                            const dbImg = existingMatch.image_base64 || null;
                            const inputImg = base64Image || null;
                            const isImgMatch = dbImg === inputImg;

                            if (isDescMatch && isImgMatch) {
                                autoAssign = true;
                            } else {
                                setBulkProcessingLog(prev => [...prev, `Row ${serial || processedCount + 1}: Match found but details differ. Re-analyzing for new score...`]);
                            }
                        }

                        if (autoAssign && existingMatch) {
                            setBulkProcessingLog(prev => [...prev, `Row ${serial || processedCount + 1}: Matched existing record (${existingMatch.tax_code})`]);
                            result = {
                                tax_code: existingMatch.tax_code,
                                ai_vision_analysis: "Tax code assigned based on previous classification",
                                reasoning: "Matched with existing database record.",
                                confidence: existingMatch.confidence,
                                is_flagged: false,
                                mismatch_detected: false
                            };
                        } else {
                            result = await classifyProductWithGemini(
                                name,
                                desc,
                                base64Image,
                                countryName,
                                countryCodes
                            );
                        }

                        const productToSave: Product = {
                            name: name,
                            user_description: desc,
                            image_base64: base64Image,
                            ai_vision_analysis: result.ai_vision_analysis,
                            tax_code: result.tax_code,
                            country: countryCode,
                            confidence: result.confidence,
                            is_flagged: result.is_flagged,
                            hierarchy: result.hierarchy,
                            reasoning: result.reasoning,
                            confidence_reasoning: result.confidence_reasoning
                        };

                        await saveProduct(productToSave, user.id);
                        newProducts.push(productToSave);
                        setBulkProcessingLog(prev => [...prev, `Row ${serial || processedCount + 1}: Success - Code ${result.tax_code}`]);

                    } catch (err: any) {
                        setBulkProcessingLog(prev => [...prev, `Row ${serial || processedCount + 1}: Failed - ${err.message}`]);
                    }

                    processedCount++;
                    setBulkProgress((processedCount / jsonData.length) * 100);
                }

                // Refresh main list
                const updatedProducts = await fetchProducts(user.id, user.role);
                setProducts(updatedProducts);
                setBulkProcessingLog(prev => [...prev, `Job Complete. Processed ${processedCount} items.`]);

            } catch (err: any) {
                setBulkProcessingLog(prev => [...prev, `Critical Error: ${err.message}`]);
            } finally {
                setIsProcessing(false);
                setIsBulkComplete(true);
                setBulkFile(null); // Clear selection
            }
        };
        reader.readAsBinaryString(bulkFile);
    };

    const handleManualClassify = async (arg?: any) => {
        // Check if forced via argument (handles event object vs boolean)
        const forceAi = arg === true;

        if (!productName) {
            setValidationError("Product Name is required.");
            return;
        }

        setValidationError(null);
        setPendingResult(null);
        setIsProcessing(true);

        try {
            if (!forceAi) {
                // 1. CHECK FOR EXISTING MATCH FIRST
                const existingMatch = await findHighConfidenceMatch(productName, selectedCountry);

                if (existingMatch) {
                    // STRICT MATCHING: Name (done by API), Description, and Image
                    const dbDesc = (existingMatch.user_description || '').trim().toLowerCase();
                    const inputDesc = (productDesc || '').trim().toLowerCase();
                    const isDescMatch = dbDesc === inputDesc;

                    const dbImg = existingMatch.image_base64 || null;
                    const inputImg = selectedImage || null;
                    const isImgMatch = dbImg === inputImg;

                    if (isDescMatch && isImgMatch) {
                        // Match found! Use it directly.
                        const result: ClassificationResult = {
                            tax_code: existingMatch.tax_code,
                            confidence: existingMatch.confidence || 100,
                            is_flagged: existingMatch.is_flagged || false,
                            mismatch_detected: false,
                            ai_vision_analysis: "Tax code assigned based on previous classification",
                            reasoning: "Matched from database history."
                        };

                        await saveProductToDb(result);
                        resetManualForm();
                        setShowModal(false);
                        setIsProcessing(false);
                        return;
                    } else {
                        // Match found by name, but details differ.
                        setBulkProcessingLog(prev => [...prev, `Match found for "${productName}" but details differ. Proceeding with fresh AI analysis...`]);
                    }
                }
            }

            // 2. Fetch Tax Codes for Selected Country (Only if no match or forced)
            const countrySpecificCodes = await fetchTaxCodes(selectedCountry);
            const countryName = COUNTRIES.find(c => c.code === selectedCountry)?.name || selectedCountry;

            // 3. Classify
            const result = await classifyProductWithGemini(
                productName,
                productDesc,
                selectedImage,
                countryName,
                countrySpecificCodes
            );

            // 4. CHECK FOR MISMATCH
            if (result.mismatch_detected) {
                setValidationError(result.reasoning || "The AI detected a contradiction between the image and the product details.");
                setPendingResult(result);
                setIsProcessing(false);
                return; // Stop here, allow user to edit or proceed
            }

            // If no mismatch, save immediately
            await saveProductToDb(result);

            resetManualForm();
            setShowModal(false);
        } catch (err: any) {
            console.error("Classification Error:", err);
            let msg = err.message || "Unknown error";
            alert(`Classification failed: ${msg}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const saveProductToDb = async (result: ClassificationResult) => {
        if (!user) return;

        const newProduct: Product = {
            name: productName,
            user_description: productDesc,
            image_base64: selectedImage,
            ai_vision_analysis: result.ai_vision_analysis,
            tax_code: result.tax_code,
            country: selectedCountry,
            confidence: result.confidence,
            is_flagged: result.is_flagged,
            hierarchy: result.hierarchy,
            reasoning: result.reasoning,
            confidence_reasoning: result.confidence_reasoning
        };

        await saveProduct(newProduct, user.id);
        const updatedProducts = await fetchProducts(user.id, user.role);
        setProducts(updatedProducts);
    };

    const handleProceedAnyway = async () => {
        if (pendingResult) {
            setIsProcessing(true);
            try {
                await saveProductToDb(pendingResult);
                resetManualForm();
                setShowModal(false);
            } catch (err: any) {
                alert("Error saving: " + err.message);
            } finally {
                setIsProcessing(false);
            }
        } else if (validationError) {
            // If warning exists but no pending result, it's the DB Mismatch Warning
            // User chose to proceed -> Force AI Analysis
            handleManualClassify(true);
        }
    };

    // --- Admin Actions ---
    const openEditModal = (product: Product) => {
        setEditingProduct(product);
        setEditTaxCode(product.tax_code);
        setEditName(product.name);
        setEditDesc(product.user_description || '');
        setEditImage(product.image_base64);
    };

    const handleUpdateProduct = async () => {
        if (!editingProduct || !user) return;

        setIsUpdating(true);
        try {
            // 1. Get Details for the manually selected tax code
            const selectedTaxRef = taxCodes.find(tc => tc.code === editTaxCode && tc.country === editingProduct.country);

            if (!selectedTaxRef) {
                throw new Error("Selected tax code details not found.");
            }

            const countryName = COUNTRIES.find(c => c.code === editingProduct.country)?.name || editingProduct.country;

            // 2. Call AI to Recalculate Confidence based on this manual assignment and EDITED fields
            const aiResult = await recalculateConfidence(
                editName,
                editDesc,
                editImage,
                countryName,
                selectedTaxRef
            );

            // 3. Update Database with new tax code AND new confidence AND new product details
            await updateProduct(editingProduct.id!, {
                name: editName,
                user_description: editDesc,
                image_base64: editImage,
                tax_code: editTaxCode,
                country: editingProduct.country,
                is_flagged: false, // Auto un-flag
                confidence: aiResult.confidence,
                ai_vision_analysis: aiResult.ai_vision_analysis,
                confidence_reasoning: aiResult.confidence_reasoning
            });

            // Refresh list
            const updatedProducts = await fetchProducts(user.id, user.role);
            setProducts(updatedProducts);
            setEditingProduct(null);
        } catch (err: any) {
            alert("Update failed: " + err.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const openViewModal = (product: Product) => {
        setViewingProduct(product);
    };

    // --- User Management Handlers ---
    const fetchUsersForAdmin = async () => {
        try {
            const users = await fetchAllUsers();
            setUsersList(users);
            setShowUsersModal(true);
        } catch (e: any) {
            alert("Failed to fetch users: " + e.message);
        }
    };

    const handleDeleteUser = async (id: number, name: string) => {
        setUserToDelete({ id, name });
        setDeleteAdminPassword('');
        setDeleteUserError(null);
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete || !user) return;

        setIsDeletingUser(true);
        try {
            await deleteUser(userToDelete.id.toString(), {
                adminId: user.id.toString(),
                adminPassword: deleteAdminPassword
            });

            setUsersList(prev => prev.filter(u => u.id !== userToDelete.id));
            setUserToDelete(null); // Close modal
        } catch (e: any) {
            setDeleteUserError(e.message || "Delete failed");
        } finally {
            setIsDeletingUser(false);
        }
    };

    const handleViewUserActivity = (targetUser: AppUser) => {
        setViewingProductAs(targetUser);
        setShowUsersModal(false); // Close modal to view dashboard
    };

    // --- Metrics ---
    const totalItems = products.length;
    const flaggedItems = products.filter(p => p.is_flagged || p.tax_code === 'TC-UNKNOWN').length;
    const notFlagged = totalItems - flaggedItems;
    const avgConfidence = totalItems > 0
        ? (products.reduce((acc, p) => acc + (p.confidence || 0), 0) / totalItems).toFixed(1)
        : "0.0";

    const displayedProducts = filterFlagged
        ? products.filter(p => p.is_flagged || p.tax_code === 'TC-UNKNOWN')
        : products;


    // --- RENDER: ANIMATION STYLES (Shared) ---
    const AnimationStyles = () => (
        <style>{`
          @keyframes blob {
              0% { transform: translate(0px, 0px) scale(1); }
              33% { transform: translate(30px, -50px) scale(1.1); }
              66% { transform: translate(-20px, 20px) scale(0.9); }
              100% { transform: translate(0px, 0px) scale(1); }
          }
          .animate-blob {
              animation: blob 7s infinite;
          }
          .animation-delay-2000 {
              animation-delay: 2s;
          }
          .animation-delay-4000 {
              animation-delay: 4s;
          }
          @keyframes shimmer {
              0% { transform: translateX(-150%) skewX(-15deg); }
              50% { transform: translateX(150%) skewX(-15deg); }
              100% { transform: translateX(150%) skewX(-15deg); }
          }
          .animate-shimmer {
              animation: shimmer 8s infinite linear;
          }
      `}</style>
    );

    const BackgroundBlobs = () => (
        <>
            <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-indigo-600/20 rounded-full blur-[100px] animate-blob mix-blend-screen pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-purple-600/20 rounded-full blur-[100px] animate-blob animation-delay-2000 mix-blend-screen pointer-events-none"></div>
            <div className="absolute top-[20%] right-[20%] w-[20rem] h-[20rem] bg-blue-500/10 rounded-full blur-[80px] animate-blob animation-delay-4000 pointer-events-none"></div>
        </>
    );

    // Reusable Theme Toggle Component
    const ThemeToggle: React.FC<{ absolute?: boolean }> = ({ absolute = false }) => (
        <button
            onClick={() => setDarkMode(!darkMode)}
            className={`${absolute ? 'absolute top-4 right-4' : ''} p-2 rounded-full transition-all duration-300 z-50 shadow-md ${darkMode ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
                }`}
            aria-label="Toggle Dark Mode"
        >
            {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
            )}
        </button>
    );


    // --- RENDER: LANDING PAGE ---
    if (!user && !landingSelection) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500 ${darkMode ? 'bg-[#0f1016]' : 'bg-gray-50'}`}>
                <AnimationStyles />
                <BackgroundBlobs />
                <ThemeToggle absolute />

                <div className="w-full max-w-4xl relative z-10 flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
                    <Logo darkMode={darkMode} className="h-24 w-24 mb-6 drop-shadow-[0_0_20px_rgba(99,102,241,0.5)]" />

                    <h1 className={`text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r mb-4 text-center tracking-tight drop-shadow-sm ${darkMode ? 'from-white via-indigo-100 to-indigo-200' : 'from-slate-900 via-indigo-800 to-slate-900'}`}>
                        10xClassify
                    </h1>

                    <p className={`text-lg md:text-xl mb-12 text-center max-w-2xl font-light ${darkMode ? 'text-indigo-200/60' : 'text-slate-600'}`}>
                        The Next-Gen Multimodal Tax Classification System.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
                        {/* ADMIN CARD */}
                        <button
                            onClick={() => { setLandingSelection('admin'); setAuthMode('login'); resetAuthForm(); }}
                            className={`group relative backdrop-blur-xl rounded-2xl p-8 border transition-all duration-300 hover:transform hover:-translate-y-1 flex flex-col items-center text-center overflow-hidden ${darkMode ? 'bg-white/5 border-white/10 hover:border-indigo-500/50 hover:shadow-[0_10px_40px_-10px_rgba(79,70,229,0.3)]' : 'bg-white border-gray-200 shadow-sm hover:shadow-xl hover:border-indigo-500/50'}`}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br transition-opacity opacity-0 group-hover:opacity-100 ${darkMode ? 'from-indigo-500/10' : 'from-indigo-500/5'} to-transparent`}></div>
                            <div className={`p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300 border ${darkMode ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-100'}`}>
                                <svg className={`w-8 h-8 ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <h3 className={`text-xl font-bold mb-2 relative z-10 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Admin Portal</h3>
                            <p className={`text-sm relative z-10 ${darkMode ? 'text-indigo-200/50' : 'text-slate-500'}`}>
                                Manage classifications, review flags, and update tax codes.
                            </p>
                        </button>

                        {/* USER CARD */}
                        <button
                            onClick={() => { setLandingSelection('user'); setAuthMode('login'); resetAuthForm(); }}
                            className={`group relative backdrop-blur-xl rounded-2xl p-8 border transition-all duration-300 hover:transform hover:-translate-y-1 flex flex-col items-center text-center overflow-hidden ${darkMode ? 'bg-white/5 border-white/10 hover:border-purple-500/50 hover:shadow-[0_10px_40px_-10px_rgba(147,51,234,0.3)]' : 'bg-white border-gray-200 shadow-sm hover:shadow-xl hover:border-purple-500/50'}`}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br transition-opacity opacity-0 group-hover:opacity-100 ${darkMode ? 'from-purple-500/10' : 'from-purple-500/5'} to-transparent`}></div>
                            <div className={`p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300 border ${darkMode ? 'bg-purple-500/20 border-purple-500/30' : 'bg-purple-50 border-purple-100'}`}>
                                <svg className={`w-8 h-8 ${darkMode ? 'text-purple-300' : 'text-purple-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <h3 className={`text-xl font-bold mb-2 relative z-10 ${darkMode ? 'text-white' : 'text-slate-900'}`}>User Portal</h3>
                            <p className={`text-sm relative z-10 ${darkMode ? 'text-indigo-200/50' : 'text-slate-500'}`}>
                                Upload products, view history, and get instant tax analysis.
                            </p>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER: LOGIN / SIGNUP SCREEN ---
    if (!user) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500 ${darkMode ? 'bg-[#0f1016]' : 'bg-gray-50'}`}>
                <AnimationStyles />
                <BackgroundBlobs />
                <ThemeToggle absolute />

                <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-8 relative z-10 animate-in fade-in zoom-in-95 duration-500 overflow-hidden group ${darkMode ? 'bg-white/5 backdrop-blur-2xl border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]' : 'bg-white border-white/40'}`}>
                    {/* Back Button */}
                    <button
                        onClick={() => { setLandingSelection(null); resetAuthForm(); setAuthMode('login'); }}
                        className={`absolute top-4 left-4 transition-colors p-2 rounded-full ${darkMode ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-slate-900 hover:bg-gray-200'}`}
                        title="Back to Selection"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>

                    {/* Shimmer Effect on Card */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-shimmer"></div>
                    </div>

                    {/* Inner shine effect */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"></div>

                    {/* Background Decor */}
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-full pointer-events-none blur-2xl ${landingSelection === 'admin' ? 'bg-indigo-500/10' : 'bg-purple-500/10'}`}></div>

                    <div className="flex flex-col items-center mb-8 relative z-10">
                        <Logo darkMode={darkMode} className="h-16 w-16 mb-4 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                        <h2 className={`text-2xl font-bold drop-shadow-sm text-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {authMode === 'login'
                                ? (landingSelection === 'admin' ? 'Admin Portal' : 'User Portal')
                                : authMode === 'signup'
                                    ? 'Create 10xClassify Account'
                                    : 'Reset Password'}
                        </h2>
                        <p className={`text-sm mt-2 text-center ${darkMode ? 'text-indigo-200/70' : 'text-slate-500'}`}>
                            {authMode === 'login'
                                ? (landingSelection === 'admin' ? 'Restricted Access for Administrators' : 'Access your intelligent tax catalogue')
                                : authMode === 'signup'
                                    ? 'Start automating your tax classification'
                                    : (isOtpVerified ? 'Set your new password' : 'Recover your account access')}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4 relative z-10" autoComplete="off">
                        {/* Hack to prevent Chrome autofill */}
                        <input type="email" name="fake_email_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
                        <input type="password" name="fake_password_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

                        {authError && (
                            <div className={`text-sm p-3 rounded-lg text-center backdrop-blur-sm animate-pulse border ${darkMode ? 'bg-red-500/20 border-red-500/30 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                {authError}
                            </div>
                        )}
                        {authSuccess && (
                            <div className={`text-sm p-3 rounded-lg text-center backdrop-blur-sm border ${darkMode ? 'bg-green-500/20 border-green-500/30 text-green-200' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                {authSuccess}
                            </div>
                        )}

                        {/* OTP UI - Used for both Signup Step 2 and Forgot Password Step 2/3 */}
                        {otpSent ? (
                            <div className={`border rounded-lg p-4 space-y-3 backdrop-blur-sm ${darkMode ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200'}`}>
                                {!isOtpVerified && (
                                    <div className={`flex items-center gap-2 text-sm mb-2 justify-center ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect width="20" height="16" x="2" y="4" rx="2" />
                                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                        </svg>
                                        <span>Verification code sent to <strong>{authEmail}</strong></span>
                                    </div>
                                )}

                                {fallbackOtpDisplay && !isOtpVerified && (
                                    <div className={`p-2 rounded text-center border ${darkMode ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'}`}>
                                        <p className={`text-xs mb-1 font-semibold uppercase ${darkMode ? 'text-yellow-500' : 'text-yellow-700'}`}>Dev Mode / Email Fail</p>
                                        <p className={`text-lg font-mono tracking-widest ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fallbackOtpDisplay}</p>
                                    </div>
                                )}

                                {(!isOtpVerified || authMode === 'signup') && (
                                    <div>
                                        <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-indigo-200/80' : 'text-slate-500'}`}>Enter Code</label>
                                        <input
                                            type="text"
                                            required
                                            maxLength={6}
                                            className={`w-full rounded-lg px-4 py-3 text-center text-lg tracking-[0.5em] font-mono focus:ring-2 focus:ring-indigo-500/50 outline-none backdrop-blur-sm border ${darkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-white border-gray-300 text-slate-900'}`}
                                            value={otpInput}
                                            onChange={e => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                                            disabled={isOtpVerified}
                                        />
                                    </div>
                                )}

                                {/* New Password Field - Only for Reset Password Flow (Step 3) */}
                                {authMode === 'forgot_password' && isOtpVerified && (
                                    <div className="mt-3 animate-in fade-in duration-300">
                                        <div className={`flex items-center gap-2 text-sm mb-4 justify-center ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="font-medium">Code Verified Successfully</span>
                                        </div>
                                        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>New Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                required
                                                className={`w-full rounded-lg pl-4 pr-10 py-2 focus:ring-2 focus:ring-indigo-500/50 outline-none backdrop-blur-sm border ${darkMode ? 'bg-black/20 border-white/10 text-white' : 'bg-white border-gray-300 text-slate-900'}`}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className={`absolute inset-y-0 right-0 pr-3 flex items-center transition-colors focus:outline-none ${darkMode ? 'text-indigo-300/50 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                {showPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!isOtpVerified && (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setAuthLoading(true);
                                                try {
                                                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                                                    setGeneratedOtp(code);
                                                    setOtpInput('');
                                                    const response = await sendOtp(authEmail, code);
                                                    if (!response.success && response.isFallback) {
                                                        setFallbackOtpDisplay(code);
                                                        setAuthError("Dev Mode: Code displayed below.");
                                                    } else if (response.success) {
                                                        setAuthSuccess("New code sent!");
                                                    }
                                                } catch (err: any) {
                                                    setAuthError(err.message);
                                                } finally {
                                                    setAuthLoading(false);
                                                }
                                            }}
                                            className={`text-xs font-medium transition-colors hover:underline ${darkMode ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}
                                        >
                                            Resend Verification Code
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setOtpSent(false); setGeneratedOtp(null); setFallbackOtpDisplay(null); }}
                                            className={`text-xs transition-colors hover:underline ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-indigo-600'}`}
                                        >
                                            Incorrect Email? Change it here
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Standard Fields */
                            <>
                                {authMode === 'signup' && (
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-indigo-200/80' : 'text-slate-600'}`}>Full Name</label>
                                        <input
                                            type="text"
                                            required
                                            className={`w-full border rounded-lg px-4 py-2.5 outline-none transition-all ${darkMode ? 'bg-black/20 border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-indigo-500/50' : 'bg-gray-50 border-gray-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/50'}`}
                                            value={authName}
                                            onChange={e => setAuthName(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-indigo-200/80' : 'text-slate-600'}`}>Email Address</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <svg className={`h-5 w-5 ${darkMode ? 'text-indigo-300/50' : 'text-slate-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect width="20" height="16" x="2" y="4" rx="2" />
                                                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                            </svg>
                                        </div>
                                        <input
                                            type="email"
                                            name="new-email-field"
                                            autoComplete="off"
                                            required
                                            className={`w-full border rounded-lg pl-10 pr-4 py-2.5 outline-none transition-all disabled:opacity-50 ${darkMode ? 'bg-black/20 border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-indigo-500/50' : 'bg-gray-50 border-gray-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/50'}`}
                                            value={authEmail}
                                            onChange={e => setAuthEmail(e.target.value)}
                                            disabled={otpSent}
                                        />
                                    </div>
                                </div>

                                {/* Password Field - Only for Login and Signup (Not Forgot Step 1) */}
                                {authMode !== 'forgot_password' && (
                                    <div>
                                        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-indigo-200/80' : 'text-slate-600'}`}>Password</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <svg className={`h-5 w-5 ${darkMode ? 'text-indigo-300/50' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                            </div>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="new-password-field"
                                                autoComplete="new-password"
                                                required
                                                className={`w-full border rounded-lg pl-10 pr-10 py-2.5 outline-none transition-all disabled:opacity-50 ${darkMode ? 'bg-black/20 border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-indigo-500/50' : 'bg-gray-50 border-gray-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/50'}`}
                                                value={authPass}
                                                onChange={e => setAuthPass(e.target.value)}
                                                disabled={otpSent}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className={`absolute inset-y-0 right-0 pr-3 flex items-center transition-colors focus:outline-none ${darkMode ? 'text-indigo-300/50 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                            >
                                                {showPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                        {authMode === 'login' && (
                                            <div className="flex justify-end mt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => { setAuthMode('forgot_password'); resetAuthForm(); }}
                                                    className={`text-xs transition-colors ${darkMode ? 'text-indigo-300 hover:text-white' : 'text-indigo-600 hover:text-indigo-800'}`}
                                                >
                                                    Forgot Password?
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={authLoading}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-2.5 rounded-lg transition-all flex justify-center items-center mt-6 shadow-lg shadow-indigo-500/30 border border-white/10 transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {authLoading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                authMode === 'login' ? 'Sign In' :
                                    authMode === 'forgot_password' ?
                                        (!otpSent ? 'Send Reset Code' : (!isOtpVerified ? 'Verify Code' : 'Reset Password')) :
                                        (otpSent ? 'Verify & Create Account' : 'Send Verification Code')
                            )}
                        </button>
                    </form>

                    <div className={`mt-6 text-center text-sm relative z-10 ${darkMode ? 'text-indigo-200/60' : 'text-slate-500'}`}>
                        {authMode === 'login' ? (
                            <>
                                {/* Only show Sign Up for User portal */}
                                {landingSelection === 'user' ? (
                                    <>
                                        Don't have an account?
                                        <button
                                            onClick={() => { setAuthMode('signup'); resetAuthForm(); }}
                                            className={`font-medium ml-1 transition-colors ${darkMode ? 'text-white hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-800'}`}
                                        >
                                            Create 10xClassify Account
                                        </button>
                                    </>
                                ) : (
                                    <span className={`text-xs italic ${darkMode ? 'text-white/30' : 'text-slate-400'}`}>Admin registration is invite only.</span>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={() => { setAuthMode('login'); resetAuthForm(); }}
                                className={`font-medium flex items-center justify-center w-full gap-1 transition-colors ${darkMode ? 'text-indigo-300 hover:text-white' : 'text-indigo-600 hover:text-indigo-800'}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back to Sign In
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER: APP INIT LOADING ---
    if (!isDbReady) {
        if (dbError) {
            return (
                <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-[#11121d]' : 'bg-gray-50'}`}>
                    <ThemeToggle absolute />
                    <div className={`w-full max-w-3xl rounded-xl shadow-2xl p-8 border ${darkMode ? 'bg-[#1a1b2e] border-red-500/20' : 'bg-white border-red-200'}`}>
                        <div className="flex items-center gap-4 mb-6 text-red-400">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <h1 className="text-2xl font-bold">Database Connection Failed</h1>
                        </div>
                        <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                            The application could not connect to Google Cloud Firestore.
                            Please ensure your project is properly configured and the service account credentials are valid.
                        </p>

                        <div className={`p-4 rounded-lg text-sm font-mono border ${darkMode ? 'bg-[#11121d] border-red-500/20 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            {dbError}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => window.location.reload()}
                                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
                            >
                                Retry Connection
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 ${darkMode ? 'bg-[#11121d]' : 'bg-gray-50'}`}>
                <ThemeToggle absolute />
                <div className="relative flex flex-col items-center">
                    <div className="relative mb-6">
                        <Logo darkMode={darkMode} className="h-24 w-24 animate-pulse" />
                        <div className={`absolute -inset-4 blur-xl rounded-full animate-pulse z-[-1] ${darkMode ? 'bg-indigo-500/20' : 'bg-indigo-500/10'}`}></div>
                    </div>
                    <h1 className={`text-4xl font-bold tracking-tight animate-pulse ${darkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-indigo-400' : 'text-indigo-600'}`}>
                        10xClassify
                    </h1>
                    <p className={`mt-4 text-sm ${darkMode ? 'text-indigo-200/50' : 'text-slate-500'}`}>
                        Initializing 10xClassify System...
                    </p>
                </div>
            </div>
        );
    }

    // --- RENDER: MAIN DASHBOARD ---
    return (
        <div className={`min-h-screen font-sans selection:bg-indigo-500/30 transition-colors duration-500 ${darkMode ? 'bg-[#11121d] text-slate-200' : 'bg-white text-slate-800'}`}>

            {/* Navbar */}
            <nav className={`border-b backdrop-blur-md sticky top-0 z-40 ${darkMode ? 'border-white/5 bg-[#1a1b2e]/50' : 'border-gray-200 bg-white/80'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-3">
                            <Logo darkMode={darkMode} className="h-8 w-8" />
                            <span className={`text-xl font-bold tracking-tight ${darkMode ? 'bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400' : 'text-slate-900'}`}>
                                10xClassify
                            </span>
                            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${darkMode ? 'bg-white/5 text-slate-400 border-white/5' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                {user.role} View
                            </span>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="text-right hidden sm:block">
                                    <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{user.name}</div>
                                    <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{user.email}</div>
                                </div>
                                <ThemeToggle />
                                <button
                                    onClick={initiateLogout}
                                    className={`p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-gray-100'}`}
                                    title="Sign Out"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Impersonation Banner */}
                {viewingProductAs && (
                    <div className="mb-6 rounded-xl bg-gradient-to-r from-indigo-950/80 to-purple-950/80 backdrop-blur-md p-4 text-white shadow-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 border border-indigo-500/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-full border border-indigo-400/20">
                                <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-100">Viewing as: {viewingProductAs.name}</h3>
                                <p className="text-xs text-slate-400">You are currently viewing this user's product dashboard.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setViewingProductAs(null)}
                            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-4 py-2 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Exit View
                        </button>
                    </div>
                )}

                {/* Admin Dashboard Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className={`rounded-xl p-6 border shadow-xl relative overflow-hidden group transition-colors ${darkMode ? 'bg-[#1a1b2e] border-white/5' : 'bg-white border-gray-200'}`}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className={`w-16 h-16 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 v2M7 7h10" />
                            </svg>
                        </div>
                        <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Catalogue Items</p>
                        <p className={`text-4xl font-bold mt-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{totalItems}</p>
                    </div>

                    <div className={`rounded-xl p-6 border shadow-xl relative overflow-hidden group transition-colors ${darkMode ? 'bg-[#1a1b2e] border-white/5' : 'bg-white border-gray-200'}`}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className="w-16 h-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <p className="text-red-400 text-sm font-medium">Flagged Items</p>
                        <p className={`text-4xl font-bold mt-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{flaggedItems}</p>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{totalItems > 0 ? ((flaggedItems / totalItems) * 100).toFixed(0) : 0}% of total</p>
                    </div>

                    <div className={`rounded-xl p-6 border shadow-xl relative overflow-hidden group transition-colors ${darkMode ? 'bg-[#1a1b2e] border-white/5' : 'bg-white border-gray-200'}`}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className="w-16 h-16 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-green-400 text-sm font-medium">Approved</p>
                        <p className={`text-4xl font-bold mt-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{notFlagged}</p>
                    </div>

                    <div className={`rounded-xl p-6 border shadow-xl relative overflow-hidden group transition-colors ${darkMode ? 'bg-[#1a1b2e] border-white/5' : 'bg-white border-gray-200'}`}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className={`w-16 h-16 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 v14a2 2 0 002 2h2a2 2 0 002-2z" />
                            </svg>
                        </div>
                        <p className={`text-sm font-medium ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Average Confidence</p>
                        <p className={`text-4xl font-bold mt-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{avgConfidence}%</p>
                    </div>
                </div>


                {/* Data Grid Section */}
                <div className={`rounded-xl border shadow-xl overflow-hidden transition-colors ${darkMode ? 'bg-[#1a1b2e] border-white/5' : 'bg-white border-gray-200'}`}>
                    <div className={`px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${darkMode ? 'border-white/5' : 'border-gray-200'}`}>
                        <div>
                            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Product Catalogue</h3>
                            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>All classified products with tax codes and confidence scores</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center cursor-pointer relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={filterFlagged}
                                    onChange={(e) => setFilterFlagged(e.target.checked)}
                                />
                                <div className={`w-9 h-5 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-600 peer-checked:to-purple-600 ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
                                <span className={`ml-2 text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Show flagged only</span>
                            </label>

                            {/* View Tax Reference Button */}
                            <button
                                onClick={() => setShowTaxRefModal(true)}
                                className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border transition-all transform hover:scale-[1.02] ${darkMode ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-white border-gray-200 text-slate-700 hover:bg-gray-50'}`}
                            >
                                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Tax Reference
                            </button>

                            {/* Knowledge Base Button for Admin */}
                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => setShowKBModal(true)}
                                    className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border transition-all transform hover:scale-[1.02] ${darkMode ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-white border-gray-200 text-slate-700 hover:bg-gray-50'}`}
                                >
                                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    Knowledge Base
                                </button>
                            )}

                            {/* Manage Users Button for Admin */}
                            {user?.role === 'admin' && (
                                <button
                                    onClick={fetchUsersForAdmin}
                                    className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border transition-all transform hover:scale-[1.02] ${darkMode ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-white border-gray-200 text-slate-700 hover:bg-gray-50'}`}
                                >
                                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                    Manage Users
                                </button>
                            )}

                            {/* New Classification Button */}
                            {user.role === 'user' && (
                                <button
                                    onClick={() => { resetManualForm(); setShowModal(true); }}
                                    className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25 transition-all transform hover:scale-[1.02]"
                                >
                                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    New Classification
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className={`min-w-full divide-y ${darkMode ? 'divide-white/5' : 'divide-gray-200'}`}>
                            <thead className={darkMode ? 'bg-[#151625]' : 'bg-gray-50'}>
                                <tr>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Item Name</th>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Country</th>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tax Code</th>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Rate</th>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status</th>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Confidence</th>
                                    <th scope="col" className={`px-6 py-3 text-center text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>AI Analysis</th>
                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Flag</th>
                                    {user.role === 'admin' && (
                                        <th scope="col" className={`px-6 py-3 text-right text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${darkMode ? 'divide-white/5 bg-[#1a1b2e]' : 'divide-gray-100 bg-white'}`}>
                                {displayedProducts.map((product) => {
                                    const isFlagged = product.is_flagged || product.tax_code === 'TC-UNKNOWN';
                                    return (
                                        <tr key={product.id} className={`transition-colors group ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center cursor-pointer" onClick={() => openViewModal(product)}>
                                                    <div className={`h-10 w-10 flex-shrink-0 rounded overflow-hidden border relative ${darkMode ? 'bg-slate-700 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                                                        {product.image_base64 && !product.image_base64.includes('[TRUNCATED]') ? (
                                                            <img
                                                                className="h-full w-full object-cover"
                                                                src={product.image_base64.startsWith('data:') ? product.image_base64 : `data:image/jpeg;base64,${product.image_base64}`}
                                                                alt=""
                                                            />
                                                        ) : (
                                                            <div className={`flex h-full w-full items-center justify-center text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>N/A</div>
                                                        )}
                                                        {/* Overlay hint for view */}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className={`text-sm font-medium transition-colors ${darkMode ? 'text-white group-hover:text-indigo-400' : 'text-slate-900 group-hover:text-indigo-600'}`}>{product.name}</div>
                                                        <div className={`text-xs truncate max-w-[150px] ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{product.user_description}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Country Column */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`text-sm font-mono px-2 py-1 rounded ${darkMode ? 'text-slate-400 bg-white/5' : 'text-slate-600 bg-gray-100'}`}>
                                                    {product.country || 'US'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${product.tax_code === 'TC-UNKNOWN'
                                                    ? (darkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200')
                                                    : (darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-gray-100 text-slate-700 border-gray-200')
                                                    }`}>
                                                    {product.tax_code}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {product.TaxCodeReference?.rate !== undefined
                                                    ? `${(product.TaxCodeReference.rate * 100).toFixed(0)}%`
                                                    : 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${darkMode ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                                    classified
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                                                {product.confidence}%
                                            </td>
                                            {/* New AI Analysis Column */}
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openViewModal(product);
                                                    }}
                                                    className={`p-2 rounded-full transition-colors inline-flex items-center justify-center ${darkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-white/5' : 'text-slate-400 hover:text-indigo-600 hover:bg-gray-100'}`}
                                                    title="View AI Analysis"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {isFlagged ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                                                        <svg className="mr-1.5 h-2 w-2 text-red-400" fill="currentColor" viewBox="0 0 8 8">
                                                            <circle cx="4" cy="4" r="3" />
                                                        </svg>
                                                        Flagged
                                                    </span>
                                                ) : (
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${darkMode ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-gray-100 text-slate-500 border-gray-200'}`}>
                                                        Safe
                                                    </span>
                                                )}
                                            </td>
                                            {/* Actions Column - Only for Admin */}
                                            {user.role === 'admin' && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    {(isFlagged || (product.confidence !== undefined && product.confidence < 90)) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditModal(product);
                                                            }}
                                                            className={`px-3 py-1 rounded transition-colors ${darkMode ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                                {displayedProducts.length === 0 && (
                                    <tr>
                                        <td colSpan={user.role === 'admin' ? 9 : 8} className="px-6 py-12 text-center text-sm text-slate-500 italic">
                                            No products found matching your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Tax Reference Modal */}
            {showTaxRefModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => setShowTaxRefModal(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div className={`relative inline-block align-bottom rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl w-full border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>
                            <div className={`px-6 py-4 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-[#151625]' : 'border-gray-200 bg-gray-50'}`}>
                                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Tax Code Knowledge Base</h3>
                                <button
                                    onClick={() => setShowTaxRefModal(false)}
                                    className={`p-1 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-900 hover:bg-gray-200'}`}
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className={`p-6 max-h-[70vh] overflow-y-auto ${darkMode ? 'bg-[#1a1b2e]' : 'bg-white'}`}>
                                <TaxReferenceList darkMode={darkMode} />
                            </div>
                            <div className={`px-6 py-4 border-t flex justify-end ${darkMode ? 'border-white/5 bg-[#151625]' : 'border-gray-200 bg-gray-50'}`}>
                                <button
                                    onClick={() => setShowTaxRefModal(false)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => setShowLogoutConfirm(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div className={`relative inline-block align-bottom rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm w-full border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>
                            <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100/10 sm:mx-0 sm:h-10 sm:w-10">
                                        <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                        <h3 className={`text-lg leading-6 font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`} id="modal-title">Sign Out</h3>
                                        <div className="mt-2">
                                            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                                Are you sure you want to sign out? You will need to log in again to access the catalogue.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className={`px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t ${darkMode ? 'bg-[#151625] border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                                <button
                                    type="button"
                                    className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors"
                                    onClick={confirmLogout}
                                >
                                    Sign Out
                                </button>
                                <button
                                    type="button"
                                    className={`mt-3 w-full inline-flex justify-center rounded-lg border shadow-sm px-4 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors ${darkMode ? 'bg-[#1a1b2e] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50'}`}
                                    onClick={() => setShowLogoutConfirm(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal - New Classification */}
            {showModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => !isProcessing && setShowModal(false)}></div>

                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div className={`relative inline-block align-bottom rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>

                            {/* Processing Overlay */}
                            {(isProcessing || isBulkComplete) && (
                                <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center animate-in fade-in duration-300 p-8 ${darkMode ? 'bg-[#1a1b2e]/95' : 'bg-white/95'}`}>
                                    <div className="relative">
                                        <Logo darkMode={darkMode} className="h-16 w-16 animate-bounce" />
                                        <div className="absolute -inset-4 bg-indigo-500/20 blur-xl rounded-full animate-pulse z-[-1]"></div>
                                    </div>

                                    {isBulkComplete && (
                                        <button
                                            onClick={() => { setIsBulkComplete(false); setShowModal(false); }}
                                            className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${darkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white' : 'bg-gray-100 text-slate-400 hover:bg-gray-200 hover:text-slate-600'}`}
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}

                                    <p className={`mt-4 text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                        {classificationMode === 'bulk'
                                            ? (isBulkComplete ? 'Upload Complete' : 'Processing Bulk Upload')
                                            : (taxDocFile ? 'Analysing Uploaded Document' : 'Analysing Product')}
                                    </p>

                                    {classificationMode === 'bulk' ? (
                                        <div className="w-full mt-4">
                                            <div className={`w-full rounded-full h-2.5 mb-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                                                <div className={`h-2.5 rounded-full transition-all duration-300 ${isBulkComplete ? 'bg-green-500' : 'bg-indigo-600'}`} style={{ width: `${bulkProgress}%` }}></div>
                                            </div>
                                            <div className={`rounded p-2 h-32 overflow-y-auto text-xs font-mono border ${darkMode ? 'bg-[#11121d] border-white/5 text-slate-400' : 'bg-gray-50 border-gray-200 text-slate-600'}`}>
                                                {bulkProcessingLog.map((log, idx) => (
                                                    <div key={idx} className={`mb-1 ${log.includes('Skipped') || log.includes('Failed') ? 'text-red-400' : ''}`}>{log}</div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className={`mt-1 text-xs ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>Applying {COUNTRIES.find(c => c.code === selectedCountry)?.name} Tax Code Rules</p>
                                    )}
                                </div>
                            )}

                            <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                        <h3 className={`text-xl leading-6 font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`} id="modal-title">New Classification</h3>

                                        {/* Tabs */}
                                        <div className={`flex justify-between items-center border-b mt-4 mb-4 ${darkMode ? 'border-white/10' : 'border-gray-200'}`}>
                                            <button
                                                className={`pb-2 px-2 text-sm font-medium transition-colors ${classificationMode === 'manual' ? 'text-indigo-500 border-b-2 border-indigo-500' : (darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-indigo-600')}`}
                                                onClick={() => { setClassificationMode('manual'); setValidationError(null); }}
                                            >
                                                Manual Entry
                                            </button>
                                            <button
                                                className={`pb-2 px-2 text-sm font-medium transition-colors ${classificationMode === 'bulk' ? 'text-indigo-500 border-b-2 border-indigo-500' : (darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-indigo-600')}`}
                                                onClick={() => { setClassificationMode('bulk'); setValidationError(null); }}
                                            >
                                                Bulk Upload
                                            </button>
                                        </div>

                                        {/* MISMATCH WARNING ALERT */}
                                        {classificationMode === 'manual' && validationError && (
                                            <div className="mb-6 bg-red-900/20 border-l-4 border-red-500 p-4 animate-in fade-in slide-in-from-top-4">
                                                <div className="flex items-start">
                                                    <div className="flex-shrink-0">
                                                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                    <div className="ml-3">
                                                        <h3 className="text-sm font-medium text-red-400">Mismatch Detected</h3>
                                                        <div className="mt-2 text-sm text-red-300">
                                                            <p>{validationError}</p>
                                                        </div>
                                                        <p className={`mt-2 text-xs italic ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                                            You can edit the details below and retry, or proceed anyway (this will likely flag the item as unknown).
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {classificationMode === 'manual' ? (
                                            /* MANUAL FORM */
                                            <div className="space-y-4 animate-in fade-in duration-300">
                                                <div>
                                                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Country <span className="text-red-400">*</span></label>
                                                    <select
                                                        value={selectedCountry}
                                                        onChange={(e) => setSelectedCountry(e.target.value)}
                                                        className={`mt-1 block w-full border rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${darkMode ? 'bg-[#11121d] border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-900'}`}
                                                    >
                                                        {COUNTRIES.map(c => (
                                                            <option key={c.code} value={c.code}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Product Name <span className="text-red-400">*</span></label>
                                                    <input
                                                        type="text"
                                                        required
                                                        className={`mt-1 block w-full border rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${darkMode ? 'bg-[#11121d] border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-900'} ${validationError ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}
                                                        value={productName}
                                                        onChange={(e) => setProductName(e.target.value)}
                                                    />
                                                </div>

                                                <div>
                                                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Description (optional)</label>
                                                    <textarea
                                                        className={`mt-1 block w-full border rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${darkMode ? 'bg-[#11121d] border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-900'} ${validationError ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}
                                                        rows={3}
                                                        value={productDesc}
                                                        onChange={(e) => setProductDesc(e.target.value)}
                                                    />
                                                </div>

                                                <div>
                                                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Product Image (optional)</label>
                                                    <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${darkMode ? 'bg-[#11121d] border-slate-700 hover:border-indigo-500' : 'bg-gray-50 border-gray-300 hover:border-indigo-500'} ${validationError ? 'border-red-500/50' : ''}`}>
                                                        <div className="space-y-1 text-center">
                                                            {selectedImage ? (
                                                                <div className="relative">
                                                                    <img src={selectedImage} alt="Preview" className="mx-auto h-48 object-contain rounded" />
                                                                    <button
                                                                        onClick={() => setSelectedImage(null)}
                                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <svg className={`mx-auto h-12 w-12 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                                                    </svg>
                                                                    <div className={`flex text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                        <label className="relative cursor-pointer rounded-md font-medium text-indigo-500 hover:text-indigo-400 focus-within:outline-none">
                                                                            <span>Upload a file</span>
                                                                            <input type="file" className="sr-only" accept="image/*" onChange={handleImageUpload} />
                                                                        </label>
                                                                        <p className="pl-1">or drag and drop</p>
                                                                    </div>
                                                                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>PNG, JPG, GIF up to 5MB</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* BULK UPLOAD FORM */
                                            <div className="space-y-6 animate-in fade-in duration-300">
                                                <div className={`border rounded-lg p-4 ${darkMode ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'}`}>
                                                    <h4 className={`text-sm font-bold mb-2 ${darkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>Instructions</h4>
                                                    <ul className={`text-xs space-y-1 list-disc list-outside ml-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                                        <li>Upload an Excel (.xlsx) or CSV file.</li>
                                                        <li>Required columns: <strong>Product Name</strong> (or Item Name), <strong>Serial Number</strong>, <strong>Country</strong> (e.g. IN, US)</li>
                                                        <li>Optional columns: <strong>Description</strong>, <strong>Image URL</strong>.</li>
                                                    </ul>
                                                </div>

                                                <div className={`flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${darkMode ? 'bg-[#11121d] border-slate-700 hover:border-indigo-500' : 'bg-gray-50 border-gray-300 hover:border-indigo-500'}`}>
                                                    <div className="space-y-1 text-center">
                                                        <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        <div className={`flex text-sm justify-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            <label className="relative cursor-pointer rounded-md font-medium text-indigo-400 hover:text-indigo-500 focus-within:outline-none">
                                                                <span>Upload Spreadsheet</span>
                                                                <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleBulkFileUpload} />
                                                            </label>
                                                        </div>
                                                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>.XLSX or .CSV files</p>
                                                    </div>
                                                </div>

                                                {bulkFile && (
                                                    <div className={`text-center text-sm font-medium py-2 rounded ${darkMode ? 'text-white bg-slate-800' : 'text-slate-900 bg-gray-100'}`}>
                                                        Selected: <span className={`font-bold ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>{bulkFile.name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={`px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t gap-3 ${darkMode ? 'bg-[#151625] border-white/5' : 'bg-gray-50 border-gray-200'}`}>

                                {/* Logic for Buttons based on Validation State */}
                                {validationError ? (
                                    <>
                                        <button
                                            type="button"
                                            className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm transition-all"
                                            onClick={handleManualClassify} // Re-analyze logic same as initial
                                            disabled={isProcessing}
                                        >
                                            {isProcessing ? 'Processing...' : 'Re-Analyze Details'}
                                        </button>

                                        <button
                                            type="button"
                                            className={`w-full inline-flex justify-center rounded-lg border shadow-sm px-4 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm transition-all ${darkMode ? 'bg-red-900/20 border-red-500/30 text-red-200 hover:bg-red-900/40' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
                                            onClick={handleProceedAnyway}
                                            disabled={isProcessing}
                                        >
                                            Proceed Anyway
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={classificationMode === 'manual' ? handleManualClassify : processBulkFile}
                                        disabled={isProcessing || (classificationMode === 'bulk' && !bulkFile)}
                                    >
                                        {isProcessing ? 'Processing...' : (classificationMode === 'manual' ? 'Run Analysis' : 'Process Bulk File')}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    className={`mt-3 w-full inline-flex justify-center rounded-lg border shadow-sm px-4 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-0 sm:w-auto sm:text-sm transition-colors ${darkMode ? 'bg-[#1a1b2e] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50'}`}
                                    onClick={() => setShowModal(false)}
                                    disabled={isProcessing}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Admin Edit Modal */}
            {
                editingProduct && (
                    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                            <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => !isUpdating && setEditingProduct(null)}></div>
                            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                            <div className={`relative inline-block align-bottom rounded-xl text-left overflow-y-auto shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border max-h-[80vh] ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>
                                <div className="px-4 pt-5 pb-4 sm:p-6">
                                    <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Edit Classification Details</h3>

                                    <div className="space-y-4">
                                        {/* Editable Name */}
                                        <div>
                                            <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Product Name</label>
                                            <input
                                                type="text"
                                                className={`mt-1 block w-full border rounded-lg shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${darkMode ? 'bg-[#11121d] border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-900'}`}
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                            />
                                        </div>

                                        {/* Editable Description */}
                                        <div>
                                            <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Description (optional)</label>
                                            <textarea
                                                className={`mt-1 block w-full border rounded-lg shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${darkMode ? 'bg-[#11121d] border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-900'}`}
                                                rows={2}
                                                value={editDesc}
                                                onChange={(e) => setEditDesc(e.target.value)}
                                            />
                                        </div>

                                        {/* Editable Image */}
                                        <div>
                                            <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Product Image (optional)</label>
                                            <div className="mt-1 flex items-center gap-4">
                                                <div className={`h-16 rounded overflow-hidden flex-shrink-0 border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-100 border-gray-200'} w-16`}>
                                                    {editImage && !editImage.includes('[TRUNCATED]') ? (
                                                        <img src={editImage} alt="Product" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                                            {editImage && editImage.includes('[TRUNCATED]') ? 'Too Large' : 'None'}
                                                        </div>
                                                    )}
                                                </div>
                                                <label className={`cursor-pointer py-1.5 px-3 rounded text-xs font-medium transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-slate-700 border border-gray-300'}`}>
                                                    Change Image
                                                    <input type="file" className="hidden" accept="image/*" onChange={handleEditImageUpload} />
                                                </label>
                                                {editImage && (
                                                    <button
                                                        onClick={() => setEditImage(null)}
                                                        className="text-xs text-red-500 hover:text-red-600 underline"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Tax Code Selection */}
                                        <div className={`pt-2 border-t ${darkMode ? 'border-white/10' : 'border-gray-200'}`}>
                                            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Assign Correct Tax Code ({editingProduct.country})</label>
                                            <TaxCodeSelector
                                                value={editTaxCode}
                                                onChange={(code) => setEditTaxCode(code)}
                                                taxCodes={taxCodes}
                                                country={editingProduct.country}
                                                darkMode={darkMode}
                                            />
                                            <p className="text-xs text-slate-500 mt-2">
                                                Changing these details will trigger the AI to recalculate the confidence score based on the new match.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            onClick={() => setEditingProduct(null)}
                                            className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${darkMode ? 'bg-[#1a1b2e] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50'}`}
                                            disabled={isUpdating}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleUpdateProduct}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-medium flex items-center gap-2"
                                            disabled={isUpdating}
                                        >
                                            {isUpdating ? 'Validating...' : 'Update & Re-Analyze'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Product View Modal */}
            {
                viewingProduct && (
                    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                            <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => setViewingProduct(null)}></div>
                            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                            <div className={`relative inline-block align-bottom rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>

                                <div className={`relative h-48 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                                    {viewingProduct.image_base64 && !viewingProduct.image_base64.includes('[TRUNCATED]') ? (
                                        <img
                                            src={viewingProduct.image_base64.startsWith('data:') ? viewingProduct.image_base64 : `data:image/jpeg;base64,${viewingProduct.image_base64}`}
                                            alt={viewingProduct.name}
                                            className="w-full h-full object-cover opacity-60"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                                            {viewingProduct.image_base64 && viewingProduct.image_base64.includes('[TRUNCATED]') ? "Image Data Exceeded Limit" : "No Image Provided"}
                                        </div>
                                    )}
                                    <div className={`absolute inset-0 bg-gradient-to-t to-transparent ${darkMode ? 'from-[#1a1b2e]' : 'from-white'}`}></div>
                                    <div className="absolute bottom-4 left-6">
                                        <h2 className={`text-2xl font-bold shadow-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{viewingProduct.name}</h2>
                                        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{viewingProduct.country} Market</p>
                                    </div>
                                    <button
                                        onClick={() => setViewingProduct(null)}
                                        className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white rounded-full p-2 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="px-6 py-6 space-y-6">
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-[#11121d] border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                                            <p className={`text-xs uppercase font-semibold mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Confidence Score</p>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-2xl font-bold ${(viewingProduct.confidence || 0) >= 90 ? (darkMode ? 'text-green-400' : 'text-green-600') :
                                                    (viewingProduct.confidence || 0) >= 70 ? (darkMode ? 'text-yellow-400' : 'text-yellow-600') : (darkMode ? 'text-red-400' : 'text-red-600')
                                                    }`}>
                                                    {viewingProduct.confidence}%
                                                </span>
                                                {(viewingProduct.confidence || 0) < 90 && (
                                                    <span className={`text-xs px-2 py-0.5 rounded border ${darkMode ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                        Low Confidence
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className={`p-4 rounded-xl border ${darkMode ? 'bg-[#11121d] border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                                            <p className={`text-xs uppercase font-semibold mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Classification</p>
                                            <p className={`text-2xl font-mono font-black ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>{viewingProduct.tax_code}</p>
                                            <p className={`text-sm mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                                                {taxCodes.find(tc => tc.code === viewingProduct.tax_code && tc.country === viewingProduct.country)?.category ||
                                                    (viewingProduct.ai_vision_analysis ?
                                                        viewingProduct.ai_vision_analysis.replace(/^Product classified as:\s*/, '').replace(/^FLAGGED.*?\n/, '').split('\n')[0].trim() :
                                                        'Unknown Category')}
                                            </p>
                                        </div>
                                    </div>

                                    {viewingProduct.ai_vision_analysis !== "Tax code assigned based on previous classification" && (
                                        <div>
                                            <h4 className={`text-sm font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                                <svg className={`w-4 h-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                AI Analysis & Reasoning
                                            </h4>

                                            <div className="space-y-6">
                                                {/* Extraction Hierarchy */}
                                                {viewingProduct.hierarchy && (
                                                    <div className="space-y-3">
                                                        <h5 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Extraction Hierarchy</h5>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {viewingProduct.hierarchy.split('|').map(s => s.trim()).filter(Boolean).map((step, idx) => {
                                                                const parts = step.split(':');
                                                                const label = parts[0] || '';
                                                                const content = parts.slice(1).join(':').trim();
                                                                return (
                                                                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${darkMode ? 'bg-[#1a1b2e]/50 border-white/5' : 'bg-white border-gray-100 shadow-sm'}`}>
                                                                        <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
                                                                            {idx + 1}
                                                                        </div>
                                                                        <div>
                                                                            <div className={`text-[10px] font-bold uppercase tracking-tighter ${darkMode ? 'text-indigo-400/70' : 'text-indigo-500/70'}`}>{label.trim()}</div>
                                                                            <div className={`text-xs font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{content}</div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Classification Logic */}
                                                {viewingProduct.reasoning && (
                                                    <div className="space-y-3">
                                                        <h5 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Classification Logic</h5>
                                                        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-[#11121d] border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                                                            <ul className="space-y-2">
                                                                {viewingProduct.reasoning.split(/(?=\d\.\s)|(?=\bStep \d:)/i).filter(Boolean).map((step: string, idx: number) => (
                                                                    <li key={idx} className="flex gap-2 text-xs leading-relaxed">
                                                                        <span className="text-indigo-400 font-bold flex-shrink-0">•</span>
                                                                        <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{step.trim().replace(/^\d\.\s/, '')}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Confidence Reasoning */}
                                                {viewingProduct.confidence_reasoning && (
                                                    <div className="space-y-3">
                                                        <h5 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Confidence Reasoning</h5>
                                                        <div className={`p-4 rounded-xl border-l-4 ${darkMode ? 'bg-indigo-900/10 border-indigo-500/50 text-indigo-200' : 'bg-indigo-50 border-indigo-500/50 text-indigo-800'}`}>
                                                            <p className="text-xs italic leading-relaxed">
                                                                "{viewingProduct.confidence_reasoning}"
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Flagged Status / No Code Warning */}
                                                {viewingProduct.tax_code === 'TC-UNKNOWN' && (
                                                    <div className={`p-4 rounded-lg border flex items-start gap-3 ${darkMode ? 'bg-red-900/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                        <div>
                                                            <p className="font-bold text-sm">No specific tax code assigned</p>
                                                            <p className="text-xs mt-1 opacity-80">The system was unable to find a high-confidence match. Manual review is required for this item.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className={`flex justify-end pt-4 border-t ${darkMode ? 'border-white/5' : 'border-gray-200'}`}>
                                        <button
                                            onClick={() => setViewingProduct(null)}
                                            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 hover:bg-slate-900'}`}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Floating Chatbot for Admin */}
            {
                user?.role === 'admin' && (
                    <Chatbot darkMode={darkMode} user={user} />
                )
            }

            {/* Manage Users Modal */}
            {
                showUsersModal && (
                    <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                            <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => setShowUsersModal(false)}></div>
                            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                            <div className={`relative inline-block align-bottom rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl w-full border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>
                                <div className={`px-6 py-4 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-[#14151f]' : 'border-gray-100 bg-gray-50'}`}>
                                    <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Manage Users</h3>
                                    <button onClick={() => setShowUsersModal(false)} className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-slate-500 hover:text-slate-900'}`}>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="p-6">
                                    <div className="overflow-x-auto">
                                        <table className={`min-w-full divide-y ${darkMode ? 'divide-white/5' : 'divide-gray-200'}`}>
                                            <thead className={darkMode ? 'bg-[#151625]' : 'bg-gray-50'}>
                                                <tr>
                                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Name</th>
                                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email</th>
                                                    <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Role</th>
                                                    <th scope="col" className={`px-6 py-3 text-right text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-gray-100'}`}>
                                                {usersList.map((u) => (
                                                    <tr key={u.id} className={darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                                                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{u.name}</td>
                                                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{u.email}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.role === 'admin'
                                                                ? (darkMode ? 'bg-purple-900/50 text-purple-200' : 'bg-purple-100 text-purple-800')
                                                                : (darkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-100 text-blue-800')
                                                                }`}>
                                                                {u.role}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-3">
                                                            <button
                                                                onClick={() => handleViewUserActivity(u)}
                                                                className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                                View
                                                            </button>
                                                            {u.id !== user?.id && u.role !== 'admin' && (
                                                                <button
                                                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                                                    className="text-red-600 hover:text-red-900 flex items-center gap-1"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                    Delete
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {usersList.length === 0 && (
                                            <div className={`text-center py-8 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                                No users found.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Secure Deletion Password Confirmation Modal */}
            {userToDelete && (
                <div className="fixed inset-0 z-[110] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => setUserToDelete(null)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div className={`relative inline-block align-bottom rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md w-full border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-gray-200'}`}>
                            <div className="px-4 pt-5 pb-4 sm:p-6">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        {deleteUserError && (
                                            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span>{deleteUserError}</span>
                                            </div>
                                        )}
                                        <h3 className={`text-lg leading-6 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`} id="modal-title">
                                            Confirm User Deletion
                                        </h3>
                                        <div className="mt-2">
                                            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                Are you sure you want to delete user <strong>"{userToDelete.name}"</strong>? This action cannot be undone.
                                            </p>
                                            <div className="mt-4">
                                                <label className={`block text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    Admin Password Required
                                                </label>
                                                <input
                                                    type="password"
                                                    value={deleteAdminPassword}
                                                    onChange={(e) => setDeleteAdminPassword(e.target.value)}
                                                    className={`block w-full border rounded-lg shadow-sm py-2 px-3 focus:ring-red-500 focus:border-red-500 sm:text-sm ${darkMode ? 'bg-[#11121d] border-slate-700 text-white' : 'bg-white border-gray-300 text-slate-900'}`}
                                                    placeholder="Enter your admin password"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className={`px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t gap-3 ${darkMode ? 'bg-[#151625] border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                                <button
                                    type="button"
                                    className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50"
                                    onClick={confirmDeleteUser}
                                    disabled={!deleteAdminPassword || isDeletingUser}
                                >
                                    {isDeletingUser ? 'Deleting...' : 'Delete User'}
                                </button>
                                <button
                                    type="button"
                                    className={`mt-3 w-full inline-flex justify-center rounded-lg border shadow-sm px-4 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors ${darkMode ? 'bg-[#1a1b2e] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50'}`}
                                    onClick={() => setUserToDelete(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Knowledge Base Modal */}
            {
                showKBModal && (
                    <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                            <div className="fixed inset-0 bg-black/80 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={() => setShowKBModal(false)}></div>
                            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                            <div className={`relative inline-block align-bottom rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl w-full border ${darkMode ? 'bg-[#0f1016] border-white/10' : 'bg-white border-gray-200'}`}>
                                <div className="absolute top-4 right-4 z-10">
                                    <button
                                        onClick={() => setShowKBModal(false)}
                                        className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white' : 'bg-gray-100 text-slate-400 hover:bg-gray-200 hover:text-slate-600'}`}
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <KnowledgeBaseManager darkMode={darkMode} />
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default App;
