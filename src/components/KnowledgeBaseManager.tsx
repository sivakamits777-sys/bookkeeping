import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, FileText, Loader2, X } from 'lucide-react';

interface KBEntry {
    id: number;
    content: string;
    metadata: any;
    created_at: string;
}

const KnowledgeBaseManager: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
    const [entries, setEntries] = useState<KBEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [addMode, setAddMode] = useState<'text' | 'file'>('text');
    const [newContent, setNewContent] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingEntry, setViewingEntry] = useState<KBEntry | null>(null);
    const [deletingEntry, setDeletingEntry] = useState<KBEntry | null>(null);

    useEffect(() => {
        fetchEntries();
    }, []);

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/kb');
            const data = await res.json();
            if (Array.isArray(data)) {
                setEntries(data);
            } else {
                const errorMsg = data.error || (typeof data === 'object' ? JSON.stringify(data) : String(data));
                console.error("KB Data is not an array. Error:", errorMsg);
                setEntries([]);
            }
        } catch (error) {
            console.error("Error fetching KB:", error);
            setEntries([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();

        if (addMode === 'text' && !newContent.trim()) return;
        if (addMode === 'file' && !selectedFile) return;

        setIsSubmitting(true);
        try {
            if (addMode === 'text') {
                const res = await fetch('/api/kb', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent })
                });
                if (res.ok) {
                    setNewContent('');
                    setIsAdding(false);
                    fetchEntries();
                }
            } else if (selectedFile) {
                const formData = new FormData();
                formData.append('file', selectedFile);

                const res = await fetch('/api/kb', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    setSelectedFile(null);
                    setIsAdding(false);
                    fetchEntries();
                } else {
                    const err = await res.json();
                    alert(`Upload failed: ${err.error || 'Unknown error'}`);
                }
            }
        } catch (error) {
            console.error("Error adding entry:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const confirmDelete = async (id: number) => {
        try {
            const res = await fetch(`/api/kb?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                setEntries(entries.filter(e => e.id !== id));
                setDeletingEntry(null);
            }
        } catch (error) {
            console.error("Error deleting entry:", error);
        }
    };

    const handleDelete = (entry: KBEntry) => {
        setDeletingEntry(entry);
    };

    const filteredEntries = entries.filter(e =>
        e.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className={`p-6 rounded-2xl border transition-all duration-300 ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200 shadow-sm'
            }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Knowledge Base</h2>
                    <p className={`text-sm ${darkMode ? 'text-indigo-200/50' : 'text-slate-500'}`}>
                        Manage documentation for the chatbot.
                    </p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300 ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                >
                    <Plus className="w-4 h-4" />
                    Add Knowledge
                </button>
            </div>

            <div className="relative mb-6">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-white/30' : 'text-slate-400'}`} />
                <input
                    type="text"
                    placeholder="Search knowledge entries..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-300 ${darkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'placeholder:text-slate-400'
                        }`}
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            ) : filteredEntries.length === 0 ? (
                <div className={`text-center py-12 rounded-xl border border-dashed ${darkMode ? 'border-white/10 text-indigo-200/30' : 'border-gray-200 text-slate-400'}`}>
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>No knowledge entries found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredEntries.map((entry) => (
                        <div
                            key={entry.id}
                            onClick={() => setViewingEntry(entry)}
                            className={`group relative p-4 rounded-xl border transition-all duration-300 cursor-pointer ${darkMode ? 'bg-white/5 border-white/10 hover:border-indigo-500/50 hover:bg-white/10' : 'bg-gray-50 border-gray-100 hover:border-indigo-500/50 hover:bg-gray-100'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg shrink-0 ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-bold mb-1 truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                        {entry.metadata?.filename || (entry.content.length > 50 ? entry.content.substring(0, 50) + '...' : entry.content)}
                                    </h4>
                                    <p className={`text-xs line-clamp-2 ${darkMode ? 'text-indigo-100/50' : 'text-slate-500'}`}>
                                        {entry.content}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                <span className={`text-[10px] uppercase font-bold tracking-wider ${darkMode ? 'text-white/20' : 'text-slate-400'}`}>
                                    {entry.metadata?.filename ? 'Document' : 'Text Snippet'} • {new Date(entry.created_at).toLocaleDateString()}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(entry);
                                        }}
                                        className={`p-1.5 rounded-lg transition-all duration-300 ${darkMode ? 'text-rose-400/50 hover:text-rose-400 hover:bg-rose-400/10' : 'text-rose-500/50 hover:text-rose-500 hover:bg-rose-50'
                                            }`}
                                        title="Delete entry"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* View Modal */}
            {viewingEntry && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-12 backdrop-blur-md bg-black/80">
                    <div className={`w-full max-w-4xl h-[96vh] rounded-2xl border p-6 animate-in fade-in zoom-in-95 duration-300 flex flex-col ${darkMode ? 'bg-[#15161d] border-white/10 shadow-2xl shadow-indigo-500/10' : 'bg-white border-gray-200 shadow-2xl'
                        }`}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    {viewingEntry.metadata?.filename || 'Text Snippet'}
                                </h3>
                                <p className={`text-xs ${darkMode ? 'text-white/20' : 'text-slate-400'}`}>
                                    Added on {new Date(viewingEntry.created_at).toLocaleString()}
                                </p>
                            </div>
                            <button onClick={() => setViewingEntry(null)} className={`${darkMode ? 'text-white/50 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className={`flex-1 overflow-hidden rounded-xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                            }`}>
                            {viewingEntry.metadata?.file_data ? (
                                <div className="w-full h-full flex flex-col">
                                    {viewingEntry.metadata?.type === 'application/pdf' ? (
                                        <div className="flex-1 px-32 py-12">
                                            <embed
                                                src={`data:application/pdf;base64,${viewingEntry.metadata.file_data}#toolbar=0&navpanes=0&view=FitH`}
                                                className="w-full h-full rounded-lg"
                                                type="application/pdf"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                            <div className={`p-6 rounded-full mb-4 ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                                <FileText className="w-12 h-12" />
                                            </div>
                                            <h4 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                                Preview not available for this type
                                            </h4>
                                            <p className={`text-sm mb-6 ${darkMode ? 'text-white/50' : 'text-slate-500'}`}>
                                                Direct preview is currently supported for PDFs. You can still download the original document.
                                            </p>
                                            <a
                                                href={`data:${viewingEntry.metadata.type};base64,${viewingEntry.metadata.file_data}`}
                                                download={viewingEntry.metadata.filename}
                                                className={`px-6 py-2 rounded-xl font-medium text-white transition-all bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20`}
                                            >
                                                Download Original Document
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full overflow-y-auto p-4 leading-relaxed">
                                    <pre className={`whitespace-pre-wrap font-sans text-sm ${darkMode ? 'text-indigo-100/90' : 'text-slate-700'}`}>
                                        {viewingEntry.content}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setViewingEntry(null)}
                                className={`px-6 py-2 rounded-xl font-medium transition-all duration-300 ${darkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-800 text-white hover:bg-gray-900'} shadow-sm`}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Modal */}
            {isAdding && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-black/40">
                    <div className={`w-full max-w-2xl rounded-2xl border p-6 animate-in fade-in zoom-in-95 duration-300 ${darkMode ? 'bg-[#15161d] border-white/10 shadow-2xl shadow-indigo-500/10' : 'bg-white border-gray-200 shadow-2xl'
                        }`}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Add Knowledge Base Entry</h3>
                            <button onClick={() => setIsAdding(false)} className={`${darkMode ? 'text-white/50 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className={`flex items-center gap-4 mb-6 p-1 rounded-xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                            <button
                                onClick={() => setAddMode('text')}
                                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${addMode === 'text'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                    : (darkMode ? 'text-white/50 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                                    }`}
                            >
                                Text Content
                            </button>
                            <button
                                onClick={() => setAddMode('file')}
                                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${addMode === 'file'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                    : (darkMode ? 'text-white/50 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                                    }`}
                            >
                                PDF / Word Document
                            </button>
                        </div>

                        <form onSubmit={handleAdd}>
                            {addMode === 'text' ? (
                                <textarea
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                    placeholder="Paste your documentation content here. This will be embedded and used by the chatbot to answer questions..."
                                    className={`w-full h-64 p-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-300 resize-none mb-6 ${darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200'
                                        }`}
                                    required
                                />
                            ) : (
                                <div className={`w-full h-64 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 mb-6 transition-all ${darkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                                    }`}>
                                    <input
                                        type="file"
                                        onChange={handleFileChange}
                                        accept=".pdf,.docx,.txt"
                                        className="hidden"
                                        id="kb-file-upload"
                                    />
                                    <label
                                        htmlFor="kb-file-upload"
                                        className="flex flex-col items-center cursor-pointer"
                                    >
                                        <div className={`p-4 rounded-full mb-4 ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                            <Plus className="w-8 h-8" />
                                        </div>
                                        <p className={`text-lg font-bold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                            {selectedFile ? selectedFile.name : 'Select a document'}
                                        </p>
                                        <p className={`text-sm ${darkMode ? 'text-white/30' : 'text-slate-500'}`}>
                                            Supports PDF, DOCX, and TXT files
                                        </p>
                                    </label>
                                    {selectedFile && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFile(null)}
                                            className="mt-4 text-rose-500 text-xs font-bold hover:underline"
                                        >
                                            Remove file
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className={`px-6 py-2 rounded-xl font-medium transition-all duration-300 ${darkMode ? 'text-white/70 hover:bg-white/5' : 'text-slate-600 hover:bg-gray-100'
                                        }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`flex items-center gap-2 px-6 py-2 rounded-xl font-medium text-white transition-all duration-300 ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-600 hover:bg-indigo-700'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    {isSubmitting ? 'Processing...' : 'Add to Knowledge Base'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingEntry && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md bg-black/60">
                    <div className={`w-full max-w-md rounded-2xl border p-6 animate-in fade-in zoom-in-95 duration-300 ${darkMode ? 'bg-[#1a1c23] border-white/10 shadow-2xl' : 'bg-white border-gray-200 shadow-2xl'
                        }`}>
                        <div className="flex flex-col items-center text-center">
                            <div className="p-4 rounded-full bg-rose-500/10 text-rose-500 mb-4">
                                <Trash2 className="w-8 h-8" />
                            </div>
                            <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Delete Knowledge Entry?</h3>
                            <p className={`text-sm mb-6 ${darkMode ? 'text-white/50' : 'text-slate-500'}`}>
                                Are you sure you want to delete <span className="font-bold">"{deletingEntry.metadata?.filename || 'this text snippet'}"</span>? This action cannot be undone.
                            </p>
                            <div className="flex w-full gap-3">
                                <button
                                    onClick={() => setDeletingEntry(null)}
                                    className={`flex-1 px-6 py-2 rounded-xl font-medium transition-all duration-300 ${darkMode ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                                        }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => confirmDelete(deletingEntry.id)}
                                    className="flex-1 px-6 py-2 rounded-xl font-medium text-white transition-all duration-300 bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KnowledgeBaseManager;
