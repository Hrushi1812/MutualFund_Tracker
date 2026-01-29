import { motion, useScroll, useTransform } from "framer-motion";

const ParallaxLayer = ({
    children,
    speed = 0.5,  // 0 = no movement, 1 = moves with scroll, <1 = slower (parallax effect)
    className = "",
}) => {
    const { scrollYProgress } = useScroll();

    // Transform scroll progress to Y movement
    // Lower speed = element moves slower = appears to be further away
    const y = useTransform(
        scrollYProgress,
        [0, 1],
        ["0%", `${(1 - speed) * 100}%`]
    );

    return (
        <motion.div
            style={{ y }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

export default ParallaxLayer;
