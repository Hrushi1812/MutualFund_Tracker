import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Check, Lightbulb } from 'lucide-react';
import api from '../../api';
import './ServerWakeUp.css';

// ── Status Lines ──
const STATUS_LINES = [
    { text: 'Establishing secure connection...', delay: 300 },
    { text: 'Waking up servers...', delay: 2500 },
    { text: 'Loading portfolio engine...', delay: 5500 },
    { text: 'Syncing market data...', delay: 9000 },
    { text: 'Preparing your dashboard...', delay: 14000 },
    { text: 'Almost there, hang tight...', delay: 22000 },
];

const SUCCESS_LINE = { text: 'Connected successfully!', isSuccess: true };

// ── Tips that rotate while waiting ──
const TIPS = [
    'Our servers sleep after 15 min of inactivity to save resources.',
    'Your portfolio data is encrypted end-to-end.',
    'NAV data is synced live from AMFI during market hours.',
    'You can track XIRR, SIP step-ups, and P&L in real time.',
    'Cold starts typically take 30–50 seconds on Render.',
];

// ── Floating Particles ──
const generateParticles = (count) =>
    Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        duration: `${8 + Math.random() * 12}s`,
        delay: `${Math.random() * 10}s`,
        size: `${1.5 + Math.random() * 2}px`,
    }));

const ServerWakeUp = ({ isVisible, onServerReady }) => {
    const [visibleLines, setVisibleLines] = useState([]);
    const [progress, setProgress] = useState(0);
    const [serverAwake, setServerAwake] = useState(false);
    const [showFlash, setShowFlash] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [tipIndex, setTipIndex] = useState(0);

    const pollRef = useRef(null);
    const timersRef = useRef([]);
    const progressRef = useRef(null);
    const tipRef = useRef(null);

    const particles = useMemo(() => generateParticles(20), []);

    // ── Health Polling ──
    const startPolling = useCallback(() => {
        const poll = async () => {
            try {
                await api.get('/health');
                setServerAwake(true);
                clearInterval(pollRef.current);
            } catch {
                // Server still waking up
            }
        };
        poll();
        pollRef.current = setInterval(poll, 5000);
    }, []);

    // ── Progress Bar ──
    const startProgress = useCallback(() => {
        const startTime = Date.now();
        const totalDuration = 45000;

        const tick = () => {
            const elapsed = Date.now() - startTime;
            const ratio = Math.min(elapsed / totalDuration, 1);
            const eased = 1 - Math.pow(1 - ratio, 2);
            setProgress(Math.round(eased * 90));
            progressRef.current = requestAnimationFrame(tick);
        };

        progressRef.current = requestAnimationFrame(tick);
    }, []);

    // ── Status Lines on Schedule ──
    const startStatusLines = useCallback(() => {
        STATUS_LINES.forEach((line, index) => {
            const timer = setTimeout(() => {
                setVisibleLines((prev) => [...prev, { ...line, index }]);
            }, line.delay);
            timersRef.current.push(timer);
        });
    }, []);

    // ── Rotating Tips ──
    const startTips = useCallback(() => {
        tipRef.current = setInterval(() => {
            setTipIndex((prev) => (prev + 1) % TIPS.length);
        }, 6000);
    }, []);

    // ── Main Init ──
    useEffect(() => {
        if (!isVisible) return;

        setVisibleLines([]);
        setProgress(0);
        setServerAwake(false);
        setShowFlash(false);
        setExiting(false);
        setTipIndex(0);

        startPolling();
        startProgress();
        startStatusLines();
        startTips();

        return () => {
            clearInterval(pollRef.current);
            clearInterval(tipRef.current);
            timersRef.current.forEach(clearTimeout);
            timersRef.current = [];
            if (progressRef.current) cancelAnimationFrame(progressRef.current);
        };
    }, [isVisible, startPolling, startProgress, startStatusLines, startTips]);

    // ── Server Awake Handler ──
    useEffect(() => {
        if (!serverAwake || exiting) return;

        if (progressRef.current) cancelAnimationFrame(progressRef.current);
        clearInterval(tipRef.current);
        setProgress(100);

        setVisibleLines((prev) => [
            ...prev,
            { ...SUCCESS_LINE, index: prev.length },
        ]);

        const flashTimer = setTimeout(() => setShowFlash(true), 300);
        const exitTimer = setTimeout(() => {
            setExiting(true);
            setTimeout(() => {
                onServerReady?.();
            }, 500);
        }, 1200);

        return () => {
            clearTimeout(flashTimer);
            clearTimeout(exitTimer);
        };
    }, [serverAwake, exiting, onServerReady]);

    const activeIndex = visibleLines.length - 1;

    return (
        <AnimatePresence>
            {isVisible && !exiting && (
                <motion.div
                    className="wakeup-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    {/* Aurora */}
                    <div className="wakeup-aurora">
                        <div className="wakeup-aurora-blob wakeup-aurora-blob--1" />
                        <div className="wakeup-aurora-blob wakeup-aurora-blob--2" />
                        <div className="wakeup-aurora-blob wakeup-aurora-blob--3" />
                    </div>

                    {/* Floating Particles */}
                    <div className="wakeup-particles">
                        {particles.map((p) => (
                            <div
                                key={p.id}
                                className="wakeup-particle"
                                style={{
                                    left: p.left,
                                    width: p.size,
                                    height: p.size,
                                    animationDuration: p.duration,
                                    animationDelay: p.delay,
                                }}
                            />
                        ))}
                    </div>

                    {/* Main Card */}
                    <div className="wakeup-card">
                        {/* Icon with orbital ring */}
                        <div className="wakeup-icon-hub">
                            <div className="wakeup-orbit">
                                <div className="wakeup-orbit-dot" />
                            </div>
                            <div className="wakeup-icon">
                                <Server />
                            </div>
                        </div>

                        <div className="wakeup-title">Waking Up Server</div>
                        <div className="wakeup-subtitle">
                            Free-tier servers sleep after inactivity — hang tight!
                        </div>

                        {/* Status Lines */}
                        <div className="wakeup-status-area">
                            {visibleLines.map((line, i) => {
                                const isDone = line.isSuccess
                                    ? false
                                    : i < activeIndex || serverAwake;
                                const isActive = i === activeIndex && !serverAwake && !line.isSuccess;

                                return (
                                    <div className="wakeup-line" key={line.index}>
                                        <div
                                            className={`wakeup-indicator ${line.isSuccess
                                                    ? 'wakeup-indicator--success-final'
                                                    : isActive
                                                        ? 'wakeup-indicator--active'
                                                        : 'wakeup-indicator--done'
                                                }`}
                                        >
                                            {(isDone || line.isSuccess) && (
                                                <Check strokeWidth={3} />
                                            )}
                                        </div>
                                        <span
                                            className={`wakeup-line-text ${line.isSuccess
                                                    ? 'wakeup-line-text--success'
                                                    : isActive
                                                        ? 'wakeup-line-text--active'
                                                        : isDone
                                                            ? 'wakeup-line-text--done'
                                                            : ''
                                                }`}
                                        >
                                            {line.text}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Divider */}
                        <div className="wakeup-divider" />

                        {/* Progress Bar */}
                        <div className="wakeup-progress-container">
                            <div className="wakeup-progress-header">
                                <span className="wakeup-progress-label">
                                    {serverAwake ? 'Connected' : 'Connecting...'}
                                </span>
                                <span className="wakeup-progress-percent">
                                    {progress}%
                                </span>
                            </div>
                            <div className="wakeup-progress-track">
                                <div
                                    className="wakeup-progress-bar"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        {/* Rotating Tip */}
                        {!serverAwake && (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    className="wakeup-tip"
                                    key={tipIndex}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.3 }}
                                    style={{ marginTop: '16px' }}
                                >
                                    <Lightbulb className="wakeup-tip-icon" />
                                    <span className="wakeup-tip-text">
                                        {TIPS[tipIndex]}
                                    </span>
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>

                    {/* Success Flash */}
                    {showFlash && <div className="wakeup-flash" />}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ServerWakeUp;
