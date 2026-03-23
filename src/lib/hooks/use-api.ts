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

export function useMstrMnav() {
  return useSWR("/api/data/mstr-mnav", fetcher, {
    revalidateOnFocus: false,
  });
}

export function useStrcFilings() {
  return useSWR("/api/data/strc-filings", fetcher, {
    revalidateOnFocus: false,
  });
}

// ── SATA Hooks ──────────────────────────────────────────────────────

export function useSataSnapshot() {
  return useSWR("/api/data/sata/snapshot", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
}

export function useSataHistory(range: "1m" | "3m" | "all" = "3m") {
  return useSWR(`/api/data/sata/history?range=${range}`, fetcher, {
    revalidateOnFocus: false,
  });
}

export function useSataVolatility() {
  return useSWR("/api/data/sata/volatility", fetcher, {
    revalidateOnFocus: false,
  });
}

export function useSataFilings() {
  return useSWR("/api/data/sata-filings", fetcher, {
    revalidateOnFocus: false,
  });
}
