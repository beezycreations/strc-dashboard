"use client";
import React from "react";

type BadgeVariant = "green" | "red" | "amber" | "blue" | "violet" | "btc" | "neutral";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  green: "badge-green", red: "badge-red", amber: "badge-amber",
  blue: "badge-blue", violet: "badge-violet", btc: "badge-btc", neutral: "badge-neutral",
};

export default function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge ${variantClass[variant]}`}>{children}</span>;
}
