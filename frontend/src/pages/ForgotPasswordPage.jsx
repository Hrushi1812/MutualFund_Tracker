import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';

const ForgotPasswordPage = () => {
    const { forgotPassword } = useContext(AuthContext);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const result = await forgotPassword(email);

        setLoading(false);
        if (result.success) {
            setSuccess(result.message);
            setEmail('');
        } else {
            setError(result.message);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-accent/20 rounded-full blur-[128px]"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-glow/10 rounded-full blur-[128px]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-brand-card/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10 w-full max-w-md relative z-10"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-text to-brand-muted">
                        Forgot Password
                    </h1>
                    <p className="text-brand-muted text-sm mt-2">
                        Enter your email to receive a reset link
                    </p>
                </div>

                {error && (
                    <div className="mb-4 text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="mb-4 text-green-500 text-sm text-center bg-green-500/10 p-3 rounded">
                        <p className="font-medium">Reset link sent successfully!</p>
                        <p className="text-xs text-brand-muted mt-1">
                            Please check your inbox. If you don't see it, check your spam folder.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
                            Email Address
                        </label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted group-focus-within:text-brand-glow transition-colors" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-brand-surface border border-white/5 rounded-lg py-3 pl-10 pr-4 text-brand-text focus:outline-none focus:border-brand-glow/50 focus:ring-1 focus:ring-brand-glow/50 transition-all placeholder:text-gray-600"
                                placeholder="Enter your email"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-brand-accent to-brand-glow hover:opacity-90 text-white font-semibold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group shadow-lg shadow-brand-accent/25"
                    >
                        {loading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                Send Reset Link <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>

                    <div className="text-center mt-4">
                        <Link
                            to="/login"
                            className="text-brand-muted text-sm hover:text-brand-accent transition-colors inline-flex items-center gap-1"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Login
                        </Link>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default ForgotPasswordPage;
