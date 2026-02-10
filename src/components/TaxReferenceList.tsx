
import React, { useState, useEffect } from 'react';

interface HsnCode {
  id: string;
  hsn_cd: string;
  refinehsn_description: string;
  country: string;
}

interface Props {
  darkMode?: boolean;
}

const TaxReferenceList: React.FC<Props> = ({ darkMode = false }) => {
  const [codes, setCodes] = useState<HsnCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<HsnCode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHsnCodes();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCodes(codes);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = codes.filter((code) => {
        const hsnMatch = code.hsn_cd.toLowerCase().includes(query);
        const descMatch = code.refinehsn_description.toLowerCase().includes(query);
        return hsnMatch || descMatch;
      });
      setFilteredCodes(filtered);
    }
  }, [searchQuery, codes]);

  const fetchHsnCodes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/hsn-codes');
      const result = await response.json();

      if (result.success) {
        setCodes(result.data);
        setFilteredCodes(result.data);
      } else {
        setError(result.error || 'Failed to fetch HSN codes');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch HSN codes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`overflow-hidden rounded-lg border ${darkMode ? 'bg-[#1a1b2e] border-white/10' : 'bg-white border-slate-200'}`}>
      {/* Header with Search */}
      <div className={`px-6 py-4 border-b ${darkMode ? 'border-white/5 bg-[#151625]' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              HSN Code Knowledge Base
            </h3>
            <p className={`mt-1 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {loading ? 'Loading...' : `${filteredCodes.length} of ${codes.length} codes`}
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className={`h-5 w-5 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by HSN code or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`block w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${darkMode
                ? 'bg-[#1a1b2e] border-white/10 text-white placeholder-slate-500 focus:ring-indigo-500/50 focus:border-indigo-500/50'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${darkMode ? 'border-indigo-400' : 'border-indigo-600'}`}></div>
            <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading HSN codes...</p>
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-600'}`}>{error}</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className={darkMode ? 'bg-[#151625]' : 'bg-slate-50'}>
              <tr>
                <th scope="col" className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  S.No
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  HSN Code
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Country
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-white/5 bg-[#1a1b2e]' : 'divide-slate-200 bg-white'}`}>
              {filteredCodes.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`px-6 py-8 text-center text-sm italic ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {searchQuery ? 'No matching codes found' : 'No HSN codes available'}
                  </td>
                </tr>
              ) : (
                filteredCodes.map((code, index) => (
                  <tr key={code.id} className={`transition-colors ${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                    <td className={`px-4 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {index + 1}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      {code.hsn_cd}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {code.country}
                    </td>
                    <td className={`px-6 py-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-900'}`}>
                      {code.refinehsn_description}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TaxReferenceList;
