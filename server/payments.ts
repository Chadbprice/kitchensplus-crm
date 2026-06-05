import { SquareClient, SquareEnvironment } from "square";

const accessToken = process.env.SQUARE_ACCESS_TOKEN;
const locationId = process.env.SQUARE_LOCATION_ID;

let squareClient: SquareClient | null = null;

function getSquareClient(): SquareClient | null {
  if (!accessToken) return null;
  if (!squareClient) {
    squareClient = new SquareClient({
      token: accessToken,
      environment: SquareEnvironment.Production,
    });
  }
  return squareClient;
}

export async function createPaymentLink(opts: {
  invoiceId: number;
  amount: number; // in cents
  description: string;
  redirectUrl?: string;
}): Promise<{ success: boolean; url?: string; orderId?: string; error?: string }> {
  const client = getSquareClient();
  if (!client || !locationId) {
    return { success: false, error: "Square not configured" };
  }
  try {
    const idempotencyKey = `invoice-${opts.invoiceId}-${Date.now()}`;
    // Use the checkout resource from the client
    const checkout = (client as any).checkout ?? (client as any).checkoutApi;
    if (!checkout) {
      return { success: false, error: "Square checkout API not available" };
    }
    const response = await checkout.createPaymentLink({
      idempotencyKey,
      order: {
        locationId,
        lineItems: [
          {
            name: opts.description,
            quantity: "1",
            basePriceMoney: {
              amount: BigInt(opts.amount),
              currency: "USD",
            },
          },
        ],
      },
    });
    const link = response?.result?.paymentLink ?? response?.paymentLink;
    return {
      success: true,
      url: link?.url,
      orderId: link?.orderId,
    };
  } catch (err: any) {
    console.error("[Square] Payment link error:", err.message);
    return { success: false, error: err.message };
  }
}

export async function validateSquareCredentials(): Promise<boolean> {
  const client = getSquareClient();
  if (!client) return false;
  try {
    const locationsApi = (client as any).locations ?? (client as any).locationsApi;
    if (!locationsApi) return false;
    const response = await locationsApi.listLocations();
    const locs = response?.result?.locations ?? response?.locations;
    return (locs?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
