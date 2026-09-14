import { AtlasRuntime } from "@/components/atlas-runtime"
import { CloudRuntime } from "@/components/cloud-runtime"
import { SkyBackground } from "@/components/sky-background"

export default function Page() {
  return (
    <div className="relative h-dvh overflow-hidden">
      <SkyBackground />
      <CloudRuntime>
        <AtlasRuntime />
      </CloudRuntime>
    </div>
  )
}
