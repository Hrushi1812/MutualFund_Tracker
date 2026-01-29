import React, { useEffect } from "react";
import Navbar from "../layout/Navbar";
import Footer from "../layout/Footer";
import Hero from "./Hero";
import Features from "./Features";
import HowItWorks from "./HowItWorks";
import FyersInfo from "./FyersInfo";
import DemoSection from "./DemoSection";
import FAQ from "./FAQ";
import CTA from "./CTA";
import api from "../../api";

const LandingPage = () => {
    // Wake up Render backend on page load (free tier goes to sleep after inactivity)
    useEffect(() => {
        api.get("/").catch(() => { }); // Silent ping, ignore errors
    }, []);

    return (
        <div className="bg-background text-foreground min-h-screen selection:bg-primary selection:text-white aurora-bg">
            <Navbar />
            <main>
                <Hero />
                <Features />
                <HowItWorks />
                <FyersInfo />
                <DemoSection />
                <FAQ />
                <CTA />
            </main>
            <Footer />
        </div>
    );
};

export default LandingPage;
