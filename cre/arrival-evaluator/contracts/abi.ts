// getPolicy view of ShipmentDelayPool (generated from contracts/out).
export const POOL_READ_ABI = [
  {
    "type": "function",
    "name": "getPolicy",
    "inputs": [
      {
        "name": "policyId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ShipmentDelayPool.Policy",
        "components": [
          {
            "name": "beneficiary",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ShipmentDelayPool.Status"
          },
          {
            "name": "eventType",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "vesselImo",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "delayThreshold",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "earliestArrival",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "agreedArrivalDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "purchasedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "settledAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "recordedArrival",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "premium",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "payout",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "quoteId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "voyageRefHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "destinationLocode",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "termsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "settlementEvidence",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  }
] as const;
