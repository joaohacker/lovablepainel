export function calcularPreco(creditos: number): number {
  let unit = 0.05;
  if (creditos >= 10000) unit = 0.028;
  else if (creditos >= 5000) unit = 0.03;
  else if (creditos >= 2000) unit = 0.032;
  else if (creditos >= 1000) unit = 0.035;
  else if (creditos >= 500) unit = 0.04;
  else if (creditos >= 200) unit = 0.045;
  return +(creditos * unit).toFixed(2);
}

export function getPricePer100(creditos: number): number {
  let unit = 0.05;
  if (creditos >= 10000) unit = 0.028;
  else if (creditos >= 5000) unit = 0.03;
  else if (creditos >= 2000) unit = 0.032;
  else if (creditos >= 1000) unit = 0.035;
  else if (creditos >= 500) unit = 0.04;
  else if (creditos >= 200) unit = 0.045;
  return +(unit * 100).toFixed(2);
}

export const FIXED_PACKAGES = [
  { name: "100", credits: 100, price: calcularPreco(100), discount: null },
  { name: "300", credits: 300, price: calcularPreco(300), discount: "10% off" },
  { name: "500", credits: 500, price: calcularPreco(500), discount: "20% off" },
  { name: "1000", credits: 1000, price: calcularPreco(1000), discount: "30% off" },
  { name: "2000", credits: 2000, price: calcularPreco(2000), discount: "36% off" },
  { name: "5000", credits: 5000, price: calcularPreco(5000), discount: "40% off" },
] as const;

/** Given a balance in R$, how many credits can be bought at the base rate (R$5/100) */
export function creditsFromBalance(balanceReais: number): number {
  return Math.floor((balanceReais / 0.05) / 5) * 5;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
