// Investicija – Inputs + Summary MVP
// Izvedeno po logici i mapiranju polja iz: Investicija_App_Developer_Handover_v1.docx
// i referentnim vrednostima iz: investicija_PEP_Risk.xlsx (Inputs/Sales/Costs/Summary/Mapa).
// (Ovo je MVP baseline; CashFlow parity doterujemo u sledećoj iteraciji.)

const DEFAULTS = {
  // Inputs (default iz investicija_PEP_Risk.xlsx)
  // Start datum u Excelu: 04/01/2027 (format u fajlu), ovde koristimo ISO.
  startDate: "2027-01-04",
  modelMonths: 24,
  constructionMonths: 14,
  salesMonths: 6,

  // Prodaja / površina (Excel: 476 m², cena 2500 €/m²)
  sellableArea: 476,
  salePricePerSqm: 2500,

  // Troškovi (Excel: 1000 €/m², soft 0.12, contingency 0.07, land 70k, permits 20k, marketing 0.02)
  constructionCostPerSqm: 1000,
  softCostPct: 0.12,
  contingencyPct: 0.07,
  landCost: 70000,
  permitsCost: 20000,
  marketingPct: 0.02,
  otherReserve: 0,

  // Finansiranje (Excel: equity 150k, interest 0.075, bank fee 0.01, base limit 323080, tax 0.10)
  equity: 150000,
  interestRateAnnual: 0.075,
  bankFeePct: 0.01,
  bankFeeBaseLimit: 323080,
  corporateTaxPct: 0.10,
};

// Prodajni raspored (iz Sales % prodaje: 0.1, 0.15, 0.2, 0.2, 0.2, 0.15) u 6 meseci prodaje
const SALES_PCTS_6 = [0.10, 0.15, 0.20, 0.20, 0.20, 0.15];

const el = (id) => document.getElementById(id);

function money(x) {
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("sr-RS", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(x);
}
function num(x, digits = 4) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

function readInputs() {
  const obj = {};
  const keys = Object.keys(DEFAULTS);
  for (const k of keys) {
    const node = el(k);
    if (!node) continue;

    if (node.type === "date") obj[k] = node.value;
    else obj[k] = Number(node.value);
  }
  return obj;
}

function setInputs(values) {
  for (const [k, v] of Object.entries(values)) {
    const node = el(k);
    if (!node) continue;
    if (node.type === "date") node.value = v;
    else node.value = v;
  }
}

function derivedTotals(p) {
  const revenue = p.sellableArea * p.salePricePerSqm;

  const hard = p.sellableArea * p.constructionCostPerSqm;
  const soft = hard * p.softCostPct;
  const contingency = hard * p.contingencyPct;
  const marketing = revenue * p.marketingPct;

  const bankFee = p.bankFeePct * p.bankFeeBaseLimit;

  const costsNoInterest =
    p.landCost +
    p.permitsCost +
    hard +
    soft +
    contingency +
    marketing +
    bankFee +
    p.otherReserve;

  return { revenue, hard, soft, contingency, marketing, bankFee, costsNoInterest };
}

/**
 * Mini cashflow engine (MVP):
 * - Expenses allocated roughly like Excel Costs:
 *   - Land: month 0 upfront
 *   - Permits: months 0..2 straight-line (3 months)
 *   - BankFee: month 0 upfront
 *   - Hard/Soft/Contingency/OtherReserve: months 1..constructionMonths straight-line
 *   - Marketing: months (constructionMonths+1) .. (constructionMonths+salesMonths) straight-line
 * - Revenue receipts in sales period using SALES_PCTS_6 (if salesMonths=6), otherwise equal split.
 * - Credit drawn when cash negative; repaid when cash positive.
 * - Interest capitalized monthly on outstanding credit.
 */
function runSimulation(p) {
  const t = derivedTotals(p);

  const months = Math.max(1, Math.floor(p.modelMonths));
  const constM = Math.max(1, Math.floor(p.constructionMonths));
  const salesM = Math.max(1, Math.floor(p.salesMonths));
  const monthlyRate = (p.interestRateAnnual || 0) / 12;

  // Allocate monthly arrays
  const inflow = new Array(months).fill(0);
  const outflow = new Array(months).fill(0);

  // --- Outflows
  const permitsPerMonth = t ? (p.permitsCost / 3) : 0;
  const bankFee = t.bankFee;

  // month 0: land + permits(1/3) + bank fee
  if (months > 0) {
    outflow[0] += p.landCost + permitsPerMonth + bankFee;
  }
  // permits months 1 and 2 (if exist)
  if (months > 1) outflow[1] += permitsPerMonth;
  if (months > 2) outflow[2] += permitsPerMonth;

  // construction-related months start at month 1 for constM months
  const hardPm = t.hard / constM;
  const softPm = t.soft / constM;
  const contPm = t.contingency / constM;
  const otherPm = p.otherReserve / constM;

  for (let m = 1; m < months; m++) {
    const idx = m; // month index
    const inConstruction = idx >= 1 && idx <= constM;
    if (inConstruction) {
      outflow[idx] += hardPm + softPm + contPm + otherPm;
    }
  }

  // marketing starts after construction ends: month (constM+1) for salesM months
  const marketingPm = t.marketing / salesM;
  for (let i = 0; i < salesM; i++) {
    const idx = (constM + 1) + i;
    if (idx >= 0 && idx < months) outflow[idx] += marketingPm;
  }

  // --- Inflows (revenue receipts in sales period)
  const startSalesIdx = constM + 1;
  let pcts;
  if (salesM === 6) pcts = SALES_PCTS_6;
  else pcts = new Array(salesM).fill(1 / salesM);

  for (let i = 0; i < salesM; i++) {
    const idx = startSalesIdx + i;
    if (idx >= 0 && idx < months) inflow[idx] += t.revenue * pcts[i];
  }

  // Equity: treat as cash inflow at month 0
  if (months > 0) inflow[0] += p.equity;

  // Simulate
  let cash = 0;
  let credit = 0;
  let peakCredit = 0;
  let totalInterest = 0;

  for (let m = 0; m < months; m++) {
    // add inflow/outflow first
    cash += inflow[m] - outflow[m];

    // interest on outstanding credit (capitalized)
    if (credit > 0 && monthlyRate > 0) {
      const interest = credit * monthlyRate;
      totalInterest += interest;
      cash -= interest;
      // if cash negative after interest, draw credit to cover
      if (cash < 0) {
        credit += (-cash);
        cash = 0;
      }
    }

    // draw credit if cash negative
    if (cash < 0) {
      credit += (-cash);
      cash = 0;
    }

    // repay if we have positive cash and credit outstanding
    if (cash > 0 && credit > 0) {
      const repay = Math.min(cash, credit);
      credit -= repay;
      cash -= repay;
    }

    peakCredit = Math.max(peakCredit, credit);
  }

  // Tax (simple): only on positive profit
  const profitBeforeTax = t.revenue - t.costsNoInterest - totalInterest;
  const tax = Math.max(0, profitBeforeTax * (p.corporateTaxPct || 0));
  const netProfit = profitBeforeTax - tax;
  const roi = p.equity > 0 ? (netProfit / p.equity) : NaN;

  return {
    ...t,
    totalInterest,
    peakCredit,
    profitBeforeTax,
    tax,
    netProfit,
    roi,
    cashEnd: cash, // post repay
  };
}

function breakEvenPrice(p) {
  // numeric search on salePricePerSqm to make netProfit ~ 0
  const base = { ...p };

  // If costs already exceed revenue at very high price? We'll search wide enough.
  let lo = 0;
  let hi = Math.max(5000, base.salePricePerSqm * 3);

  const target = (price) => {
    const sim = runSimulation({ ...base, salePricePerSqm: price });
    return sim.netProfit;
  };

  // Ensure hi gives positive profit (if possible)
  let fhi = target(hi);
  let tries = 0;
  while (fhi < 0 && tries < 10) {
    hi *= 1.5;
    fhi = target(hi);
    tries++;
  }
  // If still negative, return NaN (break-even not reachable in search range)
  if (fhi < 0) return NaN;

  let flo = target(lo);
  // binary search
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const fmid = target(mid);
    if (Math.abs(fmid) < 1) return mid;
    if (fmid > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function render(sim, bePrice) {
  el("kpiRevenue").textContent = money(sim.revenue);
  el("kpiCostsNoInterest").textContent = money(sim.costsNoInterest);
  el("kpiInterest").textContent = money(sim.totalInterest);
  el("kpiPeakCredit").textContent = money(sim.peakCredit);
  el("kpiTax").textContent = money(sim.tax);
  el("kpiNetProfit").textContent = money(sim.netProfit);
  el("kpiRoi").textContent = Number.isFinite(sim.roi) ? num(sim.roi, 6) : "—";
  el("kpiBePrice").textContent = Number.isFinite(bePrice) ? `${bePrice.toFixed(2)} €/m²` : "—";

  const note = [];
  note.push("MVP engine: linearni troškovi + prodaja po % (ako je salesMonths=6).");
  note.push("Ako želiš 1:1 Excel parity, sledeći korak je da ubacimo pun CashFlow iz fajla i acceptance test KPI.");
  el("noteBox").textContent = note.join(" ");
}

function init() {
  // wire buttons
  el("btnReset").addEventListener("click", () => {
    setInputs(DEFAULTS);
    calc();
  });
  el("btnCalc").addEventListener("click", calc);

  // set defaults at start
  setInputs(DEFAULTS);
  calc();
}

function calc() {
  const p = readInputs();
  const sim = runSimulation(p);
  const bePrice = breakEvenPrice(p);
  render(sim, bePrice);
}

init();
