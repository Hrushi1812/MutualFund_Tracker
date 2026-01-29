import React from "react";
import { Zap, Clock, Shield, CheckCircle, ExternalLink } from "lucide-react";
import ScrollReveal from "../ui/ScrollReveal";

const FyersInfo = () => {
    return (
        <section className="py-16 md:py-24 relative">
            <div className="container mx-auto px-6">
                {/* Section Header */}
                <ScrollReveal direction="up" className="text-center max-w-3xl mx-auto mb-12">
                    <span className="inline-block px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full mb-4">
                        Totally Optional
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tighter">
                        Want Even More Accuracy?
                    </h2>
                    <p className="text-white/60">
                        By default, we use public stock data which might be 1-2 minutes old.
                        Connect Fyers for real-time prices — it's free and no trading required!
                    </p>
                </ScrollReveal>

                {/* Comparison Cards */}
                <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {/* With Fyers */}
                    <ScrollReveal direction="left" delay={0.1}>
                        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 relative overflow-hidden h-full">
                            <div className="absolute top-4 right-4">
                                <span className="px-2 py-1 text-[10px] font-semibold bg-primary/20 text-primary rounded-full">
                                    RECOMMENDED
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-primary/20 rounded-xl">
                                    <Zap className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-xl font-semibold text-white">With Fyers</h3>
                            </div>
                            <ul className="space-y-3 mb-6">
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>Stock prices updated every second</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>More accurate portfolio value during market hours</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>100% free — just create a Fyers account (no money needed)</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>Secure — we never see or store your password</span>
                                </li>
                            </ul>
                            <a
                                href="https://fyers.in"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                            >
                                Create free Fyers account
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </ScrollReveal>

                    {/* Without Fyers */}
                    <ScrollReveal direction="right" delay={0.1}>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-white/10 rounded-xl">
                                    <Clock className="w-6 h-6 text-zinc-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-white">Without Fyers</h3>
                            </div>
                            <ul className="space-y-3 mb-6">
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>Uses NSE website data (1-2 minute delay)</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>All features work perfectly fine</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>No signup needed — start tracking immediately</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <span>Great choice if you check once a day</span>
                                </li>
                            </ul>
                            <p className="text-xs text-zinc-500">
                                Perfect if you don't need real-time updates
                            </p>
                        </div>
                    </ScrollReveal>
                </div>

                {/* Security Note */}
                <ScrollReveal direction="up" delay={0.3} className="mt-8 max-w-2xl mx-auto">
                    <div className="flex items-center justify-center gap-2 text-sm text-zinc-400 bg-white/5 rounded-xl p-4">
                        <Shield className="w-4 h-4 text-green-400" />
                        <span>
                            Your Fyers connection uses bank-level security. We never see your password,
                            and sessions expire every 24 hours for extra safety.
                        </span>
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default FyersInfo;
