"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSnapshot() {
  return useSWR("/api/data/snapshot", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
}

export function useHistory(range: "1m" | "3m" | "all" = "3m") {
  return useSWR(`/api/data/history?range=${range}`, fetcher, {
    revalidateOnFocus: false,
  });
}

export function useVolatility() {
  return useSWR("/api/data/volatility", fetcher, {
    revalidateOnFocus: false,
  });
}

export function useTranche() {
  return useSWR("/api/data/tranche", fetcher, {
    revalidateOnFocus: false,
  });
}

export function useOptions(asset: "mstr" | "btc", expiry: "30d" | "60d" | "90d") {
  return useSWR(`/api/data/options?asset=${asset}&expiry=${expiry}`, fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
    dedupingInterval: 4 * 60_000,
  });
}

export function useVolumeAtm() {
  return useSWR("/api/data/volume-atm", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
}
