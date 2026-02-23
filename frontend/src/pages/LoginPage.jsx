import React, { useState, useContext, useRef, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';
import ServerWakeUp from '../components/ui/ServerWakeUp';
import api from '../api';

const COLD_START_THRESHOLD_MS = 1000;

const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useContext(AuthContext);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showWakeUp, setShowWakeUp] = useState(false);

    // Refs to coordinate between the login promise and the wake-up screen
    const loginResolvedRef = useRef(false);
    const credentialsRef = useRef({ username: '', password: '' });
    const coldStartTimerRef = useRef(null);
    const wakeUpShownRef = useRef(false);

    // ── Phase 1: Pre-warm the backend as soon as the login page loads ──
    // This fires a GET /health to wake Render up while the user types credentials
    useEffect(() => {
        api.get('/health').catch(() => { });
    }, []);

    // Cleanup cold-start timer on unmount
    useEffect(() => {
        return () => {
            if (coldStartTimerRef.current) {
                clearTimeout(coldStartTimerRef.current);
                coldStartTimerRef.current = null;
            }
        };
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        loginResolvedRef.current = false;
        wakeUpShownRef.current = false;
        credentialsRef.current = { username: formData.username, password: formData.password };

        // Start a timer: if login takes too long → show wake-up overlay
        coldStartTimerRef.current = setTimeout(() => {
            if (!loginResolvedRef.current) {
                wakeUpShownRef.current = true;
                setShowWakeUp(true);
            }
        }, COLD_START_THRESHOLD_MS);

        try {
            const result = await login(formData.username, formData.password);
            clearTimeout(coldStartTimerRef.current);

            // Server is unreachable (network error) — show wake-up overlay
            if (result.isNetworkError && !wakeUpShownRef.current) {
                wakeUpShownRef.current = true;
                setShowWakeUp(true);
                return; // Don't mark as resolved — let wake-up screen handle retry
            }

            loginResolvedRef.current = true;

            // If the wake-up screen was NOT shown, handle normally
            if (!wakeUpShownRef.current) {
                setLoading(false);
                if (result.success) {
                    navigate('/dashboard');
                } else {
                    setError(result.message);
                }
            } else {
                // Login finished while wake-up screen is showing
                if (result.success) {
                    loginResolvedRef.current = 'success';
                } else {
                    loginResolvedRef.current = 'failed';
                    setError(result.message);
                }
            }
        } catch (err) {
            clearTimeout(coldStartTimerRef.current);

            // Network error (connection refused / server unreachable) = server is down
            const isNetworkError = !err?.response;

            if (isNetworkError && !wakeUpShownRef.current) {
                // Server is completely unreachable — show wake-up screen
                wakeUpShownRef.current = true;
                setShowWakeUp(true);
            } else if (!wakeUpShownRef.current) {
                loginResolvedRef.current = true;
                setLoading(false);
                setError('Connection failed. Please try again.');
            }
        }
    };

    const handleServerReady = useCallback(async () => {
        setShowWakeUp(false);

        // If login already resolved while wake-up was showing
        if (loginResolvedRef.current === 'success') {
            setLoading(false);
            navigate('/dashboard');
            return;
        }

        if (loginResolvedRef.current === 'failed') {
            setLoading(false);
            return;
        }

        // Server just woke up — retry the login
        try {
            const result = await login(
                credentialsRef.current.username,
                credentialsRef.current.password
            );
            setLoading(false);
            if (result.success) {
                navigate('/dashboard');
            } else {
                setError(result.message);
            }
        } catch {
            setLoading(false);
            setError('Login failed after server wake-up. Please try again.');
        }
    }, [login, navigate]);

    return (
        <>
            {/* Wake-Up Overlay */}
            <ServerWakeUp
                isVisible={showWakeUp}
                onServerReady={handleServerReady}
            />

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
                            Welcome Back
                        </h1>
                        <p className="text-brand-muted text-sm mt-2">Access your portfolio dashboard</p>
                    </div>

                    {error && <div className="mb-4 text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Username</label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted group-focus-within:text-brand-glow transition-colors" />
                                <input
                                    type="text"
                                    required
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full bg-brand-surface border border-white/5 rounded-lg py-3 pl-10 pr-4 text-brand-text focus:outline-none focus:border-brand-glow/50 focus:ring-1 focus:ring-brand-glow/50 transition-all placeholder:text-gray-600"
                                    placeholder="Enter username"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted group-focus-within:text-brand-glow transition-colors" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-brand-surface border border-white/5 rounded-lg py-3 pl-10 pr-12 text-brand-text focus:outline-none focus:border-brand-glow/50 focus:ring-1 focus:ring-brand-glow/50 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-glow transition-colors focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Link
                                to="/forgot-password"
                                className="text-brand-muted text-xs hover:text-brand-accent transition-colors"
                            >
                                Forgot Password?
                            </Link>
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
                                    Sign In <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <div className="text-center mt-4">
                            <p className="text-brand-muted text-sm">
                                Don't have an account?{' '}
                                <Link to="/register" className="text-brand-accent hover:text-brand-glow transition-colors">
                                    Register
                                </Link>
                            </p>
                        </div>
                    </form>
                </motion.div>
            </div>
        </>
    );
};

export default LoginPage;
