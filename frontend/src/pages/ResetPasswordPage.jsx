import React, { useState, useContext, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, ArrowRight, AlertCircle, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';

const ResetPasswordPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { resetPassword } = useContext(AuthContext);

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [tokenValid, setTokenValid] = useState(true);

    const token = searchParams.get('token');

    // Password validation rules
    const passwordChecks = useMemo(() => ({
        length: formData.password.length >= 8,
        uppercase: /[A-Z]/.test(formData.password),
        lowercase: /[a-z]/.test(formData.password),
        number: /\d/.test(formData.password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password),
    }), [formData.password]);

    useEffect(() => {
        if (!token) {
            setTokenValid(false);
            setError('Invalid or missing reset token. Please request a new password reset link.');
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        const result = await resetPassword(token, formData.password);

        setLoading(false);
        if (result.success) {
            setSuccess(result.message);
            // Redirect to login after 2 seconds
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } else {
            setError(result.message);
        }
    };

    const RequirementItem = ({ met, text }) => (
        <li className={`flex items-center gap-2 transition-colors ${met ? 'text-green-500' : 'text-brand-muted'}`}>
            <Check className={`w-3 h-3 ${met ? 'opacity-100' : 'opacity-30'}`} />
            {text}
        </li>
    );

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
                        Reset Password
                    </h1>
                    <p className="text-brand-muted text-sm mt-2">
                        Enter your new password below
                    </p>
                </div>

                {error && (
                    <div className="mb-4 text-red-500 text-sm text-center bg-red-500/10 p-3 rounded flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                {success && (
                    <div className="mb-4 text-green-500 text-sm text-center bg-green-500/10 p-3 rounded">
                        {success}
                        <p className="text-xs text-brand-muted mt-2">Redirecting to login...</p>
                    </div>
                )}

                {tokenValid && !success && (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
                                New Password
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted group-focus-within:text-brand-glow transition-colors" />
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-brand-surface border border-white/5 rounded-lg py-3 pl-10 pr-4 text-brand-text focus:outline-none focus:border-brand-glow/50 focus:ring-1 focus:ring-brand-glow/50 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">
                                Confirm Password
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted group-focus-within:text-brand-glow transition-colors" />
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full bg-brand-surface border border-white/5 rounded-lg py-3 pl-10 pr-4 text-brand-text focus:outline-none focus:border-brand-glow/50 focus:ring-1 focus:ring-brand-glow/50 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="text-xs space-y-1">
                            <p className="text-brand-muted mb-2">Password must contain:</p>
                            <ul className="space-y-1 pl-1">
                                <RequirementItem met={passwordChecks.length} text="At least 8 characters" />
                                <RequirementItem met={passwordChecks.uppercase && passwordChecks.lowercase} text="Uppercase and lowercase letters" />
                                <RequirementItem met={passwordChecks.number} text="At least one number" />
                                <RequirementItem met={passwordChecks.special} text="At least one special character" />
                            </ul>
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
                                    Reset Password <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {!tokenValid && (
                    <div className="text-center">
                        <Link
                            to="/forgot-password"
                            className="text-brand-accent hover:text-brand-glow transition-colors"
                        >
                            Request a new reset link
                        </Link>
                    </div>
                )}

                <div className="text-center mt-6">
                    <Link
                        to="/login"
                        className="text-brand-muted text-sm hover:text-brand-accent transition-colors"
                    >
                        Back to Login
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};

export default ResetPasswordPage;
