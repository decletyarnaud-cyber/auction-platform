"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "../../lib/cn";

interface CountdownTimerProps {
  targetDate: string | Date;
  onExpire?: () => void;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeLeft(targetDate: Date): TimeLeft {
  const difference = targetDate.getTime() - new Date().getTime();

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
    total: difference,
  };
}

export function CountdownTimer({
  targetDate,
  onExpire,
  className,
  showIcon = true,
  size = "md",
}: CountdownTimerProps) {
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft(target));

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(target);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.total <= 0) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [target, onExpire]);

  if (timeLeft.total <= 0) {
    return (
      <span className={cn("text-red-600 font-medium", className)}>
        Terminé
      </span>
    );
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 24;
  const isCritical = timeLeft.days === 0 && timeLeft.hours < 6;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const formatUnit = (value: number, unit: string) => {
    if (size === "sm") {
      return `${value}${unit.charAt(0)}`;
    }
    return `${value}${unit}`;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 font-medium",
        isCritical
          ? "text-red-600"
          : isUrgent
          ? "text-orange-600"
          : "text-gray-600",
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Clock size={size === "sm" ? 12 : size === "md" ? 14 : 16} />}
      <span>
        {timeLeft.days > 0 && formatUnit(timeLeft.days, "j ")}
        {formatUnit(timeLeft.hours, "h ")}
        {formatUnit(timeLeft.minutes, "m")}
        {size !== "sm" && ` ${formatUnit(timeLeft.seconds, "s")}`}
      </span>
    </div>
  );
}
