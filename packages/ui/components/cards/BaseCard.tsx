"use client";

import { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface BaseCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
  hover?: boolean;
}

export function BaseCard({
  children,
  className,
  onClick,
  href,
  hover = true,
}: BaseCardProps) {
  const baseStyles = cn(
    "bg-white rounded-lg border border-gray-200",
    hover && "transition-shadow hover:shadow-md",
    onClick && "cursor-pointer",
    className
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={baseStyles}>
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick} className={baseStyles}>
        {children}
      </div>
    );
  }

  return <div className={baseStyles}>{children}</div>;
}
