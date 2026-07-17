/**
 * okbvip.js - OKB DEX Sniper 主逻辑
 *
 * 修复清单：
 * [Fix-1] clearAllWorkers 引用局部变量 workers → 改为模块级变量
 * [Fix-2] 多 Worker 同时触发 executeTrades（竞态）→ 加 triggered 标志位保护
 * [Fix-3] sharedTimer TDZ 风险 → 改为模块级变量，先声明后赋值
 * [Fix-4] executeTrades 中 intervalTime 未定义 → 改为函数参数传入
 * [Fix-5] workerCount 字符串取模 → parseInt 转换
 * [Fix-6] approve 金额精度溢出 → 使用 MaxUint256
 * [Fix-7] Worker onmessage 覆盖竞态 → Worker 侧已修复（见 okbworker.js）
 * [Fix-8] gasMultiplier 字符串 BigInt 转换 → 统一 parseInt 处理
 */

// ─────────────────────────────────────────────────────────────
// 全局配置
// ─────────────────────────────────────────────────────────────
const web3 = new Web3(Web3.givenProvider || 'https://xlayerrpc.okx.com');
const routerContractAddress = '0x881fB2f98c13d521009464e7D1CBf16E1b394e8E';

// MaxUint256：ERC-20 授权最大值，避免精度溢出
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

const abi = [
    { "inputs": [{ "internalType": "uint256", "name": "amountIn", "type": "uint256" }, { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "swapExactTokensForTokens", "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }, { "internalType": "uint256", "name": "amountInMax", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "swapTokensForExactTokens", "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }], "stateMutability": "nonpayable", "type": "function" },
    { "stateMutability": "payable", "type": "receive" },
    { "inputs": [{ "internalType": "uint256", "name": "amountIn", "type": "uint256" }, { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "swapExactTokensForTokensSupportingFeeOnTransferTokens", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "approve", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "constant": true, "inputs": [{ "name": "amountIn", "type": "uint256" }, { "name": "path", "type": "address[]" }], "name": "getAmountsOut", "outputs": [{ "name": "", "type": "uint256[]" }], "payable": false, "stateMutability": "view", "type": "function" }
];

// ─────────────────────────────────────────────────────────────
// [Fix-1][Fix-3] 挂单模式状态：全部提升为模块级变量
// ─────────────────────────────────────────────────────────────
let sniperWorkers = [];      // 所有 Worker 实例
let sniperTimer   = null;    // setInterval 句柄
let triggered     = false;   // [Fix-2] 触发保护标志，防止多 Worker 重复触发

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────
function getTokenInAddress() {
    return document.getElementById('tokeninAddress').value === '自定义'
        ? document.getElementById('customAddress').value
        : document.getElementById('tokeninAddress').value;
}

function getTokenOutAddress() {
    return document.getElementById('tokenOutAddress').value === '自定义'
        ? document.getElementById('customBddress').value
        : document.getElementById('tokenOutAddress').value;
}

// [Fix-8] gasMultiplier 统一转 parseInt，避免字符串 BigInt 转换异常
function buildGasPrice() {
    const multiplier = BigInt(parseInt(document.getElementById('gasMultiplier').value, 10) || 1);
    const base       = BigInt(web3.utils.toWei('0.1', 'gwei'));
    return (base * multiplier).toString();
}

function log(message, color = 'black') {
    const logContainer = document.getElementById('log');
    const el = document.createElement('div');
    el.style.color = color;
    const time = new Date().toLocaleTimeString('zh-CN');
    el.textContent = `[${time}] ${message}`;
    logContainer.appendChild(el);
    // 限制最多 300 条，防止内存泄漏
    while (logContainer.children.length > 300) {
        logContainer.removeChild(logContainer.firstChild);
    }
    logContainer.scrollTop = logContainer.scrollHeight;
}

// ─────────────────────────────────────────────────────────────
// 授权按钮
// ─────────────────────────────────────────────────────────────
document.getElementById('approveButton').onclick = async () => {
    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    if (!privateKeys.length) { log('请先输入私钥', 'red'); return; }

    const tokeninAddress = getTokenInAddress();
    if (!tokeninAddress) { log('请选择或输入代币地址', 'red'); return; }

    // [Fix-6] 使用 MaxUint256，避免原来 1e34 精度溢出
    const gasPrice = await web3.eth.getGasPrice();

    const promises = privateKeys.map(async (privateKey) => {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        web3.eth.accounts.wallet.add(account);
        const tokenContract = new web3.eth.Contract(abi, tokeninAddress);
        try {
            await tokenContract.methods.approve(routerContractAddress, MAX_UINT256).send({
                from: account.address,
                gasPrice: gasPrice,
                type: 0
            });
            log(`授权成功: ${account.address}`, 'green');
        } catch (e) {
            log(`授权失败 [${account.address}]: ${e.message}`, 'red');
        }
    });
    await Promise.all(promises);
};

// ─────────────────────────────────────────────────────────────
// 快速模式（立即买入，不监听）
// ─────────────────────────────────────────────────────────────
document.getElementById('immediateBuyButton').onclick = async () => {
    const button = document.getElementById('immediateBuyButton');
    button.textContent = '执行中';
    button.disabled = true;

    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress  = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();
    const amountIn        = document.getElementById('amountIn').value * 1e18;
    const amountOutMin    = document.getElementById('amountOutMin').value * 1e18;
    const snipingCount    = parseInt(document.getElementById('snipingCount').value, 10) || 1;
    // [Fix-5] 转为数字
    const intervalTime    = parseInt(document.getElementById('buyintervalTime').value, 10) || 0;
    const amountOption    = document.querySelector('input[name="amountOption"]:checked').value;

    if (!privateKeys.length || !amountIn || !tokenOutAddress) {
        log('请填写所有必填字段', 'red');
        button.disabled = false;
        button.textContent = '快速模式';
        return;
    }

    // [Fix-4] intervalTime 作为参数传入
    await executeTrades(privateKeys, amountIn, amountOutMin, tokeninAddress, tokenOutAddress, snipingCount, intervalTime, amountOption);

    log('所有交易已发送完毕。', 'green');
    button.textContent = '快速模式';
    button.disabled = false;
};

// ─────────────────────────────────────────────────────────────
// SWAP 按钮（支持税费代币，使用滑点）
// ─────────────────────────────────────────────────────────────
document.getElementById('sellButton').onclick = async () => {
    const button = document.getElementById('sellButton');
    button.textContent = 'wait';
    button.disabled = true;

    const privateKeys     = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress  = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();
    const amountIn        = parseFloat(document.getElementById('from_amount').value) * 1e18;
    const amountOutInput  = parseFloat(document.getElementById('from_amount_out').value) || 0;
    const slippage        = parseFloat(document.getElementById('slippage').textContent) / 100;
    const amountOutMin    = Math.floor(amountOutInput * (1 - slippage) * 1e18);
    const gasPrice        = buildGasPrice();

    const promises = privateKeys.map(async (privateKey) => {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey.trim());
        web3.eth.accounts.wallet.add(account);
        const routerContract = new web3.eth.Contract(abi, routerContractAddress);
        const reciveAddress  = document.getElementById('reciveAddress').value;
        const to             = reciveAddress || account.address;
        const deadline       = Math.floor(Date.now() / 1000) + 60 * 60;
        const nonce          = await web3.eth.getTransactionCount(account.address, 'pending');

        try {
            routerContract.methods
                .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    amountIn.toString(),
                    amountOutMin.toString(),
                    [tokeninAddress, tokenOutAddress],
                    to,
                    deadline
                )
                .send({
                    from: account.address,
                    gas: 4000000,
                    gasPrice,
                    nonce
                })
                .on('transactionHash', hash => log(`SWAP 已广播 [${account.address}] ${hash}`, 'green'))
                .on('error', err => log(`SWAP 失败 [${account.address}]: ${err.message}`, 'red'));

            log(`SWAP 已提交: ${account.address}`, 'green');
        } catch (e) {
            log(`SWAP 异常 [${account.address}]: ${e.message}`, 'red');
        }
    });

    await Promise.all(promises);
    button.textContent = 'SWAP';
    button.disabled = false;
};

// ─────────────────────────────────────────────────────────────
// 挂单模式（核心：监听 → 触发 → 立即买入）
// ─────────────────────────────────────────────────────────────
document.getElementById('buyButton').onclick = async () => {
    const buyButton = document.getElementById('buyButton');

    // 如果正在监听，点击则取消
    if (buyButton.dataset.running === '1') {
        stopSniper();
        log('已手动取消监听。', 'orange');
        resetBuyButton();
        return;
    }

    // ── 读取参数 ──
    const privateKeys     = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress  = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();
    const amountIn        = document.getElementById('amountIn').value * 1e18;
    const amountOutMin    = document.getElementById('amountOutMin').value * 1e18;
    const snipingCount    = parseInt(document.getElementById('snipingCount').value, 10) || 1;
    // [Fix-4][Fix-5] intervalTime 转数字，后续作为参数传入
    const intervalTime    = parseInt(document.getElementById('buyintervalTime').value, 10) || 300;
    // [Fix-5] workerCount 转数字
    const workerCount     = parseInt(document.getElementById('worker').value, 10) || 5;
    const amountOption    = document.querySelector('input[name="amountOption"]:checked').value;

    if (!privateKeys.length || !amountIn || !tokenOutAddress) {
        log('请填写所有必填字段', 'red');
        return;
    }

    // ── 更新按钮状态 ──
    buyButton.textContent     = '取消监听';
    buyButton.dataset.running = '1';
    buyButton.classList.replace('btn-warning', 'btn-danger');

    // ── 重置触发标志 ──
    triggered = false;

    // ── 用第一个私钥的地址作为 estimateGas 的 from 地址 ──
    const monitorAccount = web3.eth.accounts.privateKeyToAccount(privateKeys[0]);
    web3.eth.accounts.wallet.add(monitorAccount);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

    log(`开始监听，间隔 ${intervalTime}ms，${workerCount} 个线程...`, 'blue');

    // ── 创建 Worker 池 ──
    sniperWorkers = [];
    let currentWorkerIndex = 0;

    for (let i = 0; i < workerCount; i++) {
        const worker = new Worker('okbworker.js');
        sniperWorkers.push(worker);

        worker.onmessage = async (event) => {
            const { type, message } = event.data;

            if (type !== 'estimateGas') return;

            if (message.gasLimit > 0) {
                // ── [Fix-2] 触发保护：只允许第一个 Worker 触发买入 ──
                if (triggered) return;
                triggered = true;

                log('⚡ 检测到代币可以买入！立即执行...', 'blue');

                // [Fix-1] 使用模块级 sniperTimer / sniperWorkers 停止监听
                stopSniper();
                resetBuyButton();

                // ── 立即执行买入 ──
                // [Fix-4] intervalTime 作为参数传入，不再依赖外部作用域
                await executeTrades(
                    privateKeys,
                    amountIn,
                    amountOutMin,
                    tokeninAddress,
                    tokenOutAddress,
                    snipingCount,
                    intervalTime,
                    amountOption
                );

                log('所有买入交易已发送完毕。', 'green');

            } else {
                // 未开放，打印日志继续等待
                const t = new Date().toLocaleTimeString('zh-CN');
                log(`[${t}] 监听中，代币暂不可买入...`, 'orange');
            }
        };

        worker.onerror = (err) => {
            log(`Worker[${i}] 错误: ${err.message}`, 'red');
        };

        // 发送初始化消息（Worker 收到后进入命令监听阶段）
        worker.postMessage({
            to:                   monitorAccount.address,
            amountIn:             amountIn.toString(),
            tokeninAddress,
            tokenOutAddress,
            abi,
            routerContractAddress,
            deadline
        });
    }

    // ── 启动轮询定时器 ──
    // [Fix-3] sniperTimer 是模块级变量，不存在 TDZ 问题
    sniperTimer = setInterval(() => {
        if (triggered) return;
        // 轮询分发给不同 Worker，降低单 Worker 压力
        const worker = sniperWorkers[currentWorkerIndex % sniperWorkers.length];
        if (worker) worker.postMessage({ command: 'estimateGas' });
        currentWorkerIndex++;
    }, intervalTime);
};

/**
 * 停止所有 Worker 和定时器
 * [Fix-1] 使用模块级变量，不再有 ReferenceError
 */
function stopSniper() {
    if (sniperTimer !== null) {
        clearInterval(sniperTimer);
        sniperTimer = null;
    }
    sniperWorkers.forEach(w => {
        try { w.terminate(); } catch (e) { /* 忽略已终止的 Worker */ }
    });
    sniperWorkers = [];
}

function resetBuyButton() {
    const buyButton = document.getElementById('buyButton');
    buyButton.textContent     = '挂单模式';
    buyButton.dataset.running = '0';
    buyButton.classList.replace('btn-danger', 'btn-warning');
    buyButton.disabled = false;
}

// ─────────────────────────────────────────────────────────────
// 核心买入函数（快速模式和挂单模式共用）
// [Fix-4] intervalTime 改为参数，不再依赖外部作用域
// ─────────────────────────────────────────────────────────────
async function executeTrades(privateKeys, amountIn, amountOutMin, tokeninAddress, tokenOutAddress, snipingCount, intervalTime, amountOption) {
    const gasPrice = buildGasPrice();

    const promises = privateKeys.map(async (privateKey) => {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey.trim());
        web3.eth.accounts.wallet.add(account);

        const routerContract = new web3.eth.Contract(abi, routerContractAddress);
        const reciveAddress  = document.getElementById('reciveAddress').value;
        const to             = reciveAddress || account.address;
        const deadline       = Math.floor(Date.now() / 1000) + 60 * 60;
        const path           = [tokeninAddress, tokenOutAddress];

        // 预取 nonce，后续手动递增，避免多笔交易 nonce 冲突
        let nonce = await web3.eth.getTransactionCount(account.address, 'pending');

        log(`开始买入 [${account.address}]，共 ${snipingCount} 笔`, 'blue');

        for (let i = 0; i < snipingCount; i++) {
            const txOptions = {
                from:     account.address,
                gas:      4000000,
                gasPrice,
                nonce:    nonce + i   // 手动递增，不等待上一笔确认
            };

            try {
                // fire-and-forget：不 await，立即发下一笔
                if (amountOption === '1') {
                    routerContract.methods
                        .swapExactTokensForTokens(
                            amountIn.toString(),
                            amountOutMin.toString(),
                            path,
                            to,
                            deadline
                        )
                        .send(txOptions)
                        .on('transactionHash', hash =>
                            log(`第${i + 1}笔已广播 [${account.address}] ${hash}`, 'green')
                        )
                        .on('error', err =>
                            log(`第${i + 1}笔失败 [${account.address}]: ${err.message}`, 'red')
                        );
                } else {
                    routerContract.methods
                        .swapTokensForExactTokens(
                            amountOutMin.toString(),
                            amountIn.toString(),
                            path,
                            to,
                            deadline
                        )
                        .send(txOptions)
                        .on('transactionHash', hash =>
                            log(`第${i + 1}笔已广播 [${account.address}] ${hash}`, 'green')
                        )
                        .on('error', err =>
                            log(`第${i + 1}笔失败 [${account.address}]: ${err.message}`, 'red')
                        );
                }

                log(`第${i + 1}笔已提交 [${account.address}]`, 'green');

            } catch (e) {
                log(`第${i + 1}笔异常 [${account.address}]: ${e.message}`, 'red');
            }

            // 多笔之间的间隔（单笔时 intervalTime 无意义，直接跳过）
            if (i < snipingCount - 1 && intervalTime > 0) {
                await new Promise(resolve => setTimeout(resolve, intervalTime));
            }
        }
    });

    await Promise.all(promises);
}

// ─────────────────────────────────────────────────────────────
// 余额查询（每 3 秒自动刷新）
// ─────────────────────────────────────────────────────────────
const checkBalances = async () => {
    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    if (!privateKeys.length) return;

    const tokeninAddress  = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();
    if (!tokeninAddress || !tokenOutAddress) return;

    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKeys[0]);
        web3.eth.accounts.wallet.add(account);
        const to = account.address;

        const tokeninContract  = new web3.eth.Contract(abi, tokeninAddress);
        const tokenOutContract = new web3.eth.Contract(abi, tokenOutAddress);
        const routerContract   = new web3.eth.Contract(abi, routerContractAddress);

        const [tokeninName, tokenOutName, balIn, balOut] = await Promise.all([
            tokeninContract.methods.symbol().call(),
            tokenOutContract.methods.symbol().call(),
            tokeninContract.methods.balanceOf(to).call(),
            tokenOutContract.methods.balanceOf(to).call()
        ]);

        const fmtIn  = parseFloat(web3.utils.fromWei(balIn,  'ether')).toFixed(6);
        const fmtOut = parseFloat(web3.utils.fromWei(balOut, 'ether')).toFixed(6);

        // 更新自定义选项文本
        const tokeninSelect = document.getElementById('tokeninAddress');
        if (tokeninSelect.value === '自定义') {
            const opt = tokeninSelect.querySelector('option[value="自定义"]');
            if (opt) opt.textContent = tokeninName + ' ↺';
        }
        const tokenOutSelect = document.getElementById('tokenOutAddress');
        if (tokenOutSelect.value === '自定义') {
            const opt = tokenOutSelect.querySelector('option[value="自定义"]');
            if (opt) opt.textContent = tokenOutName + ' ↺';
        }

        document.getElementById('privateKeyResult').style.color = 'white';
        document.getElementById('privateKeyResult').textContent = `余额: ${fmtIn} ${tokeninName}`;
        document.getElementById('tokeninResult').style.color    = 'blue';
        document.getElementById('tokeninResult').textContent    = `余额: ${fmtOut} ${tokenOutName}`;

        // 预估输出数量
        const fromAmount = parseFloat(document.getElementById('from_amount').value) || 0;
        if (fromAmount > 0) {
            const amountsOut = await routerContract.methods.getAmountsOut(
                web3.utils.toWei(fromAmount.toString(), 'ether'),
                [tokeninAddress, tokenOutAddress]
            ).call();
            document.getElementById('from_amount_out').value =
                parseFloat(web3.utils.fromWei(amountsOut[1], 'ether')).toFixed(9);
        }
    } catch (e) {
        // 静默失败，不干扰用户操作
    }
};

setInterval(checkBalances, 3000);

// ─────────────────────────────────────────────────────────────
// UI 事件绑定
// ─────────────────────────────────────────────────────────────

// 代币互换按钮
document.getElementById('toggleButton').addEventListener('click', () => {
    const tokenInSelect  = document.getElementById('tokeninAddress');
    const tokenOutSelect = document.getElementById('tokenOutAddress');
    const inVal  = tokenInSelect.value;
    const outVal = tokenOutSelect.value;
    tokenInSelect.value  = outVal;
    tokenOutSelect.value = inVal;

    const ca = document.getElementById('customAddress').value;
    const cb = document.getElementById('customBddress').value;
    document.getElementById('customAddress').value  = cb;
    document.getElementById('customBddress').value  = ca;
});

// 代币选择变化 → 弹出自定义地址输入框
document.getElementById('tokeninAddress').addEventListener('change', function () {
    if (this.value === '自定义') showModal();
});
document.getElementById('tokenOutAddress').addEventListener('change', function () {
    if (this.value === '自定义') showModalB();
});

// 单选框切换 → 更新标签文字
document.getElementsByName('amountOption').forEach(option => {
    option.addEventListener('change', () => {
        const isFixed = option.value === '2';
        document.getElementById('amountInLabel').textContent      = isFixed ? '支出代币最大数量:' : '输入支出代币数量:';
        document.getElementById('amountOutMinLabel').textContent  = isFixed ? '买入固定代币数量:' : '获取代币最小数量:';
        document.getElementById('buyintervalTimeLabel').textContent = isFixed ? '监控间隔（ms）:' : '买入间隔（ms）:';
    });
});

// 北京时间时钟
setInterval(() => {
    document.getElementById('time').innerText =
        '北京时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}, 1000);

// ─────────────────────────────────────────────────────────────
// Modal 函数
// ─────────────────────────────────────────────────────────────
function showModal()    { document.getElementById('addressModal').style.display  = 'block'; }
function showModalB()   { document.getElementById('addressModalB').style.display = 'block'; }
function closeModal()   { document.getElementById('addressModal').style.display  = 'none';  }
function closeModalB()  { document.getElementById('addressModalB').style.display = 'none';  }

function confirmAddress() {
    if (document.getElementById('customAddress').value) closeModal();
    else alert('请输入有效的地址');
}
function confirmAddressB() {
    if (document.getElementById('customBddress').value) closeModalB();
    else alert('请输入有效的地址');
}
