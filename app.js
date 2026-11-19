/* AgentMint frontend — no backend, no key storage, no tracking.
 *
 * Flow: connect an injected wallet (or WalletConnect if configured) ->
 * read Agent ID balanceOf for the CONNECTED address only -> if > 0 and
 * not yet minted, enable the Mint button -> mint() goes through the
 * user's own wallet confirmation. The mint costs 0 BNB; only gas is paid.
 */
(function () {
  "use strict";

  var AGENT_ID_ABI = ["function balanceOf(address account) view returns (uint256)"];
  var AGENTMINT_ABI = [
    "function mint() payable",
    "function totalMinted() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
    "function hasMinted(address) view returns (bool)",
    "event Minted(address indexed minter, uint256 indexed tokenId)",
  ];

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $("status"), accountEl = $("accountLine"), agentEl = $("agentLine"),
      txEl = $("txLine"), mintBtn = $("mintBtn"), connectBtn = $("connectBtn"),
      wcBtn = $("wcBtn");

  var provider = null;   // ethers BrowserJsonRpcProvider
  var signer = null;
  var account = null;
  var agentMint = null;

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || "muted";
  }

  function short(addr) { return addr.slice(0, 6) + "…" + addr.slice(-4); }

  async function readChainState() {
    if (!agentMint) return;
    try {
      var minted = await agentMint.totalMinted();
      var cap = await agentMint.MAX_SUPPLY();
      $("minted").textContent = minted.toString() + " / " + cap.toString();
      $("cap").textContent = cap.toString();
    } catch (e) { /* contract not deployed yet — leave placeholders */ }
  }

  async function refreshAccountState() {
    if (!provider || !account || !agentMint) return;
    accountEl.textContent = "Connected: " + short(account);
    try {
      var agentId = new ethers.Contract(CONFIG.agentIdRegistry, AGENT_ID_ABI, provider);
      var bal = await agentId.balanceOf(account);
      var already = await agentMint.hasMinted(account);
      if (already) {
        agentEl.textContent = "You already minted your AgentMint Pass with this address.";
        setStatus("Already minted — one pass per address.", "ok");
        mintBtn.disabled = true;
        return;
      }
      if (bal > 0n) {
        agentEl.textContent = "Agent ID held: yes (" + bal.toString() + "). You can mint.";
        setStatus("You hold an Agent ID — you can mint your free pass.", "ok");
        mintBtn.disabled = false;
      } else {
        agentEl.textContent = "Agent ID held: no. Claim one in the Binance App (Wallet → Agent ID), then come back.";
        setStatus("This address holds no Agent ID, so it cannot mint.", "warn");
        mintBtn.disabled = true;
      }
    } catch (e) {
      setStatus("Could not read chain state: " + (e && e.message ? e.message : e), "err");
    }
  }

  async function ensureBsc() {
    var net = await provider.getNetwork();
    if (Number(net.chainId) === CONFIG.chainId) return true;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CONFIG.chainId.toString(16) }],
      });
      provider = new ethers.BrowserJsonRpcProvider(window.ethereum);
      return true;
    } catch (e) {
      setStatus("Please switch your wallet to BNB Smart Chain (chain 56) and reconnect.", "warn");
      return false;
    }
  }

  async function connectInjected() {
    if (!window.ethereum) {
      setStatus("No wallet found in this browser. Install a wallet extension (e.g. Binance Wallet / MetaMask) and reload.", "err");
      return;
    }
    setStatus("Waiting for your wallet…", "muted");
    provider = new ethers.BrowserJsonRpcProvider(window.ethereum);
    try {
      var accounts = await provider.send("eth_requestAccounts", []);
    } catch (e) {
      setStatus("Connection rejected in the wallet.", "warn");
      return;
    }
    if (!accounts || !accounts.length) { setStatus("No account selected.", "warn"); return; }
    if (!(await ensureBsc())) return;
    account = accounts[0];
    signer = await provider.getSigner();
    agentMint = new ethers.Contract(CONFIG.contractAddress, AGENTMINT_ABI, signer);
    connectBtn.textContent = "Connected: " + short(account);
    connectBtn.disabled = true;
    await readChainState();
    await refreshAccountState();
  }

  async function connectWalletConnect() {
    if (!CONFIG.walletConnectProjectId) return;
    setStatus("Loading WalletConnect…", "muted");
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.16.0/dist/umd/index.min.js");
      var wc = await window.WalletConnectEthereumProvider.init({
        projectId: CONFIG.walletConnectProjectId,
        chains: [CONFIG.chainId],
        showQrModal: true,
        rpcMap: { 56: CONFIG.rpcUrl },
      });
      await wc.connect();
      provider = new ethers.BrowserJsonRpcProvider(wc);
      var accounts = await provider.send("eth_requestAccounts", []);
      account = accounts[0];
      signer = await provider.getSigner();
      agentMint = new ethers.Contract(CONFIG.contractAddress, AGENTMINT_ABI, signer);
      connectBtn.textContent = "Connected: " + short(account);
      connectBtn.disabled = true;
      wcBtn.disabled = true;
      await readChainState();
      await refreshAccountState();
    } catch (e) {
      setStatus("WalletConnect failed: " + (e && e.message ? e.message : e), "err");
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error("failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  async function mint() {
    if (!agentMint || !account) return;
    mintBtn.disabled = true;
    setStatus("Confirm the transaction in your wallet. The mint is free (0 BNB) — you only pay gas.", "muted");
    txEl.textContent = "";
    try {
      var tx = await agentMint.mint({ value: 0n });
      txEl.textContent = "Sent: " + tx.hash + " — waiting for confirmation…";
      var receipt = await tx.wait();
      if (receipt.status !== 1n && receipt.status !== 1) throw new Error("transaction failed on-chain");
      var tokenId = null;
      try {
        for (var i = 0; i < receipt.logs.length; i++) {
          var parsed = agentMint.interface.parseLog(receipt.logs[i]);
          if (parsed && parsed.name === "Minted") { tokenId = parsed.args.tokenId.toString(); break; }
        }
      } catch (e) { /* fall back to totalMinted */ }
      setStatus(tokenId
        ? "Minted! Your AgentMint Pass is token #" + tokenId + "."
        : "Minted! Your AgentMint Pass is on its way.", "ok");
      txEl.textContent = "Tx: " + tx.hash;
      await readChainState();
      await refreshAccountState();
    } catch (e) {
      var msg = (e && e.message) || String(e);
      if (/rejected|denied|user rejected/i.test(msg)) {
        setStatus("You rejected the transaction in your wallet. Nothing was sent.", "warn");
      } else {
        setStatus("Mint failed: " + msg, "err");
      }
      mintBtn.disabled = false;
    }
  }

  function init() {
    if (CONFIG.contractAddress && CONFIG.contractAddress !== "0x0000000000000000000000000000000000000000") {
      $("contract").textContent = CONFIG.contractAddress;
      var readProvider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      agentMint = new ethers.Contract(CONFIG.contractAddress, AGENTMINT_ABI, readProvider);
      readChainState();
    } else {
      $("contract").textContent = "not deployed yet — check back after the deploy";
    }
    connectBtn.addEventListener("click", connectInjected);
    mintBtn.addEventListener("click", mint);
    if (CONFIG.walletConnectProjectId) {
      wcBtn.hidden = false;
      wcBtn.addEventListener("click", connectWalletConnect);
    }
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", function (accs) {
        if (!accs.length) { location.reload(); return; }
        account = accs[0];
        refreshAccountState();
      });
      window.ethereum.on("chainChanged", function () { location.reload(); });
    }
  }

  if (typeof ethers === "undefined") {
    setStatus("Could not load the ethers library (CDN). Check your connection and reload.", "err");
  } else {
    init();
  }
})();
