"use client";
import { ActaConfig, testNet } from "@acta-team/credentials";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ActaConfig baseURL={testNet} apiKey={process.env.NEXT_PUBLIC_ACTA_API_KEY}>
      {children}
    </ActaConfig>
  );
}
