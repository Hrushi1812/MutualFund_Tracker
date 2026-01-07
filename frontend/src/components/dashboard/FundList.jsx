import React, { useContext, useState } from 'react';
import { Database, RefreshCw, ChevronRight, Trash2, AlertCircle, Zap, Clock, RefreshCcw, Upload } from 'lucide-react';
import api from '../../api';
import { PortfolioContext } from '../../context/PortfolioContext';
import { FyersContext } from '../../context/FyersContext';
import UpdateHoldingsModal from './UpdateHoldingsModal';

// Reusable Fund Card Component
const FundCard = ({ fund, onSelect, onDelete, onUpdateHoldings, isSIP = false }) => (
    <div
        onClick={() => onSelect && onSelect(fund.id)}
        className={`bg-white/5 border p-4 rounded-xl transition-all cursor-pointer group active:scale-[0.98] relative ${isSIP
            ? 'border-purple-500/20 hover:border-purple-500/50'
            : 'border-white/5 hover:border-accent/50'
            }`}
    >
        {/* SIP indicator stripe */}
        {isSIP && (
            <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
        )}

        <div className="flex justify-between items-center">
            <div className={`flex-1 overflow-hidden ${isSIP ? 'pl-2' : ''}`}>
                <h3 className="font-semibold text-foreground truncate pr-8 flex items-center gap-2">
                    {fund.nickname || fund.fund_name}
                    {isSIP && (
                        <RefreshCcw className="w-3 h-3 text-purple-400" />
                    )}
                    {fund.is_stale && (
                        <div className="group/tooltip relative">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs bg-zinc-800 text-white rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                                Holdings outdated{fund.days_since_update ? ` (${fund.days_since_update}d)` : ''}
                            </span>
                        </div>
                    )}
                </h3>
                {fund.nickname && (
                    <p className="text-xs text-zinc-500 truncate mb-1">
                        {fund.fund_name}
                    </p>
                )}
                <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                    {fund.invested_amount ? (
                        <>
                            <span className="text-zinc-300">₹{fund.invested_amount} invested</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                        </>
                    ) : null}
                    {fund.invested_date ? (
                        <span>Started {fund.invested_date}</span>
                    ) : (
                        <span>Click to Analyze</span>
                    )}
                </p>
                {/* Stale Holdings Update Button */}
                {fund.is_stale && (
                    <button
                        onClick={(e) => onUpdateHoldings(e, fund.id, fund.fund_name)}
                        className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded-md transition-colors"
                    >
                        <Upload className="w-3 h-3" />
                        Update Holdings
                    </button>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={(e) => onDelete(e, fund.id, fund.fund_name)}
                    className="p-2 hover:bg-red-500/20 text-zinc-500 hover:text-red-500 rounded-lg transition-colors z-10"
                    title="Delete Portfolio"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className={`w-5 h-5 transition-colors ${isSIP ? 'text-purple-400 group-hover:text-purple-300' : 'text-zinc-400 group-hover:text-accent'}`} />
            </div>
        </div>
    </div>
);

const FundList = ({ onSelect }) => {
    const { funds, loading, fetchFunds } = useContext(PortfolioContext);
    const fyersContext = useContext(FyersContext);
    const isLiveData = fyersContext?.isConnected;
    const userOptedOut = fyersContext?.userOptedOut;
    const [connectingFyers, setConnectingFyers] = useState(false);

    // Update Holdings Modal State
    const [updateModalOpen, setUpdateModalOpen] = useState(false);
    const [updateFundId, setUpdateFundId] = useState(null);
    const [updateFundName, setUpdateFundName] = useState('');

    const handleUpdateHoldings = (e, fundId, fundName) => {
        e.stopPropagation();
        setUpdateFundId(fundId);
        setUpdateFundName(fundName);
        setUpdateModalOpen(true);
    };

    const handleUpdateSuccess = () => {
        fetchFunds(); // Refresh the fund list
    };

    const handleDelete = async (e, fundId, fundName) => {
        e.stopPropagation(); // Prevent opening the analyzer
        if (window.confirm(`Are you sure you want to delete "${fundName}"?`)) {
            try {
                await api.delete(`/funds/${fundId}`);
                fetchFunds(); // Refresh globally
            } catch (error) {
                console.error("Failed to delete fund:", error);
                alert("Failed to delete fund. Please try again.");
            }
        }
    };

    const handleConnectFyers = async () => {
        if (!fyersContext) return;
        try {
            setConnectingFyers(true);
            // First, opt back in if user had opted out
            if (userOptedOut) {
                fyersContext.toggleOptOut(false);
            }
            const authUrl = await fyersContext.getAuthUrl();
            window.open(authUrl, '_blank', 'width=600,height=700');
            // No polling here - FyersConnectionCard handles polling when user clicks there
            // User can refresh or the banner will show status
        } catch (err) {
            console.error('Failed to start Fyers auth:', err);
        } finally {
            setConnectingFyers(false);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Database className="w-5 h-5 text-accent" />
                        Your Portfolios
                    </h2>
                    {/* Data source indicator - clickable when in delayed mode */}
                    {isLiveData ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            <Zap className="w-3 h-3" />
                            Live
                        </div>
                    ) : (
                        <button
                            onClick={handleConnectFyers}
                            disabled={connectingFyers}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-colors cursor-pointer"
                            title="Click to connect Fyers for live data"
                        >
                            <Clock className="w-3 h-3" />
                            {connectingFyers ? 'Connecting...' : 'Delayed · Upgrade'}
                        </button>
                    )}
                </div>
                <button
                    onClick={fetchFunds}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white"
                    title="Refresh List"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {funds.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-xl">
                    <p className="text-zinc-400">No portfolios found. Upload one to get started.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Lumpsum Section */}
                    {funds.filter(f => f.investment_type !== 'sip').length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-4 bg-primary rounded-full"></div>
                                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Lumpsum Investments</h3>
                                <span className="text-xs text-zinc-500">({funds.filter(f => f.investment_type !== 'sip').length})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {funds.filter(f => f.investment_type !== 'sip').map((fund) => (
                                    <FundCard key={fund.id} fund={fund} onSelect={onSelect} onDelete={handleDelete} onUpdateHoldings={handleUpdateHoldings} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SIP Section */}
                    {funds.filter(f => f.investment_type === 'sip').length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
                                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">SIP Investments</h3>
                                <span className="text-xs text-zinc-500">({funds.filter(f => f.investment_type === 'sip').length})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {funds.filter(f => f.investment_type === 'sip').map((fund) => (
                                    <FundCard key={fund.id} fund={fund} onSelect={onSelect} onDelete={handleDelete} onUpdateHoldings={handleUpdateHoldings} isSIP={true} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Update Holdings Modal */}
            <UpdateHoldingsModal
                isOpen={updateModalOpen}
                onClose={() => setUpdateModalOpen(false)}
                fundId={updateFundId}
                fundName={updateFundName}
                onSuccess={handleUpdateSuccess}
            />
        </div>
    );
};

export default FundList;
