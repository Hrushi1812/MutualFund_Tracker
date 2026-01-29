import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, HelpCircle } from "lucide-react";
import ScrollReveal from "../ui/ScrollReveal";

const FAQItem = ({ question, answer, isOpen, onClick, delay }) => (
    <ScrollReveal delay={delay} direction="up">
        <div className="border-b border-white/10">
            <button
                onClick={onClick}
                aria-expanded={isOpen}
                className="w-full py-5 flex items-center justify-between text-left group"
            >
                <span className="text-lg font-medium text-white group-hover:text-primary transition-colors">
                    {question}
                </span>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown className="w-5 h-5 text-white/50" />
                </motion.div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <p className="pb-5 text-white/60 leading-relaxed">
                            {answer}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    </ScrollReveal >
);

const FAQ = () => {
    const [openIndex, setOpenIndex] = useState(null);

    const faqs = [
        {
            question: "What is NAV and why can't I see it during the day?",
            answer: "NAV (Net Asset Value) is the price of one unit of a mutual fund. It's officially calculated only at the end of each trading day, usually around 11 PM. That's why you normally have to wait until night to know what your mutual fund is worth. Our app solves this by estimating your NAV in real-time using live stock prices!"
        },
        {
            question: "Is my financial data safe?",
            answer: "Absolutely! Your data is encrypted and stored securely. We never share your information with anyone — not even for analytics. You can delete your account and all data anytime from your settings."
        },
        {
            question: "Do I need a Fyers account to use this app?",
            answer: "Nope! Fyers is completely optional. The app works perfectly without it using public stock data. Fyers just gives you slightly more accurate real-time prices if you want that extra precision. Many users never connect Fyers and are totally happy."
        },
        {
            question: "How do I get my holdings Excel file?",
            answer: "Log into your mutual fund's website (like SBI MF, ICICI Prudential, HDFC, Axis, etc.). Navigate to 'My Portfolio' or 'Holdings' section, and look for a 'Download' or 'Export' button. Download the Excel/CSV file and upload it here!"
        },
        {
            question: "Is this app really free? What's the catch?",
            answer: "Yes, it's 100% free with no hidden charges or premium tiers. This is a passion project built to solve a real problem — waiting until 11 PM to know what your mutual funds are worth. There's no catch!"
        },
        {
            question: "Which mutual funds are supported?",
            answer: "All Indian mutual funds! Whether you invest with SBI, HDFC, ICICI Prudential, Axis, Kotak, DSP, or any other AMC — as long as they provide a holdings Excel file, we can track it."
        }
    ];

    return (
        <section id="faq" className="py-16 md:py-24 relative">
            <div className="container mx-auto px-6">
                <ScrollReveal direction="up" className="text-center max-w-2xl mx-auto mb-12">

                    <h2 className="text-3xl md:text-5xl font-bold tracking-tighter mb-4">
                        Frequently Asked Questions
                    </h2>
                    <p className="text-white/60">
                        New to mutual fund tracking? We've got you covered.
                    </p>
                </ScrollReveal>

                <div className="max-w-3xl mx-auto">
                    {faqs.map((faq, index) => (
                        <FAQItem
                            key={index}
                            question={faq.question}
                            answer={faq.answer}
                            isOpen={openIndex === index}
                            onClick={() => setOpenIndex(openIndex === index ? null : index)}
                            delay={index * 0.05}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
