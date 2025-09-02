import * as THREE from "three";
import React, { useRef, useEffect } from "react";
import type { JSX } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    CardboardBox_LP_lambert1_0: THREE.Mesh;
  };
  materials: {
    lambert1: THREE.MeshStandardMaterial;
  };
};

export function Model(
  props: JSX.IntrinsicElements["group"] & { resetTrigger?: number }
) {
  const { nodes, materials } = useGLTF(
    "./scene-transformed.glb"
  ) as unknown as GLTFResult;
  const groupRef = useRef<THREE.Group>(null);

  const defaultRotation = {
    x: -1.129770992366412,
    y: -0.08396946564885496,
    z: -0.06106870229007633,
  };

  // Mock real-time data: next rotation (velocity-based)
  const nextRef = useRef({ x: 0, y: 0, z: 0 });
  const startTimeRef = useRef(0);

  // Fetch latest rotation from backend
  useEffect(() => {
    const fetchLatestRotation = async () => {
      try {
        const response = await fetch(
          "/api/rotation-data/latest?safeId=safe-001"
        );
        const data = await response.json();
        if (data.success && data.data) {
          console.log("Fetched latest rotation:", data.data);
          nextRef.current = {
            x: data.data.alpha - defaultRotation.x,
            y: data.data.beta - defaultRotation.y,
            z: data.data.gamma - defaultRotation.z,
          };
        }
      } catch (error) {
        console.error("Failed to fetch latest rotation:", error);
      }
    };

    fetchLatestRotation();

    // Fetch every 2 seconds for real-time updates
    const interval = setInterval(fetchLatestRotation, 2000);

    return () => clearInterval(interval);
  }, []);

  // Handle reset trigger
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.rotation.set(0, 0, 0);
    }
  }, [props.resetTrigger]);

  useFrame((state, delta) => {
    if (startTimeRef.current === 0) {
      startTimeRef.current = state.clock.elapsedTime;
      if (groupRef.current) {
        groupRef.current.rotation.set(0, 0, 0);
      }
    }

    if (groupRef.current) {
      groupRef.current.rotation.x += nextRef.current.x * delta;
      groupRef.current.rotation.y += nextRef.current.y * delta;
      groupRef.current.rotation.z += nextRef.current.z * delta;
    }
  });

  return (
    <group ref={groupRef} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <mesh
          name="CardboardBox_LP_lambert1_0"
          geometry={nodes.CardboardBox_LP_lambert1_0.geometry}
          material={materials.lambert1}
          scale={0.01}
        />
      </group>
    </group>
  );
}

useGLTF.preload("/scene-transformed.glb");
