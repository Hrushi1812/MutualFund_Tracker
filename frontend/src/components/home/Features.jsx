import React from "react";
import GlassCard from "../ui/GlassCard";
import ScrollReveal from "../ui/ScrollReveal";
import { TrendingUp, Zap, IndianRupee, Calendar, Shield } from "lucide-react";

const FeatureItem = ({ icon: Icon, title, description, badge, delay }) => (
    <ScrollReveal delay={delay} direction="up">
        <GlassCard className="flex flex-col items-start gap-4 relative h-full">
            {badge && (
                <span className="absolute top-4 right-4 text-[10px] font-medium px-2 py-0.5 bg-primary/20 text-primary rounded-full">
                    {badge}
                </span>
            )}
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Icon size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="text-white/60 text-sm leading-relaxed">{description}</p>
        </GlassCard>
    </ScrollReveal>
);

const Features = () => {
    const features = [
        {
            icon: TrendingUp,
            title: "Live Value Estimates",
            description: "See your mutual fund's current worth before the official NAV is published. No more waiting until 11 PM!",
        },
        {
            icon: Zap,
            title: "Real-time Stock Prices",
            description: "Want extra accuracy? Connect Fyers for free to get live stock prices. Or skip it — either way works!",
            badge: "Optional",
        },
        {
            icon: IndianRupee,
            title: "Know Your Profit/Loss",
            description: "Upload your holdings once. We calculate how much you've made (or lost) — updated throughout the day.",
        },
        {
            icon: Calendar,
            title: "SIP Tracking Made Easy",
            description: "Track your monthly SIPs, see upcoming installments, and never miss a payment.",
        },
        {
            icon: Shield,
            title: "Your Data Stays Private",
            description: "Stored securely and never shared with anyone. We take your privacy seriously.",
        },
    ];

    return (
        <section id="features" className="py-16 md:py-24 relative">
            <div className="container mx-auto px-6">
                <ScrollReveal direction="up" className="text-center max-w-2xl mx-auto mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tighter">
                        Everything You Need to Track Your Investments
                    </h2>
                    <p className="text-white/60">
                        Simple tools that show you exactly what's happening with your money — no finance degree required.
                    </p>
                </ScrollReveal>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                    {features.map((feature, index) => (
                        <FeatureItem
                            key={feature.title}
                            {...feature}
                            delay={index * 0.1}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Features;
