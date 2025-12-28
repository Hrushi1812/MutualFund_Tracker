import React, { useState } from 'react';
import { Upload, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import UploadLumpsum from './UploadLumpsum';
import UploadSIP from './UploadSIP';

const UploadHoldings = () => {
    const [activeTab, setActiveTab] = useState('lumpsum'); // 'lumpsum' | 'sip'

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-6 md:p-8 rounded-3xl relative overflow-hidden"
        >
            {/* Glow Effect */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10"></div>

            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/20 text-primary">
                    <Upload className="w-5 h-5" />
                </div>
                Upload Portfolio
            </h2>

            {/* Info Notice for Unsupported Plan Types */}
            <p className="mb-6 text-sm text-zinc-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Only Growth plans supported. IDCW & Bonus plans not supported.
            </p>

            {/* Tab Navigation */}
            <div className="mb-8">
                <div className="flex bg-white/5 p-1.5 rounded-2xl w-full border border-white/10">
                    <button
                        type="button"
                        onClick={() => setActiveTab('lumpsum')}
                        className={`flex-1 px-3 sm:px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${activeTab === 'lumpsum'
                            ? 'bg-primary text-white shadow-lg shadow-primary/25'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <TrendingUp className="w-4 h-4" />
                        <span className="hidden sm:inline">Lumpsum Investment</span>
                        <span className="sm:hidden">Lumpsum</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('sip')}
                        className={`flex-1 px-3 sm:px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${activeTab === 'sip'
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-purple-500/25'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span className="hidden sm:inline">SIP (Systematic)</span>
                        <span className="sm:hidden">SIP</span>
                    </button>
                </div>
            </div>

            {/* Render Active Form */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: activeTab === 'lumpsum' ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
            >
                {activeTab === 'lumpsum' ? <UploadLumpsum /> : <UploadSIP />}
            </motion.div>
        </motion.div>
    );
};

export default UploadHoldings;
