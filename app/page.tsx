import type { Metadata } from "next";
import { IntroHero } from "@/components/marketing/IntroHero";
import { Hero } from "@/components/marketing/Hero";
import { HeroFlow } from "@/components/marketing/HeroFlow";
import { FeatureTabs } from "@/components/marketing/FeatureTabs";
import { PlatformFeatures } from "@/components/marketing/PlatformFeatures";
import { VoiceAgentSection } from "@/components/marketing/VoiceAgentSection";
import { StatsBar } from "@/components/marketing/StatsBar";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { getLandingPageContent } from "@/lib/landing-content";
import "@/components/marketing/landing.css";

export const metadata: Metadata = {
  title: "Dialcom — All-in-One CRM + Voice AI for Lenders",
  description:
    "Dialcom brings your leads, clients, and calls into one CRM — with an AI voice agent that qualifies borrowers and books appointments around the clock.",
};

// Picks up admin edits (Settings → Manage landing page) without a rebuild.
export const dynamic = "force-dynamic";

export default async function Home() {
  const content = await getLandingPageContent();

  return (
    <div className="landing">
      <IntroHero />
      <Hero heroImageUrl={content.hero_image_url} />
      <HeroFlow />
      <PlatformFeatures />
      <FeatureTabs demoVideoUrl={content.demo_video_url} />
      <VoiceAgentSection liveCallAudioUrl={content.live_call_audio_url} />
      <StatsBar />
      <LandingFooter />
    </div>
  );
}
