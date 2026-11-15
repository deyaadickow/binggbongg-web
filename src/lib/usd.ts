// $1,000,000 for whole dollars, $342.50 when there are cents.
export const usd = (n: number) => { const d = Number.isInteger(n) ? 0 : 2; return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
