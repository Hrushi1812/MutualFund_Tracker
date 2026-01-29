import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import Button from "../ui/Button";
import ScrollReveal from "../ui/ScrollReveal";

const CTA = () => {
    const navigate = useNavigate();
    const { scrollYProgress } = useScroll();

    // Parallax for background glow
    const glowY = useTransform(scrollYProgress, [0.7, 1], [100, 0]);
    const glowScale = useTransform(scrollYProgress, [0.7, 1], [0.8, 1]);

    return (
        <section className="py-20 md:py-32 relative overflow-hidden">
            {/* Background glow with parallax */}
            <motion.div
                style={{ y: glowY, scale: glowScale }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10"
            />

            <div className="container mx-auto px-6 text-center">
                <ScrollReveal direction="up">
                    <h2 className="text-3xl md:text-6xl font-bold tracking-tighter mb-8 max-w-3xl mx-auto">
                        Start Tracking Your Mutual Funds in 2 Minutes
                    </h2>
                </ScrollReveal>

                <ScrollReveal direction="up" delay={0.1}>
                    <p className="text-xl text-white/50 mb-10 max-w-2xl mx-auto">
                        No complicated setup. Just upload your holdings Excel file and see your portfolio value instantly. Free forever.
                    </p>
                </ScrollReveal>

                <ScrollReveal direction="up" delay={0.2}>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Button className="px-10 py-4 text-lg" onClick={() => navigate('/login')}>
                            Start Tracking Now — It's Free
                        </Button>
                    </div>
                </ScrollReveal>

                <ScrollReveal direction="up" delay={0.3}>
                    <p className="mt-6 text-sm text-white/30">
                        No credit card required • Works with all Indian mutual funds
                    </p>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default CTA;
