import { existsSync } from 'fs';
import { join } from 'path';
import puppeteer, { Browser } from 'puppeteer';

export type InvoiceStatus = 'PAID' | 'PENDING' | 'OVERDUE';

export interface InvoiceData {
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paymentDate: string;
  platform: {
    legalName: string;
    supportEmail: string;
    website: string;
    taxId: string;
  };
  billedTo: {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
  };
  promotedService: {
    name: string;
    category: string;
  };
  totals: {
    subtotal: string;
    taxLabel: string;
    tax: string;
    total: string;
  };
  payment: {
    method: string;
    transactionId: string;
    paidOn: string;
    status: string;
  };
  note: {
    text: string;
    dashboardUrl: string;
  };
}

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string | number) =>
  String(value).replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);

const formatInvoiceStatus = (status: InvoiceStatus) =>
  status.charAt(0) + status.slice(1).toLowerCase();

const getBrowserExecutablePath = () => {
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const candidates = [
    process.env.PROGRAMFILES &&
      join(
        process.env.PROGRAMFILES,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    process.env['PROGRAMFILES(X86)'] &&
      join(
        process.env['PROGRAMFILES(X86)'],
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    process.env.LOCALAPPDATA &&
      join(
        process.env.LOCALAPPDATA,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    process.env.PROGRAMFILES &&
      join(
        process.env.PROGRAMFILES,
        'Microsoft',
        'Edge',
        'Application',
        'msedge.exe'
      ),
    process.env['PROGRAMFILES(X86)'] &&
      join(
        process.env['PROGRAMFILES(X86)'],
        'Microsoft',
        'Edge',
        'Application',
        'msedge.exe'
      ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate));
};

const getInvoiceHtml = (invoice: InvoiceData) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Yepp Ads &mdash; Invoice</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  @page { size: A4; margin: 0; }

  html, body {
    width: 794px;
    background: #fff;
    color: #111827;
    font-family: Inter, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.42;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .hd {
    padding: 28px 42px 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #e5e7eb;
  }

  .logo { display: flex; align-items: center; gap: 11px; }
  .logo-mark {
    width: 36px; height: 36px;
    border-radius: 9px;
    background: #111827;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 700;
    color: #fff;
    letter-spacing: -1px;
    flex-shrink: 0;
  }
  .logo-mark span { color: #f87171; }
  .logo-name {
    font-size: 18px; font-weight: 700;
    color: #111827; letter-spacing: -.4px;
    line-height: 1;
  }
  .logo-sub {
    font-size: 10.5px; color: #9ca3af;
    margin-top: 3px; letter-spacing: .3px;
  }

  .inv-block { text-align: right; }
  .inv-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; font-weight: 600; }
  .inv-num {
    font-family: Consolas, monospace;
    font-size: 20px; font-weight: 500;
    color: #111827; letter-spacing: -.5px;
    margin: 4px 0 7px;
  }
  .badge {
    display: inline-block;
    padding: 2px 10px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
    letter-spacing: .8px; text-transform: uppercase;
  }
  .badge.PAID     { background: #ecfdf5; color: #065f46; }
  .badge.PENDING  { background: #fefce8; color: #854d0e; }
  .badge.OVERDUE  { background: #fef2f2; color: #991b1b; }

  .dates {
    display: flex;
    padding: 0 42px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  .date-cell {
    flex: 1;
    padding: 10px 0;
    border-right: 1px solid #e5e7eb;
    padding-right: 20px;
    padding-left: 0;
    margin-left: 20px;
  }
  .date-cell:first-child { margin-left: 0; }
  .date-cell:last-child { border-right: none; }
  .dc-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; font-weight: 600; }
  .dc-val   { font-size: 12.5px; font-weight: 600; color: #111827; margin-top: 2px; }

  .body { padding: 22px 42px 18px; }

  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
  .party {
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }
  .party.to { background: #f9fafb; }
  .p-role { font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #9ca3af; font-weight: 600; margin-bottom: 5px; }
  .p-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; }
  .p-detail { font-size: 11.25px; color: #6b7280; line-height: 1.55; }

  .sec-label {
    font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 1.5px; color: #9ca3af;
    font-weight: 600; margin-bottom: 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  thead tr { border-bottom: 2px solid #111827; }
  th {
    padding: 6px 10px;
    font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 1px; font-weight: 700;
    color: #6b7280; text-align: left;
  }
  th:last-child { text-align: right; }
  th:nth-child(3) { text-align: center; }

  tbody tr { border-bottom: 1px solid #f3f4f6; }
  td {
    padding: 8px 10px;
    font-size: 12px;
    color: #374151;
    vertical-align: top;
  }
  td:last-child { text-align: right; }
  td:nth-child(3) { text-align: center; }

  .td-name { font-weight: 600; color: #111827; }
  .td-mono { font-family: Consolas, monospace; font-size: 12px; }

  .foot-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 16px;
  }
  .totals { width: 220px; }
  .trow {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 12px;
    border-bottom: 1px solid #f3f4f6;
  }
  .tl { color: #6b7280; }
  .tv { font-weight: 600; color: #111827; }
  .trow.total {
    border-top: 2px solid #111827;
    border-bottom: none;
    padding-top: 8px;
    margin-top: 3px;
    font-size: 13.5px;
    font-weight: 700;
  }

  .pay-box {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: #f9fafb;
  }
  .pay-title { font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #9ca3af; font-weight: 600; margin-bottom: 8px; }
  .pay-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .pg-label { font-size: 10px; color: #9ca3af; }
  .pg-val   { font-size: 12px; font-weight: 600; color: #111827; margin-top: 2px; }
  .pg-val.mono { font-family: Consolas, monospace; font-size: 10.5px; }

  .note {
    border-left: 3px solid #d1d5db;
    padding: 8px 12px;
    background: #f9fafb;
    border-radius: 0 6px 6px 0;
  }
  .note-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; font-weight: 600; margin-bottom: 2px; }
  .note-text  { font-size: 11.25px; color: #6b7280; line-height: 1.45; }

  .ft {
    margin-top: 16px;
    padding: 12px 42px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ft-left { font-size: 13px; font-weight: 700; color: #111827; }
  .ft-left span { color: #f87171; }
  .ft-center { font-size: 10px; color: #9ca3af; text-align: center; line-height: 1.7; }
  .ft-right  { font-size: 10.5px; color: #6b7280; text-align: right; line-height: 1.7; }
</style>
</head>
<body>
<div class="hd">
  <div class="logo">
    <div class="logo-mark">Y<span>.</span></div>
    <div>
      <div class="logo-name">Yepp Ads</div>
      <div class="logo-sub">Service Promotion Platform</div>
    </div>
  </div>
  <div class="inv-block">
    <div class="inv-label">Invoice</div>
    <div class="inv-num">${escapeHtml(invoice.invoiceNumber)}</div>
    <span class="badge ${invoice.status}">${formatInvoiceStatus(invoice.status)}</span>
  </div>
</div>

<div class="dates">
  <div class="date-cell">
    <div class="dc-label">Issue Date</div>
    <div class="dc-val">${escapeHtml(invoice.issueDate)}</div>
  </div>
  <div class="date-cell">
    <div class="dc-label">Due Date</div>
    <div class="dc-val">${escapeHtml(invoice.dueDate)}</div>
  </div>
  <div class="date-cell">
    <div class="dc-label">Payment Date</div>
    <div class="dc-val">${escapeHtml(invoice.paymentDate)}</div>
  </div>
</div>

<div class="body">
  <div class="parties">
    <div class="party">
      <div class="p-role">From</div>
      <div class="p-name">${escapeHtml(invoice.platform.legalName)}</div>
      <div class="p-detail">
        ${escapeHtml(invoice.platform.supportEmail)}<br>
        ${escapeHtml(invoice.platform.website)}<br>
        Tax ID: ${escapeHtml(invoice.platform.taxId)}
      </div>
    </div>
    <div class="party to">
      <div class="p-role">Billed To</div>
      <div class="p-name">${escapeHtml(invoice.billedTo.businessName)}</div>
      <div class="p-detail">
        ${escapeHtml(invoice.billedTo.contactName)} &nbsp;&middot;&nbsp; ${escapeHtml(invoice.billedTo.email)}<br>
        ${escapeHtml(invoice.billedTo.phone)}<br>
        ${escapeHtml(invoice.billedTo.address)}
      </div>
    </div>
  </div>

  <div class="sec-label">Promoted Service/Product</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Service/Product Name</th>
        <th>Category</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-mono">01</td>
        <td><div class="td-name">${escapeHtml(invoice.promotedService.name)}</div></td>
        <td>${escapeHtml(invoice.promotedService.category)}</td>
        <td class="td-mono">${escapeHtml(invoice.totals.subtotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="foot-row">
    <div class="totals">
      <div class="trow">
        <span class="tl">Subtotal</span>
        <span class="tv">${escapeHtml(invoice.totals.subtotal)}</span>
      </div>
      <div class="trow">
        <span class="tl">${escapeHtml(invoice.totals.taxLabel)}</span>
        <span class="tv">${escapeHtml(invoice.totals.tax)}</span>
      </div>
      <div class="trow total">
        <span class="tl">Total</span>
        <span class="tv">${escapeHtml(invoice.totals.total)}</span>
      </div>
    </div>
  </div>

  <div class="pay-box">
    <div class="pay-title">Payment Details</div>
    <div class="pay-grid">
      <div>
        <div class="pg-label">Method</div>
        <div class="pg-val">${escapeHtml(invoice.payment.method)}</div>
      </div>
      <div>
        <div class="pg-label">Transaction ID</div>
        <div class="pg-val mono">${escapeHtml(invoice.payment.transactionId)}</div>
      </div>
      <div>
        <div class="pg-label">Paid On</div>
        <div class="pg-val">${escapeHtml(invoice.payment.paidOn)}</div>
      </div>
      <div>
        <div class="pg-label">Status</div>
        <div class="pg-val">${escapeHtml(invoice.payment.status)}</div>
      </div>
    </div>
  </div>

  <div class="note">
    <div class="note-label">Note</div>
    <div class="note-text">
      ${escapeHtml(invoice.note.text)} <strong>${escapeHtml(invoice.note.dashboardUrl)}</strong>.
    </div>
  </div>
</div>

<div class="ft">
  <div class="ft-left"><span>Yepp</span> Ads</div>
  <div class="ft-center">
    Computer-generated invoice &middot; No signature required<br>
    ${escapeHtml(invoice.invoiceNumber)} &middot; ${escapeHtml(invoice.issueDate)}
  </div>
  <div class="ft-right">
    ${escapeHtml(invoice.platform.supportEmail)}<br>
    ${escapeHtml(invoice.platform.website)}
  </div>
</div>
</body>
</html>`;
};

export const generateInvoicePdf = async (invoice: InvoiceData) => {
  let browser: Browser | undefined;

  try {
    const executablePath = getBrowserExecutablePath();

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(executablePath ? { executablePath } : {}),
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType('screen');
    await page.setContent(getInvoiceHtml(invoice), {
      waitUntil: 'networkidle0',
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
