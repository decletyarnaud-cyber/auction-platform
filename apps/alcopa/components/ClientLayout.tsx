"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@repo/ui";
import { APP_CONFIG, NAV_ITEMS } from "@/lib/config";
import { LayoutDashboard, Car, Settings } from "lucide-react";

const iconMap: Record<string, ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={20} />,
  Car: <Car size={20} />,
  Settings: <Settings size={20} />,
};

export function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    icon: iconMap[item.icon],
  }));

  return (
    <AppShell
      appName={APP_CONFIG.name}
      appLogo={<Car size={24} className="text-primary-600" />}
      navItems={navItems}
      currentPath={pathname}
    >
      {children}
    </AppShell>
  );
}
