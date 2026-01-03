import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ClientLayout } from "@/components/ClientLayout";
import { APP_CONFIG } from "@/lib/config";

export const metadata: Metadata = {
  title: APP_CONFIG.name,
  description: `Enchères de véhicules - ${APP_CONFIG.region}`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
