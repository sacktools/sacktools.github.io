importScripts('https://cdn.jsdelivr.net/npm/web3/dist/web3.min.js');

self.onmessage = async function (e) {
    const {
        to,
        amountIn,
        tokeninAddress,
        tokenOutAddress,
        abi,
        routerContractAddress,
    } = e.data;

    const web3 = new Web3(Web3.givenProvider || "https://bsc-dataseed1.defibit.io");
    const routerContract = new web3.eth.Contract(abi, routerContractAddress);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const path = [tokeninAddress, tokenOutAddress];
    let failureCount = 0;

    const gasEstimateInterval = setInterval(async () => {
        try {
            const gasLimit = await routerContract.methods.swapExactTokensForTokens(
                amountIn,
                0,
                path,
                to,
                deadline
            ).estimateGas({ from: to });

            if (gasLimit) {
                clearInterval(gasEstimateInterval); // 只需清除一次
                postMessage({ type: 'estimateGas', message: { gasLimit } });
                
            }
        } catch (error) {
            postMessage({ type: 'log', message: { text: '交易未开启，进行第 ' + failureCount + ' 次检查', color: 'blue' } });
            postMessage({ type: 'estimateGas', message: { gasLimit: 0 } }); // 返回无效 gasLimit
            failureCount++;
        }
    }, 3000);

};
