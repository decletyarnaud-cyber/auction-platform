"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState, useEffect, useRef } from "react";
import { initApiClient, type ApiClientConfig } from "./client";

interface ApiProviderProps {
  children: ReactNode;
  config: ApiClientConfig;
}

export function ApiProvider({ children, config }: ApiProviderProps) {
  // Initialize API client once (both SSR and client)
  const initialized = useRef(false);
  if (!initialized.current) {
    initApiClient(config);
    initialized.current = true;
  }

  // Also ensure initialization on client-side mount
  useEffect(() => {
    initApiClient(config);
  }, [config]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
