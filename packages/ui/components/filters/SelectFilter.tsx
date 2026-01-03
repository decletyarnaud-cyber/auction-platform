"use client";

import { cn } from "../../lib/cn";

interface Option {
  value: string;
  label: string;
}

interface SelectFilterProps {
  label: string;
  options: Option[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  className?: string;
}

export function SelectFilter({
  label,
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "Tous",
  className,
}: SelectFilterProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (multiple) {
      const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
      onChange(selected);
    } else {
      onChange(e.target.value);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        value={multiple ? undefined : (value as string)}
        onChange={handleChange}
        multiple={multiple}
        className={cn(
          "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
          "focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500",
          multiple && "min-h-[100px]"
        )}
      >
        {!multiple && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
