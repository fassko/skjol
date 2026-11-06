import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { waitForSuccessfulTransaction } from '../src/onchain-wait';

/**
 * Owner-only calls on the deployed pool, sent from the developer-controlled deploy wallet.
 *
 * Usage:
 *   bun run ./scripts/pool-admin.ts <walletId> <poolAddress> setSimulationOperator <address>
 *   bun run ./scripts/pool-admin.ts <walletId> <poolAddress> transferOwnership <address>
 */
const ALLOWED: Record<string, string> = {
  setSimulationOperator: 'setSimulationOperator(address)',
  transferOwnership: 'transferOwnership(address)',
};

async function main(): Promise<void> {
  const [walletId, poolAddress, fn, arg] = process.argv.slice(2);
  const signature = fn ? ALLOWED[fn] : undefined;

  if (!walletId || !poolAddress || !signature || !arg || !/^0x[0-9a-fA-F]{40}$/.test(arg)) {
    throw new Error('Usage: pool-admin.ts <walletId> <poolAddress> <setSimulationOperator|transferOwnership> <address>');
  }

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecret) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env');
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  const created = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: poolAddress,
    abiFunctionSignature: signature,
    abiParameters: [arg],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  const id = created.data?.id;

  if (!id) {
    throw new Error('Circle did not return a transaction id.');
  }

  const tx = await waitForSuccessfulTransaction(
    () => client.getTransaction({ id }),
    (res) => res.data?.transaction?.state,
    { label: fn },
  );

  console.log(JSON.stringify({ call: fn, id, state: tx.data?.transaction?.state, txHash: tx.data?.transaction?.txHash }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.slice(0, 400) : 'pool-admin failed');
  process.exit(1);
});
