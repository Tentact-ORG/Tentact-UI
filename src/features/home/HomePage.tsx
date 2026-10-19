import { MotionGate } from "@/providers/MotionGate";
import { SmoothScrollProvider } from "@/providers/SmoothScrollProvider";
import { SiteFooter } from "./components/SiteFooter/SiteFooter";
import { SiteHeader } from "./components/SiteHeader/SiteHeader";
import { ArcSection } from "./sections/arc/ArcSection";
import { EditorialSection } from "./sections/editorial/EditorialSection";
import { FinalSection } from "./sections/final/FinalSection";
import { HeroSection } from "./sections/hero/HeroSection";
import { PricingSection } from "./sections/pricing/PricingSection";
import { ReachSection } from "./sections/reach/ReachSection";
import { RingSection } from "./sections/ring/RingSection";
import { TunnelSection } from "./sections/tunnel/TunnelSection";

/** The landing page, top to bottom. */
export function HomePage() {
  return (
    <SmoothScrollProvider>
      <MotionGate>
        <SiteHeader />
        <main>
          <HeroSection />
          <EditorialSection />
          <RingSection />
          <ArcSection />
          <TunnelSection />
          <ReachSection />
          <PricingSection />
          <FinalSection />
        </main>
        <SiteFooter />
      </MotionGate>
    </SmoothScrollProvider>
  );
}
