import React, { useState, useContext, useRef, useEffect } from 'react';
import { LayoutDashboard, LogOut, PieChart, User, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import UploadHoldings from '../components/dashboard/UploadHoldings';
import FundList from '../components/dashboard/FundList';
import PortfolioAnalyzer from '../components/dashboard/PortfolioAnalyzer';
import FyersBanner from '../components/dashboard/FyersBanner';
import FyersConnectionCard from '../components/dashboard/FyersConnectionCard';
import { AuthContext } from '../context/AuthContext';

const Dashboard = () => {
    const navigate = useNavigate();
    const { user, logout } = useContext(AuthContext);
    const [selectedFund, setSelectedFund] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const settingsRef = useRef(null);
    const buttonRef = useRef(null);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                settingsRef.current &&
                !settingsRef.current.contains(event.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target)
            ) {
                setShowSettings(false);
            }
        };

        if (showSettings) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSettings]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent/20 rounded-lg">
                            <PieChart className="w-6 h-6 text-accent" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">Mutual Fund Tracker</h1>
                    </div>

                    <div className="flex items-center gap-4">
                        {user && (
                            <div className="flex items-center gap-2 text-sm font-medium text-white/80 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                                <User className="w-4 h-4 text-brand-accent" />
                                <span>Hi, {user.username}</span>
                            </div>
                        )}

                        {/* Settings Button with Floating Dropdown */}
                        <div className="relative">
                            <button
                                ref={buttonRef}
                                onClick={() => setShowSettings(!showSettings)}
                                className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-accent/20 text-accent' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                                title="Settings"
                            >
                                <Settings className="w-5 h-5" />
                            </button>

                            {/* Floating Settings Dropdown */}
                            <AnimatePresence>
                                {showSettings && (
                                    <motion.div
                                        ref={settingsRef}
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 top-full mt-2 w-72 md:w-96 z-50"
                                    >
                                        <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                                            {/* Header */}
                                            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                                                <h3 className="font-semibold text-white">Settings</h3>
                                                <button
                                                    onClick={() => setShowSettings(false)}
                                                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Content */}
                                            <div className="p-4">
                                                <FyersConnectionCard compact />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Fyers Banner - Shows when reconnection needed */}
                <FyersBanner />

                {/* Welcome Section */}
                <div>
                    <h2 className="text-2xl font-bold text-white">Portfolio Overview</h2>
                    <p className="text-zinc-400">Track your mutual funds and estimate daily NAV.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Main Column - Always full width now */}
                    <div className="lg:col-span-12 space-y-8">
                        <UploadHoldings />

                        <div className="bg-white/5 border border-white/5 rounded-2xl p-6 shadow-xl">
                            <FundList onSelect={(fund) => setSelectedFund(fund)} />
                        </div>
                    </div>
                </div>
            </main>

            {/* Analyzer Modal */}
            {selectedFund && (
                <PortfolioAnalyzer
                    fundId={selectedFund}
                    onClose={() => setSelectedFund(null)}
                />
            )}
        </div>
    );
};

export default Dashboard;
