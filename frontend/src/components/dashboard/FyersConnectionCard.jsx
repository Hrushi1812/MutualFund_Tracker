import React, { useState } from 'react';
import { Zap, ExternalLink, Check, X, Clock, AlertCircle, RefreshCw, Settings } from 'lucide-react';
import { useFyers } from '../../context/FyersContext';

/**
 * FyersConnectionCard - Shows Fyers connection status and management options.
 * 
 * Features:
 * - Connection status indicator
 * - Connect/Disconnect buttons
 * - Opt-out toggle for delayed data preference
 * - Token expiry info
 * - Clear explanation of what Fyers provides
 */
const FyersConnectionCard = ({ compact = false }) => {
    const {
        authenticated,
        configured,
        tokenExpiry,
        loading,
        isConnected,
        userOptedOut,
        getAuthUrl,
        disconnectFyers,
        toggleOptOut,
        checkFyersStatus,
    } = useFyers();

    const [connecting, setConnecting] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [pollIntervalId, setPollIntervalId] = useState(null);

    // Stop polling when authenticated
    React.useEffect(() => {
        if (authenticated && pollIntervalId) {
            clearInterval(pollIntervalId);
            setPollIntervalId(null);
            setConnecting(false);
        }
    }, [authenticated, pollIntervalId]);

    const handleConnect = async () => {
        try {
            setConnecting(true);
            const authUrl = await getAuthUrl();
            window.open(authUrl, '_blank', 'width=600,height=700');

            // Poll for status after user completes OAuth (every 10s for 2 min)
            let attempts = 0;
            const maxAttempts = 12;
            const intervalId = setInterval(async () => {
                attempts++;
                await checkFyersStatus(false);
                if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    setPollIntervalId(null);
                    setConnecting(false);
                }
            }, 10000);
            setPollIntervalId(intervalId);
        } catch (err) {
            console.error('Failed to start Fyers auth:', err);
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (confirm('Disconnect Fyers? You can reconnect anytime.')) {
            await disconnectFyers();
        }
    };

    const formatExpiry = (isoString) => {
        if (!isoString) return null;
        try {
            const date = new Date(isoString);
            return date.toLocaleString('en-IN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return null;
        }
    };

    return (
        <div className={compact ? "" : "bg-white/5 border border-white/10 rounded-2xl overflow-hidden"}>
            {/* Header */}
            <div className={`p-4 flex items-center justify-between ${compact ? "" : "border-b border-white/5"}`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-500/20' : 'bg-zinc-500/20'}`}>
                        <Zap className={`w-5 h-5 ${isConnected ? 'text-green-500' : 'text-zinc-400'}`} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Live Stock Data</h3>
                        <p className="text-xs text-zinc-400">Powered by Fyers API</p>
                    </div>
                </div>

                {/* Status Badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isConnected
                    ? 'bg-green-500/20 text-green-400'
                    : userOptedOut
                        ? 'bg-zinc-500/20 text-zinc-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                    {isConnected ? (
                        <>
                            <Check className="w-3 h-3" />
                            Connected
                        </>
                    ) : userOptedOut ? (
                        <>
                            <Clock className="w-3 h-3" />
                            Delayed Mode
                        </>
                    ) : (
                        <>
                            <AlertCircle className="w-3 h-3" />
                            Not Connected
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {/* Info Toggle */}
                <button
                    onClick={() => setShowInfo(!showInfo)}
                    className="w-full text-left text-sm text-zinc-400 hover:text-zinc-300 flex items-center gap-2 transition-colors"
                >
                    <Settings className="w-4 h-4" />
                    {showInfo ? 'Hide details' : 'Why connect Fyers?'}
                </button>

                {showInfo && (
                    <div className="bg-white/5 rounded-xl p-4 text-sm space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-accent/20 rounded-lg shrink-0">
                                <Zap className="w-4 h-4 text-accent" />
                            </div>
                            <div>
                                <p className="font-medium text-white">With Fyers (Free)</p>
                                <p className="text-zinc-400 text-xs mt-0.5">
                                    Real-time stock prices for accurate intraday NAV estimation. Updated every minute during market hours.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-zinc-500/20 rounded-lg shrink-0">
                                <Clock className="w-4 h-4 text-zinc-400" />
                            </div>
                            <div>
                                <p className="font-medium text-white">Without Fyers (Delayed Mode)</p>
                                <p className="text-zinc-400 text-xs mt-0.5">
                                    Uses NSE website scraping for stock prices. Data may be slightly delayed compared to live feed. <strong className="text-zinc-300">Still works great!</strong>
                                </p>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 space-y-2">
                            <p className="text-xs text-zinc-300 font-medium">How to get started with Fyers:</p>
                            <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
                                <li>Create a free Fyers account at <a href="https://fyers.in" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">fyers.in</a></li>
                                <li>No trading or deposits required - just the free account</li>
                                <li>Click "Connect Fyers" and login with your credentials</li>
                                <li>Sessions expire every 24 hours for security - just reconnect when prompted</li>
                            </ol>
                        </div>

                        <p className="text-xs text-zinc-500 pt-2 border-t border-white/5">
                            💡 <strong>Pro tip:</strong> The app never stops working if Fyers is unavailable. It automatically falls back to delayed data.
                        </p>
                    </div>
                )}

                {/* Token Expiry Info */}
                {authenticated && tokenExpiry && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Clock className="w-3.5 h-3.5" />
                        Session expires: {formatExpiry(tokenExpiry)}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                    {!authenticated ? (
                        <>
                            <button
                                onClick={handleConnect}
                                disabled={connecting || !configured}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {connecting ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4" />
                                        Connect Fyers
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </>
                                )}
                            </button>

                            {!userOptedOut && (
                                <button
                                    onClick={() => toggleOptOut(true)}
                                    className="px-4 py-2.5 text-zinc-400 hover:text-zinc-300 text-sm transition-colors"
                                >
                                    Skip
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => checkFyersStatus(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm rounded-lg transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Refresh Status
                            </button>

                            <button
                                onClick={handleDisconnect}
                                className="inline-flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 text-sm transition-colors"
                            >
                                <X className="w-4 h-4" />
                                Disconnect
                            </button>
                        </>
                    )}
                </div>

                {/* Opt-out Toggle */}
                {userOptedOut && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-sm text-zinc-400">Using delayed data mode</span>
                        <button
                            onClick={() => toggleOptOut(false)}
                            className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                            Enable live data
                        </button>
                    </div>
                )}

                {/* Not configured warning */}
                {!configured && (
                    <p className="text-xs text-amber-400/80 bg-amber-500/10 p-2 rounded-lg">
                        Fyers API credentials not configured on server. Contact admin.
                    </p>
                )}
            </div>
        </div>
    );
};

export default FyersConnectionCard;
