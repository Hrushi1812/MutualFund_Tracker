import React from "react";
import ScrollReveal from "../ui/ScrollReveal";
import { Upload, Activity, TrendingUp } from "lucide-react";

const Step = ({ number, icon: Icon, title, description, delay }) => (
    <ScrollReveal delay={delay} direction="up">
        <div className="flex flex-col items-center text-center space-y-4 relative z-10">
            {/* Step number badge - positioned above the icon */}
            <div className="text-sm font-bold text-primary/60 mb-2">
                Step {number}
            </div>

            {/* Icon box */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <Icon className="w-7 h-7 text-white" />
            </div>

            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-white/50 text-sm max-w-xs leading-relaxed">{description}</p>
        </div>
    </ScrollReveal>
);

const HowItWorks = () => {
    const steps = [
        {
            number: "1",
            icon: Upload,
            title: "Upload Your Holdings",
            description: "Download the holdings sheet from your mutual fund website (like SBI MF, ICICI Prudential, HDFC) and upload it here. Takes 30 seconds!"
        },
        {
            number: "2",
            icon: Activity,
            title: "Watch Values Update Live",
            description: "We fetch live stock prices and calculate what your mutual fund is worth right now — not yesterday's price."
        },
        {
            number: "3",
            icon: TrendingUp,
            title: "Track Your Growth",
            description: "See your total invested amount, current value, and profit/loss at a glance. Set up SIPs and track every installment."
        }
    ];

    return (
        <section id="how-it-works" className="py-24 relative overflow-hidden">
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-[55%] left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -z-0" />

            <div className="container mx-auto px-6">
                <ScrollReveal direction="up" className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tighter">
                        Get Started in 3 Simple Steps
                    </h2>
                    <p className="text-white/50 max-w-xl mx-auto">
                        No complicated setup. No finance jargon. Just upload and start tracking.
                    </p>
                </ScrollReveal>

                <div className="grid md:grid-cols-3 gap-12 relative">
                    {steps.map((step, index) => (
                        <Step
                            key={step.number}
                            {...step}
                            delay={index * 0.15}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
