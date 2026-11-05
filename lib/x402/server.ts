import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient, RouteConfig } from "@x402/core/server";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { withX402 } from "@x402/next";
import { x402Config } from "../config";
import type { PaidService } from "./services";

type PaymentOption = Exclude<RouteConfig["accepts"], unknown[]>;

// Seller side. Every paid route offers two rails in its 402 response:
//   - Arc Testnet USDC through Circle Gateway nanopayments (gasless, batched settlement)
//   - Hedera testnet USDC (HTS) through an x402 facilitator that sponsors the Hedera fee
// The resource server routes each payment to the facilitator that supports its network.

let _server: x402ResourceServer | null = null;

export function resourceServer() {
  if (_server) return _server;
  // Circle's client is protocol-compatible; its bundled types mark `resource.description` required.
  const facilitators: FacilitatorClient[] = [new BatchFacilitatorClient({ url: x402Config.gatewayUrl() }) as unknown as FacilitatorClient];
  if (x402Config.hederaPayTo()) facilitators.push(new HTTPFacilitatorClient({ url: x402Config.hederaFacilitatorUrl() }));
  const server = new x402ResourceServer(facilitators).register(x402Config.arcNetwork, new GatewayEvmScheme());
  if (x402Config.hederaPayTo()) {
    server.register(
      x402Config.hederaNetwork,
      new ExactHederaScheme({ defaultAssets: { [x402Config.hederaNetwork]: { asset: x402Config.hederaUsdcToken(), decimals: 6 } } }),
    );
  }
  server.registerExtension(bazaarResourceServerExtension);
  _server = server;
  return server;
}

export function paymentOptions(s: PaidService): PaymentOption[] {
  const arcPayTo = x402Config.arcPayTo();
  const hederaPayTo = x402Config.hederaPayTo();
  const out: PaymentOption[] = [];
  if (arcPayTo) out.push({ scheme: "exact", network: x402Config.arcNetwork, price: s.price, payTo: arcPayTo, maxTimeoutSeconds: 120 });
  if (hederaPayTo) out.push({ scheme: "exact", network: x402Config.hederaNetwork, price: s.price, payTo: hederaPayTo, maxTimeoutSeconds: 120 });
  if (!out.length) throw new Error("No x402 payee configured (set X402_ARC_PAY_TO / DEPLOYER_ADDRESS and/or HEDERA_PAYEE_ACCOUNT_ID)");
  return out;
}

function routeConfig(s: PaidService): RouteConfig {
  return {
    accepts: paymentOptions(s),
    description: s.description,
    mimeType: "application/json",
    serviceName: "Skjol",
    tags: s.tags,
    extensions: declareDiscoveryExtension({ input: s.input, inputSchema: s.inputSchema, output: { example: s.outputExample } }),
  };
}

/**
 * Wrap a route handler with an x402 paywall. Built on first request (not at import) so env vars
 * are read at runtime. Settlement runs only after the handler returns a status below 400.
 */
export function paidRoute(s: PaidService, handler: (req: NextRequest) => Promise<NextResponse<unknown>>) {
  let wrapped: ((req: NextRequest) => Promise<NextResponse<unknown>>) | null = null;
  return (req: NextRequest) => {
    wrapped ??= withX402<unknown>(handler, { [s.path]: routeConfig(s) }, resourceServer());
    return wrapped(req);
  };
}
