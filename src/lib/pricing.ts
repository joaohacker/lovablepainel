// Anchor prices (with 30% discount applied)
const TIERS = [
  { credits: 100, price: 5.36 },
  { credits: 1000, price: 37.50 },
  { credits: 5000, price: 160.71 },
  { credits: 10000, price: 300.00 },
] as const;

export function calcularPreco(creditos: number): number {
  if (creditos <= 0) return 0;
  // Clamp to tier range
  if (creditos <= TIERS[0].credits) {
    return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
  }
  if (creditos >= TIERS[TIERS.length - 1].credits) {
    return +(creditos * (TIERS[TIERS.length - 1].price / TIERS[TIERS.length - 1].credits)).toFixed(2);
  }
  // Linear interpolation between surrounding tiers
  for (let i = 0; i < TIERS.length - 1; i++) {
    if (creditos >= TIERS[i].credits && creditos <= TIERS[i + 1].credits) {
      const t = (creditos - TIERS[i].credits) / (TIERS[i + 1].credits - TIERS[i].credits);
      const unitLow = TIERS[i].price / TIERS[i].credits;
      const unitHigh = TIERS[i + 1].price / TIERS[i + 1].credits;
      const unit = unitLow + t * (unitHigh - unitLow);
      return +(creditos * unit).toFixed(2);
    }
  }
  return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
}

export function getPricePer100(creditos: number): number {
  const total = calcularPreco(creditos);
  return +((total / creditos) * 100).toFixed(2);
}

export const FIXED_PACKAGES = [
  { name: "100", credits: 100, price: calcularPreco(100), discount: null },
  { name: "500", credits: 500, price: calcularPreco(500), discount: "10% off" },
  { name: "1000", credits: 1000, price: calcularPreco(1000), discount: "20% off" },
  { name: "2000", credits: 2000, price: calcularPreco(2000), discount: "30% off" },
  { name: "5000", credits: 5000, price: calcularPreco(5000), discount: "40% off" },
  { name: "10000", credits: 10000, price: calcularPreco(10000), discount: "44% off" },
] as const;

/** Given a balance in R$, estimate how many credits can be bought using the real pricing tiers */
export function creditsFromBalance(balanceReais: number): number {
  if (balanceReais <= 0) return 0;
  // Binary search: find the max credits where calcularPreco(credits) <= balance
  let lo = 0;
  let hi = 500000;
  while (lo + 5 < hi) {
    const mid = Math.floor((lo + hi) / 2 / 5) * 5;
    if (mid <= 0) { lo = 0; break; }
    if (calcularPreco(mid) <= balanceReais) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
