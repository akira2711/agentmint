// AgentMint frontend configuration.
// Fill in CONTRACT_ADDRESS after the mainnet deployment is confirmed.
// Nothing here is secret. No keys of any kind belong in this file.
const CONFIG = {
  // BNB Chain mainnet.
  chainId: 56,
  chainName: "BNB Smart Chain",
  rpcUrl: "https://bsc-dataseed.binance.org",
  // AgentMint contract (deployed + verified on BNB mainnet 2026-11-19).
  contractAddress: "0x4A8E187475C85Fb5cF0F339e6bA1DE9A7edB8AF4",
  // Official SPACE ID Agent ID registry on BNB Chain.
  agentIdRegistry: "0x60B9262456dE011F7d15a54cdd8c48bAaa8B022F",
  maxSupply: 10000,
  // Optional: a WalletConnect (Reown) project id enables the
  // "Connect with WalletConnect" button. Leave empty to hide it.
  // Get one free at https://cloud.reown.com — it is a public id, not a secret.
  walletConnectProjectId: "",
};
