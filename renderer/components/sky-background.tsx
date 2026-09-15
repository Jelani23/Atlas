export function SkyBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Base atmosphere. Keep the center calm so Alice stays the focal point. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#c5e4fb_0%,#add7f7_30%,#9fcef3_62%,#b8dcf7_100%)]" />

      {/* Warm daylight spread rather than a single obvious circular spotlight. */}
      <div className="absolute -top-[18%] left-1/2 h-[58vh] w-[110vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(255,246,217,0.66)_0%,rgba(255,246,217,0.2)_42%,rgba(255,246,217,0)_72%)] blur-2xl" />
      <div className="absolute inset-x-[8%] top-[8%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,248,220,0.72),transparent)] opacity-55 blur-[1px]" />

      {/* Far-away cloud masses for depth. */}
      <div className="animate-drift absolute left-[4%] top-[18%] h-[26vh] w-[38vw] rounded-[50%] bg-white/42 blur-[78px]" />
      <div className="animate-drift-slow absolute right-[2%] top-[8%] h-[23vh] w-[31vw] rounded-[50%] bg-white/42 blur-[68px]" />
      <div className="animate-drift-slow absolute bottom-[4%] left-[10%] h-[34vh] w-[48vw] rounded-[50%] bg-white/38 blur-[88px]" />
      <div className="animate-drift absolute bottom-[10%] right-[7%] h-[27vh] w-[38vw] rounded-[50%] bg-[rgba(143,191,236,0.34)] blur-[78px]" />

      {/* A few readable little cloud silhouettes at the extreme edges. They are
          intentionally faint and slow so the background feels inhabited without
          becoming another character competing with Alice. */}
      <div className="animate-drift-slow absolute -left-12 top-[34%] opacity-28">
        <div className="relative h-20 w-44">
          <span className="absolute bottom-1 left-7 h-12 w-28 rounded-[50%] bg-white/75 blur-[2px]" />
          <span className="absolute bottom-4 left-4 h-12 w-14 rounded-full bg-white/72 blur-[2px]" />
          <span className="absolute bottom-5 left-20 h-14 w-16 rounded-full bg-white/76 blur-[2px]" />
        </div>
      </div>

      <div className="animate-drift absolute -right-14 top-[48%] opacity-22">
        <div className="relative h-16 w-40">
          <span className="absolute bottom-1 right-5 h-10 w-28 rounded-[50%] bg-white/72 blur-[2px]" />
          <span className="absolute bottom-4 right-3 h-11 w-12 rounded-full bg-white/70 blur-[2px]" />
          <span className="absolute bottom-4 right-20 h-12 w-14 rounded-full bg-white/75 blur-[2px]" />
        </div>
      </div>

      {/* Long, nearly transparent wind streaks add movement without visual noise. */}
      <div className="animate-drift-slow absolute left-[12%] top-[30%] h-8 w-48 rotate-[-4deg] rounded-[50%] border-t border-white/24" />
      <div className="animate-drift absolute right-[13%] top-[38%] h-8 w-40 rotate-[3deg] rounded-[50%] border-t border-white/20" />
      <div className="animate-drift-slow absolute bottom-[23%] left-[23%] h-7 w-36 rotate-[2deg] rounded-[50%] border-t border-white/16" />

      {/* Cooler base haze creates the sense that the interface is suspended in sky. */}
      <div className="absolute inset-x-0 bottom-0 h-[46vh] bg-[linear-gradient(180deg,rgba(140,186,232,0)_0%,rgba(132,181,228,0.34)_100%)]" />

      {/* Tiny daylight glints. Deliberately sparse. */}
      <span className="absolute left-[20%] top-[16%] h-1.5 w-1.5 rounded-full bg-white/45 blur-[0.5px]" />
      <span className="absolute right-[22%] top-[22%] h-1 w-1 rounded-full bg-white/40" />
      <span className="absolute right-[15%] bottom-[29%] h-1.5 w-1.5 rounded-full bg-white/28 blur-[0.5px]" />
    </div>
  )
}
