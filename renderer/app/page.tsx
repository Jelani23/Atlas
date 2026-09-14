import { AtlasRuntime } from "@/components/atlas-runtime"
import { SkyBackground } from "@/components/sky-background"

export default function Page() {
  return (
    <div className="relative h-dvh overflow-hidden">
      <SkyBackground />
      <AtlasRuntime />
    </div>
  )
}
