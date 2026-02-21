import React, { useState, useContext } from 'react';
import { X, Calculator, Calendar, IndianRupee, TrendingUp, TrendingDown, Clock, Zap, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import { FyersContext } from '../../context/FyersContext';
import SIPActionModal from './SIPActionModal';

const PortfolioAnalyzer = ({ fundId, onClose }) => {
    // Fyers connection status for showing delayed data notice
    const fyersContext = useContext(FyersContext);
    const isUsingDelayedData = fyersContext && !fyersContext.isConnected;
    const [connectingFyers, setConnectingFyers] = useState(false);

    // State for Analysis Results
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true); // Start loading immediately
    const [error, setError] = useState(null);

    // SIP Modal State
    const [showSipModal, setShowSipModal] = useState(false);
    const [pendingInstallment, setPendingInstallment] = useState(null);

    const hasFetched = React.useRef(false);

    const handleConnectFyers = async () => {
        if (!fyersContext) return;
        try {
            setConnectingFyers(true);
            if (fyersContext.userOptedOut) {
                fyersContext.toggleOptOut(false);
            }
            const authUrl = await fyersContext.getAuthUrl();
            window.open(authUrl, '_blank', 'width=600,height=700');
        } catch (err) {
            console.error('Failed to start Fyers auth:', err);
        } finally {
            setConnectingFyers(false);
        }
    };

    // Auto-analyze on mount
    React.useEffect(() => {
        if (!hasFetched.current) {
            handleAnalyze(false); // Show SIP modal on initial load
            hasFetched.current = true;
        }
    }, []);

    const handleAnalyze = async (skipSipModal = false) => {
        setLoading(true);
        setError(null);
        setResult(null);

        // Send JSON payload
        const payload = { fund_id: fundId };

        try {
            const response = await api.post('/analyze-portfolio', payload);
            if (response.data.error) {
                setError(response.data.error);
            } else if (response.data && response.data.pnl !== undefined) {
                setResult(response.data);

                // Check for SIP Pending - only show if not suppressed
                if (!skipSipModal && response.data.sip_pending_installments && response.data.sip_pending_installments.length > 0) {
                    // Show the first pending installment
                    setPendingInstallment(response.data.sip_pending_installments[0]);
                    setShowSipModal(true);
                }
            } else {
                setError("No valid analysis data returned.");
            }
        } catch (err) {
            console.error("Analysis Failed:", err);
            setError("Failed to connect to server.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#1a1b1e] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/5 flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Calculator className="w-5 h-5 text-accent" />
                                Portfolio Analysis
                            </h2>
                            <p className="text-sm text-zinc-400 mt-1">
                                {result?.nickname || result?.fund_name || "Loading..."}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {loading ? (
                            <div className="space-y-6">
                                {/* Accent progress scanner */}
                                <div className="overflow-hidden rounded-full">
                                    <div className="skeleton-progress-line" />
                                </div>

                                {/* 3-col Metrics Skeleton with staggered entrance */}
                                <motion.div
                                    className="grid grid-cols-3 gap-2 sm:gap-4"
                                    initial="hidden"
                                    animate="visible"
                                    variants={{
                                        hidden: {},
                                        visible: { transition: { staggerChildren: 0.15 } }
                                    }}
                                >
                                    {['Invested', '1D Returns', 'Total Returns'].map((label, i) => (
                                        <motion.div
                                            key={label}
                                            className="flex flex-col gap-2"
                                            variants={{
                                                hidden: { opacity: 0, y: 12 },
                                                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
                                            }}
                                        >
                                            <span className="text-[10px] sm:text-xs text-zinc-600 font-medium tracking-wide">
                                                {label}
                                            </span>
                                            <div className={`skeleton-bone ${i === 0 ? 'h-6 w-24' : i === 1 ? 'h-5 w-16 mx-auto' : 'h-5 w-20 ml-auto'}`} />
                                            <div className={`skeleton-bone h-3 ${i === 0 ? 'w-16' : i === 1 ? 'w-12 mx-auto' : 'w-14 ml-auto'}`} />
                                        </motion.div>
                                    ))}
                                </motion.div>

                                {/* Mini Heartbeat Chart — feels alive */}
                                <motion.div
                                    className="flex items-end justify-center gap-[3px] h-8 py-1"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5, duration: 0.4 }}
                                >
                                    {[0.5, 0.8, 0.4, 1, 0.6, 0.9, 0.3, 0.7, 0.95, 0.55, 0.85, 0.45].map((h, i) => (
                                        <div
                                            key={i}
                                            className="skeleton-chart-bar w-[6px]"
                                            style={{
                                                height: `${h * 100}%`,
                                                animationDelay: `${i * 0.1}s`,
                                            }}
                                        />
                                    ))}
                                </motion.div>

                                {/* Secondary Info Card Skeleton */}
                                <motion.div
                                    className="bg-white/[0.03] rounded-2xl p-4 border border-white/5 space-y-3"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.35, duration: 0.5 }}
                                >
                                    {/* Current Value row */}
                                    <div className="flex justify-between items-center">
                                        <div className="skeleton-bone h-4 w-24" />
                                        <div className="skeleton-bone h-6 w-28" />
                                    </div>
                                    <div className="h-px bg-white/5" />
                                    {/* NAV row */}
                                    <div className="flex justify-between items-center">
                                        <div className="skeleton-bone h-4 w-20" />
                                        <div className="flex items-center gap-2">
                                            {/* 3D coin flip */}
                                            <div className="skeleton-coin w-5 h-5 rounded-full bg-gradient-to-br from-accent/40 to-indigo-400/20 border border-accent/30 flex items-center justify-center">
                                                <span className="text-[8px] text-accent/60 font-bold">₹</span>
                                            </div>
                                            <div className="skeleton-bone h-4 w-16" />
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Footer note skeleton */}
                                <motion.div
                                    className="flex flex-col items-center gap-1.5 pt-1"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.6, duration: 0.4 }}
                                >
                                    <div className="skeleton-bone h-2 w-44" />
                                    <div className="skeleton-bone h-2 w-28" />
                                </motion.div>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                <div className="p-3 bg-red-500/10 rounded-full mb-3 text-red-500 border border-red-500/20">
                                    <TrendingDown className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Analysis Failed</h3>
                                <p className="text-sm text-zinc-400 mb-6">{error}</p>
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/5"
                                >
                                    Close
                                </button>
                            </div>
                        ) : result ? (
                            // Results View
                            <div className="space-y-6">
                                {/* Key Metrics Grid - Creative Redesign */}
                                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
                                    {/* Invested - Split view for SIP */}
                                    <div className="flex flex-col">
                                        {result.investment_type === 'sip' && result.manual_invested_amount > 0 ? (
                                            <>
                                                <span className="text-[10px] sm:text-xs text-zinc-500 mb-1 font-medium tracking-wide">Total Invested</span>
                                                <span className="text-base sm:text-lg font-bold text-white tracking-tight">₹{result.invested_amount}</span>
                                                <div className="text-[9px] text-zinc-500 mt-1 space-y-0.5">
                                                    <div>Till Upload: ₹{result.manual_invested_amount}</div>
                                                    <div>After Upload: ₹{result.invested_amount - result.manual_invested_amount}</div>
                                                </div>
                                                <div className="text-[8px] text-zinc-600 italic mt-1">*Assuming past SIPs paid</div>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-[10px] sm:text-xs text-zinc-500 mb-1 font-medium tracking-wide">Invested</span>
                                                <span className="text-base sm:text-lg font-bold text-white tracking-tight">₹{result.invested_amount}</span>
                                            </>
                                        )}
                                    </div>

                                    {/* 1D Returns */}
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] sm:text-xs text-zinc-500 mb-1 font-medium tracking-wide">1D returns</span>
                                        <div className={`flex flex-col items-center leading-tight ${result.day_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            <span className="text-sm border-b border-transparent font-bold whitespace-nowrap">
                                                {result.day_pnl >= 0 ? '+' : ''}₹{Math.abs(result.day_pnl)}
                                            </span>
                                            <span className="text-[10px] sm:text-xs font-medium opacity-80 whitespace-nowrap">
                                                ({result.day_pnl >= 0 ? '+' : ''}{result.day_pnl_pct}%)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Total Returns */}
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] sm:text-xs text-zinc-500 mb-1 font-medium tracking-wide">Total returns</span>
                                        <div className={`flex flex-col items-end leading-tight ${result.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            <span className="text-sm font-bold whitespace-nowrap">
                                                {result.pnl >= 0 ? '+' : ''}₹{Math.abs(result.pnl)}
                                            </span>
                                            <span className="text-[10px] sm:text-xs font-medium opacity-80 whitespace-nowrap">
                                                ({result.pnl >= 0 ? '+' : ''}{result.pnl_pct}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Secondary Info Card */}
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-zinc-400">Current Value</span>
                                        <span className="font-mono font-bold text-xl text-white">₹{result.current_value}</span>
                                    </div>
                                    <div className="h-px bg-white/5 w-full my-2"></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-zinc-400">{isUsingDelayedData ? 'NAV (Est)' : 'Live NAV (Est)'}</span>
                                        <span className="font-mono text-white">₹{result.current_nav}</span>
                                    </div>
                                    {/* XIRR - Annualized Return for SIP */}
                                    {result.investment_type === 'sip' && result.xirr !== null && result.xirr !== undefined && (
                                        <>
                                            <div className="h-px bg-white/5 w-full my-2"></div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-zinc-400">Annualized Return (XIRR)</span>
                                                <span className={`font-mono font-semibold ${result.xirr >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {result.xirr >= 0 ? '+' : ''}{result.xirr}%
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Stale Holdings Warning */}
                                {result.is_stale && (
                                    <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-medium">
                                                Holdings data is {result.days_since_update ? `${result.days_since_update} days` : ''} old
                                            </span>
                                            <span className="block text-amber-300/70">
                                                Update from your AMC website for accurate live NAV estimation
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Delayed Data Notice - Clickable to connect Fyers */}
                                {isUsingDelayedData && (
                                    <button
                                        onClick={handleConnectFyers}
                                        disabled={connectingFyers}
                                        className="flex items-center justify-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 hover:bg-amber-500/20 p-2 rounded-lg transition-colors w-full"
                                    >
                                        <Clock className="w-3.5 h-3.5" />
                                        {connectingFyers ? 'Opening Fyers login...' : 'Using NSE data (delayed)'}
                                        <span className="text-amber-300">· Click to get live prices</span>
                                        <Zap className="w-3 h-3" />
                                    </button>
                                )}


                                {/* Pending NAV Warning - Units not yet allocated */}
                                {result.investment_type === 'sip' && result.has_pending_nav_sip && (
                                    <div className="flex flex-col gap-1 text-xs text-blue-400/80 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
                                        <div className="flex items-start gap-2">
                                            <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-medium">Current SIP: ₹{result.pending_nav_amount} paid</span>
                                                <span className="block text-blue-300/70">Units pending allocation — awaiting next official NAV</span>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-blue-300/50 ml-5">
                                            P&L excludes this SIP until units are allocated
                                        </span>
                                    </div>
                                )}

                                {/* Estimated Units Warning for SIP */}
                                {result.investment_type === 'sip' && result.has_estimated_units && !result.has_pending_nav_sip && (
                                    <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-500/10 p-2 rounded-lg">
                                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        <span>Units include estimates (T+1 settlement). Sync with CAS for accurate values.</span>
                                    </div>
                                )}

                                {/* Note */}
                                <div className="text-[10px] text-center text-zinc-600 px-4">
                                    {result.note}
                                    <br />
                                    Last Updated: {result.last_updated}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </motion.div>
            </motion.div>
            <SIPActionModal
                isOpen={showSipModal}
                onClose={() => setShowSipModal(false)}
                pendingInstallment={pendingInstallment}
                fundId={fundId}
                fundName={result?.fund_name}
                onUpdate={() => handleAnalyze(true)} // Re-run analysis but skip modal reopening
            />
        </AnimatePresence>
    );
};

export default PortfolioAnalyzer;
