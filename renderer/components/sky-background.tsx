export function SkyBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* vertical sky gradient: richer atmospheric blue so the white cloud reads clearly */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#bfe0fb_0%,#a9d3f6_34%,#9ecbf3_62%,#b3d8f6_100%)]" />

      {/* soft warm sunlight pooling from behind the cloud, upper-center */}
      <div className="absolute -top-[22%] left-1/2 h-[70vh] w-[85vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(253,242,210,0.7)_0%,rgba(253,242,210,0.12)_52%,rgba(253,242,210,0)_72%)] blur-2xl" />

      {/* drifting atmospheric cloud masses — soft, secondary to Atlas */}
      <div className="animate-drift absolute left-[6%] top-[20%] h-[28vh] w-[40vw] rounded-full bg-white/55 blur-[75px]" />
      <div className="animate-drift-slow absolute right-[4%] top-[10%] h-[24vh] w-[32vw] rounded-full bg-white/50 blur-[65px]" />
      <div className="animate-drift-slow absolute bottom-[6%] left-[14%] h-[32vh] w-[46vw] rounded-full bg-white/45 blur-[85px]" />
      <div className="animate-drift absolute bottom-[12%] right-[10%] h-[26vh] w-[36vw] rounded-full bg-[rgba(150,196,240,0.5)] blur-[75px]" />

      {/* cooler, slightly deeper tint at the base for atmospheric depth */}
      <div className="absolute inset-x-0 bottom-0 h-[46vh] bg-[linear-gradient(180deg,rgba(140,186,232,0)_0%,rgba(140,186,232,0.4)_100%)]" />
    </div>
  )
}
