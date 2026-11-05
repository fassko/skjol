// One-time Hedera testnet setup for the freight agent.
// Needs a funded portal account (https://portal.hedera.com): HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY.
// Creates the agent (payer) and payee accounts with ECDSA keys, associates both with testnet USDC,
// creates the HCS audit topic (only the agent key may submit) and prints the env lines to add.
// Usage: node --env-file=.env.local --import tsx scripts/hedera-setup.mts
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
  TopicCreateTransaction,
} from "@hiero-ledger/sdk";

const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKeyRaw = process.env.HEDERA_OPERATOR_KEY;
if (!operatorId || !operatorKeyRaw) throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY (from portal.hedera.com) first.");
const parseKey = (k: string) => (/^(0x)?[0-9a-fA-F]{64}$/.test(k.trim()) ? PrivateKey.fromStringECDSA(k.trim()) : PrivateKey.fromStringDer(k.trim()));
const usdc = TokenId.fromString(process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274");
const client = Client.forTestnet().setOperator(AccountId.fromString(operatorId), parseKey(operatorKeyRaw));

async function createAccount(label: string, hbar: number) {
  const key = PrivateKey.generateECDSA();
  const resp = await new AccountCreateTransaction().setECDSAKeyWithAlias(key).setInitialBalance(new Hbar(hbar)).execute(client);
  const id = (await resp.getReceipt(client)).accountId!;
  const assoc = await new TokenAssociateTransaction().setAccountId(id).setTokenIds([usdc]).freezeWith(client).sign(key);
  await (await assoc.execute(client)).getReceipt(client);
  console.log(`${label}: ${id.toString()} (associated with USDC ${usdc.toString()})`);
  return { id: id.toString(), key };
}

const agent = await createAccount("agent", Number(process.env.AGENT_HBAR ?? 10));
const payee = await createAccount("payee", Number(process.env.PAYEE_HBAR ?? 2));
const topicTx = await new TopicCreateTransaction().setTopicMemo("Skjol freight agent audit log").setSubmitKey(agent.key.publicKey).execute(client);
const topicId = (await topicTx.getReceipt(client)).topicId!.toString();
console.log(`audit topic: ${topicId}`);
client.close();

console.log(`
# Add to .env.local (Hedera testnet, test funds only)
HEDERA_AGENT_ACCOUNT_ID=${agent.id}
HEDERA_AGENT_PRIVATE_KEY=0x${agent.key.toStringRaw()}
HEDERA_PAYEE_ACCOUNT_ID=${payee.id}
HEDERA_AUDIT_TOPIC_ID=${topicId}

Next: send testnet USDC to ${agent.id} from https://faucet.circle.com (network: Hedera Testnet).`);
