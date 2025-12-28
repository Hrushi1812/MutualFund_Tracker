import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Upload, Calendar, FileSpreadsheet, CheckCircle2, AlertCircle, IndianRupee, X, Loader2, RefreshCw, TrendingUp, Zap, Target, FileText, Plus, Trash2, Eye, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import { PortfolioContext } from '../../context/PortfolioContext';

const UploadSIP = () => {
    const { fetchFunds } = useContext(PortfolioContext);

    // Mode Toggle: 'simple' | 'detailed'
    const [sipMode, setSipMode] = useState('simple');

    // Common Fields
    const [file, setFile] = useState(null);
    const [fundName, setFundName] = useState('');
    const [nickname, setNickname] = useState('');
    const fileInputRef = useRef(null);

    // Scheme Search State (for Simple mode)
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

    // Simple Mode Fields
    const [sipAmount, setSipAmount] = useState('');
    const [startDate, setStartDate] = useState('');
    const [sipDay, setSipDay] = useState('');
    const [totalUnits, setTotalUnits] = useState('');
    const [totalInvestedAmount, setTotalInvestedAmount] = useState('');

    // Step-Up SIP State
    const [stepupEnabled, setStepupEnabled] = useState(false);
    const [stepupType, setStepupType] = useState('percentage');
    const [stepupValue, setStepupValue] = useState('');
    const [stepupFrequency, setStepupFrequency] = useState('Annual');

    // Detailed Mode - CAS Import
    const [casFile, setCasFile] = useState(null);
    const [casPassword, setCasPassword] = useState('');
    const [parsingCas, setParsingCas] = useState(false);
    const [casSchemes, setCasSchemes] = useState([]);
    const [selectedCasScheme, setSelectedCasScheme] = useState(null);
    const [parsedTransactions, setParsedTransactions] = useState([]);
    const [casCostValue, setCasCostValue] = useState(null);  // CAS's Total Cost Value (includes stamp duty)
    const [casAmfiCode, setCasAmfiCode] = useState(null);  // AMFI code from CAS (eliminates ambiguity)
    const casFileRef = useRef(null);

    // Detailed Mode - Manual Entry
    const [manualInstallments, setManualInstallments] = useState([{ date: '', amount: '', units: '' }]);

    // Ambiguity Handling
    const [showModal, setShowModal] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [pendingFundId, setPendingFundId] = useState(null);
    const [selectedScheme, setSelectedScheme] = useState(null);

    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // --- Scheme Search Functions ---
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

    // --- Handlers ---

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

    const handleCasFileDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.toLowerCase().endsWith('.pdf')) {
            setCasFile(droppedFile);
        }
    };

    const handleRemoveCasFile = (e) => {
        e.stopPropagation();
        setCasFile(null);
        setCasSchemes([]);
        setParsedTransactions([]);
        setSelectedCasScheme(null);
    };

    // Parse CAS PDF
    const handleParseCas = async () => {
        if (!casFile || !casPassword) {
            setMessage({ type: 'error', text: 'Please upload a CAS PDF and enter password.' });
            return;
        }

        setParsingCas(true);
        setMessage({ type: '', text: '' });

        try {
            const formData = new FormData();
            formData.append('file', casFile);
            formData.append('password', casPassword);

            const response = await api.post('/parse-cas/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const data = response.data;
            if (data.schemes && data.schemes.length > 0) {
                setCasSchemes(data.schemes);
                setMessage({ type: 'success', text: `Found ${data.schemes.length} scheme(s) in CAS.` });
            } else {
                setMessage({ type: 'error', text: 'No schemes found in CAS. Please check the PDF.' });
            }
        } catch (error) {
            const detail = error.response?.data?.detail || 'Failed to parse CAS.';
            setMessage({ type: 'error', text: detail });
        } finally {
            setParsingCas(false);
        }
    };

    // Get transactions for selected scheme
    const handleSelectCasScheme = async (scheme) => {
        setSelectedCasScheme(scheme);
        setParsingCas(true);

        // Auto-populate fund name from CAS (user can still edit if needed)
        if (scheme.name && !fundName) {
            setFundName(scheme.name);
        }

        // Store AMFI code from CAS to use directly (eliminates ambiguity)
        if (scheme.amfi) {
            setCasAmfiCode(scheme.amfi);
        }

        try {
            const formData = new FormData();
            formData.append('file', casFile);
            formData.append('password', casPassword);
            formData.append('scheme_name', scheme.name);

            const response = await api.post('/parse-cas/transactions/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const data = response.data;
            if (data.transactions && data.transactions.length > 0) {
                // Add pending installment if current month is missing
                let allTransactions = [...data.transactions];
                if (data.missing_current_month && data.pending_installment) {
                    allTransactions.push(data.pending_installment);
                }

                setParsedTransactions(allTransactions);

                // Store cost_value from CAS for accurate total invested
                setCasCostValue(data.summary?.total_invested || null);

                let successMsg = `✅ ${scheme.name} imported successfully! (${data.transactions.length} transactions)`;
                if (data.missing_current_month) {
                    successMsg += ` Note: This month's SIP (${data.pending_installment?.date}) needs confirmation.`;
                }
                setMessage({ type: 'success', text: successMsg });
            } else {
                setMessage({ type: 'error', text: 'No purchase transactions found for this scheme.' });
            }
        } catch (error) {
            const detail = error.response?.data?.detail || 'Failed to extract transactions.';
            setMessage({ type: 'error', text: detail });
        } finally {
            setParsingCas(false);
        }
    };

    // Manual installment handlers
    const addManualInstallment = () => {
        setManualInstallments([...manualInstallments, { date: '', amount: '', units: '' }]);
    };

    const removeManualInstallment = (index) => {
        if (manualInstallments.length > 1) {
            setManualInstallments(manualInstallments.filter((_, i) => i !== index));
        }
    };

    const updateManualInstallment = (index, field, value) => {
        const updated = [...manualInstallments];
        updated[index][field] = value;
        setManualInstallments(updated);
    };

    // Calculate summary for detailed mode
    // Uses CAS's Total Cost Value if available (includes stamp duty)
    const getDetailedSummary = () => {
        const installments = sipMode === 'detailed' && parsedTransactions.length > 0
            ? parsedTransactions
            : manualInstallments.filter(i => i.date && i.amount);

        const totalAmount = installments.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
        const totalUnitsVal = installments.reduce((sum, i) => sum + (parseFloat(i.units) || 0), 0);

        // Use CAS cost_value if available (it includes stamp duty)
        // Otherwise use sum of raw amounts
        const displayAmount = casCostValue || totalAmount;

        return {
            count: installments.length,
            totalInvested: displayAmount,
            totalUnits: totalUnitsVal
        };
    };

    // Main upload handler
    const handleUpload = async (e) => {
        e.preventDefault();

        // Common validation
        if (!file || !fundName) {
            setMessage({ type: 'error', text: 'Please provide Fund Name and Holdings File.' });
            return;
        }

        let detailedInstallmentsJson = null;
        let effectiveSipAmount = sipAmount;
        let effectiveStartDate = startDate;
        let effectiveSipDay = sipDay;

        if (sipMode === 'simple') {
            // Simple mode validation
            if (!sipAmount || !startDate) {
                setMessage({ type: 'error', text: 'Please provide SIP Amount and Start Date.' });
                return;
            }
            if (!sipDay || sipDay < 1 || sipDay > 31) {
                setMessage({ type: 'error', text: 'Please enter a valid SIP day (1-31).' });
                return;
            }
            if (!totalUnits || parseFloat(totalUnits) < 0) {
                setMessage({ type: 'error', text: 'Please enter total units held (from CAS). Enter 0 if starting fresh.' });
                return;
            }
            if (!totalInvestedAmount || parseFloat(totalInvestedAmount) < 0) {
                setMessage({ type: 'error', text: 'Please enter total invested amount. Enter 0 if starting fresh.' });
                return;
            }
            if (stepupEnabled && (!stepupValue || parseFloat(stepupValue) <= 0)) {
                setMessage({ type: 'error', text: 'Please enter a valid step-up value.' });
                return;
            }
        } else {
            // Detailed mode validation
            let installments = [];

            if (parsedTransactions.length > 0) {
                installments = parsedTransactions;
            } else {
                // Manual entry
                const validManual = manualInstallments.filter(i => i.date && i.amount && i.units);
                if (validManual.length === 0) {
                    setMessage({ type: 'error', text: 'Please add at least one installment with date, amount, and units.' });
                    return;
                }
                installments = validManual.map(i => ({
                    date: formatDateForApi(i.date),
                    amount: parseFloat(i.amount),
                    units: parseFloat(i.units)
                }));
            }

            detailedInstallmentsJson = JSON.stringify(installments);

            // Validate SIP configuration for detailed mode
            if (!sipAmount || parseFloat(sipAmount) <= 0) {
                setMessage({ type: 'error', text: 'Please enter your current SIP amount for future tracking.' });
                return;
            }
            if (!sipDay || sipDay < 1 || sipDay > 31) {
                setMessage({ type: 'error', text: 'Please enter a valid SIP day (1-31).' });
                return;
            }
            if (stepupEnabled && (!stepupValue || parseFloat(stepupValue) <= 0)) {
                setMessage({ type: 'error', text: 'Please enter a valid step-up value.' });
                return;
            }

            // For detailed mode, derive start date from first installment
            if (installments.length > 0) {
                const firstInstallment = installments[0];
                effectiveStartDate = firstInstallment.date;
                // Use user-provided SIP amount and day (already validated above)
                effectiveSipAmount = sipAmount;
                effectiveSipDay = sipDay;
            }
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('fund_name', fundName);
        formData.append('file', file);
        formData.append('investment_type', 'sip');
        formData.append('sip_mode', sipMode);
        formData.append('invested_amount', effectiveSipAmount);
        formData.append('sip_amount', effectiveSipAmount);

        // Format date
        const formattedDate = sipMode === 'simple'
            ? formatDateForApi(startDate)
            : effectiveStartDate;
        formData.append('invested_date', formattedDate);

        formData.append('sip_day', effectiveSipDay);

        if (sipMode === 'simple') {
            formData.append('total_units', totalUnits);
            formData.append('total_invested_amount', totalInvestedAmount);
        } else {
            formData.append('total_units', '0');
            formData.append('total_invested_amount', '0');
            formData.append('detailed_installments', detailedInstallmentsJson);
            // Pass CAS's Total Cost Value for accurate invested amount (includes stamp duty)
            if (casCostValue) {
                formData.append('cas_cost_value', casCostValue.toString());
            }
            // Pass AMFI code directly from CAS (eliminates scheme selection ambiguity)
            if (casAmfiCode) {
                formData.append('scheme_code', casAmfiCode);
            }
        }

        // Step-up SIP fields (both modes)
        formData.append('stepup_enabled', stepupEnabled ? 'true' : 'false');
        formData.append('stepup_type', stepupType);
        formData.append('stepup_value', stepupValue || '');
        formData.append('stepup_frequency', stepupFrequency);

        if (nickname) formData.append('nickname', nickname);

        try {
            const response = await api.post('/upload-holdings/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const data = response.data;

            if (data.upload_status && data.upload_status.requires_selection) {
                setPendingFundId(data.upload_status.id);
                setCandidates(data.upload_status.candidates || []);
                setShowModal(true);
                setMessage({ type: '', text: '' });
            } else {
                setMessage({ type: 'success', text: `${sipMode === 'detailed' ? 'Detailed' : 'Simple'} SIP registered successfully!` });
                fetchFunds();
                resetForm();
            }
        } catch (error) {
            console.error(error);
            let userMsg = 'Upload failed. Please check the file format.';
            if (error.response?.data?.detail) {
                const detail = error.response.data.detail;
                userMsg = `Error: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`;
            }
            setMessage({ type: 'error', text: userMsg });
        } finally {
            setLoading(false);
        }
    };

    const formatDateForApi = (dateStr) => {
        // Convert YYYY-MM-DD to DD-MM-YYYY
        if (dateStr.includes('/') || (dateStr.match(/-/g) || []).length === 2) {
            const parts = dateStr.split('-');
            if (parts[0].length === 4) {
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        return dateStr;
    };

    const resetForm = () => {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setFundName('');
        setNickname('');
        setSipAmount('');
        setStartDate('');
        setSipDay('');
        setTotalUnits('');
        setTotalInvestedAmount('');
        setStepupEnabled(false);
        setStepupType('percentage');
        setStepupValue('');
        setStepupFrequency('Annual');
        setCasFile(null);
        setCasPassword('');
        setCasSchemes([]);
        setParsedTransactions([]);
        setCasCostValue(null);
        setCasAmfiCode(null);
        setSelectedCasScheme(null);
        setManualInstallments([{ date: '', amount: '', units: '' }]);
        setPendingFundId(null);
        setCandidates([]);
        setSelectedScheme(null);
        setShowModal(false);
        // Clear scheme search state
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
            setMessage({ type: 'success', text: 'Scheme selected and SIP registered!' });
            fetchFunds();
            resetForm();
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update scheme selection.' });
            setSelectedScheme(null);
        } finally {
            setLoading(false);
        }
    }

    const detailedSummary = getDetailedSummary();

    return (
        <div className="space-y-6">
            {/* Mode Toggle */}
            <div className="flex bg-white/5 p-1.5 rounded-xl border border-white/10">
                <button
                    type="button"
                    onClick={() => setSipMode('simple')}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                        ${sipMode === 'simple'
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Zap className="w-4 h-4" />
                    Simple
                </button>
                <button
                    type="button"
                    onClick={() => setSipMode('detailed')}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2
                        ${sipMode === 'detailed'
                            ? 'bg-gradient-to-r from-green-500 to-teal-500 text-white shadow-lg shadow-green-500/30'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Target className="w-4 h-4" />
                    Detailed
                </button>
            </div>

            {/* Mode Description */}
            <div className={`p-4 rounded-xl border ${sipMode === 'simple'
                ? 'bg-blue-500/10 border-blue-500/20'
                : 'bg-green-500/10 border-green-500/20'}`}>
                <div className="flex items-start gap-3">
                    {sipMode === 'simple'
                        ? <Zap className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        : <Target className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    }
                    <div>
                        <h4 className="text-sm font-semibold text-white mb-1">
                            {sipMode === 'simple' ? '⚡ Simple Setup' : '🎯 Detailed Setup'}
                        </h4>
                        <p className="text-xs text-zinc-400">
                            {sipMode === 'simple'
                                ? 'Quick setup with totals. XIRR will be approximate.'
                                : 'Full installment history for accurate XIRR calculation.'}
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleUpload} className="space-y-6">
                {/* Fund Name - Only for Simple Mode (Detailed mode uses CAS scheme name) */}
                {sipMode === 'simple' && (
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
                                placeholder="Type to search... e.g. Nippon Large Cap"
                                autoComplete="off"
                                className={`w-full bg-white/5 border rounded-xl pl-10 pr-10 py-3 text-white placeholder-zinc-600 focus:outline-none transition-colors ${selectedSchemeCode
                                    ? 'border-green-500/50 bg-green-500/5'
                                    : 'border-white/10 focus:border-blue-500'
                                    }`}
                            />
                            {searchLoading && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
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
                )}

                {/* Nickname (Optional) */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Nickname (Optional)</label>
                    <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. Monthly SIP"
                        autoComplete="off"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-primary transition-colors"
                    />
                </div>

                {/* Excel Upload Area (Common) */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Holdings File (Excel) <span className="text-red-500">*</span></label>
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleFileDrop}
                        className={`
                            border-2 border-dashed rounded-xl p-4 sm:p-6 text-center transition-all cursor-pointer relative group
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
                        <div className="flex flex-col items-center gap-2">
                            <FileSpreadsheet className={`w-6 h-6 ${file ? 'text-green-500' : 'text-zinc-500'}`} />
                            {file ? (
                                <div className="text-center">
                                    <p className="text-sm font-medium text-white">{file.name}</p>
                                    <button type="button" onClick={handleRemoveFile} className="text-xs text-red-400 hover:underline mt-1">Remove</button>
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-500">Drop Excel file or click to browse</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ==================== SIMPLE MODE ==================== */}
                <AnimatePresence mode="wait">
                    {sipMode === 'simple' && (
                        <motion.div
                            key="simple"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {/* SIP Amount & Start Date */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                                        SIP Amount (Monthly) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <input
                                            type="number"
                                            value={sipAmount}
                                            onChange={(e) => setSipAmount(e.target.value)}
                                            placeholder="5000"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                                        SIP Start Date <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SIP Day & Total Units */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">SIP Date (Day of Month) <span className="text-red-500">*</span></label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={sipDay}
                                        onChange={(e) => setSipDay(e.target.value)}
                                        placeholder="e.g. 5"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Total Units Held Till Date <span className="text-red-500">*</span></label>
                                    <input
                                        type="number"
                                        value={totalUnits}
                                        onChange={(e) => setTotalUnits(e.target.value)}
                                        placeholder="Total accumulated units"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                    <p className="text-[10px] text-zinc-500 mt-1">
                                        From CAS (<a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">CAMS</a>) or email. Enter 0 if starting fresh.
                                    </p>
                                </div>
                            </div>

                            {/* Total Invested Amount */}
                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Total Invested Amount Till Upload <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="number"
                                        value={totalInvestedAmount}
                                        onChange={(e) => setTotalInvestedAmount(e.target.value)}
                                        placeholder="e.g. 500000"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-1">From CAS or email. App tracks new investments separately.</p>
                            </div>

                            {/* Step-Up SIP (Collapsed by default) */}
                            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 space-y-4">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={stepupEnabled}
                                            onChange={(e) => setStepupEnabled(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-purple-500 transition-colors" />
                                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-purple-400" />
                                        <span className="text-sm font-medium text-white">Enable Step-Up SIP</span>
                                    </div>
                                </label>

                                <AnimatePresence>
                                    {stepupEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-4 overflow-hidden"
                                        >
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setStepupType('percentage')}
                                                    className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${stepupType === 'percentage'
                                                        ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                                                        }`}
                                                >
                                                    Percentage (%)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setStepupType('amount')}
                                                    className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${stepupType === 'amount'
                                                        ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                                                        }`}
                                                >
                                                    Fixed Amount (₹)
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                                                        {stepupType === 'percentage' ? 'Increase by (%)' : 'Increase by (₹)'}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={stepupValue}
                                                        onChange={(e) => setStepupValue(e.target.value)}
                                                        placeholder={stepupType === 'percentage' ? '10' : '500'}
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Frequency</label>
                                                    <select
                                                        value={stepupFrequency}
                                                        onChange={(e) => setStepupFrequency(e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors appearance-none cursor-pointer"
                                                    >
                                                        <option value="Annual" className="bg-zinc-900">Annual</option>
                                                        <option value="Half-Yearly" className="bg-zinc-900">Half-Yearly</option>
                                                        <option value="Quarterly" className="bg-zinc-900">Quarterly</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}

                    {/* ==================== DETAILED MODE ==================== */}
                    {sipMode === 'detailed' && (
                        <motion.div
                            key="detailed"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {/* CAS Import Section */}
                            <div className="border border-green-500/20 bg-green-500/5 rounded-xl p-4 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText className="w-5 h-5 text-green-400" />
                                    <span className="text-sm font-semibold text-white">Import from CAS (PDF)</span>
                                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Recommended</span>
                                </div>

                                {/* CAS Drop Zone */}
                                <div
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleCasFileDrop}
                                    className="border-2 border-dashed border-green-500/30 rounded-xl p-4 text-center hover:border-green-500/50 transition-colors cursor-pointer relative"
                                >
                                    <input
                                        type="file"
                                        ref={casFileRef}
                                        accept=".pdf"
                                        onChange={(e) => setCasFile(e.target.files[0])}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <FileText className={`w-6 h-6 mx-auto mb-2 ${casFile ? 'text-green-400' : 'text-zinc-500'}`} />
                                    {casFile ? (
                                        <div>
                                            <p className="text-sm text-white">{casFile.name}</p>
                                            <button type="button" onClick={handleRemoveCasFile} className="text-xs text-red-400 hover:underline mt-1">Remove</button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-zinc-500">Drop CAS PDF or click to browse</p>
                                    )}
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
                                    <input
                                        type="password"
                                        value={casPassword}
                                        onChange={(e) => setCasPassword(e.target.value)}
                                        placeholder="Enter CAS password"
                                        autoComplete="new-password"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                                    />
                                    <p className="text-[10px] text-zinc-500 mt-1">
                                        Try PAN + DOB (DDMMYYYY) or the one you set. Example: ABCDE1234F25121990
                                    </p>
                                </div>

                                {/* Links */}
                                <p className="text-[10px] text-zinc-500">
                                    Get CAS from{" "}
                                    <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                                        CAMS+KFintech
                                    </a>
                                    {" "}(covers all AMCs) or{" "}
                                    <a href="https://www.mfcentral.com/" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                                        MFCentral
                                    </a>
                                </p>

                                {/* Parse Button */}
                                <button
                                    type="button"
                                    onClick={handleParseCas}
                                    disabled={!casFile || !casPassword || parsingCas}
                                    className="w-full py-2.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {parsingCas ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                    {parsingCas ? 'Parsing...' : 'Parse CAS'}
                                </button>

                                {/* Scheme Selector */}
                                {casSchemes.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">Select Scheme</label>
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {casSchemes.map((scheme, idx) => (
                                                <button
                                                    type="button"
                                                    key={idx}
                                                    onClick={() => handleSelectCasScheme(scheme)}
                                                    className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${selectedCasScheme?.name === scheme.name
                                                        ? 'bg-green-500/20 border-green-500 text-white'
                                                        : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="truncate">{scheme.name}</span>
                                                        <span className="text-xs text-zinc-500">{scheme.transaction_count} txns</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Parsed Transactions Preview */}
                                {parsedTransactions.length > 0 && (
                                    <div className="bg-black/20 rounded-lg p-3">
                                        <p className="text-xs text-green-400 mb-2">✅ {parsedTransactions.length} transactions extracted</p>
                                        <div className="max-h-32 overflow-y-auto text-xs text-zinc-400 space-y-1">
                                            {parsedTransactions.slice(0, 5).map((t, i) => (
                                                <div key={i} className="flex justify-between">
                                                    <span>{t.date}</span>
                                                    <span>₹{t.amount.toLocaleString()}</span>
                                                    <span>{t.units} units</span>
                                                </div>
                                            ))}
                                            {parsedTransactions.length > 5 && (
                                                <p className="text-center text-zinc-500">... and {parsedTransactions.length - 5} more</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* OR Divider */}
                            <div className="flex items-center gap-4 text-zinc-500">
                                <div className="flex-1 h-px bg-zinc-700" />
                                <span className="text-sm">OR</span>
                                <div className="flex-1 h-px bg-zinc-700" />
                            </div>

                            {/* Manual Entry Section */}
                            <div className="border border-white/10 bg-white/5 rounded-xl p-4 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Plus className="w-5 h-5 text-zinc-400" />
                                    <span className="text-sm font-semibold text-white">Manual Entry</span>
                                </div>

                                {/* Installment Table */}
                                <div className="space-y-2">
                                    <div className="grid grid-cols-12 gap-2 text-xs text-zinc-500 uppercase tracking-wider px-1">
                                        <div className="col-span-4">Date</div>
                                        <div className="col-span-3">Amount</div>
                                        <div className="col-span-3">Units</div>
                                        <div className="col-span-2"></div>
                                    </div>

                                    {manualInstallments.map((inst, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2">
                                            <div className="col-span-4">
                                                <input
                                                    type="date"
                                                    value={inst.date}
                                                    onChange={(e) => updateManualInstallment(idx, 'date', e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-green-500 [color-scheme:dark]"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    value={inst.amount}
                                                    onChange={(e) => updateManualInstallment(idx, 'amount', e.target.value)}
                                                    placeholder="₹"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    value={inst.units}
                                                    onChange={(e) => updateManualInstallment(idx, 'units', e.target.value)}
                                                    placeholder="Units"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                                />
                                            </div>
                                            <div className="col-span-2 flex items-center justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => removeManualInstallment(idx)}
                                                    disabled={manualInstallments.length === 1}
                                                    className="p-1.5 text-zinc-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-zinc-500"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={addManualInstallment}
                                    className="w-full py-2 rounded-lg border border-dashed border-white/20 text-zinc-400 hover:text-white hover:border-white/40 text-sm flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Installment
                                </button>
                            </div>

                            {/* SIP Configuration for Detailed Mode */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-green-400" />
                                    SIP Configuration (for future tracking)
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                                            Current SIP Amount <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                            <input
                                                type="number"
                                                value={sipAmount}
                                                onChange={(e) => setSipAmount(e.target.value)}
                                                placeholder="5000"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                                            />
                                        </div>
                                        <p className="text-[10px] text-zinc-500 mt-1">Your current monthly SIP amount</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                                            SIP Day <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={sipDay}
                                            onChange={(e) => setSipDay(e.target.value)}
                                            placeholder="e.g. 5"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                                        />
                                        <p className="text-[10px] text-zinc-500 mt-1">Day of month for SIP deduction</p>
                                    </div>
                                </div>

                                {/* Step-Up SIP for Detailed Mode */}
                                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 space-y-4">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                checked={stepupEnabled}
                                                onChange={(e) => setStepupEnabled(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:bg-purple-500 transition-colors" />
                                            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-purple-400" />
                                            <span className="text-sm font-medium text-white">Enable Step-Up SIP</span>
                                        </div>
                                    </label>

                                    <AnimatePresence>
                                        {stepupEnabled && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="space-y-4 overflow-hidden"
                                            >
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setStepupType('percentage')}
                                                        className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${stepupType === 'percentage'
                                                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                                            : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        Percentage (%)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setStepupType('amount')}
                                                        className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${stepupType === 'amount'
                                                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                                            : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        Fixed Amount (₹)
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                                                            {stepupType === 'percentage' ? 'Increase by (%)' : 'Increase by (₹)'}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={stepupValue}
                                                            onChange={(e) => setStepupValue(e.target.value)}
                                                            placeholder={stepupType === 'percentage' ? '10' : '500'}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Frequency</label>
                                                        <select
                                                            value={stepupFrequency}
                                                            onChange={(e) => setStepupFrequency(e.target.value)}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors appearance-none cursor-pointer"
                                                        >
                                                            <option value="Annual" className="bg-zinc-900">Annual</option>
                                                            <option value="Half-Yearly" className="bg-zinc-900">Half-Yearly</option>
                                                            <option value="Quarterly" className="bg-zinc-900">Quarterly</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Summary Card */}
                            {(parsedTransactions.length > 0 || manualInstallments.some(i => i.date && i.amount)) && (
                                <div className="bg-gradient-to-r from-green-500/10 to-teal-500/10 border border-green-500/20 rounded-xl p-4">
                                    <h4 className="text-sm font-semibold text-white mb-3">📊 Summary</h4>
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <p className="text-2xl font-bold text-white">{detailedSummary.count}</p>
                                            <p className="text-xs text-zinc-400">Installments</p>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-green-400">₹{detailedSummary.totalInvested.toLocaleString()}</p>
                                            <p className="text-xs text-zinc-400">Total Invested</p>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-teal-400">{detailedSummary.totalUnits.toFixed(4)}</p>
                                            <p className="text-xs text-zinc-400">Total Units</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group ${sipMode === 'simple'
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/25'
                        : 'bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 shadow-green-500/25'
                        } text-white`}
                >
                    {loading ? (
                        <span className="animate-pulse">Processing...</span>
                    ) : (
                        <>
                            {sipMode === 'simple' ? '⚡ Register Simple SIP' : '🎯 Register Detailed SIP'}
                            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                        </>
                    )}
                </button>

                {/* Messages */}
                <AnimatePresence>
                    {message.text && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`p-4 rounded-xl flex items-center gap-2 text-sm ${message.type === 'error'
                                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                : 'bg-green-500/10 text-green-500 border border-green-500/20'
                                }`}
                        >
                            {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            {message.text}
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>

            {/* INLINE SCHEME SELECTION */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-6 space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-zinc-400">Multiple schemes found. Select the correct one:</p>
                            <button
                                onClick={resetForm}
                                className="text-xs text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1"
                            >
                                <X className="w-3 h-3" />
                                Cancel
                            </button>
                        </div>

                        <div className="space-y-2">
                            {candidates.map((c) => (
                                <button
                                    key={c.schemeCode}
                                    onClick={() => handleSchemeSelection(c.schemeCode)}
                                    disabled={loading && selectedScheme === c.schemeCode}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${selectedScheme === c.schemeCode
                                        ? 'bg-blue-500/20 border-blue-500/50'
                                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                        }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedScheme === c.schemeCode ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                                            <span className={`text-sm font-medium truncate ${selectedScheme === c.schemeCode ? 'text-white' : 'text-zinc-300'}`}>
                                                {c.schemeName}
                                            </span>
                                            {loading && selectedScheme === c.schemeCode && (
                                                <span className="text-blue-400 text-sm font-medium animate-pulse flex-shrink-0">
                                                    Uploading...
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 flex-shrink-0">
                                            {c.schemeCode}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default UploadSIP;
