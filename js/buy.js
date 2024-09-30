const web3 = new Web3(Web3.givenProvider || "https://bsc-dataseed1.defibit.io");
const routerContractAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
let tokeninAddress;
let tokenOutAddress;
const abi = [
    { "inputs": [{ "internalType": "uint256", "name": "amountIn", "type": "uint256" }, { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "swapExactTokensForTokens", "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }], "stateMutability": "nonpayable", "type": "function" },

    { "inputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }, { "internalType": "uint256", "name": "amountInMax", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "swapTokensForExactTokens", "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }], "stateMutability": "nonpayable", "type": "function" }, { "stateMutability": "payable", "type": "receive" },
    {
        "inputs": [
            { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
            { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
            { "internalType": "address[]", "name": "path", "type": "address[]" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "deadline", "type": "uint256" }
        ],
        "name": "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },

    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },

    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },

    {
        "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

document.getElementById('approveButton').onclick = async () => {
    const privateKey = document.getElementById('privateKey').value;
    const amountIn = 100000000000000000000000000000 * 1e18;
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);

    // 获取 tokeninAddress
    const customAddress = document.getElementById('customAddress');
    if (document.getElementById('tokeninAddress').value === '自定义') {
        tokeninAddress = customAddress.value; // 使用自定义地址
    } else {
        tokeninAddress = document.getElementById('tokeninAddress').value; // 使用选择的地址
    }

    const tokenContract = new web3.eth.Contract(abi, tokeninAddress);
    try {
        const approval = await tokenContract.methods.approve(routerContractAddress, amountIn).send({ from: account.address });
        log('代币授权成功', 'red');
    } catch (error) {
        log('代币授权失败: ' + error.message);
    }
};


document.getElementById('immediateBuyButton').onclick = async () => {
    const button = document.getElementById('immediateBuyButton');
    button.textContent = '执行中';
    button.disabled = true; // 禁用按钮
    const privateKey = document.getElementById('privateKey').value;
    const amountIn = document.getElementById('amountIn').value * 1e18;
    const snipingCount = document.getElementById('snipingCount').value;
    const intervalTime = document.getElementById('buyintervalTime').value;
    const amountOutMin = document.getElementById('amountOutMin').value * 1e18;
    const customAddress = document.getElementById('customAddress');
    if (document.getElementById('tokeninAddress').value === '自定义') {
        tokeninAddress = customAddress.value; // 使用自定义地址
    } else {
        tokeninAddress = document.getElementById('tokeninAddress').value; // 使用选择的地址
    }

    const customBddress = document.getElementById('customBddress');
    if (document.getElementById('tokenOutAddress').value === '自定义') {
        tokenOutAddress = customBddress.value; // 使用自定义地址
    } else {
        tokenOutAddress = document.getElementById('tokenOutAddress').value; // 使用选择的地址
    }
    if (!privateKey || !amountIn || !tokenOutAddress) {
        log('请填写所有字段');
        button.disabled = false; // 重新启用按钮
        return;
    }

    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    const routerContract = new web3.eth.Contract(abi, routerContractAddress);
    const reciveAddress = document.getElementById('reciveAddress').value;
    const to = reciveAddress ? reciveAddress : account.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const path = [tokeninAddress, tokenOutAddress];
    const gasMultiplier = document.getElementById('gasMultiplier').value;
    const gasPrice = web3.utils.toWei('1.1', 'gwei'); // 直接赋值为 1.1 Gwei
    const increasedGasPrice = (BigInt(gasPrice) * BigInt(gasMultiplier)).toString();
    let successfulSnipes = 0;
    // 获取初始 nonce
    let nonce = await web3.eth.getTransactionCount(account.address);
    // 检查选择框的值
    const amountOption = document.querySelector('input[name="amountOption"]:checked').value;
    // 使用循环来控制发送交易的频率
    while (successfulSnipes < snipingCount) {
        try {
            if (amountOption === '1') {
                // 执行 swapExactTokensForTokens
                routerContract.methods.swapExactTokensForTokens(
                    amountIn,
                    amountOutMin,
                    path,
                    to,
                    deadline
                ).send({
                    from: account.address,
                    gas: 4000000, // 使用估算的 gas limit
                    gasPrice: increasedGasPrice,
                    nonce: nonce++ // 使用当前 nonce 并自增
                });
            } else if (amountOption === '2') {
                // 执行 swapTokensForExactTokens
                routerContract.methods.swapTokensForExactTokens(
                    amountOutMin,
                    amountIn,
                    path,
                    to,
                    deadline
                ).send({
                    from: account.address,
                    gas: 4000000, // 使用估算的 gas limit
                    gasPrice: increasedGasPrice,
                    nonce: nonce++ // 使用当前 nonce 并自增
                });
            }
            successfulSnipes++;
            log('发送第 ' + successfulSnipes + ' 笔成功', 'green');
        } catch (error) {
            log('交易失败: ' + error.message);
        }
        await new Promise(resolve => setTimeout(resolve, intervalTime));
    }
    log('恭喜您：已完成所有交易发送。', 'red');
    button.textContent = '快速模式';
    button.disabled = false; // 重新启用按钮
};

document.getElementById('sellButton').onclick = async () => {
    const button = document.getElementById('sellButton');
    button.textContent = 'wait';
    button.disabled = true; // 禁用按钮
    const privateKey = document.getElementById('privateKey').value;
    const amountIn = document.getElementById('amountIn').value * 1e18;
    const snipingCount = document.getElementById('snipingCount').value;
    const intervalTime = document.getElementById('buyintervalTime').value;
    const amountOutMin = document.getElementById('amountOutMin').value * 1e18;
    const customAddress = document.getElementById('customAddress');
    if (document.getElementById('tokeninAddress').value === '自定义') {
        tokeninAddress = customAddress.value; // 使用自定义地址
    } else {
        tokeninAddress = document.getElementById('tokeninAddress').value; // 使用选择的地址
    }

    const customBddress = document.getElementById('customBddress');
    if (document.getElementById('tokenOutAddress').value === '自定义') {
        tokenOutAddress = customBddress.value; // 使用自定义地址
    } else {
        tokenOutAddress = document.getElementById('tokenOutAddress').value; // 使用选择的地址
    }
    if (!privateKey || !amountIn || !tokenOutAddress) {
        log('请填写所有字段');
        button.disabled = false; // 重新启用按钮
        return;
    }

    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    const routerContract = new web3.eth.Contract(abi, routerContractAddress);
    const reciveAddress = document.getElementById('reciveAddress').value;
    const to = reciveAddress ? reciveAddress : account.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const path = [tokeninAddress, tokenOutAddress];
    const gasMultiplier = document.getElementById('gasMultiplier').value;
    const gasPrice = web3.utils.toWei('1.1', 'gwei'); // 直接赋值为 1.1 Gwei
    const increasedGasPrice = (BigInt(gasPrice) * BigInt(gasMultiplier)).toString();
    let successfulSnipes = 0;
    // 获取初始 nonce
    let nonce = await web3.eth.getTransactionCount(account.address);
    // 检查选择框的值
    const amountOption = document.querySelector('input[name="amountOption"]:checked').value;
    // 使用循环来控制发送交易的频率
    while (successfulSnipes < snipingCount) {
        try {
            if (amountOption === '1') {
                // 执行 swapExactTokensForTokens
                routerContract.methods.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    amountIn,
                    amountOutMin,
                    path,
                    to,
                    deadline
                ).send({
                    from: account.address,
                    gas: 4000000, // 使用估算的 gas limit
                    gasPrice: increasedGasPrice,
                    nonce: nonce++ // 使用当前 nonce 并自增
                });
            } else if (amountOption === '2') {
                log('暂不支持 ');
            }
            successfulSnipes++;
            log('发送第 ' + successfulSnipes + ' 笔成功', 'green');
        } catch (error) {
            log('交易失败: ' + error.message);
        }
        await new Promise(resolve => setTimeout(resolve, intervalTime));
    }
    alert('恭喜您，购买成功！');
    button.textContent = 'SWAP';
    button.disabled = false; // 重新启用按钮
};

document.getElementById('buyButton').onclick = async () => {
    const buyButton = document.getElementById('buyButton');
    buyButton.textContent = '执行中';
    buyButton.disabled = true; // 禁用按钮以防重复点击

    const privateKey = document.getElementById('privateKey').value;
    const amountIn = document.getElementById('amountIn').value * 1e18;
    const customAddress = document.getElementById('customAddress');
    if (document.getElementById('tokeninAddress').value === '自定义') {
        tokeninAddress = customAddress.value; // 使用自定义地址
    } else {
        tokeninAddress = document.getElementById('tokeninAddress').value; // 使用选择的地址
    }

    const customBddress = document.getElementById('customBddress');
    if (document.getElementById('tokenOutAddress').value === '自定义') {
        tokenOutAddress = customBddress.value; // 使用自定义地址
    } else {
        tokenOutAddress = document.getElementById('tokenOutAddress').value; // 使用选择的地址
    }
    const intervalTimes = document.getElementById('intervalTime').value;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    if (!privateKey || !amountIn || !tokenOutAddress) {
        log('请填写所有字段');
        return;
    }

    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    log('已成功加载私钥钱包...', 'red');

    const workers = [];
    const workerCount = document.getElementById('worker').value;
    let currentWorkerIndex = 0;
    let gasLimitFound = false;

    // 创建多个 Worker
    for (let i = 0; i < workerCount; i++) {
        const worker = new Worker('worker.js');
        workers.push(worker);
        worker.onmessage = async (event) => {
            const { type, message } = event.data;
            if (type === 'estimateGas') {
                if (message.gasLimit > 0) {
                    gasLimitFound = true; // 找到有效的 gas limit
                    log(`检测到交易已开启...`, 'blue');
                    await executeTrades(account, amountIn, tokeninAddress, tokenOutAddress, abi, routerContractAddress);
                    clearAllWorkers()
                    // 停止发送命令
                    clearInterval(sharedTimer);
                    buyButton.textContent = '挂单模式';
                    buyButton.disabled = false; // 启用按钮

                } else if (message.gasLimit === 0) {
                    const currentTime = new Date().toLocaleString(); // 获取当前时间
                    log(` ${currentTime}，交易未开启.....`, 'orange'); // 打印当前时间
                }
            } else if (type === 'log') {
                log(message.text, message.color);
            }
        };

        // 向 Worker 发送请求
        worker.postMessage({
            to: account.address,
            amountIn,
            tokeninAddress,
            tokenOutAddress,
            abi,
            routerContractAddress,
            deadline
        });
    }

    // 启动共享计时器
    const sharedTimer = setInterval(() => {
        if (!gasLimitFound) {
            workers[currentWorkerIndex].postMessage({ command: 'estimateGas' });
            currentWorkerIndex = (currentWorkerIndex + 1) % workerCount; // 循环
        }
    }, intervalTimes); // 每0.3秒执行一次
};
async function clearAllWorkers() {
    workers.forEach(worker => {
        worker.terminate();
    });
}
// 执行交易的函数
async function executeTrades(account, amountIn, tokeninAddress, tokenOutAddress, abi, routerContractAddress) {
    const routerContract = new web3.eth.Contract(abi, routerContractAddress);
    const reciveAddress = document.getElementById('reciveAddress').value;
    const to = reciveAddress ? reciveAddress : account.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const gasMultiplier = document.getElementById('gasMultiplier').value;
    const gasPrice = web3.utils.toWei('1.1', 'gwei'); // 直接赋值为 1.1 Gwei
    const increasedGasPrice = (BigInt(gasPrice) * BigInt(gasMultiplier)).toString();
    const amountOutMin = document.getElementById('amountOutMin').value * 1e18;
    const snipingCount = document.getElementById('snipingCount').value;
    const intervalTime = document.getElementById('buyintervalTime').value; // 购买间隔时间
    let successfulSnipes = 0;
    let nonce = await web3.eth.getTransactionCount(account.address);

    // 检查选择框的值
    const amountOption = document.querySelector('input[name="amountOption"]:checked').value;

    // 使用循环来控制发送交易的频率
    while (successfulSnipes < snipingCount) {
        try {
            const txOptions = {
                from: account.address,
                gas: 4000000, // 使用返回的 gas limit
                gasPrice: increasedGasPrice,
                nonce: nonce++ // 使用当前 nonce 并自增
            };

            // 根据选择的交易类型执行相应的交易
            if (amountOption === '1') {
                routerContract.methods.swapExactTokensForTokens(
                    amountIn,
                    amountOutMin,
                    [tokeninAddress, tokenOutAddress],
                    to,
                    deadline
                ).send(txOptions);
            } else if (amountOption === '2') {
                routerContract.methods.swapTokensForExactTokens(
                    amountOutMin,
                    amountIn,
                    [tokeninAddress, tokenOutAddress],
                    to,
                    deadline
                ).send(txOptions);
            }

            successfulSnipes++;
            log('发送第 ' + successfulSnipes + ' 笔交易成功', 'green');

            // 等待指定的间隔时间
            await new Promise(resolve => setTimeout(resolve, intervalTime));
        } catch (error) {
            log('交易失败: ' + error.message);
        }
    }
}
const checkBalances = async () => {
    const privateKey = document.getElementById('privateKey').value;
    const customAddress = document.getElementById('customAddress');
    if (document.getElementById('tokeninAddress').value === '自定义') {
        tokeninAddress = customAddress.value; // 使用自定义地址
    } else {
        tokeninAddress = document.getElementById('tokeninAddress').value; // 使用选择的地址
    }

    const customBddress = document.getElementById('customBddress');
    if (document.getElementById('tokenOutAddress').value === '自定义') {
        tokenOutAddress = customBddress.value; // 使用自定义地址
    } else {
        tokenOutAddress = document.getElementById('tokenOutAddress').value; // 使用选择的地址
    }

    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(account);
    const to = account.address;
    const tokeninAddressContract = new web3.eth.Contract(abi, tokeninAddress);
    const tokenOutAddressContract = new web3.eth.Contract(abi, tokenOutAddress);

    try {
        // 使用 Promise.all 并行处理
        const [tokeninName, tokenOutName, balancetokenin, balancetokenOut] = await Promise.all([
            tokeninAddressContract.methods.symbol().call(),
            tokenOutAddressContract.methods.symbol().call(),
            tokeninAddressContract.methods.balanceOf(to).call(),
            tokenOutAddressContract.methods.balanceOf(to).call()
        ]);

        const formattedtokeninBalance = parseFloat(web3.utils.fromWei(balancetokenin, 'ether')).toFixed(9);
        const formattedtokenOutBalance = parseFloat(web3.utils.fromWei(balancetokenOut, 'ether')).toFixed(9);

        // 更新 tokeninAddress 下拉选项
        const tokeninSelect = document.getElementById('tokeninAddress');
        const customTokeninOption = tokeninSelect.querySelector('option[value="自定义"]');
        
        if (tokeninSelect.value === '自定义' && customTokeninOption) {
            customTokeninOption.textContent = tokeninName + '‌ ↺ '; // 将文本更改为 tokeninName
        }

        // 更新 tokenOutAddress 下拉选项
        const tokenOutSelect = document.getElementById('tokenOutAddress');
        const customTokenOutOption = tokenOutSelect.querySelector('option[value="自定义"]');
        
        if (tokenOutSelect.value === '自定义' && customTokenOutOption) {
            customTokenOutOption.textContent = tokenOutName + '‌ ↺ '; // 将文本更改为 tokenOutName
        }

        document.getElementById('privateKeyResult').style.color = 'white'; // 恢复可见
        document.getElementById('privateKeyResult').textContent =  '余额: ' + formattedtokeninBalance;
        document.getElementById('tokeninResult').style.color = 'blue'; // 恢复可见
        document.getElementById('tokeninResult').textContent =  '余额: ' + formattedtokenOutBalance;
    } catch (error) {
        console.error(error); // 打印错误信息
    }
};

// 每3秒自动执行一次
setInterval(checkBalances, 3000);
function log(message, color = 'black', fontSize = '12px') {
    const logDiv = document.getElementById('log');

    // 创建一个新的 span 元素来设置颜色和字体大小
    const logEntry = document.createElement('span');
    logEntry.textContent = message + '\n'; // 设置日志内容
    logEntry.style.color = color; // 设置文本颜色
    logEntry.style.fontSize = fontSize; // 设置字体大小

    logDiv.appendChild(logEntry); // 将新元素添加到日志容器中
    logDiv.scrollTop = logDiv.scrollHeight; // 滚动到最后一行
}
