import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Upload, Calendar, FileSpreadsheet, CheckCircle2, AlertCircle, IndianRupee, X, Loader2, Search, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import { PortfolioContext } from '../../context/PortfolioContext';

const UploadLumpsum = () => {
    const { fetchFunds } = useContext(PortfolioContext);
    const [file, setFile] = useState(null);
    const [fundName, setFundName] = useState('');
    const [nickname, setNickname] = useState('');
    const [investedAmount, setInvestedAmount] = useState('');
    const [investedDate, setInvestedDate] = useState('');
    const fileInputRef = useRef(null);

    // Scheme Search State
    const [schemeSearchQuery, setSchemeSearchQuery] = useState('');
    const [schemeResults, setSchemeResults] = useState([]);
    const [selectedSchemeCode, setSelectedSchemeCode] = useState(null);
    const [selectedSchemeName, setSelectedSchemeName] = useState('');
    const [showSchemeDropdown, setShowSchemeDropdown] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const schemeDropdownRef = useRef(null);

    // Validation Warning Modal State
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [validationWarning, setValidationWarning] = useState(null);

    // Ambiguity Handling (legacy - for backward compatibility)
    const [showModal, setShowModal] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [pendingFundId, setPendingFundId] = useState(null);
    const [selectedScheme, setSelectedScheme] = useState(null);

    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Debounced scheme search
    const searchSchemes = useCallback(async (query) => {
        if (!query || query.length < 2) {
            setSchemeResults([]);
            return;
        }

        setSearchLoading(true);
        try {
            const response = await api.get(`/schemes/search?q=${encodeURIComponent(query)}`);
            setSchemeResults(response.data.schemes || []);
        } catch (error) {
            console.error('Scheme search error:', error);
            setSchemeResults([]);
        } finally {
            setSearchLoading(false);
        }
    }, []);

    // Debounce effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (schemeSearchQuery && !selectedSchemeCode) {
                searchSchemes(schemeSearchQuery);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [schemeSearchQuery, selectedSchemeCode, searchSchemes]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (schemeDropdownRef.current && !schemeDropdownRef.current.contains(e.target)) {
                setShowSchemeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSchemeSelect = (scheme) => {
        setSelectedSchemeCode(scheme.schemeCode);
        setSelectedSchemeName(scheme.schemeName);
        setFundName(scheme.schemeName);
        setSchemeSearchQuery(scheme.schemeName);
        setShowSchemeDropdown(false);
        setSchemeResults([]);
    };

    const clearSchemeSelection = () => {
        setSelectedSchemeCode(null);
        setSelectedSchemeName('');
        setSchemeSearchQuery('');
        setFundName('');
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) setFile(droppedFile);
    };

    const handleRemoveFile = (e) => {
        e.stopPropagation();
        setFile(null);
    }

    const handleUpload = async (e, skipValidation = false) => {
        if (e) e.preventDefault();

        if (!file || !selectedSchemeCode || !investedAmount || !investedDate) {
            setMessage({ type: 'error', text: 'Please select a fund, upload a file, and provide amount and date.' });
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('fund_name', fundName || selectedSchemeName);
        formData.append('file', file);
        formData.append('investment_type', 'lumpsum');
        formData.append('invested_amount', investedAmount);
        formData.append('scheme_code', selectedSchemeCode);
        formData.append('scheme_name', selectedSchemeName);
        formData.append('skip_validation', skipValidation ? 'true' : 'false');

        // Convert YYYY-MM-DD to DD-MM-YYYY
        const [year, month, day] = investedDate.split('-');
        const formattedDate = `${day}-${month}-${year}`;
        formData.append('invested_date', formattedDate);

        if (nickname) formData.append('nickname', nickname);

        try {
            const response = await api.post('/upload-holdings/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const data = response.data;

            // Check for validation warning
            if (data.validation_required) {
                setValidationWarning({
                    warning: data.validation_warning,
                    extractedName: data.extracted_fund_name,
                    expectedName: data.expected_scheme_name,
                    score: data.similarity_score
                });
                setShowValidationModal(true);
                setLoading(false);
                return;
            }

            if (data.upload_status && data.upload_status.requires_selection) {
                setPendingFundId(data.upload_status.id);
                setCandidates(data.upload_status.candidates || []);
                setShowModal(true);
                setMessage({ type: '', text: '' });
            } else {
                setMessage({ type: 'success', text: 'Lumpsum investment uploaded successfully!' });
                fetchFunds();
                resetForm();
            }
        } catch (error) {
            console.error(error);
            let userMsg = 'Upload failed. Please check the file format.';

            if (error.response) {
                if (error.response.data && error.response.data.detail) {
                    const detail = error.response.data.detail;
                    userMsg = `Error: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`;
                }
            } else if (error.request) {
                userMsg = 'Cannot reach server. Please ensure the backend is running.';
            } else {
                userMsg = `Error: ${error.message}`;
            }

            setMessage({ type: 'error', text: userMsg });
        } finally {
            setLoading(false);
        }
    };

    const handleUploadWithSkip = () => {
        setShowValidationModal(false);
        handleUpload(null, true);
    };

    const resetForm = () => {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setFundName('');
        setNickname('');
        setInvestedAmount('');
        setInvestedDate('');
        setPendingFundId(null);
        setCandidates([]);
        setSelectedScheme(null);
        setShowModal(false);
        setSelectedSchemeCode(null);
        setSelectedSchemeName('');
        setSchemeSearchQuery('');
        setValidationWarning(null);
        setShowValidationModal(false);
    }

    const handleSchemeSelection = async (schemeCode) => {
        setSelectedScheme(schemeCode);
        setLoading(true);
        try {
            await api.patch(`/funds/${pendingFundId}/scheme`, { scheme_code: schemeCode });
            setMessage({ type: 'success', text: 'Scheme selected and portfolio updated!' });
            fetchFunds();
            resetForm();
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update scheme selection.' });
            setSelectedScheme(null);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleUpload} className="space-y-6">

                {/* Scheme Search */}
                <div ref={schemeDropdownRef} className="relative">
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Search & Select Fund <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            value={schemeSearchQuery}
                            onChange={(e) => {
                                setSchemeSearchQuery(e.target.value);
                                if (selectedSchemeCode) clearSchemeSelection();
                                setShowSchemeDropdown(true);
                            }}
                            onFocus={() => setShowSchemeDropdown(true)}
                            placeholder="Type to search... e.g. HDFC Flexi Cap"
                            className={`w-full bg-white/5 border rounded-xl pl-10 pr-10 py-3 text-white placeholder-zinc-600 focus:outline-none transition-colors ${selectedSchemeCode
                                ? 'border-green-500/50 bg-green-500/5'
                                : 'border-white/10 focus:border-primary'
                                }`}
                        />
                        {searchLoading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                        )}
                        {selectedSchemeCode && !searchLoading && (
                            <button
                                type="button"
                                onClick={clearSchemeSelection}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Selected Scheme Badge */}
                    {selectedSchemeCode && (
                        <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-sm text-green-400 truncate">Selected: {selectedSchemeName}</span>
                            </div>
                            <span className="text-xs text-zinc-500 ml-5 sm:ml-0">({selectedSchemeCode})</span>
                        </div>
                    )}

                    {/* Dropdown */}
                    <AnimatePresence>
                        {showSchemeDropdown && schemeResults.length > 0 && !selectedSchemeCode && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute z-50 w-full mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto"
                            >
                                {schemeResults.map((scheme) => (
                                    <button
                                        key={scheme.schemeCode}
                                        type="button"
                                        onClick={() => handleSchemeSelect(scheme)}
                                        className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors"
                                    >
                                        <div className="text-sm text-white font-medium">{scheme.schemeName}</div>
                                        <div className="text-xs text-zinc-500 mt-1">Code: {scheme.schemeCode}</div>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Nickname (Optional) */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Nickname (Optional)</label>
                    <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. Retirement Fund"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-primary transition-colors"
                    />
                </div>

                {/* Excel Upload Area */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Holdings File (Excel) <span className="text-red-500">*</span></label>
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleFileDrop}
                        className={`
                            border-2 border-dashed rounded-xl p-4 sm:p-8 text-center transition-all cursor-pointer relative group
                            ${dragOver ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-zinc-500 hover:bg-white/5'}
                        `}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".xlsx, .xls"
                            onChange={(e) => setFile(e.target.files[0])}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />

                        <div className="flex flex-col items-center gap-3">
                            <div className="p-2 sm:p-3 bg-white/5 rounded-full group-hover:bg-primary/20 transition-colors">
                                <FileSpreadsheet className={`w-6 h-6 sm:w-8 sm:h-8 ${file ? 'text-green-500' : 'text-zinc-500 group-hover:text-white'}`} />
                            </div>
                            {file ? (
                                <div className="relative">
                                    <p className="text-sm font-medium text-white">{file.name}</p>
                                    <p className="text-xs text-green-400 mb-1">Ready to upload</p>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFile}
                                        className="relative z-10 px-3 py-1 bg-white/10 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 text-xs rounded-full border border-white/10 transition-colors flex items-center gap-1 mx-auto"
                                    >
                                        <X className="w-3 h-3" /> Remove
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-sm font-medium text-white">Drop Excel file or click to browse</p>
                                    <p className="text-xs text-zinc-500 mt-1">Supports .xlsx, .xls</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                        Check monthly portfolio disclosures from your fund house (via email)
                    </p>
                </div>

                {/* Details Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            Invested Amount <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type="number"
                                value={investedAmount}
                                onChange={(e) => setInvestedAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            Invested Date <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type="date"
                                value={investedDate}
                                onChange={(e) => setInvestedDate(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-primary transition-colors [color-scheme:dark]"
                            />
                        </div>
                    </div>
                </div>

                {/* Submit Action */}
                <button
                    type="submit"
                    disabled={loading || !selectedSchemeCode}
                    className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <span className="animate-pulse">Processing...</span>
                    ) : (
                        <>Upload Lumpsum Investment <Upload className="w-4 h-4 group-hover:-translate-y-1 transition-transform" /></>
                    )}
                </button>

                {/* Messages */}
                <AnimatePresence>
                    {message.text && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`p-4 rounded-xl flex items-center gap-2 text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}
                        >
                            {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            {message.text}
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>

            {/* VALIDATION WARNING MODAL */}
            <AnimatePresence>
                {showValidationModal && validationWarning && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-zinc-900 border border-yellow-500/20 rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-yellow-500/10 rounded-full">
                                    <AlertCircle className="w-6 h-6 text-yellow-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white">File Mismatch Warning</h3>
                            </div>

                            <p className="text-sm text-zinc-300 mb-4">{validationWarning.warning}</p>

                            <div className="bg-white/5 rounded-lg p-3 mb-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-400">Excel contains:</span>
                                    <span className="text-white font-medium">{validationWarning.extractedName || 'Unknown'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-400">You selected:</span>
                                    <span className="text-primary font-medium">{validationWarning.expectedName}</span>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowValidationModal(false)}
                                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUploadWithSkip}
                                    className="flex-1 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors text-sm font-medium"
                                >
                                    Upload Anyway
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* LEGACY AMBIGUITY MODAL */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-white mb-2">Select Fund Scheme</h3>
                            <p className="text-sm text-zinc-400 mb-4">We found multiple matching schemes. Please select the correct one:</p>

                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {candidates.map((c) => {
                                    const isSelected = selectedScheme === c.schemeCode;
                                    const isBusy = loading && isSelected;

                                    return (
                                        <button
                                            key={c.schemeCode}
                                            onClick={() => handleSchemeSelection(c.schemeCode)}
                                            disabled={loading}
                                            className={`
                                                w-full text-left p-3 rounded-lg border transition-all text-sm group
                                                ${isSelected
                                                    ? 'bg-primary/20 border-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.3)]'
                                                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-primary/50 text-zinc-300 hover:text-white'
                                                }
                                                ${loading && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}
                                            `}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    {isBusy && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                                                    <span className={`font-medium ${isSelected ? 'text-primary-foreground' : ''}`}>
                                                        {c.schemeName}
                                                        {isBusy && <span className="ml-2 text-xs text-primary font-normal">Uploading...</span>}
                                                    </span>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded ml-2 ${isSelected ? 'bg-primary/30 text-white' : 'bg-black/20 text-zinc-500'}`}>
                                                    {c.schemeCode}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={resetForm}
                                className="mt-4 w-full py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-colors text-sm"
                            >
                                Cancel Upload
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default UploadLumpsum;

