/* ============================================================
   市值管理工具 · BSC — 核心逻辑
   路由判断：FLAP Portal getTokenV3 + PancakeSwap 双重验证
   交易执行：统一路由合约 UnifiedMarketRouter
   ============================================================ */
'use strict';

/* ===== 合约地址 ===== */
const ADDR = {
  FLAP:           '0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0',
  UNIFIED_ROUTER: '0xf285000859Ee54762a3ad34214F519Df3a10117a', // 统一路由合约
  ROUTER:         '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap（仅用于行情查询）
  FACTORY:        '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  WBNB:           '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT:           '0x55d398326f99059fF775485246999027B3197955',
  USDC:           '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
};

/* ===== ABI ===== */

// 统一路由合约 ABI
const UNIFIED_ROUTER_ABI = [
  {"name":"buyWithAutomaticRoute","type":"function","stateMutability":"payable",
   "inputs":[
     {"name":"token","type":"address"},
     {"name":"minTokenOut","type":"uint256"},
     {"name":"to","type":"address"},
     {"name":"deadline","type":"uint256"}
   ],"outputs":[{"name":"tokenOut","type":"uint256"}]},
  {"name":"sellWithAutomaticRoute","type":"function","stateMutability":"nonpayable",
   "inputs":[
     {"name":"token","type":"address"},
     {"name":"amountIn","type":"uint256"},
     {"name":"minBnbOut","type":"uint256"},
     {"name":"to","type":"address"},
     {"name":"deadline","type":"uint256"}
   ],"outputs":[]},
  {"name":"swapTokenToToken","type":"function","stateMutability":"nonpayable",
   "inputs":[
     {"name":"amountIn","type":"uint256"},
     {"name":"amountOutMin","type":"uint256"},
     {"name":"path","type":"address[]"},
     {"name":"to","type":"address"},
     {"name":"deadline","type":"uint256"}
   ],"outputs":[]},
  {"name":"getRoute","type":"function","stateMutability":"view",
   "inputs":[{"name":"token","type":"address"}],
   "outputs":[{"name":"","type":"uint8"}]}
];

const FLAP_ABI = [
  {"name":"swapExactInput","type":"function","stateMutability":"payable",
   "inputs":[{"name":"params","type":"tuple","components":[
     {"name":"inputToken","type":"address"},{"name":"outputToken","type":"address"},
     {"name":"inputAmount","type":"uint256"},{"name":"minOutputAmount","type":"uint256"},
     {"name":"permitData","type":"bytes"}
   ]}],"outputs":[{"name":"outputAmount","type":"uint256"}]},
  {"name":"quoteExactInput","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"params","type":"tuple","components":[
     {"name":"inputToken","type":"address"},{"name":"outputToken","type":"address"},
     {"name":"inputAmount","type":"uint256"}
   ]}],"outputs":[{"name":"outputAmount","type":"uint256"}]},
  {"name":"getTokenV3","type":"function","stateMutability":"view",
   "inputs":[{"name":"token","type":"address"}],
   "outputs":[{"name":"state","type":"tuple","components":[
     {"name":"status","type":"uint8"},{"name":"reserve","type":"uint256"},
     {"name":"circulatingSupply","type":"uint256"},{"name":"price","type":"uint256"},
     {"name":"tokenVersion","type":"uint8"},{"name":"r","type":"uint256"},
     {"name":"dexSupplyThresh","type":"uint256"}
   ]}]},
  {"name":"buy","type":"function","stateMutability":"payable",
   "inputs":[{"name":"token","type":"address"},{"name":"recipient","type":"address"},{"name":"minAmount","type":"uint256"}],
   "outputs":[{"name":"amount","type":"uint256"}]},
  {"name":"sell","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"minEth","type":"uint256"}],
   "outputs":[{"name":"eth","type":"uint256"}]},
  {"name":"previewBuy","type":"function","stateMutability":"view",
   "inputs":[{"name":"token","type":"address"},{"name":"eth","type":"uint256"}],
   "outputs":[{"name":"amount","type":"uint256"}]},
  {"name":"previewSell","type":"function","stateMutability":"view",
   "inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"}],
   "outputs":[{"name":"eth","type":"uint256"}]},
  {"name":"getFeeRate","type":"function","stateMutability":"view",
   "inputs":[],"outputs":[{"name":"buyFeeRate","type":"uint256"},{"name":"sellFeeRate","type":"uint256"}]}
];

const ROUTER_ABI = [
  {"name":"swapExactETHForTokensSupportingFeeOnTransferTokens","type":"function","stateMutability":"payable",
   "inputs":[{"name":"amountOutMin","type":"uint256"},{"name":"path","type":"address[]"},
             {"name":"to","type":"address"},{"name":"deadline","type":"uint256"}],"outputs":[]},
  {"name":"swapExactTokensForETHSupportingFeeOnTransferTokens","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"amountIn","type":"uint256"},{"name":"amountOutMin","type":"uint256"},
             {"name":"path","type":"address[]"},{"name":"to","type":"address"},{"name":"deadline","type":"uint256"}],"outputs":[]},
  {"name":"swapExactTokensForTokensSupportingFeeOnTransferTokens","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"amountIn","type":"uint256"},{"name":"amountOutMin","type":"uint256"},
             {"name":"path","type":"address[]"},{"name":"to","type":"address"},{"name":"deadline","type":"uint256"}],"outputs":[]},
  {"name":"getAmountsOut","type":"function","stateMutability":"view",
   "inputs":[{"name":"amountIn","type":"uint256"},{"name":"path","type":"address[]"}],
   "outputs":[{"name":"amounts","type":"uint256[]"}]}
];

const FACTORY_ABI = [
  {"name":"getPair","type":"function","stateMutability":"view",
   "inputs":[{"name":"tokenA","type":"address"},{"name":"tokenB","type":"address"}],
   "outputs":[{"name":"pair","type":"address"}]}
];

const PAIR_ABI = [
  {"name":"getReserves","type":"function","stateMutability":"view","inputs":[],
   "outputs":[{"name":"reserve0","type":"uint112"},{"name":"reserve1","type":"uint112"},{"name":"blockTimestampLast","type":"uint32"}]},
  {"name":"token0","type":"function","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"address"}]},
  {"name":"token1","type":"function","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"address"}]}
];

const ERC20_ABI = [
  {"name":"name","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]},
  {"name":"symbol","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]},
  {"name":"decimals","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"uint8"}]},
  {"name":"totalSupply","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
  {"name":"balanceOf","type":"function","stateMutability":"view",
   "inputs":[{"name":"account","type":"address"}],"outputs":[{"type":"uint256"}]},
  {"name":"allowance","type":"function","stateMutability":"view",
   "inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"type":"uint256"}]},
  {"name":"approve","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"type":"bool"}]},
  {"name":"transfer","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"type":"bool"}]}
];

/* ===== 全局状态 ===== */
let provider = null;
let wallets = [];
let tokenOutInfo = null;
let pumpRunning = false, dumpRunning = false;
let pumpAbort = false, dumpAbort = false;
let pendingConfirm = null;

/* ===== 捆绑买入预热缓存 ===== */
// 监测启动后立即预热，触发时直接使用，消除冷启动延迟
let _snipeCache = null; // { walletObjs, routerContracts, nonces, amtWei, gasPrice, gasLimit }

/* ===== 止盈监控状态 ===== */
let profitMonitorMap = {}; // { addr: { costBnb, walletInfo, slippage } }
let profitMonitorTimer = null;
let profitMonitorRunning = false;

const COLORS = [
  '#5b6af0','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'
];

/* ===== 初始化 ===== */
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initProvider();
  loadLocalWallets();
  fetchBnbPrice();
  setInterval(fetchBnbPrice, 30000);
  setInterval(() => { if (tokenOutInfo) refreshTokenPrice(); }, 15000);
  // 初始化手动买卖面板
  initManualPanel();
  // 初始化手机端
  initMobile();
});

function getAddr(key) {
  const overrides = {
    FLAP: document.getElementById('cfgFlap')?.value?.trim(),
    ROUTER: document.getElementById('cfgRouter')?.value?.trim(),
    FACTORY: document.getElementById('cfgFactory')?.value?.trim(),
    WBNB: document.getElementById('cfgWbnb')?.value?.trim(),
  };
  return (overrides[key] && ethers.utils.isAddress(overrides[key])) ? overrides[key] : ADDR[key];
}

// 国内可用的 BSC RPC 列表（按优先级排序）
const FALLBACK_RPCS = [
  'https://bsc-dataseed2.defibit.io/',
  'https://bsc-dataseed3.defibit.io/',
  'https://bsc-dataseed4.defibit.io/',
  'https://bsc-dataseed2.ninicoin.io/',
  'https://bsc-dataseed3.ninicoin.io/',
  'https://bsc-rpc.publicnode.com',
  'https://bsc.meowrpc.com',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/',
  'https://bsc-dataseed.binance.org/',
  'https://rpc.ankr.com/bsc',
];

function initProvider(rpc) {
  const url = rpc || document.getElementById('rpcSelect').value;
  if (url === 'custom') return;
  try {
    provider = new ethers.providers.JsonRpcProvider(url, { chainId: 56, name: 'bnb' });
    // 设置超时：10秒内未响应则尝试备用节点
    const timer = setTimeout(() => {
      setRpcStatus(false);
      // 如果当前节点超时，自动尝试下一个备用节点
      const idx = FALLBACK_RPCS.indexOf(url);
      if (idx >= 0 && idx < FALLBACK_RPCS.length - 1) {
        console.log('[RPC] 超时，切换到备用节点:', FALLBACK_RPCS[idx + 1]);
        initProvider(FALLBACK_RPCS[idx + 1]);
      }
    }, 10000);
    provider.getBlockNumber().then(() => {
      clearTimeout(timer);
      setRpcStatus(true);
    }).catch(() => {
      clearTimeout(timer);
      setRpcStatus(false);
    });
  } catch (e) {
    setRpcStatus(false);
  }
}

function setRpcStatus(ok) {
  const dot = document.getElementById('rpcDot');
  const lbl = document.getElementById('rpcLabel');
  if (ok) {
    dot.className = 'rpc-dot';
    lbl.textContent = '已连接';
  } else {
    dot.className = 'rpc-dot offline';
    lbl.textContent = '连接失败';
  }
}

async function fetchBnbPrice() {
  // 依次尝试多个价格源，优先国内可访问的
  const sources = [
    // OKX 国内可访问
    async () => {
      const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BNB-USDT', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      return parseFloat(d.data[0].last);
    },
    // Gate.io 国内可访问
    async () => {
      const r = await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BNB_USDT', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      return parseFloat(d[0].last);
    },
    // Binance 国际（国内可能超时）
    async () => {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      return parseFloat(d.price);
    },
    // Binance 备用域名
    async () => {
      const r = await fetch('https://api1.binance.com/api/v3/ticker/price?symbol=BNBUSDT', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      return parseFloat(d.price);
    },
  ];
  for (const src of sources) {
    try {
      const p = await src();
      if (p && p > 0) {
        const el = document.getElementById('bnbPriceTag');
        if (el) el.querySelector('span').textContent = '$' + p.toFixed(2);
        window._bnbPrice = p;
        return;
      }
    } catch (e) {}
  }
}

/* ===== 路由检测 ===== */
// status: 0=Invalid, 1=Tradable(内盘), 2=InDuel, 3=Killed, 4=DEX(已毕业), 5=Staged
async function detectRoute(tokenAddr) {
  if (!provider) return 'unknown';
  try {
    const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
    const state = await portal.getTokenV3(tokenAddr);
    const status = state.status;
    if (status === 1 || status === 2) return 'flap';
    if (status === 4) return 'flap-dex';
  } catch (e) {}
  try {
    const factory = new ethers.Contract(getAddr('FACTORY'), FACTORY_ABI, provider);
    const pairAddr = await factory.getPair(tokenAddr, getAddr('WBNB'));
    if (pairAddr && pairAddr !== ethers.constants.AddressZero) {
      const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
      const [r0, r1] = await pair.getReserves();
      if (r0.gt(0) || r1.gt(0)) return 'pancake';
    }
  } catch (e) {}
  return 'unknown';
}

/* ===== 代币信息 ===== */
let tokenDebounce = null;
function onTokenOutInput(val) {
  clearTimeout(tokenDebounce);
  const addr = val.trim();
  if (!ethers.utils.isAddress(addr)) {
    document.getElementById('tokenBanner').classList.add('hidden');
    setRouteTag('unknown');
    tokenOutInfo = null;
    return;
  }
  tokenDebounce = setTimeout(() => loadTokenInfo(addr), 700);
}

async function loadTokenInfo(addr) {
  if (!provider) { toast('请先连接RPC', 'error'); return; }
  showLoading('加载代币信息...');
  try {
    const ca = ethers.utils.getAddress(addr);
    const tc = new ethers.Contract(ca, ERC20_ABI, provider);
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      tc.name().catch(() => 'Unknown'),
      tc.symbol().catch(() => '???'),
      tc.decimals().catch(() => 18),
      tc.totalSupply().catch(() => ethers.BigNumber.from(0))
    ]);
    log('info', `检测代币路由: ${symbol} (${ca.slice(0, 8)}...)`);
    const route = await detectRoute(ca);
    log('info', `路由: ${routeLabel(route)}`);
    const ts = parseFloat(ethers.utils.formatUnits(totalSupply, decimals));
    const { price, mcap, liq } = await getTokenMarketData(ca, decimals, route, ts);
    tokenOutInfo = { address: ca, name, symbol, decimals, totalSupply: ts, route, price, mcap, liq };
    updateTokenBanner();
    setRouteTag(route);
    toast(`已加载 ${symbol}，路由: ${routeLabel(route)}`, 'success');
    renderWalletTable();
  } catch (e) {
    toast('加载代币失败: ' + (e.message || e), 'error');
    log('error', '加载代币失败: ' + (e.message || e));
  } finally {
    hideLoading();
  }
}

function routeLabel(route) {
  if (route === 'flap') return '⚡ FLAP 内盘';
  if (route === 'flap-dex') return '⚡ FLAP 已毕业DEX';
  if (route === 'pancake') return '🥞 PancakeSwap V2';
  return '❓ 未知';
}

async function getTokenMarketData(addr, decimals, route, totalSupply) {
  let price = 0, mcap = 0, liq = 0;
  try {
    if (route === 'flap' || route === 'flap-dex') {
      const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
      const amt = ethers.utils.parseUnits('1', decimals);
      const bnbOut = await portal.quoteExactInput({
        inputToken: addr,
        outputToken: ethers.constants.AddressZero,
        inputAmount: amt
      });
      const bnbP = parseFloat(ethers.utils.formatEther(bnbOut));
      price = bnbP * (window._bnbPrice || 0);
      mcap = price * totalSupply;
      try {
        const state = await portal.getTokenV3(addr);
        const reserve = parseFloat(ethers.utils.formatEther(state.reserve));
        liq = reserve * 2 * (window._bnbPrice || 0);
      } catch (e) {}
    } else if (route === 'pancake') {
      const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
      const amt = ethers.utils.parseUnits('1', decimals);
      const amounts = await router.getAmountsOut(amt, [addr, getAddr('WBNB')]);
      const bnbP = parseFloat(ethers.utils.formatEther(amounts[1]));
      price = bnbP * (window._bnbPrice || 0);
      mcap = price * totalSupply;
      try {
        const factory = new ethers.Contract(getAddr('FACTORY'), FACTORY_ABI, provider);
        const pairAddr = await factory.getPair(addr, getAddr('WBNB'));
        if (pairAddr !== ethers.constants.AddressZero) {
          const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
          const [r0, r1] = await pair.getReserves();
          const t0 = await pair.token0();
          const bnbReserve = t0.toLowerCase() === getAddr('WBNB').toLowerCase() ? r0 : r1;
          liq = parseFloat(ethers.utils.formatEther(bnbReserve)) * 2 * (window._bnbPrice || 0);
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { price, mcap, liq };
}

async function refreshTokenPrice() {
  if (!tokenOutInfo || !provider) return;
  try {
    const { price, mcap, liq } = await getTokenMarketData(
      tokenOutInfo.address, tokenOutInfo.decimals, tokenOutInfo.route, tokenOutInfo.totalSupply
    );
    tokenOutInfo.price = price; tokenOutInfo.mcap = mcap; tokenOutInfo.liq = liq;
    updateTokenBanner();
  } catch (e) {}
}

function updateTokenBanner() {
  if (!tokenOutInfo) return;
  const banner = document.getElementById('tokenBanner');
  banner.classList.remove('hidden');
  document.getElementById('tiAvatar').textContent = tokenOutInfo.symbol.charAt(0).toUpperCase();
  document.getElementById('tiName').textContent = tokenOutInfo.name;
  document.getElementById('tiSym').textContent = tokenOutInfo.symbol + ' · ' + tokenOutInfo.address.slice(0, 10) + '...';
  document.getElementById('tiPrice').textContent = tokenOutInfo.price > 0 ? '$' + fmtPrice(tokenOutInfo.price) : '$--';
  document.getElementById('tiMcap').textContent = tokenOutInfo.mcap > 0 ? fmtUSD(tokenOutInfo.mcap) : '--';
  document.getElementById('tiLiq').textContent = tokenOutInfo.liq > 0 ? fmtUSD(tokenOutInfo.liq) : '--';
  const routeEl = document.getElementById('tiRoute');
  if (tokenOutInfo.route === 'flap') {
    routeEl.className = 'route-tag route-flap'; routeEl.textContent = '⚡ FLAP 内盘';
  } else if (tokenOutInfo.route === 'flap-dex') {
    routeEl.className = 'route-tag route-flap'; routeEl.textContent = '⚡ FLAP 已毕业';
  } else if (tokenOutInfo.route === 'pancake') {
    routeEl.className = 'route-tag route-pancake'; routeEl.textContent = '🥞 PancakeSwap V2';
  } else {
    routeEl.className = 'route-tag route-unknown'; routeEl.textContent = '❓ 未知路由';
  }
}

function setRouteTag(route) {
  const wrap = document.getElementById('routeTagWrap');
  if (route === 'flap') wrap.innerHTML = '<span class="route-tag route-flap">⚡ FLAP 内盘</span>';
  else if (route === 'flap-dex') wrap.innerHTML = '<span class="route-tag route-flap">⚡ FLAP 已毕业</span>';
  else if (route === 'pancake') wrap.innerHTML = '<span class="route-tag route-pancake">🥞 PancakeSwap V2</span>';
  else wrap.innerHTML = '';
}

/* ===== 标签页切换 ===== */
function switchMainTab(btn, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tabId).classList.add('active');
  // 切换到捆绑开盘时，刷新已选钱包状态
  if (tabId === 'snipe') {
    updateSnipeMonitor();
  }
  // 切换到手动买卖时，自动同步交易面板的代币地址
  if (tabId === 'manual') {
    const tradeTokenOut = document.getElementById('tokenOut').value.trim();
    const manualTokenInput = document.getElementById('manualToken');
    if (tradeTokenOut && ethers.utils.isAddress(tradeTokenOut) && !manualTokenInput.value.trim()) {
      manualTokenInput.value = tradeTokenOut;
      onManualTokenInput(tradeTokenOut);
    }
    // 如果已有 tokenOutInfo，直接复用
    if (!manualTokenInfo && tokenOutInfo) {
      manualTokenInfo = { ...tokenOutInfo };
      setManualRouteTag(manualTokenInfo.route);
      updateManualSelTips();
      if (tradeTokenOut) manualTokenInput.value = tradeTokenOut;
    }
  }
}

/* ===== 钱包管理 ===== */
function loadWallets() {
  const lines = document.getElementById('pkInput').value.trim().split('\n').filter(l => l.trim());
  if (!lines.length) { toast('请输入私钥', 'warning'); return; }
  let added = 0, dup = 0, err = 0;
  const existingAddrs = new Set(wallets.map(w => w.address.toLowerCase()));
  lines.forEach((line, i) => {
    const pk = line.trim();
    if (!pk) return;
    try {
      const w = new ethers.Wallet(pk.startsWith('0x') ? pk : '0x' + pk);
      if (existingAddrs.has(w.address.toLowerCase())) { dup++; return; }
      wallets.push({
        id: Date.now() + i,
        name: `钱包${wallets.length + 1}`,
        address: w.address,
        privateKey: w.privateKey,
        bnbBal: '--', tokenInBal: '--', tokenOutBal: '--',
        selected: true,
        colorIdx: wallets.length % COLORS.length
      });
      existingAddrs.add(w.address.toLowerCase());
      added++;
    } catch (e) { err++; }
  });
  renderWalletTable();
  updateSelCount();
  let msg = `已加载 ${added} 个钱包`;
  if (dup) msg += `，${dup} 个重复跳过`;
  if (err) msg += `，${err} 个格式错误`;
  toast(msg, added > 0 ? 'success' : 'warning');
  log('info', msg);
}

function generateWallets() {
  const count = parseInt(document.getElementById('genCount').value) || 5;
  const prefix = document.getElementById('genPrefix').value || '钱包';
  if (count < 1 || count > 100) { toast('数量范围 1-100', 'warning'); return; }
  for (let i = 0; i < count; i++) {
    const w = ethers.Wallet.createRandom();
    wallets.push({
      id: Date.now() + i,
      name: `${prefix}${wallets.length + 1}`,
      address: w.address,
      privateKey: w.privateKey,
      bnbBal: '0', tokenInBal: '0', tokenOutBal: '0',
      selected: true,
      colorIdx: wallets.length % COLORS.length
    });
  }
  renderWalletTable();
  updateSelCount();
  toast(`已生成 ${count} 个钱包`, 'success');
  log('info', `已生成 ${count} 个钱包`);
}

function saveLocal() {
  if (!wallets.length) { toast('没有钱包', 'warning'); return; }
  localStorage.setItem('mcap_wallets', JSON.stringify(wallets));
  toast('已保存到本地', 'success');
}

function loadLocal() {
  try {
    const saved = localStorage.getItem('mcap_wallets');
    if (!saved) { toast('没有本地数据', 'warning'); return; }
    wallets = JSON.parse(saved);
    renderWalletTable();
    updateSelCount();
    toast(`已读取 ${wallets.length} 个钱包`, 'success');
  } catch (e) { toast('读取失败', 'error'); }
}

function loadLocalWallets() {
  try {
    const saved = localStorage.getItem('mcap_wallets');
    if (saved) { wallets = JSON.parse(saved); renderWalletTable(); updateSelCount(); }
  } catch (e) {}
}

async function queryBalances() {
  if (!provider || !wallets.length) { toast('请先加载钱包并连接RPC', 'warning'); return; }
  showLoading('查询余额中...');
  log('info', `开始查询 ${wallets.length} 个钱包余额...`);
  try {
    const tokenInAddr = getTokenInAddr();
    const tokenOutAddr = tokenOutInfo ? tokenOutInfo.address : null;
    await Promise.all(wallets.map(async (w, i) => {
      try {
        const bnb = await provider.getBalance(w.address);
        wallets[i].bnbBal = parseFloat(ethers.utils.formatEther(bnb)).toFixed(5);
        if (tokenInAddr && ethers.utils.isAddress(tokenInAddr)) {
          const tc = new ethers.Contract(tokenInAddr, ERC20_ABI, provider);
          const dec = await tc.decimals().catch(() => 18);
          const bal = await tc.balanceOf(w.address);
          wallets[i].tokenInBal = parseFloat(ethers.utils.formatUnits(bal, dec)).toFixed(4);
        }
        if (tokenOutAddr) {
          const tc = new ethers.Contract(tokenOutAddr, ERC20_ABI, provider);
          const bal = await tc.balanceOf(w.address);
          wallets[i].tokenOutBal = parseFloat(ethers.utils.formatUnits(bal, tokenOutInfo.decimals)).toFixed(4);
        }
      } catch (e) {}
    }));
    renderWalletTable();
    saveLocal();
    toast('余额查询完成', 'success');
    log('success', '余额查询完成');
  } catch (e) {
    toast('查询失败: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

function getTokenInAddr() {
  const mode = document.getElementById('tradeMode').value;
  if (mode === 'bnb2token') return getAddr('WBNB');
  const val = document.getElementById('tokenIn').value.trim();
  return ethers.utils.isAddress(val) ? val : null;
}

function selectAll() { wallets.forEach(w => w.selected = true); renderWalletTable(); updateSelCount(); }
function deselectAll() { wallets.forEach(w => w.selected = false); renderWalletTable(); updateSelCount(); }
function getSelected() { return wallets.filter(w => w.selected); }

function toggleCheckAll(el) {
  wallets.forEach(w => w.selected = el.checked);
  renderWalletTable();
  updateSelCount();
}

function deleteSelected() {
  const sel = getSelected();
  if (!sel.length) { toast('请先选择钱包', 'warning'); return; }
  wallets = wallets.filter(w => !w.selected);
  renderWalletTable();
  updateSelCount();
  toast(`已删除 ${sel.length} 个钱包`, 'success');
}

// 复制钱包地址到剪切板（一行一个）
function copyAddresses() {
  const sel = getSelected();
  const list = sel.length ? sel : wallets;
  if (!list.length) { toast('没有钱包', 'warning'); return; }
  const text = list.map(w => w.address).join('\n');
  copyText(text, `已复制 ${list.length} 个地址`);
}

// 复制私钥到剪切板（一行一个）
function copyPrivateKeys() {
  const sel = getSelected();
  const list = sel.length ? sel : wallets;
  if (!list.length) { toast('没有钱包', 'warning'); return; }
  const text = list.map(w => w.privateKey).join('\n');
  copyText(text, `已复制 ${list.length} 个私钥`);
}

function updateSelCount() {
  const n = getSelected().length;
  // 桌面端侧边栏
  const selCountEl = document.getElementById('selCount');
  if (selCountEl) selCountEl.textContent = `已选 ${n}`;
  // 手机端设置面板
  const selCount2El = document.getElementById('selCount2');
  if (selCount2El) selCount2El.textContent = `已选 ${n}`;
  // 钱包数量徽章
  const wcEl = document.getElementById('walletCount');
  if (wcEl) wcEl.textContent = wallets.length;
  // 手机端底部导航徽章
  const wcBadge = document.getElementById('walletCountBadge');
  if (wcBadge) {
    wcBadge.textContent = wallets.length;
    wcBadge.style.display = wallets.length > 0 ? '' : 'none';
  }
  // 手机端浮动选中栏
  const mobileSelBar = document.getElementById('mobileSelBar');
  const mobileSelText = document.getElementById('mobileSelText');
  if (mobileSelBar && mobileSelText) {
    mobileSelText.textContent = `已选 ${n} 个钱包`;
    mobileSelBar.classList.toggle('hidden', n === 0);
    // 同步 body 类名，用于 CSS 防止内容被浮动栏遮挡
    document.body.classList.toggle('has-sel-bar', n > 0);
  }
  // 同步更新手动买卖面板的已选提示
  if (typeof updateManualSelTips === 'function') updateManualSelTips();
  // 同步更新捆绑开盘面板的已选钱包
  if (typeof updateSnipeMonitor === 'function') updateSnipeMonitor();
}

function removeWallet(id) {
  wallets = wallets.filter(w => w.id !== id);
  renderWalletTable();
  updateSelCount();
}

function useFirstWallet(inputId) {
  if (!wallets.length) { toast('没有钱包', 'warning'); return; }
  document.getElementById(inputId).value = wallets[0].address;
}

/* ===== 渲染钱包表格 ===== */
function renderWalletTable() {
  const tbody = document.getElementById('walletTbody');
  const showPk = document.getElementById('showPkCheck')?.checked || document.getElementById('showPkCheck2')?.checked;
  const mode = document.getElementById('tradeMode').value;
  document.getElementById('thTokenIn').textContent = mode === 'bnb2token' ? 'BNB' : 'TokenIn';
  document.getElementById('thTokenOut').textContent = tokenOutInfo ? tokenOutInfo.symbol : 'TokenOut';
  const wcEl = document.getElementById('walletCount');
  if (wcEl) wcEl.textContent = wallets.length;
  const wcBadge = document.getElementById('walletCountBadge');
  if (wcBadge) { wcBadge.textContent = wallets.length; wcBadge.style.display = wallets.length > 0 ? '' : 'none'; }
  const checkAll = document.getElementById('checkAll');
  if (checkAll) checkAll.checked = wallets.length > 0 && wallets.every(w => w.selected);
  // 手机端卡片列表
  renderWalletCards(showPk);
  if (!wallets.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无钱包，请导入或生成</td></tr>';
    return;
  }
  tbody.innerHTML = wallets.map((w, i) => `
    <tr>
      <td><input type="checkbox" class="check" ${w.selected ? 'checked' : ''} onchange="wallets[${i}].selected=this.checked;updateSelCount()"></td>
      <td>
        <div class="wallet-name">
          <span class="wallet-dot" style="background:${COLORS[w.colorIdx || 0]}"></span>
          ${w.name}
        </div>
      </td>
      <td>
        <span class="wallet-addr" title="${w.address}" onclick="copyText('${w.address}','地址已复制')">${shortAddr(w.address)}</span>
        ${showPk ? `<div style="font-size:10px;color:#ef4444;font-family:monospace;margin-top:2px">${w.privateKey.slice(0, 20)}...</div>` : ''}
      </td>
      <td class="wallet-bnb">${w.bnbBal}</td>
      <td class="wallet-token">${mode === 'bnb2token' ? w.bnbBal : w.tokenInBal}</td>
      <td class="wallet-token">${w.tokenOutBal}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-xs" onclick="showWalletDetail(${w.id})">详情</button>
          <button class="btn btn-ghost btn-xs" onclick="removeWallet(${w.id})">删除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showWalletDetail(id) {
  const w = wallets.find(w => w.id === id);
  if (!w) return;
  const showPk = document.getElementById('showPkCheck')?.checked;
  showConfirmModal('钱包详情', `
    <div class="confirm-box">
      <div class="confirm-row"><span class="confirm-key">名称</span><span class="confirm-val">${w.name}</span></div>
      <div class="confirm-row"><span class="confirm-key">地址</span><span class="confirm-val" style="font-family:monospace;font-size:11px">${w.address}</span></div>
      <div class="confirm-row"><span class="confirm-key">BNB 余额</span><span class="confirm-val green">${w.bnbBal}</span></div>
      <div class="confirm-row"><span class="confirm-key">Token 余额</span><span class="confirm-val blue">${w.tokenOutBal}</span></div>
      ${showPk ? `<div class="confirm-row"><span class="confirm-key">私钥</span><span class="confirm-val" style="font-family:monospace;font-size:10px;color:#ef4444">${w.privateKey}</span></div>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="copyText('${w.address}','地址已复制')">复制地址</button>
      ${showPk ? `<button class="btn btn-ghost btn-sm" onclick="copyText('${w.privateKey}','私钥已复制')">复制私钥</button>` : ''}
      <a href="https://bscscan.com/address/${w.address}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none">BSCScan</a>
    </div>
  `, null, false);
}

/* ===== 交易模式切换 ===== */
function onTradeModeChange() {
  const mode = document.getElementById('tradeMode').value;
  const buyGroup = document.getElementById('buyAmountGroup') || document.querySelector('[id="buyMin"]')?.closest('.param-block');
  const sellBlock = document.getElementById('sellPctBlock');
  const tokenInGroup = document.getElementById('tokenInGroup');
  if (mode === 'bnb2token') {
    if (sellBlock) sellBlock.style.display = 'none';
    if (tokenInGroup) tokenInGroup.style.display = 'none';
  } else if (mode === 'token2bnb') {
    if (sellBlock) sellBlock.style.display = '';
    if (tokenInGroup) tokenInGroup.style.display = 'none';
  } else {
    if (sellBlock) sellBlock.style.display = '';
    if (tokenInGroup) tokenInGroup.style.display = '';
  }
  renderWalletTable();
}

function setTokenIn(sym) {
  const addrs = { WBNB: getAddr('WBNB'), USDT: ADDR.USDT, USDC: ADDR.USDC };
  document.getElementById('tokenIn').value = addrs[sym] || '';
}

// 授权已移除：买卖时自动检测并按需 approve，无需手动授权

/* ===== 买入 ===== */
async function buyToken(walletInfo, bnbAmount, slippage) {
  if (!tokenOutInfo) throw new Error('请先设置代币地址');
  const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
  const amtWei = ethers.utils.parseEther(bnbAmount.toFixed(18));
  const gasPrice = ethers.utils.parseUnits(document.getElementById('gasPrice').value || '0.05', 'gwei');
  const gasMulti = parseFloat(document.getElementById('gasMulti').value) || 1.2;

  // 通过统一路由合约买入（自动判断 Flap 内盘 / PancakeSwap）
  const unifiedRouter = new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  // 计算滑点保护：尝试获取预估输出量
  let minTokenOut = ethers.BigNumber.from(0);
  try {
    if (tokenOutInfo.route === 'flap' || tokenOutInfo.route === 'flap-dex') {
      const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
      const quoted = await portal.quoteExactInput({
        inputToken: ethers.constants.AddressZero,
        outputToken: tokenOutInfo.address,
        inputAmount: amtWei
      });
      minTokenOut = quoted.mul(Math.floor((100 - slippage) * 100)).div(10000);
    } else {
      const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
      const amounts = await router.getAmountsOut(amtWei, [getAddr('WBNB'), tokenOutInfo.address]);
      minTokenOut = amounts[1].mul(Math.floor((100 - slippage) * 100)).div(10000);
    }
  } catch (e) {}

  const gasEst = await unifiedRouter.estimateGas.buyWithAutomaticRoute(
    tokenOutInfo.address, minTokenOut, wallet.address, deadline, { value: amtWei }
  ).catch(() => ethers.BigNumber.from(500000));

  const tx = await unifiedRouter.buyWithAutomaticRoute(
    tokenOutInfo.address, minTokenOut, wallet.address, deadline,
    { value: amtWei, gasPrice, gasLimit: Math.floor(gasEst.toNumber() * gasMulti) }
  );
  return await tx.wait();
}

/* ===== 卖出 ===== */
async function sellToken(walletInfo, sellPct, slippage) {
  if (!tokenOutInfo) throw new Error('请先设置代币地址');
  const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
  const tc = new ethers.Contract(tokenOutInfo.address, ERC20_ABI, wallet);
  const gasPrice = ethers.utils.parseUnits(document.getElementById('gasPrice').value || '0.05', 'gwei');
  const gasMulti = parseFloat(document.getElementById('gasMulti').value) || 1.2;
  const balance = await tc.balanceOf(wallet.address);
  if (balance.isZero()) throw new Error('代币余额为0');
  const sellAmt = balance.mul(Math.floor(sellPct * 100)).div(10000);

  // 通过统一路由合约卖出（自动判断 Flap 内盘 / PancakeSwap）
  const unifiedRouter = new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  // 确保已授权给统一路由合约
  const allowance = await tc.allowance(wallet.address, ADDR.UNIFIED_ROUTER);
  if (allowance.lt(sellAmt)) {
    const appTx = await tc.approve(ADDR.UNIFIED_ROUTER, ethers.constants.MaxUint256, { gasPrice, gasLimit: 100000 });
    await appTx.wait();
  }

  // 计算滑点保护
  let minBnbOut = ethers.BigNumber.from(0);
  try {
    if (tokenOutInfo.route === 'flap' || tokenOutInfo.route === 'flap-dex') {
      const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
      const quoted = await portal.quoteExactInput({
        inputToken: tokenOutInfo.address,
        outputToken: ethers.constants.AddressZero,
        inputAmount: sellAmt
      });
      minBnbOut = quoted.mul(Math.floor((100 - slippage) * 100)).div(10000);
    } else {
      const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
      const amounts = await router.getAmountsOut(sellAmt, [tokenOutInfo.address, getAddr('WBNB')]);
      minBnbOut = amounts[1].mul(Math.floor((100 - slippage) * 100)).div(10000);
    }
  } catch (e) {}

  const gasEst = await unifiedRouter.estimateGas.sellWithAutomaticRoute(
    tokenOutInfo.address, sellAmt, minBnbOut, wallet.address, deadline
  ).catch(() => ethers.BigNumber.from(500000));

  const tx = await unifiedRouter.sellWithAutomaticRoute(
    tokenOutInfo.address, sellAmt, minBnbOut, wallet.address, deadline,
    { gasPrice, gasLimit: Math.floor(gasEst.toNumber() * gasMulti) }
  );
  return await tx.wait();
}

/* ===== Token -> Token 对换 ===== */
async function swapTokenToToken(walletInfo, sellPct, slippage) {
  const tokenInAddr = document.getElementById('tokenIn').value.trim();
  if (!ethers.utils.isAddress(tokenInAddr)) throw new Error('请设置 TokenIn 地址');
  if (!tokenOutInfo) throw new Error('请设置 TokenOut 地址');
  const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
  const gasPrice = ethers.utils.parseUnits(document.getElementById('gasPrice').value || '0.05', 'gwei');
  const gasMulti = parseFloat(document.getElementById('gasMulti').value) || 1.2;
  const tcIn = new ethers.Contract(tokenInAddr, ERC20_ABI, wallet);
  const balance = await tcIn.balanceOf(wallet.address);
  if (balance.isZero()) throw new Error('TokenIn 余额为0');
  const sellAmt = balance.mul(Math.floor(sellPct * 100)).div(10000);

  // 通过统一路由合约进行 Token 对换
  const unifiedRouter = new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  // 确保 TokenIn 已授权给统一路由合约
  const allowance = await tcIn.allowance(wallet.address, ADDR.UNIFIED_ROUTER);
  if (allowance.lt(sellAmt)) {
    const appTx = await tcIn.approve(ADDR.UNIFIED_ROUTER, ethers.constants.MaxUint256, { gasPrice, gasLimit: 100000 });
    await appTx.wait();
  }

  const path = [tokenInAddr, getAddr('WBNB'), tokenOutInfo.address];
  let amountOutMin = ethers.BigNumber.from(0);
  try {
    const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
    const amounts = await router.getAmountsOut(sellAmt, path);
    amountOutMin = amounts[2].mul(Math.floor((100 - slippage) * 100)).div(10000);
  } catch (e) {}

  const gasEst = await unifiedRouter.estimateGas.swapTokenToToken(
    sellAmt, amountOutMin, path, wallet.address, deadline
  ).catch(() => ethers.BigNumber.from(400000));

  const tx = await unifiedRouter.swapTokenToToken(
    sellAmt, amountOutMin, path, wallet.address, deadline,
    { gasPrice, gasLimit: Math.floor(gasEst.toNumber() * gasMulti) }
  );
  return await tx.wait();
}

/* ===== 拉盘 ===== */
async function startPump() {
  const sel = getSelected();
  if (!sel.length) { toast('请选择钱包', 'warning'); return; }
  if (!tokenOutInfo) { toast('请先设置 TokenOut 地址', 'warning'); return; }
  const mode = document.getElementById('tradeMode').value;
  const buyMin = parseFloat(document.getElementById('buyMin').value) || 0.001;
  const buyMax = parseFloat(document.getElementById('buyMax').value) || 0.002;
  const sellPctMin = parseFloat(document.getElementById('sellPctMin').value) || 80;
  const sellPctMax = parseFloat(document.getElementById('sellPctMax').value) || 100;
  const slippage = parseFloat(document.getElementById('slippage').value) || 5;
  const loopCount = parseInt(document.getElementById('loopCount').value) || 0;
  const intMin = parseInt(document.getElementById('buyIntervalMin').value) || 1000;
  const intMax = parseInt(document.getElementById('buyIntervalMax').value) || 3000;
  const enableProfitStop = document.getElementById('enableProfitStop')?.checked || false;
  const profitStopPct = parseFloat(document.getElementById('profitStopPct')?.value) || 100;
  const doConfirmTrade = document.getElementById('confirmCheck').checked;
  if (doConfirmTrade) {
    pendingConfirm = () => _runPump(sel, mode, buyMin, buyMax, sellPctMin, sellPctMax, slippage, loopCount, intMin, intMax, enableProfitStop, profitStopPct);
    showConfirmModal('确认开始拉盘', `
      <div class="confirm-box">
        <div class="confirm-row"><span class="confirm-key">代币</span><span class="confirm-val">${tokenOutInfo.symbol}</span></div>
        <div class="confirm-row"><span class="confirm-key">路由</span><span class="confirm-val purple">${routeLabel(tokenOutInfo.route)}</span></div>
        <div class="confirm-row"><span class="confirm-key">模式</span><span class="confirm-val blue">${mode === 'bnb2token' ? 'BNB→Token' : mode === 'token2bnb' ? 'Token→BNB' : 'Token→Token'}</span></div>
        <div class="confirm-row"><span class="confirm-key">钱包数</span><span class="confirm-val">${sel.length} 个</span></div>
        <div class="confirm-row"><span class="confirm-key">金额范围</span><span class="confirm-val green">${buyMin} ~ ${buyMax} BNB</span></div>
        <div class="confirm-row"><span class="confirm-key">循环次数</span><span class="confirm-val">${loopCount === 0 ? '无限' : loopCount}</span></div>
        ${enableProfitStop ? `<div class="confirm-row"><span class="confirm-key">止盈设置</span><span class="confirm-val" style="color:var(--c-warn)">📊 盈利超过 ${profitStopPct}% 自动全卖</span></div>` : ''}
      </div>
      <div class="warn-notice">⚠️ 链上操作不可撤销，请确认参数无误！</div>
    `);
    return;
  }
  _runPump(sel, mode, buyMin, buyMax, sellPctMin, sellPctMax, slippage, loopCount, intMin, intMax, enableProfitStop, profitStopPct);
}

async function _runPump(sel, mode, buyMin, buyMax, sellPctMin, sellPctMax, slippage, loopCount, intMin, intMax, enableProfitStop = false, profitStopPct = 100) {
  pumpRunning = true; pumpAbort = false;
  document.getElementById('startPumpBtn').disabled = true;
  document.getElementById('stopPumpBtn').disabled = false;
  document.getElementById('tradeProgress').classList.add('show');
  log('info', `🚀 开始拉盘，${sel.length}个钱包，${loopCount === 0 ? '无限' : '共' + loopCount}轮`);
  let round = 0;
  while (pumpRunning && !pumpAbort && (loopCount === 0 || round < loopCount)) {
    round++;
    log('info', `--- 第 ${round} 轮 ---`);
    for (let i = 0; i < sel.length && !pumpAbort; i++) {
      const w = sel[i];
      const pct = Math.round((i / sel.length) * 100);
      document.getElementById('tradeFill').style.width = pct + '%';
      document.getElementById('tradeProgressText').textContent = `第${round}轮 ${i + 1}/${sel.length}`;
      try {
        let receipt;
        if (mode === 'bnb2token') {
          const amt = randBetween(buyMin, buyMax);
          log('pending', `[${w.name}] 买入 ${amt.toFixed(4)} BNB...`);
          receipt = await buyToken(w, amt, slippage);
          log('success', `[${w.name}] 买入成功`, receipt.transactionHash);
          // 止盈监控：记录买入成本
          if (enableProfitStop) {
            const addrKey = w.address.toLowerCase();
            if (!profitMonitorMap[addrKey]) {
              profitMonitorMap[addrKey] = { costBnb: amt, walletInfo: w, slippage };
            } else {
              profitMonitorMap[addrKey].costBnb += amt; // 累计成本
            }
            startProfitMonitor(profitStopPct);
          }
        } else if (mode === 'token2bnb') {
          const p = randBetween(sellPctMin, sellPctMax);
          log('pending', `[${w.name}] 卖出 ${p.toFixed(1)}%...`);
          receipt = await sellToken(w, p, slippage);
          log('success', `[${w.name}] 卖出成功`, receipt.transactionHash);
        } else {
          const p = randBetween(sellPctMin, sellPctMax);
          log('pending', `[${w.name}] Token对换 ${p.toFixed(1)}%...`);
          receipt = await swapTokenToToken(w, p, slippage);
          log('success', `[${w.name}] 对换成功`, receipt.transactionHash);
        }
        const bnb = await provider.getBalance(w.address).catch(() => null);
        if (bnb) { const idx = wallets.findIndex(x => x.id === w.id); if (idx >= 0) wallets[idx].bnbBal = parseFloat(ethers.utils.formatEther(bnb)).toFixed(5); }
      } catch (e) {
        log('error', `[${w.name}] 失败: ${e.reason || e.message || e}`);
      }
      if (!pumpAbort) await sleep(randInt(intMin, intMax));
    }
    renderWalletTable();
    if (loopCount > 0 && round >= loopCount) break;
    if (!pumpAbort && loopCount === 0) await sleep(500);
  }
  pumpRunning = false;
  document.getElementById('startPumpBtn').disabled = false;
  document.getElementById('stopPumpBtn').disabled = true;
  document.getElementById('tradeFill').style.width = '100%';
  document.getElementById('tradeProgressText').textContent = '完成';
  log('info', `✅ 拉盘结束，共 ${round} 轮`);
  toast('拉盘结束', 'success');
}

function stopPump() {
  pumpAbort = true; pumpRunning = false;
  document.getElementById('startPumpBtn').disabled = false;
  document.getElementById('stopPumpBtn').disabled = true;
  log('info', '⏹ 已停止拉盘');
  toast('已停止拉盘', 'info');
}

/* ===== 止盈监控 ===== */
function startProfitMonitor(profitStopPct) {
  if (profitMonitorRunning) return;
  profitMonitorRunning = true;
  const checkInterval = parseInt(document.getElementById('profitCheckInterval')?.value) || 5;
  const statusEl = document.getElementById('profitMonitorStatus');
  const statusText = document.getElementById('profitMonitorText');
  if (statusEl) statusEl.classList.remove('hidden');
  _updateProfitMonitorStatus();

  profitMonitorTimer = setInterval(async () => {
    if (!tokenOutInfo || !provider) return;
    const addrs = Object.keys(profitMonitorMap);
    if (!addrs.length) {
      stopProfitMonitor();
      return;
    }
    _updateProfitMonitorStatus();
    for (const addrKey of addrs) {
      const entry = profitMonitorMap[addrKey];
      if (!entry) continue;
      const { costBnb, walletInfo, slippage } = entry;
      try {
        const tc = new ethers.Contract(tokenOutInfo.address, ERC20_ABI, provider);
        const balance = await tc.balanceOf(walletInfo.address);
        if (balance.isZero()) {
          delete profitMonitorMap[addrKey];
          _updateProfitMonitorStatus();
          continue;
        }
        // 估算卖出可得BNB
        let bnbOut = 0;
        if (tokenOutInfo.route === 'flap' || tokenOutInfo.route === 'flap-dex') {
          const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
          const quoted = await portal.quoteExactInput({
            inputToken: tokenOutInfo.address,
            outputToken: ethers.constants.AddressZero,
            inputAmount: balance
          }).catch(() => null);
          if (quoted) bnbOut = parseFloat(ethers.utils.formatEther(quoted));
        } else if (tokenOutInfo.route === 'pancake') {
          const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
          const amounts = await router.getAmountsOut(balance, [tokenOutInfo.address, getAddr('WBNB')]).catch(() => null);
          if (amounts) bnbOut = parseFloat(ethers.utils.formatEther(amounts[1]));
        }
        if (bnbOut > 0 && costBnb > 0) {
          const profitPct = (bnbOut - costBnb) / costBnb * 100;
          log('info', `[${walletInfo.name}] 止盈检查：成本 ${costBnb.toFixed(5)} BNB，当前估值 ${bnbOut.toFixed(5)} BNB，盈利 ${profitPct.toFixed(1)}%`);
          if (profitPct >= profitStopPct) {
            log('info', `[${walletInfo.name}] 盈利 ${profitPct.toFixed(1)}% 已达止盈线 ${profitStopPct}%，自动全部卖出...`);
            delete profitMonitorMap[addrKey];
            _updateProfitMonitorStatus();
            sellToken(walletInfo, 100, slippage).then(receipt => {
              log('success', `[${walletInfo.name}] 止盈卖出成功（盈利 ${profitPct.toFixed(1)}%）`, receipt.transactionHash);
              toast(`✅ [${walletInfo.name}] 止盈卖出成功，盈利 ${profitPct.toFixed(1)}%`, 'success');
              const bnb = provider.getBalance(walletInfo.address).catch(() => null);
              if (bnb) {
                bnb.then(b => {
                  const idx = wallets.findIndex(x => x.id === walletInfo.id);
                  if (idx >= 0) wallets[idx].bnbBal = parseFloat(ethers.utils.formatEther(b)).toFixed(5);
                  renderWalletTable();
                });
              }
            }).catch(e => {
              log('error', `[${walletInfo.name}] 止盈卖出失败: ${e.reason || e.message || e}`);
              // 卖出失败则重新加入监控
              profitMonitorMap[addrKey] = entry;
              _updateProfitMonitorStatus();
            });
          }
        }
      } catch (e) {
        // 忽略单个地址的查询错误
      }
    }
  }, checkInterval * 1000);
}

function stopProfitMonitor() {
  profitMonitorRunning = false;
  if (profitMonitorTimer) { clearInterval(profitMonitorTimer); profitMonitorTimer = null; }
  const statusEl = document.getElementById('profitMonitorStatus');
  if (statusEl) statusEl.classList.add('hidden');
}

function _updateProfitMonitorStatus() {
  const n = Object.keys(profitMonitorMap).length;
  const statusEl = document.getElementById('profitMonitorStatus');
  const statusText = document.getElementById('profitMonitorText');
  if (!statusEl) return;
  if (n === 0) {
    statusEl.classList.add('hidden');
  } else {
    statusEl.classList.remove('hidden');
    if (statusText) statusText.textContent = `止盈监控中，已记录 ${n} 个地址...`;
  }
}

function onProfitStopToggle() {
  const enabled = document.getElementById('enableProfitStop')?.checked;
  if (!enabled) {
    profitMonitorMap = {};
    stopProfitMonitor();
    log('info', '止盈监控已关闭');
  }
}

function clearProfitMonitor() {
  profitMonitorMap = {};
  stopProfitMonitor();
  log('info', '止盈监控已清空');
  toast('止盈监控已清空', 'info');
}

/* ===== 砸盘 ===== */
async function startDump() {
  const sel = getSelected();
  if (!sel.length) { toast('请选择钱包', 'warning'); return; }
  if (!tokenOutInfo) { toast('请先设置代币地址', 'warning'); return; }
  // 砸盘固定 100% 全部卖出
  const sellPct = 100;
  const slippage = parseFloat(document.getElementById('slippage').value) || 5;
  const intMin = parseInt(document.getElementById('sellIntervalMin').value) || 1000;
  const intMax = parseInt(document.getElementById('sellIntervalMax').value) || 3000;
  const doConfirmTrade = document.getElementById('confirmCheck').checked;
  if (doConfirmTrade) {
    pendingConfirm = () => _runDump(sel, sellPct, sellPct, slippage, intMin, intMax);
    showConfirmModal('确认开始砸盘', `
      <div class="confirm-box">
        <div class="confirm-row"><span class="confirm-key">代币</span><span class="confirm-val">${tokenOutInfo.symbol}</span></div>
        <div class="confirm-row"><span class="confirm-key">路由</span><span class="confirm-val purple">${routeLabel(tokenOutInfo.route)}</span></div>
        <div class="confirm-row"><span class="confirm-key">钱包数</span><span class="confirm-val">${sel.length} 个</span></div>
        <div class="confirm-row"><span class="confirm-key">卖出比例</span><span class="confirm-val red">💥 100%（全部卖出）</span></div>
      </div>
      <div class="warn-notice">⚠️ 将批量卖出全部代币，操作不可撤销！</div>
    `);
    return;
  }
  _runDump(sel, sellPct, sellPct, slippage, intMin, intMax);
}

async function _runDump(sel, sellPctMin, sellPctMax, slippage, intMin, intMax) {
  dumpRunning = true; dumpAbort = false;
  document.getElementById('startDumpBtn').disabled = true;
  document.getElementById('stopDumpBtn').disabled = false;
  log('info', `📉 开始砸盘，${sel.length}个钱包`);
  let ok = 0, fail = 0;
  for (let i = 0; i < sel.length && !dumpAbort; i++) {
    const w = sel[i];
    const pct = randBetween(sellPctMin, sellPctMax);
    try {
      log('pending', `[${w.name}] 卖出 ${pct.toFixed(1)}%...`);
      const receipt = await sellToken(w, pct, slippage);
      log('success', `[${w.name}] 卖出成功`, receipt.transactionHash);
      ok++;
      const bnb = await provider.getBalance(w.address).catch(() => null);
      if (bnb) { const idx = wallets.findIndex(x => x.id === w.id); if (idx >= 0) wallets[idx].bnbBal = parseFloat(ethers.utils.formatEther(bnb)).toFixed(5); }
    } catch (e) {
      log('error', `[${w.name}] 失败: ${e.reason || e.message || e}`);
      fail++;
    }
    if (!dumpAbort) await sleep(randInt(intMin, intMax));
  }
  renderWalletTable();
  dumpRunning = false;
  document.getElementById('startDumpBtn').disabled = false;
  document.getElementById('stopDumpBtn').disabled = true;
  log('info', `✅ 砸盘完成：${ok}成功 ${fail}失败`);
  toast(`砸盘完成：${ok}成功 ${fail}失败`, ok > 0 ? 'success' : 'error');
}

function stopDump() {
  dumpAbort = true; dumpRunning = false;
  document.getElementById('startDumpBtn').disabled = false;
  document.getElementById('stopDumpBtn').disabled = true;
  log('info', '⏹ 已停止砸盘');
  toast('已停止砸盘', 'info');
}

/* ===== 归集 BNB ===== */
async function collectBnb() {
  const target = document.getElementById('collectBnbTarget').value.trim();
  const reserve = parseFloat(document.getElementById('collectBnbReserve').value) || 0;
  const gasP = parseFloat(document.getElementById('collectGasPrice').value) || 0.05;
  const sel = getSelected();
  if (!ethers.utils.isAddress(target)) { toast('请输入有效目标地址', 'warning'); return; }
  if (!sel.length) { toast('请选择钱包', 'warning'); return; }
  pendingConfirm = () => _collectBnb(sel, target, reserve, gasP);
  showConfirmModal('确认 BNB 归集', `
    <div class="confirm-box">
      <div class="confirm-row"><span class="confirm-key">目标地址</span><span class="confirm-val" style="font-family:monospace;font-size:11px">${shortAddr(target)}</span></div>
      <div class="confirm-row"><span class="confirm-key">钱包数量</span><span class="confirm-val">${sel.length} 个</span></div>
      <div class="confirm-row"><span class="confirm-key">每个保留</span><span class="confirm-val">${reserve} BNB</span></div>
    </div>
  `);
}

async function _collectBnb(sel, target, reserve, gasP) {
  // 初始化日志和进度条
  const logWrap = document.getElementById('collectBnbLog');
  const progressWrap = document.getElementById('collectBnbProgress');
  const fill = document.getElementById('collectBnbFill');
  const progressText = document.getElementById('collectBnbText');
  const resultWrap = document.getElementById('collectBnbResult');
  const btn = document.getElementById('collectBnbBtn');

  function opLog(type, msg, hash) {
    if (!logWrap) return;
    const empty = logWrap.querySelector('.log-empty');
    if (empty) empty.remove();
    const now = new Date().toTimeString().slice(0, 8);
    const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️', skip: '⏭️' };
    const item = document.createElement('div');
    item.className = 'op-exec-row';
    item.innerHTML = `
      <span class="op-exec-dot ${type}"></span>
      <span class="op-exec-name">${escHtml(msg.split(']')[0].replace('[',''))}</span>
      <span class="op-exec-msg">${icons[type] || ''} ${escHtml(msg.replace(/^\[.*?\]\s*/, ''))}</span>
      ${hash ? `<a class="op-exec-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0,10)}...</a>` : ''}
    `;
    logWrap.appendChild(item);
    logWrap.scrollTop = logWrap.scrollHeight;
  }

  if (logWrap) logWrap.innerHTML = '<div class="log-empty">开始归集...</div>';
  if (progressWrap) progressWrap.classList.add('show');
  if (resultWrap) resultWrap.classList.remove('show');
  if (btn) btn.disabled = true;

  log('info', `开始归集BNB，${sel.length}个钱包 -> ${shortAddr(target)}`);
  const gasPrice = ethers.utils.parseUnits(gasP.toString(), 'gwei');
  const gasLimit = 21000;
  const gasCost = gasPrice.mul(gasLimit);
  let ok = 0, fail = 0, total = ethers.BigNumber.from(0);

  for (let i = 0; i < sel.length; i++) {
    const w = sel[i];
    const pct = Math.round(((i + 1) / sel.length) * 100);
    if (fill) fill.style.width = pct + '%';
    if (progressText) progressText.textContent = `${i + 1} / ${sel.length}`;
    try {
      const wallet = new ethers.Wallet(w.privateKey, provider);
      const balance = await provider.getBalance(w.address);
      const reserveWei = ethers.utils.parseEther(reserve.toString());
      const sendable = balance.sub(reserveWei).sub(gasCost);
      if (sendable.lte(0)) {
        opLog('skip', `[${w.name}] 余额不足，跳过`);
        log('info', `[${w.name}] 余额不足，跳过`);
        continue;
      }
      opLog('pending', `[${w.name}] 归集中...`);
      const tx = await wallet.sendTransaction({ to: target, value: sendable, gasPrice, gasLimit });
      await tx.wait();
      total = total.add(sendable);
      const amt = parseFloat(ethers.utils.formatEther(sendable)).toFixed(5);
      opLog('ok', `[${w.name}] 归集 ${amt} BNB`, tx.hash);
      log('success', `[${w.name}] 归集 ${amt} BNB`, tx.hash);
      ok++;
    } catch (e) {
      opLog('fail', `[${w.name}] 失败: ${e.message || e}`);
      log('error', `[${w.name}] 失败: ${e.message || e}`);
      fail++;
    }
    await sleep(300);
  }

  if (btn) btn.disabled = false;
  if (progressWrap) progressWrap.classList.remove('show');

  // 显示结果统计
  if (resultWrap) {
    resultWrap.classList.add('show');
    const totalBnb = parseFloat(ethers.utils.formatEther(total)).toFixed(5);
    document.getElementById('collectBnbOk').textContent = ok;
    document.getElementById('collectBnbFail').textContent = fail;
    document.getElementById('collectBnbTotal').textContent = totalBnb + ' BNB';
  }

  toast(`归集完成：${ok}成功 ${fail}失败，共 ${parseFloat(ethers.utils.formatEther(total)).toFixed(5)} BNB`, ok > 0 ? 'success' : 'error');
  log('info', `归集完成：共 ${parseFloat(ethers.utils.formatEther(total)).toFixed(5)} BNB`);
}

/* ===== 归集代币 ===== */
async function collectToken() {
  const tokenAddr = document.getElementById('collectTokenAddr').value.trim();
  const target = document.getElementById('collectTokenTarget').value.trim();
  const sel = getSelected();
  if (!ethers.utils.isAddress(tokenAddr)) { toast('请输入有效代币地址', 'warning'); return; }
  if (!ethers.utils.isAddress(target)) { toast('请输入有效目标地址', 'warning'); return; }
  if (!sel.length) { toast('请选择钱包', 'warning'); return; }

  const logWrap = document.getElementById('collectTokenLog');
  const progressWrap = document.getElementById('collectTokenProgress');
  const fill = document.getElementById('collectTokenFill');
  const progressText = document.getElementById('collectTokenText');
  const resultWrap = document.getElementById('collectTokenResult');
  const btn = document.getElementById('collectTokenBtn');

  function opLog(type, msg, hash) {
    if (!logWrap) return;
    const empty = logWrap.querySelector('.log-empty');
    if (empty) empty.remove();
    const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️', skip: '⏭️' };
    const item = document.createElement('div');
    item.className = 'op-exec-row';
    item.innerHTML = `
      <span class="op-exec-dot ${type}"></span>
      <span class="op-exec-name">${escHtml(msg.split(']')[0].replace('[',''))}</span>
      <span class="op-exec-msg">${icons[type] || ''} ${escHtml(msg.replace(/^\[.*?\]\s*/, ''))}</span>
      ${hash ? `<a class="op-exec-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0,10)}...</a>` : ''}
    `;
    logWrap.appendChild(item);
    logWrap.scrollTop = logWrap.scrollHeight;
  }

  if (logWrap) logWrap.innerHTML = '<div class="log-empty">开始归集...</div>';
  if (progressWrap) progressWrap.classList.add('show');
  if (resultWrap) resultWrap.classList.remove('show');
  if (btn) btn.disabled = true;

  log('info', `开始归集代币，${sel.length}个钱包 -> ${shortAddr(target)}`);
  const gasPrice = ethers.utils.parseUnits('0.05', 'gwei');
  let ok = 0, fail = 0;

  for (let i = 0; i < sel.length; i++) {
    const w = sel[i];
    const pct = Math.round(((i + 1) / sel.length) * 100);
    if (fill) fill.style.width = pct + '%';
    if (progressText) progressText.textContent = `${i + 1} / ${sel.length}`;
    try {
      const wallet = new ethers.Wallet(w.privateKey, provider);
      const tc = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
      const dec = await tc.decimals().catch(() => 18);
      const balance = await tc.balanceOf(w.address);
      if (balance.isZero()) {
        opLog('skip', `[${w.name}] 代币余额为0，跳过`);
        log('info', `[${w.name}] 代币余额为0，跳过`);
        continue;
      }
      opLog('pending', `[${w.name}] 归集中...`);
      const tx = await tc.transfer(target, balance, { gasPrice, gasLimit: 100000 });
      await tx.wait();
      const amt = parseFloat(ethers.utils.formatUnits(balance, dec)).toFixed(4);
      opLog('ok', `[${w.name}] 归集 ${amt} 代币`, tx.hash);
      log('success', `[${w.name}] 归集 ${amt} 代币`, tx.hash);
      ok++;
    } catch (e) {
      opLog('fail', `[${w.name}] 失败: ${e.message || e}`);
      log('error', `[${w.name}] 失败: ${e.message || e}`);
      fail++;
    }
    await sleep(300);
  }

  if (btn) btn.disabled = false;
  if (progressWrap) progressWrap.classList.remove('show');
  if (resultWrap) {
    resultWrap.classList.add('show');
    document.getElementById('collectTokenOk').textContent = ok;
    document.getElementById('collectTokenFail').textContent = fail;
  }
  toast(`代币归集完成：${ok}成功 ${fail}失败`, ok > 0 ? 'success' : 'error');
}

/* ===== 分发 BNB ===== */
async function distributeBnb() {
  const fromPk = document.getElementById('distFromPk').value.trim();
  const distMin = parseFloat(document.getElementById('distBnbMin').value) || 0.005;
  const distMax = parseFloat(document.getElementById('distBnbMax').value) || 0.01;
  const sel = getSelected();
  if (!fromPk) { toast('请输入来源钱包私钥', 'warning'); return; }
  if (!sel.length) { toast('请选择目标钱包', 'warning'); return; }
  let fromWallet;
  try { fromWallet = new ethers.Wallet(fromPk.startsWith('0x') ? fromPk : '0x' + fromPk, provider); }
  catch (e) { toast('私钥格式错误', 'error'); return; }
  const totalEst = sel.length * distMax;
  pendingConfirm = () => _distributeBnb(fromWallet, sel, distMin, distMax);
  showConfirmModal('确认 BNB 分发', `
    <div class="confirm-box">
      <div class="confirm-row"><span class="confirm-key">来源地址</span><span class="confirm-val" style="font-family:monospace;font-size:11px">${shortAddr(fromWallet.address)}</span></div>
      <div class="confirm-row"><span class="confirm-key">目标钱包</span><span class="confirm-val">${sel.length} 个</span></div>
      <div class="confirm-row"><span class="confirm-key">每个金额</span><span class="confirm-val green">${distMin} ~ ${distMax} BNB</span></div>
      <div class="confirm-row"><span class="confirm-key">预计总量</span><span class="confirm-val red">最多 ${totalEst.toFixed(4)} BNB</span></div>
    </div>
  `);
}

async function _distributeBnb(fromWallet, sel, distMin, distMax) {
  const logWrap = document.getElementById('distBnbLog');
  const progressWrap = document.getElementById('distBnbProgress');
  const fill = document.getElementById('distBnbFill');
  const progressText = document.getElementById('distBnbText');
  const resultWrap = document.getElementById('distBnbResult');
  const btn = document.getElementById('distBnbBtn');

  function opLog(type, msg, hash) {
    if (!logWrap) return;
    const empty = logWrap.querySelector('.log-empty');
    if (empty) empty.remove();
    const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️' };
    const item = document.createElement('div');
    item.className = 'op-exec-row';
    item.innerHTML = `
      <span class="op-exec-dot ${type}"></span>
      <span class="op-exec-name">${escHtml(msg.split(']')[0].replace('[',''))}</span>
      <span class="op-exec-msg">${icons[type] || ''} ${escHtml(msg.replace(/^\[.*?\]\s*/, ''))}</span>
      ${hash ? `<a class="op-exec-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0,10)}...</a>` : ''}
    `;
    logWrap.appendChild(item);
    logWrap.scrollTop = logWrap.scrollHeight;
  }

  if (logWrap) logWrap.innerHTML = '<div class="log-empty">开始分发...</div>';
  if (progressWrap) progressWrap.classList.add('show');
  if (resultWrap) resultWrap.classList.remove('show');
  if (btn) btn.disabled = true;

  log('info', `开始分发BNB，来源: ${shortAddr(fromWallet.address)}，${sel.length}个目标`);
  const gasPrice = ethers.utils.parseUnits('0.05', 'gwei');
  let ok = 0, fail = 0;

  for (let i = 0; i < sel.length; i++) {
    const w = sel[i];
    const pct = Math.round(((i + 1) / sel.length) * 100);
    if (fill) fill.style.width = pct + '%';
    if (progressText) progressText.textContent = `${i + 1} / ${sel.length}`;
    try {
      const amt = randBetween(distMin, distMax);
      const amtWei = ethers.utils.parseEther(amt.toFixed(18));
      opLog('pending', `[${w.name}] 分发中...`);
      const tx = await fromWallet.sendTransaction({ to: w.address, value: amtWei, gasPrice, gasLimit: 21000 });
      await tx.wait();
      opLog('ok', `[${w.name}] 收到 ${amt.toFixed(5)} BNB`, tx.hash);
      log('success', `[${w.name}] 收到 ${amt.toFixed(5)} BNB`, tx.hash);
      ok++;
    } catch (e) {
      opLog('fail', `[${w.name}] 失败: ${e.message || e}`);
      log('error', `[${w.name}] 失败: ${e.message || e}`);
      fail++;
    }
    await sleep(300);
  }

  if (btn) btn.disabled = false;
  if (progressWrap) progressWrap.classList.remove('show');
  if (resultWrap) {
    resultWrap.classList.add('show');
    document.getElementById('distBnbOk').textContent = ok;
    document.getElementById('distBnbFail').textContent = fail;
  }
  toast(`BNB分发完成：${ok}成功 ${fail}失败`, ok > 0 ? 'success' : 'error');
}

/* ===== 分发代币 ===== */
async function distributeToken() {
  const fromPk = document.getElementById('distTokenFromPk').value.trim();
  const tokenAddr = document.getElementById('distTokenAddr').value.trim();
  const distMin = parseFloat(document.getElementById('distTokenMin').value) || 100;
  const distMax = parseFloat(document.getElementById('distTokenMax').value) || 500;
  const sel = getSelected();
  if (!fromPk) { toast('请输入来源钱包私钥', 'warning'); return; }
  if (!ethers.utils.isAddress(tokenAddr)) { toast('请输入有效代币地址', 'warning'); return; }
  if (!sel.length) { toast('请选择目标钱包', 'warning'); return; }
  let fromWallet;
  try { fromWallet = new ethers.Wallet(fromPk.startsWith('0x') ? fromPk : '0x' + fromPk, provider); }
  catch (e) { toast('私钥格式错误', 'error'); return; }

  const logWrap = document.getElementById('distTokenLog');
  const progressWrap = document.getElementById('distTokenProgress');
  const fill = document.getElementById('distTokenFill');
  const progressText = document.getElementById('distTokenText');
  const resultWrap = document.getElementById('distTokenResult');
  const btn = document.getElementById('distTokenBtn');

  function opLog(type, msg, hash) {
    if (!logWrap) return;
    const empty = logWrap.querySelector('.log-empty');
    if (empty) empty.remove();
    const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️' };
    const item = document.createElement('div');
    item.className = 'op-exec-row';
    item.innerHTML = `
      <span class="op-exec-dot ${type}"></span>
      <span class="op-exec-name">${escHtml(msg.split(']')[0].replace('[',''))}</span>
      <span class="op-exec-msg">${icons[type] || ''} ${escHtml(msg.replace(/^\[.*?\]\s*/, ''))}</span>
      ${hash ? `<a class="op-exec-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0,10)}...</a>` : ''}
    `;
    logWrap.appendChild(item);
    logWrap.scrollTop = logWrap.scrollHeight;
  }

  if (logWrap) logWrap.innerHTML = '<div class="log-empty">开始分发...</div>';
  if (progressWrap) progressWrap.classList.add('show');
  if (resultWrap) resultWrap.classList.remove('show');
  if (btn) btn.disabled = true;

  log('info', `开始分发代币，来源: ${shortAddr(fromWallet.address)}，${sel.length}个目标`);
  const gasPrice = ethers.utils.parseUnits('0.05', 'gwei');
  const tc = new ethers.Contract(tokenAddr, ERC20_ABI, fromWallet);
  const dec = await tc.decimals().catch(() => 18);
  let ok = 0, fail = 0;

  for (let i = 0; i < sel.length; i++) {
    const w = sel[i];
    const pct = Math.round(((i + 1) / sel.length) * 100);
    if (fill) fill.style.width = pct + '%';
    if (progressText) progressText.textContent = `${i + 1} / ${sel.length}`;
    try {
      const amt = randBetween(distMin, distMax);
      const amtWei = ethers.utils.parseUnits(amt.toFixed(dec > 6 ? 6 : dec), dec);
      opLog('pending', `[${w.name}] 分发中...`);
      const tx = await tc.transfer(w.address, amtWei, { gasPrice, gasLimit: 100000 });
      await tx.wait();
      opLog('ok', `[${w.name}] 收到 ${amt.toFixed(2)} 代币`, tx.hash);
      log('success', `[${w.name}] 收到 ${amt.toFixed(2)} 代币`, tx.hash);
      ok++;
    } catch (e) {
      opLog('fail', `[${w.name}] 失败: ${e.message || e}`);
      log('error', `[${w.name}] 失败: ${e.message || e}`);
      fail++;
    }
    await sleep(300);
  }

  if (btn) btn.disabled = false;
  if (progressWrap) progressWrap.classList.remove('show');
  if (resultWrap) {
    resultWrap.classList.add('show');
    document.getElementById('distTokenOk').textContent = ok;
    document.getElementById('distTokenFail').textContent = fail;
  }
  toast(`代币分发完成：${ok}成功 ${fail}失败`, ok > 0 ? 'success' : 'error');
}

/* ===== 设置 ===== */
function onRpcChange() {
  const val = document.getElementById('rpcSelect').value;
  const customInput = document.getElementById('customRpc');
  if (val === 'custom') {
    customInput.style.display = '';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    initProvider(val);
  }
}

function applyCustomRpc() {
  const url = document.getElementById('customRpc').value.trim();
  if (url) initProvider(url);
}

function setDefaultGas(v) {
  document.getElementById('defaultGasPrice').value = v;
  syncGasPrice();
}

function syncGasPrice() {
  const v = document.getElementById('defaultGasPrice').value;
  const gp = document.getElementById('gasPrice');
  if (gp) gp.value = v;
}

function toggleShowPk() { renderWalletTable(); }

function saveSettings() {
  const settings = {
    rpc: document.getElementById('rpcSelect').value,
    gasPrice: document.getElementById('defaultGasPrice').value,
    gasMulti: document.getElementById('gasMulti').value,
    flap: document.getElementById('cfgFlap').value,
    router: document.getElementById('cfgRouter').value,
    factory: document.getElementById('cfgFactory').value,
    wbnb: document.getElementById('cfgWbnb').value,
  };
  localStorage.setItem('mcap_settings', JSON.stringify(settings));
  toast('设置已保存', 'success');
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('mcap_settings') || '{}');
    if (s.rpc) {
      document.getElementById('rpcSelect').value = s.rpc;
    } else {
      // 默认使用国内友好的 DeFiBit2 节点
      document.getElementById('rpcSelect').value = 'https://bsc-dataseed2.defibit.io/';
    }
    if (s.gasPrice) document.getElementById('defaultGasPrice').value = s.gasPrice;
    if (s.gasMulti) document.getElementById('gasMulti').value = s.gasMulti;
    if (s.flap) document.getElementById('cfgFlap').value = s.flap;
    if (s.router) document.getElementById('cfgRouter').value = s.router;
    if (s.factory) document.getElementById('cfgFactory').value = s.factory;
    if (s.wbnb) document.getElementById('cfgWbnb').value = s.wbnb;
  } catch (e) {}
}

/* ===== 日志 ===== */
function log(type, msg, hash) {
  const wrap = document.getElementById('logWrap');
  const empty = wrap.querySelector('.log-empty');
  if (empty) empty.remove();
  const now = new Date().toTimeString().slice(0, 8);
  const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️' };
  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <span class="log-time">${now}</span>
    <span class="log-msg ${type}">
      ${icons[type] || ''} ${escHtml(msg)}
      ${hash ? `<a class="log-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0, 16)}...</a>` : ''}
    </span>
  `;
  wrap.appendChild(item);
  wrap.scrollTop = wrap.scrollHeight;
}

function clearLog() {
  document.getElementById('logWrap').innerHTML = '<div class="log-empty">暂无日志</div>';
}

function exportLog() {
  const items = document.querySelectorAll('.log-item');
  const lines = Array.from(items).map(el => el.textContent.trim().replace(/\s+/g, ' '));
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `log_${Date.now()}.txt`;
  a.click();
}

/* ===== 模态框 ===== */
function showConfirmModal(title, body, okCb, showOk = true) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').innerHTML = body;
  document.getElementById('confirmOkBtn').style.display = showOk ? '' : 'none';
  if (okCb) pendingConfirm = okCb;
  document.getElementById('confirmModal').classList.add('open');
}

function closeModal(id) {
  // 只关闭弹窗，不清空 pendingConfirm（由 cancelModal 或 doConfirm 负责清空）
  document.getElementById(id).classList.remove('open');
}

function cancelModal(id) {
  // 用户主动取消：关闭弹窗并清空回调
  document.getElementById(id).classList.remove('open');
  pendingConfirm = null;
}

function doConfirm() {
  // 先保存回调，再关闭弹窗，再执行回调
  const fn = pendingConfirm;
  pendingConfirm = null;
  closeModal('confirmModal');
  if (fn) fn();
}

/* ===== Toast ===== */
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${escHtml(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ===== 加载遮罩 ===== */
function showLoading(text = '处理中...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

/* ===== 工具函数 ===== */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randBetween(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(randBetween(min, max)); }
function shortAddr(addr) { return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '--'; }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function fmtPrice(p) {
  if (p === 0) return '0';
  if (p < 0.000001) return p.toExponential(3);
  if (p < 0.001) return p.toFixed(7);
  if (p < 1) return p.toFixed(5);
  return p.toFixed(4);
}

function fmtUSD(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}

function copyText(text, msg = '已复制') {
  navigator.clipboard.writeText(text).then(() => toast(msg, 'success')).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    toast(msg, 'success');
  });
}


/* ============================================================
   手动买卖模块
   - manualTokenInfo: 独立的代币信息（与自动交易共享路由逻辑）
   - manualBuy / manualSell: 支持并行/串行、固定/随机金额
   - 卖出支持：按比例（含滑块+浮动）/ 按数量（固定/随机）
   ============================================================ */

let manualTokenInfo = null;
let manualTokenDebounce = null;

/* ===== 代币输入监听 ===== */
function onManualTokenInput(val) {
  clearTimeout(manualTokenDebounce);
  const addr = val.trim();
  if (!ethers.utils.isAddress(addr)) {
    manualTokenInfo = null;
    setManualRouteTag('unknown');
    updateManualSelTips();
    return;
  }
  manualTokenDebounce = setTimeout(() => loadManualTokenInfo(addr), 700);
}

async function loadManualTokenInfo(addr) {
  if (!provider) { toast('请先连接 RPC', 'error'); return; }
  showLoading('加载代币信息...');
  try {
    const ca = ethers.utils.getAddress(addr);
    const tc = new ethers.Contract(ca, ERC20_ABI, provider);
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      tc.name().catch(() => 'Unknown'),
      tc.symbol().catch(() => '???'),
      tc.decimals().catch(() => 18),
      tc.totalSupply().catch(() => ethers.BigNumber.from(0))
    ]);
    const route = await detectRoute(ca);
    const ts = parseFloat(ethers.utils.formatUnits(totalSupply, decimals));
    const { price, mcap, liq } = await getTokenMarketData(ca, decimals, route, ts);
    manualTokenInfo = { address: ca, name, symbol, decimals, totalSupply: ts, route, price, mcap, liq };
    setManualRouteTag(route);
    updateManualSelTips();
    toast(`已加载 ${symbol}，路由: ${routeLabel(route)}`, 'success');
    mlog('info', `代币 ${symbol} 已加载，路由: ${routeLabel(route)}`);
  } catch (e) {
    toast('加载代币失败: ' + (e.message || e), 'error');
  } finally {
    hideLoading();
  }
}

function setManualRouteTag(route) {
  const wrap = document.getElementById('manualRouteTag');
  if (!wrap) return;
  if (route === 'flap') wrap.innerHTML = '<span class="route-tag route-flap">⚡ FLAP 内盘</span>';
  else if (route === 'flap-dex') wrap.innerHTML = '<span class="route-tag route-flap">⚡ FLAP 已毕业</span>';
  else if (route === 'pancake') wrap.innerHTML = '<span class="route-tag route-pancake">🥞 PancakeSwap V2</span>';
  else wrap.innerHTML = '';
}

/* ===== 已选钱包数量提示 ===== */
function updateManualSelTips() {
  const n = getSelected().length;
  const buyTip = document.getElementById('buySelTip');
  const sellTip = document.getElementById('sellSelTip');
  if (buyTip) buyTip.textContent = `已选 ${n} 个钱包`;
  if (sellTip) sellTip.textContent = `已选 ${n} 个钱包`;
}

/* updateManualSelTips 在 updateSelCount 内已被直接调用（见上方函数定义） */

/* ===== 买入模式切换 ===== */
function onBuyModeChange() {
  const mode = document.querySelector('input[name="buyAmtMode"]:checked')?.value;
  document.getElementById('buyFixedField').style.display = mode === 'fixed' ? '' : 'none';
  document.getElementById('buyRangeField').style.display = mode === 'random' ? '' : 'none';
}

function setManualBuyAmt(v) {
  document.getElementById('manualBuyAmt').value = v;
  // 切换到固定模式
  document.querySelector('input[name="buyAmtMode"][value="fixed"]').checked = true;
  onBuyModeChange();
}

/* ===== 卖出模式切换 ===== */
function switchSellTab(tab) {
  document.getElementById('sellTabPct').classList.toggle('active', tab === 'pct');
  document.getElementById('sellTabAmt').classList.toggle('active', tab === 'amt');
  document.getElementById('sellPanelPct').style.display = tab === 'pct' ? '' : 'none';
  document.getElementById('sellPanelAmt').style.display = tab === 'amt' ? '' : 'none';
}

function setSellPct(v) {
  document.getElementById('manualSellPct').value = v;
  document.getElementById('manualSellPctSlider').value = v;
  // 更新滑块渐变
  const slider = document.getElementById('manualSellPctSlider');
  slider.style.setProperty('--pct', v + '%');
}

/* 滑块实时更新渐变（合并到主 DOMContentLoaded 中，避免重复监听） */
function initManualPanel() {
  const slider = document.getElementById('manualSellPctSlider');
  if (slider) {
    slider.addEventListener('input', function () {
      this.style.setProperty('--pct', this.value + '%');
    });
    slider.style.setProperty('--pct', slider.value + '%');
  }
  // 卖出数量模式的固定/随机切换
  document.querySelectorAll('input[name="sellAmtMode"]').forEach(r => {
    r.addEventListener('change', () => {
      const m = document.querySelector('input[name="sellAmtMode"]:checked')?.value;
      document.getElementById('sellAmtFixedField').style.display = m === 'fixed' ? '' : 'none';
      document.getElementById('sellAmtRangeField').style.display = m === 'random' ? '' : 'none';
    });
  });
  updateManualSelTips();
}

/* ===== 手动买入 ===== */
async function manualBuy() {
  if (!manualTokenInfo) { toast('请先输入代币地址', 'warning'); return; }
  const sel = getSelected();
  if (!sel.length) { toast('请先勾选钱包', 'warning'); return; }

  const buyMode = document.querySelector('input[name="buyAmtMode"]:checked')?.value || 'fixed';
  const fixedAmt = parseFloat(document.getElementById('manualBuyAmt').value) || 0.01;
  const rangeMin = parseFloat(document.getElementById('manualBuyMin').value) || 0.005;
  const rangeMax = parseFloat(document.getElementById('manualBuyMax').value) || 0.015;
  const slippage = parseFloat(document.getElementById('manualSlippage').value) || 5;
  const execMode = document.getElementById('manualExecMode').value;
  const gasPrice = ethers.utils.parseUnits(document.getElementById('manualGasPrice').value || '0.05', 'gwei');
  const gasMulti = parseFloat(document.getElementById('gasMulti').value) || 1.2;

  // 确认弹窗
  const amtDesc = buyMode === 'fixed'
    ? `${fixedAmt} BNB / 每个钱包`
    : `${rangeMin} ~ ${rangeMax} BNB 随机 / 每个钱包`;

  pendingConfirm = () => _runManualBuy(sel, buyMode, fixedAmt, rangeMin, rangeMax, slippage, execMode, gasPrice, gasMulti);
  showConfirmModal('确认手动买入', `
    <div class="confirm-box">
      <div class="confirm-row"><span class="confirm-key">代币</span><span class="confirm-val">${manualTokenInfo.symbol}</span></div>
      <div class="confirm-row"><span class="confirm-key">路由</span><span class="confirm-val purple">${routeLabel(manualTokenInfo.route)}</span></div>
      <div class="confirm-row"><span class="confirm-key">钱包数</span><span class="confirm-val">${sel.length} 个</span></div>
      <div class="confirm-row"><span class="confirm-key">买入金额</span><span class="confirm-val green">${amtDesc}</span></div>
      <div class="confirm-row"><span class="confirm-key">执行方式</span><span class="confirm-val blue">${execMode === 'parallel' ? '同步并行' : '逐个顺序'}</span></div>
      <div class="confirm-row"><span class="confirm-key">滑点</span><span class="confirm-val">${slippage}%</span></div>
    </div>
    <div class="warn-notice">⚠️ 链上操作不可撤销，请确认参数无误！</div>
  `);
}

async function _runManualBuy(sel, buyMode, fixedAmt, rangeMin, rangeMax, slippage, execMode, gasPrice, gasMulti) {
  const btn = document.getElementById('manualBuyBtn');
  btn.disabled = true;
  document.getElementById('manualBuyProgress').classList.add('show');
  mlog('info', `🚀 手动买入开始，${sel.length} 个钱包，${execMode === 'parallel' ? '并行' : '串行'}模式`);

  // 清空执行状态区域
  const logWrap = document.getElementById('manualLogWrap');

  let ok = 0, fail = 0;

  const execOne = async (w, index) => {
    const amt = buyMode === 'fixed' ? fixedAmt : randBetween(rangeMin, rangeMax);
    mlog('pending', `[${w.name}] 买入 ${amt.toFixed(5)} BNB...`);
    try {
      const wallet = new ethers.Wallet(w.privateKey, provider);
      const amtWei = ethers.utils.parseEther(amt.toFixed(18));
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // 通过统一路由合约买入
      const unifiedRouter = new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, wallet);
      let minOut = ethers.BigNumber.from(0);
      try {
        if (manualTokenInfo.route === 'flap' || manualTokenInfo.route === 'flap-dex') {
          const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
          const q = await portal.quoteExactInput({
            inputToken: ethers.constants.AddressZero,
            outputToken: manualTokenInfo.address,
            inputAmount: amtWei
          });
          minOut = q.mul(Math.floor((100 - slippage) * 100)).div(10000);
        } else {
          const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
          const amounts = await router.getAmountsOut(amtWei, [getAddr('WBNB'), manualTokenInfo.address]);
          minOut = amounts[1].mul(Math.floor((100 - slippage) * 100)).div(10000);
        }
      } catch (e) {}

      const gasEst = await unifiedRouter.estimateGas.buyWithAutomaticRoute(
        manualTokenInfo.address, minOut, wallet.address, deadline, { value: amtWei }
      ).catch(() => ethers.BigNumber.from(500000));
      const tx = await unifiedRouter.buyWithAutomaticRoute(
        manualTokenInfo.address, minOut, wallet.address, deadline,
        { value: amtWei, gasPrice, gasLimit: Math.floor(gasEst.toNumber() * gasMulti) }
      );
      const receipt = await tx.wait();
      mlog('success', `[${w.name}] 买入成功 ${amt.toFixed(5)} BNB`, receipt.transactionHash);
      ok++;
    } catch (e) {
      mlog('error', `[${w.name}] 买入失败: ${e.reason || e.message || e}`);
      fail++;
    }
    // 更新进度
    const done = ok + fail;
    document.getElementById('manualBuyFill').style.width = Math.round(done / sel.length * 100) + '%';
    document.getElementById('manualBuyText').textContent = `${done} / ${sel.length}`;
  };

  if (execMode === 'parallel') {
    // 并行：所有钱包同时发起
    await Promise.allSettled(sel.map((w, i) => execOne(w, i)));
  } else {
    // 串行：逐个执行
    for (let i = 0; i < sel.length; i++) {
      await execOne(sel[i], i);
    }
  }

  btn.disabled = false;
  mlog('info', `✅ 手动买入完成：${ok} 成功，${fail} 失败`);
  toast(`买入完成：${ok} 成功 ${fail} 失败`, ok > 0 ? 'success' : 'error');
  // 刷新余额
  queryBalances().catch(() => {});
}

/* ===== 手动卖出 ===== */
async function manualSell() {
  if (!manualTokenInfo) { toast('请先输入代币地址', 'warning'); return; }
  const sel = getSelected();
  if (!sel.length) { toast('请先勾选钱包', 'warning'); return; }

  const sellTab = document.getElementById('sellTabPct').classList.contains('active') ? 'pct' : 'amt';
  const slippage = parseFloat(document.getElementById('manualSlippage').value) || 5;
  const execMode = document.getElementById('manualExecMode').value;
  const gasPrice = ethers.utils.parseUnits(document.getElementById('manualGasPrice').value || '0.05', 'gwei');
  const gasMulti = parseFloat(document.getElementById('gasMulti').value) || 1.2;

  let sellDesc = '';
  let sellParams = {};

  if (sellTab === 'pct') {
    const pct = parseFloat(document.getElementById('manualSellPct').value) || 100;
    const floatPct = parseFloat(document.getElementById('manualSellPctFloat').value) || 0;
    sellDesc = floatPct > 0 ? `${pct}% ± ${floatPct}% 随机` : `${pct}%`;
    sellParams = { mode: 'pct', pct, floatPct };
  } else {
    const amtMode = document.querySelector('input[name="sellAmtMode"]:checked')?.value || 'fixed';
    const fixedAmt = parseFloat(document.getElementById('manualSellAmt').value) || 0;
    const amtMin = parseFloat(document.getElementById('manualSellAmtMin').value) || 0;
    const amtMax = parseFloat(document.getElementById('manualSellAmtMax').value) || 0;
    sellDesc = amtMode === 'fixed' ? `${fixedAmt} ${manualTokenInfo.symbol}` : `${amtMin}~${amtMax} ${manualTokenInfo.symbol} 随机`;
    sellParams = { mode: 'amt', amtMode, fixedAmt, amtMin, amtMax };
  }

  pendingConfirm = () => _runManualSell(sel, sellTab, sellParams, slippage, execMode, gasPrice, gasMulti);
  showConfirmModal('确认手动卖出', `
    <div class="confirm-box">
      <div class="confirm-row"><span class="confirm-key">代币</span><span class="confirm-val">${manualTokenInfo.symbol}</span></div>
      <div class="confirm-row"><span class="confirm-key">路由</span><span class="confirm-val purple">${routeLabel(manualTokenInfo.route)}</span></div>
      <div class="confirm-row"><span class="confirm-key">钱包数</span><span class="confirm-val">${sel.length} 个</span></div>
      <div class="confirm-row"><span class="confirm-key">卖出方式</span><span class="confirm-val">${sellTab === 'pct' ? '按比例' : '按数量'}</span></div>
      <div class="confirm-row"><span class="confirm-key">卖出量</span><span class="confirm-val red">${sellDesc}</span></div>
      <div class="confirm-row"><span class="confirm-key">执行方式</span><span class="confirm-val blue">${execMode === 'parallel' ? '同步并行' : '逐个顺序'}</span></div>
    </div>
    <div class="warn-notice">⚠️ 卖出操作不可撤销，请确认参数！</div>
  `);
}

async function _runManualSell(sel, sellTab, sellParams, slippage, execMode, gasPrice, gasMulti) {
  const btn = document.getElementById('manualSellBtn');
  btn.disabled = true;
  document.getElementById('manualSellProgress').classList.add('show');
  mlog('info', `📉 手动卖出开始，${sel.length} 个钱包，${execMode === 'parallel' ? '并行' : '串行'}模式`);

  let ok = 0, fail = 0;

  const execOne = async (w) => {
    try {
      const wallet = new ethers.Wallet(w.privateKey, provider);
      const tc = new ethers.Contract(manualTokenInfo.address, ERC20_ABI, wallet);
      const balance = await tc.balanceOf(wallet.address);
      if (balance.isZero()) {
        mlog('info', `[${w.name}] 余额为 0，跳过`);
        return;
      }

      // 计算实际卖出量
      let sellAmt;
      if (sellTab === 'pct') {
        let pct = sellParams.pct;
        if (sellParams.floatPct > 0) {
          const delta = randBetween(-sellParams.floatPct, sellParams.floatPct);
          pct = Math.min(100, Math.max(1, pct + delta));
        }
        sellAmt = balance.mul(Math.floor(pct * 100)).div(10000);
        mlog('pending', `[${w.name}] 卖出 ${pct.toFixed(1)}%...`);
      } else {
        let rawAmt;
        if (sellParams.amtMode === 'fixed') {
          rawAmt = sellParams.fixedAmt;
        } else {
          rawAmt = randBetween(sellParams.amtMin, sellParams.amtMax);
        }
        const amtWei = ethers.utils.parseUnits(
          rawAmt.toFixed(manualTokenInfo.decimals > 6 ? 6 : manualTokenInfo.decimals),
          manualTokenInfo.decimals
        );
        // 若余额不足则全卖
        sellAmt = amtWei.gt(balance) ? balance : amtWei;
        const actualAmt = parseFloat(ethers.utils.formatUnits(sellAmt, manualTokenInfo.decimals));
        mlog('pending', `[${w.name}] 卖出 ${actualAmt.toFixed(4)} ${manualTokenInfo.symbol}...`);
      }

      if (sellAmt.isZero()) {
        mlog('info', `[${w.name}] 计算卖出量为 0，跳过`);
        return;
      }

      // 通过统一路由合约卖出
      const unifiedRouter = new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, wallet);
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // 确保已授权给统一路由合约
      const allowance = await tc.allowance(wallet.address, ADDR.UNIFIED_ROUTER);
      if (allowance.lt(sellAmt)) {
        const appTx = await tc.approve(ADDR.UNIFIED_ROUTER, ethers.constants.MaxUint256, { gasPrice, gasLimit: 100000 });
        await appTx.wait();
      }

      let minBnbOut = ethers.BigNumber.from(0);
      try {
        if (manualTokenInfo.route === 'flap' || manualTokenInfo.route === 'flap-dex') {
          const portal = new ethers.Contract(getAddr('FLAP'), FLAP_ABI, provider);
          const q = await portal.quoteExactInput({
            inputToken: manualTokenInfo.address,
            outputToken: ethers.constants.AddressZero,
            inputAmount: sellAmt
          });
          minBnbOut = q.mul(Math.floor((100 - slippage) * 100)).div(10000);
        } else {
          const router = new ethers.Contract(getAddr('ROUTER'), ROUTER_ABI, provider);
          const amounts = await router.getAmountsOut(sellAmt, [manualTokenInfo.address, getAddr('WBNB')]);
          minBnbOut = amounts[1].mul(Math.floor((100 - slippage) * 100)).div(10000);
        }
      } catch (e) {}

      const gasEst = await unifiedRouter.estimateGas.sellWithAutomaticRoute(
        manualTokenInfo.address, sellAmt, minBnbOut, wallet.address, deadline
      ).catch(() => ethers.BigNumber.from(500000));
      const tx = await unifiedRouter.sellWithAutomaticRoute(
        manualTokenInfo.address, sellAmt, minBnbOut, wallet.address, deadline,
        { gasPrice, gasLimit: Math.floor(gasEst.toNumber() * gasMulti) }
      );
      const receipt = await tx.wait();
      mlog('success', `[${w.name}] 卖出成功`, receipt.transactionHash);
      ok++;
    } catch (e) {
      mlog('error', `[${w.name}] 卖出失败: ${e.reason || e.message || e}`);
      fail++;
    }
    const done = ok + fail;
    document.getElementById('manualSellFill').style.width = Math.round(done / sel.length * 100) + '%';
    document.getElementById('manualSellText').textContent = `${done} / ${sel.length}`;
  };

  if (execMode === 'parallel') {
    await Promise.allSettled(sel.map(w => execOne(w)));
  } else {
    for (const w of sel) {
      await execOne(w);
    }
  }

  btn.disabled = false;
  mlog('info', `✅ 手动卖出完成：${ok} 成功，${fail} 失败`);
  toast(`卖出完成：${ok} 成功 ${fail} 失败`, ok > 0 ? 'success' : 'error');
  queryBalances().catch(() => {});
}

/* ===== 手动面板专用日志（写入 manualLogWrap） ===== */
function mlog(type, msg, hash) {
  const wrap = document.getElementById('manualLogWrap');
  if (!wrap) { log(type, msg, hash); return; }
  const empty = wrap.querySelector('.log-empty');
  if (empty) empty.remove();
  const now = new Date().toTimeString().slice(0, 8);
  const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️' };
  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <span class="log-time">${now}</span>
    <span class="log-msg ${type}">
      ${icons[type] || ''} ${escHtml(msg)}
      ${hash ? `<a class="log-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0, 16)}...</a>` : ''}
    </span>
  `;
  wrap.appendChild(item);
  wrap.scrollTop = wrap.scrollHeight;
  // 同时写入主日志
  log(type, msg, hash);
}

function clearManualLog() {
  const wrap = document.getElementById('manualLogWrap');
  if (wrap) wrap.innerHTML = '<div class="log-empty">暂无日志</div>';
}


/* ============================================================
   手机端专属功能
   ============================================================ */

/* ===== 底部导航切换 ===== */
function switchBottomTab(btn, tabId) {
  // 同步底部导航按钮状态
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // 同步面板显示
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + tabId);
  if (panel) panel.classList.add('active');
  // 切换到手动买卖时，自动同步代币地址
  if (tabId === 'manual') {
    const tradeTokenOut = document.getElementById('tokenOut').value.trim();
    const manualTokenInput = document.getElementById('manualToken');
    if (tradeTokenOut && ethers.utils.isAddress(tradeTokenOut) && !manualTokenInput.value.trim()) {
      manualTokenInput.value = tradeTokenOut;
      onManualTokenInput(tradeTokenOut);
    }
    if (!manualTokenInfo && tokenOutInfo) {
      manualTokenInfo = { ...tokenOutInfo };
      setManualRouteTag(manualTokenInfo.route);
      updateManualSelTips();
      if (tradeTokenOut) manualTokenInput.value = tradeTokenOut;
    }
  }
  // 切换到捆绑开盘时刷新状态
  if (tabId === 'snipe') {
    updateSnipeMonitor();
  }
  // 切换到钱包面板时刷新卡片
  if (tabId === 'wallets') {
    renderWalletCards(document.getElementById('showPkCheck2')?.checked);
  }
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===== 手机端钱包卡片渲染 ===== */
function renderWalletCards(showPk) {
  const list = document.getElementById('walletCardList');
  if (!list) return;
  if (!wallets.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--c-text3);padding:24px;font-size:13px">暂无钱包，请前往设置导入或生成</div>';
    return;
  }
  const tokenSymbol = tokenOutInfo ? tokenOutInfo.symbol : 'Token';
  list.innerHTML = wallets.map((w, i) => `
    <div class="wallet-card ${w.selected ? 'selected' : ''}" id="wcard-${w.id}">
      <div class="wallet-card-top">
        <input type="checkbox" class="wallet-card-check"
          ${w.selected ? 'checked' : ''}
          onchange="wallets[${i}].selected=this.checked;updateSelCount();document.getElementById('wcard-${w.id}').classList.toggle('selected',this.checked)">
        <div class="wallet-card-name">
          <span class="wallet-dot" style="background:${COLORS[w.colorIdx || 0]}"></span>
          ${escHtml(w.name)}
        </div>
        <div class="wallet-card-actions">
          <button class="btn btn-ghost btn-xs" onclick="showWalletDetail(${w.id})">详情</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--c-danger);border-color:var(--c-danger-border)" onclick="removeWallet(${w.id})">删除</button>
        </div>
      </div>
      <div class="wallet-card-addr" onclick="copyText('${w.address}','地址已复制')" title="点击复制">
        ${w.address}
      </div>
      <div class="wallet-card-balances">
        <div class="wallet-bal-item">
          <div class="wallet-bal-val green">${w.bnbBal}</div>
          <div class="wallet-bal-lbl">BNB</div>
        </div>
        <div class="wallet-bal-item">
          <div class="wallet-bal-val blue">${w.tokenOutBal}</div>
          <div class="wallet-bal-lbl">${escHtml(tokenSymbol)}</div>
        </div>
        <div class="wallet-bal-item">
          <div class="wallet-bal-val">${w.tokenInBal}</div>
          <div class="wallet-bal-lbl">TokenIn</div>
        </div>
      </div>
      ${showPk ? `<div style="font-size:10px;color:var(--c-danger);font-family:var(--font-mono);margin-top:8px;padding:6px;background:var(--c-danger-bg);border-radius:6px;word-break:break-all">${w.privateKey}</div>` : ''}
    </div>
  `).join('');
}

/* ===== 手机端导入钱包（读取 pkInput2） ===== */
function loadWalletsMobile() {
  const pkInput2 = document.getElementById('pkInput2');
  // 同步到主输入框
  if (pkInput2) {
    document.getElementById('pkInput').value = pkInput2.value;
  }
  loadWallets();
  if (pkInput2) pkInput2.value = '';
}

/* ===== 手机端生成钱包（读取 genCount2/genPrefix2） ===== */
function generateWalletsMobile() {
  const count2 = document.getElementById('genCount2');
  const prefix2 = document.getElementById('genPrefix2');
  if (count2) document.getElementById('genCount').value = count2.value;
  if (prefix2) document.getElementById('genPrefix').value = prefix2.value;
  generateWallets();
}

/* ===== 手机端设置同步 ===== */
function onRpcChange2() {
  const val = document.getElementById('rpcSelect2').value;
  const customInput = document.getElementById('customRpc2');
  // 同步到主设置
  document.getElementById('rpcSelect').value = val;
  if (val === 'custom') {
    customInput.style.display = '';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    initProvider(val);
  }
}

function applyCustomRpc2() {
  const url = document.getElementById('customRpc2').value.trim();
  document.getElementById('customRpc').value = url;
  if (url) initProvider(url);
}

function setDefaultGas2(v) {
  document.getElementById('defaultGasPrice2').value = v;
  document.getElementById('defaultGasPrice').value = v;
  syncGasPrice();
}

function syncGasPrice2() {
  const v = document.getElementById('defaultGasPrice2').value;
  document.getElementById('defaultGasPrice').value = v;
  syncGasPrice();
}

function toggleShowPk2() {
  const checked = document.getElementById('showPkCheck2').checked;
  document.getElementById('showPkCheck').checked = checked;
  renderWalletTable();
}

function syncConfirmCheck() {
  const checked = document.getElementById('confirmCheck2').checked;
  document.getElementById('confirmCheck').checked = checked;
}

function saveSettingsMobile() {
  // 同步手机端设置到主设置
  const gasMulti2 = document.getElementById('gasMulti2');
  const cfgFlap2 = document.getElementById('cfgFlap2');
  if (gasMulti2) document.getElementById('gasMulti').value = gasMulti2.value;
  if (cfgFlap2) document.getElementById('cfgFlap').value = cfgFlap2.value;
  saveSettings();
}

/* ===== 检测是否手机端 ===== */
function isMobile() {
  return window.matchMedia('(max-width: 640px)').matches;
}

/* ===== 初始化手机端状态 ===== */
function initMobile() {
  if (!isMobile()) return;
  // 同步设置面板初始值
  const rpcSelect2 = document.getElementById('rpcSelect2');
  const gasMulti2 = document.getElementById('gasMulti2');
  const cfgFlap2 = document.getElementById('cfgFlap2');
  const defaultGasPrice2 = document.getElementById('defaultGasPrice2');
  if (rpcSelect2) rpcSelect2.value = document.getElementById('rpcSelect').value;
  if (gasMulti2) gasMulti2.value = document.getElementById('gasMulti').value;
  if (cfgFlap2) cfgFlap2.value = document.getElementById('cfgFlap').value;
  if (defaultGasPrice2) defaultGasPrice2.value = document.getElementById('defaultGasPrice').value;
}

/* ============================================================
   捆绑开盘模块
   - 每 N ms 检测目标合约 totalSupply > 0
   - 检测到后立即触发选中钱包并行买入
   ============================================================ */

let snipeTimer = null;
let snipeRunning = false;
let snipeCheckCount = 0;
let snipeStartTime = null;
let snipeTimeUpdateTimer = null;
let snipeTriggered = false; // 触发锁：防止重复触发买入

/* ===== 日志辅助 ===== */
function snipeLog(type, msg, hash) {
  const wrap = document.getElementById('snipeLog');
  if (!wrap) return;
  const empty = wrap.querySelector('.log-empty');
  if (empty) empty.remove();
  const now = new Date().toTimeString().slice(0, 8);
  const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️', trigger: '🚀' };
  const item = document.createElement('div');
  item.className = 'op-exec-row';
  item.innerHTML = `
    <span class="op-exec-dot ${type === 'success' || type === 'trigger' ? 'ok' : type === 'error' ? 'fail' : 'pending'}"></span>
    <span class="op-exec-msg" style="flex:1">${icons[type] || ''} <span class="log-time">[${now}]</span> ${escHtml(msg)}</span>
    ${hash ? `<a class="op-exec-hash" href="https://bscscan.com/tx/${hash}" target="_blank">${hash.slice(0,10)}...</a>` : ''}
  `;
  wrap.appendChild(item);
  wrap.scrollTop = wrap.scrollHeight;
}

/* ===== 更新监测状态面板 ===== */
function updateSnipeMonitor() {
  const sel = getSelected();
  const addr = document.getElementById('snipeTokenAddr')?.value?.trim() || '--';
  const amt = document.getElementById('snipeBuyAmt')?.value || '--';

  const monitorAddr = document.getElementById('snipeMonitorAddr');
  const monitorCount = document.getElementById('snipeMonitorCount');
  const monitorTime = document.getElementById('snipeMonitorTime');
  const monitorWallets = document.getElementById('snipeMonitorWallets');
  const monitorAmt = document.getElementById('snipeMonitorAmt');
  const selInfo = document.getElementById('snipeSelInfo');

  if (monitorAddr) monitorAddr.textContent = addr.length > 20 ? addr.slice(0, 10) + '...' + addr.slice(-6) : addr;
  if (monitorCount) monitorCount.textContent = snipeCheckCount;
  if (monitorWallets) monitorWallets.textContent = sel.length + ' 个';
  if (monitorAmt) monitorAmt.textContent = amt + ' BNB';

  // 更新已选钱包显示
  if (selInfo) {
    if (sel.length === 0) {
      selInfo.innerHTML = '<span style="color:var(--c-text3)">请先在钱包列表选中钱包</span>';
    } else {
      selInfo.innerHTML = sel.map(w =>
        `<span class="snipe-sel-tag">${escHtml(w.name || shortAddr(w.address))}</span>`
      ).join('');
    }
  }
}

/* ===== 更新运行时间 ===== */
function updateSnipeTime() {
  if (!snipeStartTime) return;
  const elapsed = Math.floor((Date.now() - snipeStartTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const el = document.getElementById('snipeMonitorTime');
  if (el) el.textContent = `${m}分${s.toString().padStart(2,'0')}秒`;
}

/* ===== 设置UI状态 ===== */
function setSnipeUIState(running) {
  snipeRunning = running;
  const startBtn = document.getElementById('startSnipeBtn');
  const stopBtn = document.getElementById('stopSnipeBtn');
  const badge = document.getElementById('snipeStatusBadge');
  const dot = document.getElementById('snipeDot');
  const statusText = document.getElementById('snipeStatusText');
  const tabBadge = document.getElementById('snipeStatus');

  if (startBtn) startBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;

  if (running) {
    if (badge) badge.classList.add('active');
    if (dot) { dot.className = 'snipe-dot active'; }
    if (statusText) statusText.textContent = '监测中...';
    if (tabBadge) { tabBadge.style.display = ''; tabBadge.textContent = 'ON'; }
  } else {
    if (badge) badge.classList.remove('active');
    if (dot) { dot.className = 'snipe-dot'; }
    if (statusText) statusText.textContent = '待机中';
    if (tabBadge) tabBadge.style.display = 'none';
  }
}

/* ===== 开始监测 ===== */
async function startSnipe() {
  if (snipeRunning) return;

  const tokenAddr = document.getElementById('snipeTokenAddr')?.value?.trim();
  const buyAmt = parseFloat(document.getElementById('snipeBuyAmt')?.value) || 0.01;
  const minTokenOutRaw = document.getElementById('snipeMinTokenOut')?.value?.trim() || '0';
  const gasP = parseFloat(document.getElementById('snipeGasPrice')?.value) || 5;
  const interval = parseInt(document.getElementById('snipeInterval')?.value) || 500;
  const sel = getSelected();

  if (!tokenAddr || !ethers.utils.isAddress(tokenAddr)) {
    toast('请输入有效的目标合约地址', 'warning'); return;
  }
  if (sel.length === 0) {
    toast('请先在钱包列表选中要参与的钱包', 'warning'); return;
  }
  if (!provider) {
    toast('请先连接 RPC', 'error'); return;
  }

  // 清空日志
  const logWrap = document.getElementById('snipeLog');
  if (logWrap) logWrap.innerHTML = '';

  snipeCheckCount = 0;
  snipeStartTime = Date.now();
  snipeTriggered = false; // 重置触发锁
  setSnipeUIState(true);
  updateSnipeMonitor();

  snipeLog('info', `开始监测合约: ${shortAddr(tokenAddr)}，间隔 ${interval}ms，目标钱包 ${sel.length} 个`);
  snipeLog('info', `买入参数：${buyAmt} BNB/钱包，最小获得=${minTokenOutRaw || '0'}，Gas ${gasP} Gwei`);

  // ⚡ 先预热，完成后再启动监测，确保触发时缓存必然就绪
  _snipeCache = null;
  snipeLog('info', '⚡ 预热中，初始化钱包实例和 nonce...');
  try {
    const cache = await _warmupSnipeCache(sel, buyAmt, gasP, minTokenOutRaw);
    _snipeCache = cache;
    snipeLog('info', `⚡ 预热完成：${cache.walletObjs.length} 个钱包已就绪，nonce 已缓存，开始监测...`);
  } catch(e) {
    snipeLog('info', `预热失败(不影响买入): ${e.message}，开始监测...`);
  }

  // 启动时间更新定时器
  snipeTimeUpdateTimer = setInterval(updateSnipeTime, 1000);

  // 启动检测循环
  snipeTimer = setInterval(async () => {
    if (!snipeRunning) return;
    snipeCheckCount++;
    document.getElementById('snipeMonitorCount').textContent = snipeCheckCount;

    try {
      const ca = ethers.utils.getAddress(tokenAddr);
      const tc = new ethers.Contract(ca, ERC20_ABI, provider);
      const supply = await tc.totalSupply();

      if (supply && supply.gt(0)) {
        // 触发锁：确保只触发一次买入
        if (snipeTriggered) return;
        snipeTriggered = true;

        // 检测到合约已部署！立即触发买入
        clearInterval(snipeTimer);
        clearInterval(snipeTimeUpdateTimer);
        snipeTimer = null;

        const dot = document.getElementById('snipeDot');
        if (dot) dot.className = 'snipe-dot triggered';
        const statusText = document.getElementById('snipeStatusText');
        if (statusText) statusText.textContent = '已触发！';

        snipeLog('trigger', `🚀 检测到合约已部署！totalSupply = ${supply.toString().slice(0,12)}... 立即触发买入！`);
        toast('检测到合约已部署，正在触发买入！', 'success');

        // 执行并行买入
        await _snipeBuy(ca, sel, buyAmt, gasP, minTokenOutRaw);
        setSnipeUIState(false);
      }
    } catch (e) {
      // 合约未部署时 totalSupply 调用会失败，属于正常情况，不记录错误
      // 只在连续失败超过100次时提示
      if (snipeCheckCount % 100 === 0) {
        snipeLog('info', `已检测 ${snipeCheckCount} 次，合约尚未部署...`);
      }
    }
  }, interval);
}

/* ===== 停止监测 ===== */
function stopSnipe() {
  if (snipeTimer) { clearInterval(snipeTimer); snipeTimer = null; }
  if (snipeTimeUpdateTimer) { clearInterval(snipeTimeUpdateTimer); snipeTimeUpdateTimer = null; }
  _snipeCache = null;
  setSnipeUIState(false);
  snipeLog('info', `监测已停止，共检测 ${snipeCheckCount} 次`);
  toast('捆绑监测已停止', 'info');
}

/* ===== 预热缓存：监测启动时提前准备好所有买入所需对象 ===== */
async function _warmupSnipeCache(sel, buyAmt, gasP, minTokenOutRaw) {
  const gasPrice = ethers.utils.parseUnits(gasP.toString(), 'gwei');
  const amtWei = ethers.utils.parseEther(buyAmt.toString());
  // 固定 gasLimit：FLAP 内盘买入实测约 150k~200k，给 1000000 足够安全
  const gasLimit = 1000000;
  const minTokenOut = ethers.BigNumber.from(minTokenOutRaw || '0');

  const walletObjs = sel.map(w => new ethers.Wallet(w.privateKey, provider));
  const routerContracts = walletObjs.map(wallet =>
    new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, wallet)
  );

  // 并行预取所有钱包的 nonce
  const nonces = await Promise.all(
    walletObjs.map(w => provider.getTransactionCount(w.address, 'pending'))
  );

  return { walletObjs, routerContracts, nonces, amtWei, gasPrice, gasLimit, minTokenOut, sel };
}

/* ===== 多 RPC 并行广播工具函数 ===== */
// 签名一次得到 rawTx，同时向多个 RPC 发送，最快响应的返回 hash
async function _broadcastRawTx(rawTx, rpcList) {
  const controllers = rpcList.map(() => new AbortController());
  let resolved = false;

  return new Promise((resolve, reject) => {
    let failCount = 0;
    rpcList.forEach((rpcUrl, idx) => {
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_sendRawTransaction',
          params: [rawTx], id: idx + 1
        }),
        signal: controllers[idx].signal
      })
      .then(r => r.json())
      .then(data => {
        if (resolved) return;
        if (data.result) {
          resolved = true;
          // 取消其他请求
          controllers.forEach((c, i) => { if (i !== idx) try { c.abort(); } catch(e){} });
          resolve({ hash: data.result, rpc: rpcUrl });
        } else {
          // 返回了错误（如 nonce 冲突、资金不足等）
          failCount++;
          if (failCount === rpcList.length) reject(new Error(data.error?.message || 'all RPCs failed'));
        }
      })
      .catch(err => {
        if (resolved || err.name === 'AbortError') return;
        failCount++;
        if (failCount === rpcList.length) reject(new Error('all RPCs timed out'));
      });
    });
  });
}

/* ===== 执行买入（极速模式 + 多 RPC 并行广播）===== */
async function _snipeBuy(tokenAddr, sel, buyAmt, gasP, minTokenOutRaw) {
  snipeLog('info', `开始并行买入，${sel.length} 个钱包同时执行...`);
  snipeLog('info', '路由：⚡ FLAP 内盘（通过 UnifiedMarketRouter）');

  const t0 = Date.now();
  const deadline = Math.floor(Date.now() / 1000) + 120;
  const minTokenOut = ethers.BigNumber.from(minTokenOutRaw || '0');

  // 优先使用预热缓存（nonce、合约实例已就绪），否则临时创建
  let cache = _snipeCache;
  if (!cache) {
    snipeLog('info', '⚠️ 预热缓存未就绪，临时初始化...');
    const gasPrice = ethers.utils.parseUnits(gasP.toString(), 'gwei');
    const amtWei = ethers.utils.parseEther(buyAmt.toString());
    const walletObjs = sel.map(w => new ethers.Wallet(w.privateKey, provider));
    const routerContracts = walletObjs.map(w =>
      new ethers.Contract(ADDR.UNIFIED_ROUTER, UNIFIED_ROUTER_ABI, w)
    );
    const nonces = await Promise.all(
      walletObjs.map(w => provider.getTransactionCount(w.address, 'pending'))
    );
    cache = { walletObjs, routerContracts, nonces, amtWei, gasPrice, gasLimit: 1000000, minTokenOut, sel };
  } else {
    // 监测期间钱包无其他交易，直接使用预热缓存的 nonce，零延迟
  }

  // 广播用的多 RPC 列表：取前 5 个节点同时广播
  const broadcastRpcs = FALLBACK_RPCS.slice(0, 5);
  snipeLog('info', `⚡ 准备耗时: ${Date.now() - t0}ms，向 ${broadcastRpcs.length} 个 RPC 并行广播...`);

  // 并行处理所有钱包
  const promises = cache.sel.map(async (w, i) => {
    try {
      const wallet = cache.walletObjs[i];

      // 第一步：本地签名（纯 CPU操作，无网络延迟）
      const unsignedTx = await cache.routerContracts[i].populateTransaction.buyWithAutomaticRoute(
        tokenAddr,
        cache.minTokenOut || minTokenOut,
        wallet.address,
        deadline,
        {
          value: cache.amtWei,
          gasPrice: cache.gasPrice,
          gasLimit: cache.gasLimit,
          nonce: cache.nonces[i]
        }
      );
      const signedTx = await wallet.signTransaction(unsignedTx);
      const signMs = Date.now() - t0;

      // 第二步：同时向多个 RPC 广播，最快响应的返回 hash
      const { hash, rpc } = await _broadcastRawTx(signedTx, broadcastRpcs);
      const broadcastMs = Date.now() - t0;

      snipeLog('pending',
        `[${w.name}] 广播成功！签名 ${signMs}ms 广播 ${broadcastMs}ms 通过 ${rpc.replace('https://','').split('/')[0]}`,
        hash
      );

      // 异步等待链上确认
      provider.waitForTransaction(hash).then(receipt => {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
        snipeLog('success', `[${w.name}] ✅ 买入确认！总耗时 ${elapsed}s，${buyAmt} BNB`, hash);
      }).catch(err => {
        snipeLog('error', `[${w.name}] 确认失败: ${err.reason || err.message}`);
      });

      return { ok: true, wallet: w, hash };
    } catch (e) {
      snipeLog('error', `[${w.name}] 买入失败: ${e.reason || e.message || e}`);
      return { ok: false, wallet: w, error: e };
    }
  });

  const results = await Promise.allSettled(promises);
  const ok = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  const fail = results.length - ok;
  const broadcastMs = Date.now() - t0;

  snipeLog(ok > 0 ? 'success' : 'error',
    `广播完成：${ok} 成功，${fail} 失败，总耗时 ${broadcastMs}ms（链上确认中...）`);
  toast(`捆绑买入已广播：${ok} 成功 ${fail} 失败`, ok > 0 ? 'success' : 'error');
  log('info', `捆绑开盘买入广播完成：${ok} 成功 ${fail} 失败，耗时 ${broadcastMs}ms`);
}

