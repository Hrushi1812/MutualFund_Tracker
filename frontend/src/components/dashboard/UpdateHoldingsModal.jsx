import React, { useState } from 'react';
import { X, Upload, RefreshCcw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';

const UpdateHoldingsModal = ({ isOpen, onClose, fundId, fundName, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [dragOver, setDragOver] = useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (!selectedFile.name.match(/\.(xls|xlsx)$/i)) {
                setError('Please upload an Excel file (.xls or .xlsx)');
                return;
            }
            setFile(selectedFile);
            setError(null);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
            if (!droppedFile.name.match(/\.(xls|xlsx)$/i)) {
                setError('Please upload an Excel file (.xls or .xlsx)');
                return;
            }
            setFile(droppedFile);
            setError(null);
        }
    };

    const handleSubmit = async () => {
        if (!file) {
            setError('Please select a file');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await api.patch(`/funds/${fundId}/holdings`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.error) {
                setError(response.data.error);
            } else {
                setSuccess(response.data.message || `Holdings updated: ${response.data.count} stocks`);
                setTimeout(() => {
                    onSuccess?.();
                    onClose();
                }, 1500);
            }
        } catch (err) {
            console.error('Update holdings failed:', err);
            setError(err.response?.data?.detail || 'Failed to update holdings. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setFile(null);
            setError(null);
            setSuccess(null);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#1a1b1e] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="p-5 border-b border-white/5 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <RefreshCcw className="w-5 h-5 text-amber-500" />
                                Update Holdings
                            </h2>
                            <p className="text-sm text-zinc-400 mt-0.5 truncate max-w-[280px]">
                                {fundName || 'Refresh portfolio allocation'}
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            disabled={loading}
                            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-5 space-y-4">
                        {/* Info Banner */}
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm">
                            <p className="text-amber-300/90">
                                Upload the latest holdings Excel from your AMC website to refresh stock allocations for accurate live NAV estimation.
                            </p>
                        </div>

                        {/* Drop Zone */}
                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            className={`
                                border-2 border-dashed rounded-xl p-6 transition-all text-center
                                ${dragOver ? 'border-accent bg-accent/10' : 'border-white/10 hover:border-white/20'}
                                ${file ? 'border-green-500/50 bg-green-500/5' : ''}
                            `}
                        >
                            <input
                                type="file"
                                accept=".xls,.xlsx"
                                onChange={handleFileChange}
                                className="hidden"
                                id="holdings-file-input"
                                disabled={loading}
                            />
                            <label
                                htmlFor="holdings-file-input"
                                className="cursor-pointer flex flex-col items-center gap-3"
                            >
                                {file ? (
                                    <>
                                        <div className="p-3 bg-green-500/20 rounded-full">
                                            <Check className="w-6 h-6 text-green-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{file.name}</p>
                                            <p className="text-xs text-zinc-500 mt-1">Click to change file</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-3 bg-white/5 rounded-full">
                                            <Upload className="w-6 h-6 text-zinc-400" />
                                        </div>
                                        <div>
                                            <p className="text-zinc-300">Drop Excel file here or click to browse</p>
                                            <p className="text-xs text-zinc-500 mt-1">Supports .xls and .xlsx</p>
                                        </div>
                                    </>
                                )}
                            </label>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Success Message */}
                        {success && (
                            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 p-3 rounded-lg">
                                <Check className="w-4 h-4 flex-shrink-0" />
                                <span>{success}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-white/5 flex gap-3">
                        <button
                            onClick={handleClose}
                            disabled={loading}
                            className="flex-1 py-2.5 px-4 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || !file}
                            className="flex-1 py-2.5 px-4 bg-accent hover:bg-accent/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                <>
                                    <RefreshCcw className="w-4 h-4" />
                                    Update Holdings
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default UpdateHoldingsModal;
