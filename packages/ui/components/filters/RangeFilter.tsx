"use client";

import { cn } from "../../lib/cn";

interface RangeFilterProps {
  label: string;
  minValue: number | undefined;
  maxValue: number | undefined;
  onMinChange: (value: number | undefined) => void;
  onMaxChange: (value: number | undefined) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  step?: number;
  unit?: string;
  className?: string;
}

export function RangeFilter({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  step = 1,
  unit,
  className,
}: RangeFilterProps) {
  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onMinChange(val === "" ? undefined : Number(val));
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onMaxChange(val === "" ? undefined : Number(val));
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-sm font-medium text-gray-700">
        {label}
        {unit && <span className="text-gray-400 ml-1">({unit})</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={minValue ?? ""}
          onChange={handleMinChange}
          placeholder={minPlaceholder}
          step={step}
          className={cn(
            "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
            "focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          )}
        />
        <span className="text-gray-400">-</span>
        <input
          type="number"
          value={maxValue ?? ""}
          onChange={handleMaxChange}
          placeholder={maxPlaceholder}
          step={step}
          className={cn(
            "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
            "focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          )}
        />
      </div>
    </div>
  );
}
