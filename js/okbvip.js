/**
 * okbworker.js - 监听 Worker
 * 职责：接收初始化参数后，响应主线程的 estimateGas 命令，
 * 检测目标代币是否可以买入，并将结果 postMessage 回主线程。
 */

importScripts('https://cdn.jsdelivr.net/npm/web3/dist/web3.min.js');

let web3;
let routerContract;
let path;
let to;
let amountIn;
let deadline;
let initialized = false;

/**
 * 阶段1：接收初始化消息
 * 主线程第一条消息必须是初始化数据包
 */
self.onmessage = function (e) {
    if (!initialized) {
        const data = e.data;
        to            = data.to;
        amountIn      = data.amountIn;
        deadline      = data.deadline;
        path          = [data.tokeninAddress, data.tokenOutAddress];

        web3           = new Web3('https://xlayerrpc.okx.com');
        routerContract = new web3.eth.Contract(data.abi, data.routerContractAddress);

        initialized = true;

        // 初始化完成后切换到命令处理阶段
        self.onmessage = handleCommand;
        return;
    }
    // 兜底：初始化后如果还走到这里，也转发给命令处理
    handleCommand(e);
};

/**
 * 阶段2：命令处理
 * 主线程发送 { command: 'estimateGas' } 触发一次检测
 */
function handleCommand(e) {
    const { command } = e.data;
    if (command === 'estimateGas') {
        checkCanBuy();
    }
}

/**
 * 核心检测：尝试 estimateGas，成功则代币可买入
 * 超时 5 秒视为失败，避免 Worker 卡死
 */
async function checkCanBuy() {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
    );

    try {
        const gasLimit = await Promise.race([
            routerContract.methods
                .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    amountIn,
                    0,
                    path,
                    to,
                    deadline
                )
                .estimateGas({ from: to }),
            timeoutPromise
        ]);

        // gasLimit 是 BigInt（web3 v4+）或 Number（web3 v1），统一转 Number
        const gasNum = Number(gasLimit);
        postMessage({ type: 'estimateGas', message: { gasLimit: gasNum } });

    } catch (error) {
        // revert 或 timeout 均视为不可买入
        postMessage({ type: 'estimateGas', message: { gasLimit: 0 } });
    }
}
