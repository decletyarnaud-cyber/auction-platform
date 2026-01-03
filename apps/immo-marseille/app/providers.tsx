"use client";

import { ReactNode } from "react";
import { ApiProvider } from "@repo/api-client";
import { API_URL } from "@/lib/config";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApiProvider config={{ baseUrl: API_URL }}>
      {children}
    </ApiProvider>
  );
}
