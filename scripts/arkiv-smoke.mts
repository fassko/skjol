// Smoke test: one real Arkiv write + read on Rabdi testnet. Prints keys/tx only.
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { eq } from "@arkiv-network/sdk/query";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const Probe = defineSchema("skjol.v1.probe", { probeId: str().indexed(), at: u64().indexed(), note: str() });
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain, transport: http() });
const wal = createWalletClient({ chain, transport: http(), account });
const probeId = `probe-${Date.now()}`;
const res = await wal.createEntity(Probe, { probeId, at: u64(BigInt(Math.floor(Date.now() / 1000))), note: "skjol smoke test" }, { expiration: ExpirationTime.fromHours(2) });
console.log("created", res.entityKey, "tx", res.txHash, "expiresAt block", res.expiresAt);
const { entities } = await pub.select({ $key: true, $creator: true, probeId: true, note: true }).from(Probe).createdBy(account.address).where(eq("probeId", probeId)).fetch();
console.log("read back", entities.map((e) => ({ key: e.$key, creator: e.$creator, probeId: e.probeId.value, note: e.note.value })));
