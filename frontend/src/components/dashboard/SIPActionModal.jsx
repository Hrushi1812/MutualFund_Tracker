import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, CheckCircle2, XCircle, Loader2, IndianRupee, AlertTriangle } from 'lucide-react';
import api from '../../api';

const SIPActionModal = ({ isOpen, onClose, pendingInstallment, fundId, fundName, onUpdate }) => {
    const [loadingAction, setLoadingAction] = useState(null); // 'PAID' | 'SKIPPED' | null
    const [error, setError] = useState('');
    const submittingRef = useRef(false); // Prevents double-submit

    if (!isOpen || !pendingInstallment) return null;

    const handleAction = async (action) => {
        // Prevent double-submit
        if (submittingRef.current) return;
        submittingRef.current = true;

        setLoadingAction(action);
        setError('');
        try {
            await api.post(`/funds/${fundId}/sip-action`, {
                date: pendingInstallment.date,
                action: action // "PAID" or "SKIPPED"
            });
            onUpdate(); // Refresh parent
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to update status. Please try again.');
        } finally {
            setLoadingAction(null);
            submittingRef.current = false; // Reset for potential retry
        }
    };


    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden"
                >
                    {/* Glow */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[50px] -z-10"></div>

                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        SIP Installment Due
                    </h3>

                    <p className="text-sm text-zinc-400 mb-6">
                        An installment for <span className="text-white font-medium">{fundName}</span> was expected on <span className="text-white font-medium">{pendingInstallment.date}</span>.
                    </p>

                    <div className="bg-white/5 rounded-xl p-4 mb-4 flex justify-between items-center border border-white/5">
                        <div className="text-sm text-zinc-400">Amount Due</div>
                        <div className="text-xl font-bold text-white flex items-center">
                            <IndianRupee className="w-4 h-4 mr-1" />
                            {pendingInstallment.amount}
                        </div>
                    </div>

                    {/* Action Explanation */}
                    <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2 p-2.5 text-xs text-green-400/90 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span><strong>Invested Amount</strong> will update immediately</span>
                        </div>
                        <div className="flex items-start gap-2 p-2.5 text-xs text-blue-400/90 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span><strong>Units</strong> will be allocated once official NAV is published (usually by evening)</span>
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleAction('SKIPPED')}
                            disabled={loadingAction !== null}
                            className="py-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/40 transition-all font-medium flex items-center justify-center gap-2"
                        >
                            {loadingAction === 'SKIPPED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            Skip
                        </button>

                        <button
                            onClick={() => handleAction('PAID')}
                            disabled={loadingAction !== null}
                            className="py-3 px-4 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/20 hover:border-green-500/40 transition-all font-bold flex items-center justify-center gap-2"
                        >
                            {loadingAction === 'PAID' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Invested
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={loadingAction !== null}
                        className="mt-4 w-full text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                        Decide Later
                    </button>

                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default SIPActionModal;
