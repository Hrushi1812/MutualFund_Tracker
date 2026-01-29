import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import GlassCard from "../ui/GlassCard";
import ScrollReveal from "../ui/ScrollReveal";
import { CheckCircle } from "lucide-react";

const DemoSection = () => {
    const { scrollYProgress } = useScroll();
    const scale = useTransform(scrollYProgress, [0.3, 0.5], [0.95, 1]);

    const features = [
        "See total portfolio value in real-time",
        "Track individual fund performance",
        "Never miss a SIP payment",
        "View historical trends with charts"
    ];

    return (
        <section id="demo" className="py-16 md:py-24 relative">
            <div className="container mx-auto px-6">
                <div className="flex flex-col md:flex-row items-center gap-12">
                    <ScrollReveal direction="up" className="w-full md:w-1/2 space-y-6">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tighter">
                            Your Portfolio, At a Glance
                        </h2>
                        <p className="text-white/60 text-lg">
                            Stop tracking mutual funds in messy Excel sheets. Our dashboard shows exactly what you need — clean, simple, and always up to date.
                        </p>
                        <ul className="space-y-3 text-white/70">
                            {features.map((feature, index) => (
                                <li key={index} className="flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                    </ScrollReveal>

                    <ScrollReveal direction="up" delay={0.2} className="w-full md:w-1/2">
                        <motion.div style={{ scale }}>
                            <GlassCard className="p-8 aspect-video flex flex-col justify-center items-center relative overflow-hidden group">
                                {/* Abstract UI representation */}
                                <div className="absolute inset-x-8 top-8 bottom-0 bg-white/5 rounded-t-xl border border-white/10 p-4 transition-transform duration-500 group-hover:-translate-y-2">
                                    {/* Stats Row */}
                                    <div className="flex gap-4 mb-4">
                                        <div className="flex-1 p-3 bg-white/5 rounded-lg">
                                            <div className="text-[10px] text-white/40 mb-1">Total Value</div>
                                            <div className="text-sm font-semibold text-white">₹2,45,678</div>
                                            <div className="text-[10px] text-green-400">+12.5%</div>
                                        </div>
                                        <div className="flex-1 p-3 bg-white/5 rounded-lg">
                                            <div className="text-[10px] text-white/40 mb-1">Invested</div>
                                            <div className="text-sm font-semibold text-white">₹2,18,500</div>
                                        </div>
                                        <div className="flex-1 p-3 bg-primary/20 rounded-lg">
                                            <div className="text-[10px] text-white/40 mb-1">Profit</div>
                                            <div className="text-sm font-semibold text-green-400">+₹27,178</div>
                                        </div>
                                    </div>
                                    {/* Chart Placeholder */}
                                    <div className="w-full h-24 bg-white/5 rounded-lg flex items-end justify-around p-2">
                                        <div className="w-4 bg-primary/30 rounded-t" style={{ height: '40%' }} />
                                        <div className="w-4 bg-primary/40 rounded-t" style={{ height: '55%' }} />
                                        <div className="w-4 bg-primary/50 rounded-t" style={{ height: '45%' }} />
                                        <div className="w-4 bg-primary/60 rounded-t" style={{ height: '70%' }} />
                                        <div className="w-4 bg-primary/70 rounded-t" style={{ height: '60%' }} />
                                        <div className="w-4 bg-primary/80 rounded-t" style={{ height: '85%' }} />
                                        <div className="w-4 bg-primary rounded-t" style={{ height: '100%' }} />
                                    </div>
                                </div>

                                <div className="absolute bottom-6 right-6">
                                    <div className="px-4 py-2 bg-primary rounded-lg text-xs font-bold text-white shadow-lg shadow-primary/20">
                                        Live Updates
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    </ScrollReveal>
                </div>
            </div>
        </section>
    );
};

export default DemoSection;
