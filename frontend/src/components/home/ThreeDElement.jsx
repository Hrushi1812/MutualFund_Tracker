import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial } from "@react-three/drei";

const ThreeDElement = () => {
    const meshRef = useRef();

    // Randomize initial rotation only once on mount
    const seed = useRef(Math.random() * 100);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();
        // Use the seed to offset time, creating a random start point
        // Rotate on all axes with non-repeating prime-ish factors for organic movement
        meshRef.current.rotation.x = (time + seed.current) * 0.21;
        meshRef.current.rotation.y = (time + seed.current) * 0.27;
        meshRef.current.rotation.z = (time + seed.current) * 0.19;
    });
    return (
        <Float speed={2} rotationIntensity={1} floatIntensity={1}>
            <Icosahedron args={[1, 0]} ref={meshRef} scale={2}>
                <MeshDistortMaterial
                    color="#3b82f6"
                    attach="material"
                    distort={0.4}
                    speed={2}
                    roughness={0.2}
                    metalness={0.8}
                />
            </Icosahedron>
        </Float>
    );
};

export default ThreeDElement;
