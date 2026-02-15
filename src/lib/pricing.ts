export function calcularPreco(creditos: number): number {
  const unit = Math.max(0.03, 0.05 - creditos / 50000);
  return +(creditos * unit).toFixed(2);
}

export function getPricePer100(creditos: number): number {
  const unit = Math.max(0.03, 0.05 - creditos / 50000);
  return +(unit * 100).toFixed(2);
}

export const FIXED_PACKAGES = [
  { name: "100", credits: 100, price: calcularPreco(100), discount: null },
  { name: "500", credits: 500, price: calcularPreco(500), discount: null },
  { name: "1000", credits: 1000, price: calcularPreco(1000), discount: "30% off" },
  { name: "2000", credits: 2000, price: calcularPreco(2000), discount: "36% off" },
  { name: "5000", credits: 5000, price: calcularPreco(5000), discount: "40% off" },
  { name: "10000", credits: 10000, price: calcularPreco(10000), discount: "40% off" },
] as const;

/** Given a balance in R$, how many credits can be bought at the base rate (R$5/100) */
export function creditsFromBalance(balanceReais: number): number {
  return Math.floor((balanceReais / 0.05) / 5) * 5;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
