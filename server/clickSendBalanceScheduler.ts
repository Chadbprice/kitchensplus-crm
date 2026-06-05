/**
 * ClickSend Balance Monitor & Auto Top-Up Scheduler
 *
 * Runs every hour. If the ClickSend account balance falls below $5.00,
 * automatically purchases the $20 package (package_id 11) using the
 * saved credit card on file, then notifies the owner.
 *
 * ClickSend API references:
 *   GET  /v3/account                       → returns { data.balance }
 *   PUT  /v3/recharge/purchase/{package_id} → charges saved card, adds credit
 *   Package 11 = $20.00 (minimum recharge)
 */

import { notifyOwner } from "./_core/notification";

const CLICKSEND_BASE = "https://rest.clicksend.com/v3";
const LOW_BALANCE_THRESHOLD = 5.0;   // trigger top-up below this amount
const RECHARGE_PACKAGE_ID = 11;      // $20.00 package
const RECHARGE_AMOUNT = 20.0;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Build Basic Auth header from env vars. Returns null if not configured. */
function getAuthHeader(): string | null {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return null;
  return "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64");
}

/** Fetch current ClickSend account balance in USD. Returns null on error. */
async function getBalance(): Promise<number | null> {
  const auth = getAuthHeader();
  if (!auth) return null;
  try {
    const res = await fetch(`${CLICKSEND_BASE}/account`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const bal = parseFloat(json?.data?.balance ?? "");
    return isNaN(bal) ? null : bal;
  } catch (err: any) {
    console.error("[BalanceScheduler] Failed to fetch balance:", err?.message);
    return null;
  }
}

/**
 * Purchase the $20 recharge package via ClickSend API.
 * Uses the credit card already saved on the account.
 * Returns true on success.
 */
async function purchaseTopUp(): Promise<boolean> {
  const auth = getAuthHeader();
  if (!auth) return false;
  try {
    const res = await fetch(`${CLICKSEND_BASE}/recharge/purchase/${RECHARGE_PACKAGE_ID}`, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
    });
    const json = (await res.json()) as any;
    if (res.ok && (json?.response_code === "SUCCESS" || json?.http_code === 200)) {
      console.log(`[BalanceScheduler] Top-up SUCCESS — charged $${RECHARGE_AMOUNT} to card on file.`);
      return true;
    }
    console.error("[BalanceScheduler] Top-up failed:", json?.response_msg ?? `HTTP ${res.status}`);
    return false;
  } catch (err: any) {
    console.error("[BalanceScheduler] Top-up network error:", err?.message);
    return false;
  }
}

/** Main check-and-top-up function. */
async function checkAndTopUp(): Promise<void> {
  const auth = getAuthHeader();
  if (!auth) {
    console.warn("[BalanceScheduler] ClickSend not configured — skipping balance check.");
    return;
  }

  const balance = await getBalance();
  if (balance === null) {
    console.warn("[BalanceScheduler] Could not retrieve balance — skipping.");
    return;
  }

  console.log(`[BalanceScheduler] Current balance: $${balance.toFixed(2)}`);

  if (balance >= LOW_BALANCE_THRESHOLD) {
    // Balance is healthy — nothing to do.
    return;
  }

  // Balance is below threshold — attempt top-up.
  console.warn(
    `[BalanceScheduler] Balance $${balance.toFixed(2)} is below $${LOW_BALANCE_THRESHOLD} threshold. Initiating $${RECHARGE_AMOUNT} top-up...`
  );

  const success = await purchaseTopUp();

  if (success) {
    // Fetch updated balance for the notification.
    const newBalance = await getBalance();
    const newBalStr = newBalance !== null ? `$${newBalance.toFixed(2)}` : "unknown";
    await notifyOwner({
      title: "ClickSend Auto Top-Up — Success",
      content:
        `Your ClickSend SMS balance dropped to $${balance.toFixed(2)}, which is below the $${LOW_BALANCE_THRESHOLD.toFixed(2)} threshold. ` +
        `A $${RECHARGE_AMOUNT.toFixed(2)} top-up was automatically charged to the card on file. ` +
        `New balance: ${newBalStr}.`,
    });
  } else {
    // Top-up failed — alert owner so they can act manually.
    await notifyOwner({
      title: "⚠️ ClickSend Top-Up FAILED — Action Required",
      content:
        `Your ClickSend SMS balance is critically low at $${balance.toFixed(2)}. ` +
        `An automatic $${RECHARGE_AMOUNT.toFixed(2)} top-up was attempted but failed. ` +
        `Please log in to ClickSend and add credit manually to avoid SMS delivery failures.`,
    });
  }
}

/** Start the hourly balance monitor. */
export function startClickSendBalanceScheduler(): void {
  console.log(
    `[BalanceScheduler] Started — checking every hour. Threshold: $${LOW_BALANCE_THRESHOLD}, top-up: $${RECHARGE_AMOUNT}.`
  );

  // Run immediately on startup, then every hour.
  checkAndTopUp().catch(console.error);
  setInterval(() => {
    checkAndTopUp().catch(console.error);
  }, CHECK_INTERVAL_MS);
}
