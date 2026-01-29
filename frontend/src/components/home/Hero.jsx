import React from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import ThreeDElement from "./ThreeDElement";
import Button from "../ui/Button";

const Hero = () => {
    const navigate = useNavigate();
    const { scrollY } = useScroll();

    // Parallax transforms - elements move at different speeds
    const blob1Y = useTransform(scrollY, [0, 500], [0, 150]);
    const blob2Y = useTransform(scrollY, [0, 500], [0, 100]);
    const contentY = useTransform(scrollY, [0, 500], [0, 50]);
    const canvasY = useTransform(scrollY, [0, 500], [0, 75]);

    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-20 md:py-0">
            {/* Background Gradients with Parallax */}
            <motion.div
                style={{ y: blob1Y }}
                className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10"
            />
            <motion.div
                style={{ y: blob2Y }}
                className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl -z-10"
            />

            <div className="container mx-auto px-6 grid md:grid-cols-2 gap-12 items-center relative z-10">
                <motion.div
                    style={{ y: contentY }}
                    className="text-left space-y-6"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-blue-300"
                    >
                        ✨ Free Mutual Fund Portfolio Tracker
                    </motion.div>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60"
                    >
                        See How Much Your Mutual Funds Are Worth — Right Now
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="text-base md:text-lg text-white/60 max-w-lg leading-relaxed"
                    >
                        Don't wait until late night. Know what your mutual funds are worth right now.
                    </motion.p>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="flex flex-wrap gap-4 pt-4"
                    >
                        <Button variant="primary" onClick={() => navigate('/login')}>Start Tracking Free</Button>
                        <Button variant="secondary" onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: 'smooth' })}>See How It Works</Button>
                    </motion.div>
                </motion.div>

                <motion.div
                    style={{ y: canvasY }}
                    className="h-[300px] md:h-[600px] w-full relative order-first md:order-last"
                >
                    <Canvas className="w-full h-full" camera={{ position: [0, 0, 5] }}>
                        <Environment preset="city" />
                        <ThreeDElement />
                    </Canvas>
                </motion.div>
            </div>

            {/* Scroll Indicator */}
            <motion.div
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 0.5, y: [0, -10, 0] }}
                transition={{
                    opacity: { delay: 1, duration: 0.5 },
                    y: {
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }
                }}
                className="absolute bottom-10 left-1/2 transform -translate-x-1/2 hidden md:block"
            >
                <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2">
                    <div className="w-1 h-3 bg-white/50 rounded-full" />
                </div>
            </motion.div>
        </section>
    );
};

export default Hero;
