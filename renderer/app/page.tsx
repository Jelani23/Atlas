import { AtlasApp } from "@/components/atlas-app"
import { SkyBackground } from "@/components/sky-background"

export default function Page() {
  return (
    <div className="relative h-dvh overflow-hidden">
      <SkyBackground />
      <AtlasApp />
    </div>
  )
}
