import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ScrollReveal = ({
    children,
    delay = 0,
    direction = "up",  // up, down, left, right
    duration = 0.6,
    className = "",
    once = false
}) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once, margin: "-80px" });

    const directions = {
        up: { y: 40, x: 0 },
        down: { y: -40, x: 0 },
        left: { x: 40, y: 0 },
        right: { x: -40, y: 0 },
        none: { x: 0, y: 0 }
    };

    const offset = directions[direction] || directions.none;

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, ...offset }}
            animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, ...offset }}
            transition={{
                duration,
                delay,
                ease: [0.25, 0.1, 0.25, 1] // Smooth easing
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

export default ScrollReveal;
