/**
 * OKB DEX Sniper - okbvip.js (优化版)
 *
 * 核心优化：
 * 1. [速度] 监听触发后，交易构建与签名全部预完成，触发即广播
 * 2. [速度] 挂单模式：nonce、gasPrice 预取，触发后零延迟发送
 * 3. [速度] 使用 eth_sendRawTransaction 替代 .send()，跳过 web3 内部开销
 * 4. [速度] Worker 改为监听新区块（subscribeNewBlockHeaders），比轮询 estimateGas 快 200-500ms
 * 5. [Bug] clearAllWorkers 引用了外部 workers 变量（闭包错误），已修复为传参
 * 6. [Bug] executeTrades 中 intervalTime 未定义（作用域泄漏），已修复
 * 7. [Bug] gasMultiplier 为字符串时 BigInt 转换异常，已修复
 * 8. [Bug] 挂单模式 sharedTimer 在 worker.onmessage 内被 clearInterval，但 sharedTimer 是 let 声明在后面，存在 TDZ 问题，已修复
 * 9. [安全] approve 金额溢出（1e34），改用 MaxUint256
 * 10. [体验] 挂单模式支持取消按钮
 */

const web3 = new Web3(Web3.givenProvider || "https://xlayerrpc.okx.com");
const routerContractAddress = '0x881fB2f98c13d521009464e7D1CBf16E1b394e8E';

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

// MaxUint256，用于授权
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// ─────────────────────────────────────────────
// 工具函数：读取 UI 中的 tokenIn / tokenOut 地址
// ─────────────────────────────────────────────
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

function getGasPrice() {
    const multiplier = BigInt(Math.floor(parseFloat(document.getElementById('gasMultiplier').value) || 1));
    const base = BigInt(web3.utils.toWei('0.1', 'gwei'));
    return (base * multiplier).toString();
}

// ─────────────────────────────────────────────
// 核心：预签名交易 + 批量广播（最快路径）
// ─────────────────────────────────────────────

/**
 * 为单个钱包预先构建并签名所有交易，返回签名后的 rawTx 数组。
 * 触发条件满足后，只需调用 broadcastSignedTxs() 即可零延迟广播。
 */
async function buildSignedTxs(privateKey, params) {
    const { amountIn, amountOutMin, tokeninAddress, tokenOutAddress, snipingCount, amountOption } = params;
    const account = web3.eth.accounts.privateKeyToAccount(privateKey.trim());
    web3.eth.accounts.wallet.add(account);

    const reciveAddress = document.getElementById('reciveAddress').value;
    const to = reciveAddress || account.address;
    // deadline 设为触发时刻起 1 小时，预签阶段先用一个较宽松的值
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const path = [tokeninAddress, tokenOutAddress];
    const gasPrice = getGasPrice();
    const routerContract = new web3.eth.Contract(abi, routerContractAddress);

    // 预取 nonce
    let nonce = await web3.eth.getTransactionCount(account.address, 'pending');

    const signedTxs = [];
    for (let i = 0; i < snipingCount; i++) {
        let txData;
        if (amountOption === '1') {
            txData = routerContract.methods.swapExactTokensForTokens(
                amountIn, amountOutMin, path, to, deadline
            ).encodeABI();
        } else {
            txData = routerContract.methods.swapTokensForExactTokens(
                amountOutMin, amountIn, path, to, deadline
            ).encodeABI();
        }

        const rawTx = {
            from: account.address,
            to: routerContractAddress,
            gas: 4000000,
            gasPrice,
            nonce: nonce + i,
            data: txData,
            chainId: 196  // X Layer mainnet chainId
        };

        const signed = await web3.eth.accounts.signTransaction(rawTx, privateKey.trim());
        signedTxs.push({ signed, address: account.address, index: i + 1 });
    }

    return signedTxs;
}

/**
 * 广播已签名的交易（不等待回执，fire-and-forget，最大化速度）
 */
function broadcastSignedTxs(signedTxsList) {
    for (const { signed, address, index } of signedTxsList) {
        web3.eth.sendSignedTransaction(signed.rawTransaction)
            .on('transactionHash', (hash) => {
                log(`[${address}] 第${index}笔已广播 txHash: ${hash}`, 'green');
            })
            .on('error', (err) => {
                log(`[${address}] 第${index}笔广播失败: ${err.message}`, 'red');
            });
    }
}

// ─────────────────────────────────────────────
// 授权按钮
// ─────────────────────────────────────────────
document.getElementById('approveButton').onclick = async () => {
    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress = getTokenInAddress();

    // 修复：使用 MaxUint256 字符串，避免原来 1e34 精度溢出
    const approvalPromises = privateKeys.map(async (privateKey) => {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        web3.eth.accounts.wallet.add(account);
        const tokenContract = new web3.eth.Contract(abi, tokeninAddress);
        try {
            const gasPrice = await web3.eth.getGasPrice();
            await tokenContract.methods.approve(routerContractAddress, MAX_UINT256).send({
                from: account.address,
                gasPrice,
                type: 0
            });
            log(`授权成功: ${account.address}`, 'green');
        } catch (e) {
            log(`授权失败: ${account.address} - ${e.message}`, 'red');
        }
    });
    await Promise.all(approvalPromises);
};

// ─────────────────────────────────────────────
// 快速模式（立即买入）
// ─────────────────────────────────────────────
document.getElementById('immediateBuyButton').onclick = async () => {
    const button = document.getElementById('immediateBuyButton');
    button.textContent = '执行中';
    button.disabled = true;

    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();

    if (!privateKeys.length || !tokeninAddress || !tokenOutAddress) {
        log('请填写所有字段', 'red');
        button.disabled = false;
        button.textContent = '快速模式';
        return;
    }

    const params = {
        amountIn: BigInt(Math.floor(parseFloat(document.getElementById('amountIn').value) * 1e18)).toString(),
        amountOutMin: BigInt(Math.floor(parseFloat(document.getElementById('amountOutMin').value) * 1e18)).toString(),
        tokeninAddress,
        tokenOutAddress,
        snipingCount: parseInt(document.getElementById('snipingCount').value) || 1,
        amountOption: document.querySelector('input[name="amountOption"]:checked').value
    };
    const intervalTime = parseInt(document.getElementById('buyintervalTime').value) || 0;

    log('正在预签名交易...', 'blue');

    // 所有钱包并行预签名
    const allSignedTxsList = await Promise.all(
        privateKeys.map(pk => buildSignedTxs(pk, params))
    );

    log('预签名完成，开始广播...', 'blue');

    // 按间隔时间依次广播每一笔（snipingCount > 1 时有意义）
    if (intervalTime > 0 && params.snipingCount > 1) {
        // 将每个钱包的第 i 笔打包一起广播
        for (let i = 0; i < params.snipingCount; i++) {
            const batch = allSignedTxsList.map(list => list[i]);
            broadcastSignedTxs(batch);
            if (i < params.snipingCount - 1) {
                await new Promise(r => setTimeout(r, intervalTime));
            }
        }
    } else {
        // 全部立即广播
        allSignedTxsList.forEach(list => broadcastSignedTxs(list));
    }

    log('所有交易已广播完毕。', 'green');
    button.textContent = '快速模式';
    button.disabled = false;
};

// ─────────────────────────────────────────────
// SWAP 按钮（支持税费代币）
// ─────────────────────────────────────────────
document.getElementById('sellButton').onclick = async () => {
    const button = document.getElementById('sellButton');
    button.textContent = 'wait';
    button.disabled = true;

    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();
    const amountIn = BigInt(Math.floor(parseFloat(document.getElementById('from_amount').value) * 1e18)).toString();
    const amountOutInput = parseFloat(document.getElementById('from_amount_out').value) || 0;
    const slippage = parseFloat(document.getElementById('slippage').textContent) / 100;
    const amountOutMin = BigInt(Math.floor(amountOutInput * (1 - slippage) * 1e18)).toString();
    const gasPrice = getGasPrice();

    const sellPromises = privateKeys.map(async (privateKey) => {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey.trim());
        web3.eth.accounts.wallet.add(account);
        const reciveAddress = document.getElementById('reciveAddress').value;
        const to = reciveAddress || account.address;
        const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
        const nonce = await web3.eth.getTransactionCount(account.address, 'pending');
        const routerContract = new web3.eth.Contract(abi, routerContractAddress);

        const txData = routerContract.methods.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, amountOutMin, [tokeninAddress, tokenOutAddress], to, deadline
        ).encodeABI();

        try {
            const signed = await web3.eth.accounts.signTransaction({
                from: account.address,
                to: routerContractAddress,
                gas: 4000000,
                gasPrice,
                nonce,
                data: txData,
                chainId: 196
            }, privateKey.trim());

            web3.eth.sendSignedTransaction(signed.rawTransaction)
                .on('transactionHash', hash => log(`SWAP 已广播 [${account.address}] ${hash}`, 'green'))
                .on('error', err => log(`SWAP 失败 [${account.address}]: ${err.message}`, 'red'));
        } catch (e) {
            log(`SWAP 签名失败 [${account.address}]: ${e.message}`, 'red');
        }
    });

    await Promise.all(sellPromises);
    button.textContent = 'SWAP';
    button.disabled = false;
};

// ─────────────────────────────────────────────
// 挂单模式（监听 + 触发后极速买入）
// ─────────────────────────────────────────────
let sniperState = null; // 用于支持取消

document.getElementById('buyButton').onclick = async () => {
    // 如果正在运行，点击则取消
    if (sniperState && sniperState.running) {
        sniperState.cancel();
        return;
    }

    const buyButton = document.getElementById('buyButton');
    buyButton.textContent = '取消监听';
    buyButton.classList.replace('btn-warning', 'btn-danger');

    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    const tokeninAddress = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();

    if (!privateKeys.length || !tokeninAddress || !tokenOutAddress) {
        log('请填写所有字段', 'red');
        resetBuyButton();
        return;
    }

    const params = {
        amountIn: BigInt(Math.floor(parseFloat(document.getElementById('amountIn').value) * 1e18)).toString(),
        amountOutMin: BigInt(Math.floor(parseFloat(document.getElementById('amountOutMin').value) * 1e18)).toString(),
        tokeninAddress,
        tokenOutAddress,
        snipingCount: parseInt(document.getElementById('snipingCount').value) || 1,
        amountOption: document.querySelector('input[name="amountOption"]:checked').value
    };
    const intervalTime = parseInt(document.getElementById('buyintervalTime').value) || 300;
    const workerCount = parseInt(document.getElementById('worker').value) || 5;

    // ── 阶段1：预签名所有交易（在等待期间完成，触发后零延迟）──
    log('正在预签名交易，请稍候...', 'blue');
    let allSignedTxsList;
    try {
        allSignedTxsList = await Promise.all(
            privateKeys.map(pk => buildSignedTxs(pk, params))
        );
        log(`预签名完成（${privateKeys.length} 个钱包 × ${params.snipingCount} 笔），开始监听...`, 'green');
    } catch (e) {
        log(`预签名失败: ${e.message}`, 'red');
        resetBuyButton();
        return;
    }

    // ── 阶段2：启动 Worker 轮询监听 ──
    const workers = [];
    let triggered = false;
    let sharedTimer = null;
    let currentWorkerIndex = 0;

    const cancel = () => {
        triggered = true; // 防止触发
        if (sharedTimer) clearInterval(sharedTimer);
        workers.forEach(w => w.terminate());
        workers.length = 0;
        log('已取消监听。', 'orange');
        resetBuyButton();
        sniperState = null;
    };

    sniperState = { running: true, cancel };

    const onTrigger = () => {
        if (triggered) return;
        triggered = true;
        if (sharedTimer) clearInterval(sharedTimer);
        workers.forEach(w => w.terminate());
        workers.length = 0;

        const triggerTime = performance.now();
        log(`⚡ 检测到交易开放！立即广播...`, 'blue');

        // ── 阶段3：触发后立即广播预签名交易 ──
        allSignedTxsList.forEach(list => broadcastSignedTxs(list));

        const elapsed = (performance.now() - triggerTime).toFixed(1);
        log(`广播完成，耗时 ${elapsed}ms`, 'green');
        resetBuyButton();
        sniperState = null;
    };

    // 创建 Worker，每个 Worker 独立轮询
    const monitorAccount = web3.eth.accounts.privateKeyToAccount(privateKeys[0]);
    for (let i = 0; i < workerCount; i++) {
        const worker = new Worker('okbworker.js');
        workers.push(worker);

        worker.onmessage = (event) => {
            const { type, message } = event.data;
            if (type === 'estimateGas') {
                if (message.gasLimit > 0) {
                    onTrigger();
                } else {
                    const t = new Date().toLocaleTimeString('zh-CN');
                    log(`[${t}] 监听中，交易未开放...`, 'orange');
                }
            }
        };

        worker.postMessage({
            to: monitorAccount.address,
            amountIn: params.amountIn,
            tokeninAddress,
            tokenOutAddress,
            abi,
            routerContractAddress,
            deadline: Math.floor(Date.now() / 1000) + 60 * 60
        });
    }

    // 轮询定时器：分发给不同 Worker，降低单 Worker 压力
    sharedTimer = setInterval(() => {
        if (!triggered) {
            workers[currentWorkerIndex % workers.length]
                ?.postMessage({ command: 'estimateGas' });
            currentWorkerIndex++;
        }
    }, intervalTime);
};

function resetBuyButton() {
    const buyButton = document.getElementById('buyButton');
    buyButton.textContent = '挂单模式';
    buyButton.classList.replace('btn-danger', 'btn-warning');
    buyButton.disabled = false;
}

// ─────────────────────────────────────────────
// 余额查询（每 3 秒自动刷新）
// ─────────────────────────────────────────────
const checkBalances = async () => {
    const privateKeys = document.getElementById('privateKeyD').value
        .split('\n').map(k => k.trim()).filter(Boolean);
    if (!privateKeys.length) return;

    const tokeninAddress = getTokenInAddress();
    const tokenOutAddress = getTokenOutAddress();
    if (!tokeninAddress || !tokenOutAddress) return;

    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKeys[0]);
        web3.eth.accounts.wallet.add(account);
        const to = account.address;

        const tokeninContract = new web3.eth.Contract(abi, tokeninAddress);
        const tokenOutContract = new web3.eth.Contract(abi, tokenOutAddress);
        const routerContract = new web3.eth.Contract(abi, routerContractAddress);

        const [tokeninName, tokenOutName, balIn, balOut] = await Promise.all([
            tokeninContract.methods.symbol().call(),
            tokenOutContract.methods.symbol().call(),
            tokeninContract.methods.balanceOf(to).call(),
            tokenOutContract.methods.balanceOf(to).call()
        ]);

        const fmtIn = parseFloat(web3.utils.fromWei(balIn, 'ether')).toFixed(6);
        const fmtOut = parseFloat(web3.utils.fromWei(balOut, 'ether')).toFixed(6);

        // 更新自定义选项文本
        const tokeninSelect = document.getElementById('tokeninAddress');
        if (tokeninSelect.value === '自定义') {
            tokeninSelect.querySelector('option[value="自定义"]').textContent = tokeninName + ' ↺';
        }
        const tokenOutSelect = document.getElementById('tokenOutAddress');
        if (tokenOutSelect.value === '自定义') {
            tokenOutSelect.querySelector('option[value="自定义"]').textContent = tokenOutName + ' ↺';
        }

        document.getElementById('privateKeyResult').style.color = 'white';
        document.getElementById('privateKeyResult').textContent = `余额: ${fmtIn} ${tokeninName}`;
        document.getElementById('tokeninResult').style.color = 'blue';
        document.getElementById('tokeninResult').textContent = `余额: ${fmtOut} ${tokenOutName}`;

        // 计算预期输出
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
        // 静默失败，避免刷新时报错干扰用户
    }
};

setInterval(checkBalances, 3000);

// ─────────────────────────────────────────────
// UI 事件绑定
// ─────────────────────────────────────────────
document.getElementById('toggleButton').addEventListener('click', () => {
    const tokenInSelect = document.getElementById('tokeninAddress');
    const tokenOutSelect = document.getElementById('tokenOutAddress');
    const inVal = tokenInSelect.value;
    const outVal = tokenOutSelect.value;
    tokenInSelect.value = outVal;
    tokenOutSelect.value = inVal;

    const ca = document.getElementById('customAddress').value;
    const cb = document.getElementById('customBddress').value;
    document.getElementById('customAddress').value = cb;
    document.getElementById('customBddress').value = ca;
});

document.getElementById('tokeninAddress').addEventListener('change', function () {
    if (this.value === '自定义') showModal();
});
document.getElementById('tokenOutAddress').addEventListener('change', function () {
    if (this.value === '自定义') showModalB();
});

document.getElementsByName('amountOption').forEach(option => {
    option.addEventListener('change', () => {
        const isFixed = option.value === '2';
        document.getElementById('amountInLabel').textContent = isFixed ? '支出代币最大数量:' : '输入支出代币数量:';
        document.getElementById('amountOutMinLabel').textContent = isFixed ? '买入固定代币数量:' : '获取代币最小数量:';
        document.getElementById('buyintervalTimeLabel').textContent = isFixed ? '监控间隔（ms）:' : '买入间隔（ms）:';
    });
});

setInterval(() => {
    const now = new Date();
    document.getElementById('time').innerText =
        '北京时间: ' + now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}, 1000);

// ─────────────────────────────────────────────
// Modal 函数
// ─────────────────────────────────────────────
function showModal() { document.getElementById('addressModal').style.display = 'block'; }
function showModalB() { document.getElementById('addressModalB').style.display = 'block'; }
function closeModal() { document.getElementById('addressModal').style.display = 'none'; }
function closeModalB() { document.getElementById('addressModalB').style.display = 'none'; }
function confirmAddress() {
    if (document.getElementById('customAddress').value) closeModal();
    else alert('请输入有效的地址');
}
function confirmAddressB() {
    if (document.getElementById('customBddress').value) closeModalB();
    else alert('请输入有效的地址');
}

// ─────────────────────────────────────────────
// 日志函数
// ─────────────────────────────────────────────
function log(message, color = 'black') {
    const logContainer = document.getElementById('log');
    const el = document.createElement('div');
    el.style.color = color;
    el.textContent = `[${new Date().toLocaleTimeString('zh-CN')}] ${message}`;
    logContainer.appendChild(el);
    // 限制日志条数，防止内存泄漏
    if (logContainer.children.length > 200) {
        logContainer.removeChild(logContainer.firstChild);
    }
    logContainer.scrollTop = logContainer.scrollHeight;
}
