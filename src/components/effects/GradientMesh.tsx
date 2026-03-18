"use client";

export default function GradientMesh() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Primary gradient orb */}
      <div
        className="absolute w-[800px] h-[800px] rounded-full opacity-[0.07]"
        style={{
          background: "radial-gradient(circle, #A78BFA 0%, transparent 70%)",
          top: "-20%",
          right: "-10%",
          animation: "float 20s ease-in-out infinite",
        }}
      />
      {/* Secondary gradient orb */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.05]"
        style={{
          background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)",
          bottom: "-15%",
          left: "-5%",
          animation: "float 15s ease-in-out infinite reverse",
        }}
      />
      {/* Accent glow */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.04]"
        style={{
          background: "radial-gradient(circle, #F5A623 0%, transparent 70%)",
          top: "40%",
          left: "50%",
          transform: "translateX(-50%)",
          animation: "float 25s ease-in-out infinite",
        }}
      />
    </div>
  );
}
