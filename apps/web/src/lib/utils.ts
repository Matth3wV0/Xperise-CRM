import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string, locale = "vi-VN") {
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
