export interface PriceTier {
  minCredits: number;
  maxCredits: number;
  pricePer100: number;
}

export const PRICE_TIERS: PriceTier[] = [
  { minCredits: 5000, maxCredits: 10000, pricePer100: 5.0 },
  { minCredits: 3000, maxCredits: 4999, pricePer100: 5.5 },
  { minCredits: 2000, maxCredits: 2999, pricePer100: 6.0 },
  { minCredits: 1000, maxCredits: 1999, pricePer100: 6.5 },
  { minCredits: 5, maxCredits: 999, pricePer100: 7.0 },
];

export const FIXED_PACKAGES = [
  { name: "Starter", credits: 100, price: 7.0, discount: null },
  { name: "Popular", credits: 500, price: 35.0, discount: null },
  { name: "Pro", credits: 1000, price: 65.0, discount: "7% off" },
  { name: "Business", credits: 2000, price: 120.0, discount: "14% off" },
  { name: "Mega", credits: 5000, price: 275.0, discount: "21% off" },
  { name: "Ultra", credits: 10000, price: 500.0, discount: "29% off" },
] as const;

export function calcularPreco(creditos: number): number {
  const pricePer100 =
    creditos >= 5000 ? 5.0 :
    creditos >= 3000 ? 5.5 :
    creditos >= 2000 ? 6.0 :
    creditos >= 1000 ? 6.5 :
    7.0;
  return (creditos / 100) * pricePer100;
}

export function getPricePer100(creditos: number): number {
  return creditos >= 5000 ? 5.0 :
    creditos >= 3000 ? 5.5 :
    creditos >= 2000 ? 6.0 :
    creditos >= 1000 ? 6.5 :
    7.0;
}

/** Given a balance in R$, how many credits can be bought at the best tier? */
export function creditsFromBalance(balanceReais: number): number {
  // Use lowest tier price (7.00/100) for display
  return Math.floor((balanceReais / 7.0) * 100 / 5) * 5;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
