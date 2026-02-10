import React, { useState, useMemo } from 'react';

interface TaxCode {
    code: string;
    category: string;
    rate: number;
    keywords?: string;
    country: string;
}

interface TaxCodeSelectorProps {
    value: string;
    onChange: (code: string) => void;
    taxCodes: TaxCode[];
    country: string;
    darkMode?: boolean;
}

const TaxCodeSelector: React.FC<TaxCodeSelectorProps> = ({
    value,
    onChange,
    taxCodes,
    country,
    darkMode = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCodeForDetails, setSelectedCodeForDetails] = useState<TaxCode | null>(null);

    // Filter tax codes by country and search query
    const filteredCodes = useMemo(() => {
        let codes = taxCodes.filter(tc => tc.country === country);

        if (searchQuery.trim()) {
            // Split search query into individual words for multi-word search
            const searchWords = searchQuery.toLowerCase().trim().split(/\s+/);

            codes = codes.filter(tc => {
                const searchableText = [
                    tc.code,
                    tc.category || '',
                    tc.keywords || ''
                ].join(' ').toLowerCase();

                // All search words must be found in the searchable text
                return searchWords.every(word => searchableText.includes(word));
            });
        }

        return codes;
    }, [taxCodes, country, searchQuery]);

    // Get selected tax code details
    const selectedCode = taxCodes.find(tc => tc.code === value);

    const handleSelectCode = (code: string) => {
        onChange(code);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleViewDetails = (e: React.MouseEvent, code: TaxCode) => {
        e.stopPropagation();
        setSelectedCodeForDetails(code);
    };

    return (
        <div className="relative">
            {/* Selected Value Display */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full text-left border rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm flex items-center justify-between ${darkMode
                    ? 'bg-[#11121d] border-slate-700 text-white'
                    : 'bg-white border-gray-300 text-slate-900'
                    }`}
            >
                <span className={!value ? 'text-slate-500' : ''}>
                    {value ? (selectedCode ? `${selectedCode.code} - ${selectedCode.category}` : value) : '-- Select Tax Code --'}
                </span>
                <svg
                    className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown Content */}
                    <div className={`absolute z-50 mt-1 w-full rounded-lg shadow-2xl border flex flex-col ${darkMode
                        ? 'bg-[#1a1b2e] border-slate-700'
                        : 'bg-white border-gray-300'
                        }`}
                        style={{
                            maxHeight: '400px',
                            minHeight: '200px'
                        }}
                    >
                        {/* Search Bar */}
                        <div className={`p-3 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                            <div className="relative">
                                <svg
                                    className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by code or keyword..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={`w-full pl-10 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${darkMode
                                        ? 'bg-[#11121d] border-slate-600 text-white placeholder-slate-500'
                                        : 'bg-white border-gray-300 text-slate-900 placeholder-slate-400'
                                        }`}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>

                        {/* Tax Code List */}
                        <div className="overflow-y-auto flex-1" style={{ maxHeight: '320px' }}>
                            {/* TC-UNKNOWN Option */}
                            <div
                                onClick={() => handleSelectCode('TC-UNKNOWN')}
                                className={`px-4 py-3 cursor-pointer flex items-center justify-between border-b ${darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-gray-100 hover:bg-gray-50'
                                    } ${value === 'TC-UNKNOWN' ? (darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50') : ''}`}
                            >
                                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    TC-UNKNOWN
                                </span>
                                <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Unclassified
                                </span>
                            </div>

                            {/* Filtered Tax Codes */}
                            {filteredCodes.length === 0 ? (
                                <div className={`px-3 py-8 text-center text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    No tax codes found
                                </div>
                            ) : (
                                filteredCodes.map((tc) => (
                                    <div
                                        key={tc.code}
                                        onClick={() => handleSelectCode(tc.code)}
                                        className={`px-4 py-3 cursor-pointer flex items-center justify-between border-b ${darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-gray-100 hover:bg-gray-50'
                                            } ${value === tc.code ? (darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50') : ''}`}
                                    >
                                        <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                            {tc.code}
                                        </span>
                                        <button
                                            onClick={(e) => handleViewDetails(e, tc)}
                                            className={`text-xs px-3 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 transition-all transform hover:scale-105 shadow-sm`}
                                        >
                                            View Details
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Details Modal */}
            {selectedCodeForDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setSelectedCodeForDetails(null)}
                    />

                    {/* Modal Content */}
                    <div className={`relative rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-[#1a1b2e]' : 'bg-white'
                        }`}>
                        {/* Header */}
                        <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    Tax Code Details
                                </h3>
                                <button
                                    onClick={() => setSelectedCodeForDetails(null)}
                                    className={`p-1 rounded-lg hover:bg-slate-700 transition-colors ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    HSN Code
                                </label>
                                <p className={`mt-1 text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    {selectedCodeForDetails.code}
                                </p>
                            </div>

                            <div>
                                <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Description
                                </label>
                                <p className={`mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {selectedCodeForDetails.category}
                                </p>
                            </div>

                            <div>
                                <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Tax Rate
                                </label>
                                <p className={`mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {(selectedCodeForDetails.rate * 100).toFixed(0)}%
                                </p>
                            </div>

                            <div>
                                <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Country
                                </label>
                                <p className={`mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {selectedCodeForDetails.country}
                                </p>
                            </div>

                            {selectedCodeForDetails.keywords && (
                                <div>
                                    <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                        Keywords
                                    </label>
                                    <p className={`mt-1 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                        {selectedCodeForDetails.keywords}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className={`px-6 py-4 border-t flex justify-end gap-3 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                            <button
                                onClick={() => setSelectedCodeForDetails(null)}
                                className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${darkMode
                                    ? 'bg-[#1a1b2e] border-slate-700 text-slate-300 hover:bg-slate-800'
                                    : 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50'
                                    }`}
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    handleSelectCode(selectedCodeForDetails.code);
                                    setSelectedCodeForDetails(null);
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20"
                            >
                                Select This Code
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaxCodeSelector;
