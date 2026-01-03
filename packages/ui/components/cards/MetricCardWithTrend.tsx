"use client";

import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "../../lib/cn";

interface MetricCardWithTrendProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    label?: string;
  };
  icon?: ReactNode;
  subtitle?: string;
  tooltip?: string;
  className?: string;
}

export function MetricCardWithTrend({
  title,
  value,
  trend,
  icon,
  subtitle,
  tooltip,
  className,
}: MetricCardWithTrendProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp size={14} className="text-green-500" />;
    if (trend.value < 0) return <TrendingDown size={14} className="text-red-500" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    if (trend.value > 0) return "text-green-600";
    if (trend.value < 0) return "text-red-600";
    return "text-gray-500";
  };

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow group relative",
        className
      )}
      title={tooltip}
    >
      {tooltip && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
            ?
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {trend && (
              <div className={cn("flex items-center gap-1 text-sm", getTrendColor())}>
                {getTrendIcon()}
                <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
              </div>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
          {trend?.label && (
            <p className="text-xs text-gray-400 mt-0.5">{trend.label}</p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
