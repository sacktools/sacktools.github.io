importScripts('https://cdn.jsdelivr.net/npm/web3/dist/web3.min.js');

self.onmessage = async function (e) {
    const {
        to,
        amountIn,
        tokeninAddress,
        tokenOutAddress,
        abi,
        routerContractAddress,
        deadline,
    } = e.data;

    const web3 = new Web3(Web3.givenProvider || "https://bsc-dataseed1.defibit.io");
    const routerContract = new web3.eth.Contract(abi, routerContractAddress);
    const path = [tokeninAddress, tokenOutAddress];

    self.onmessage = async (e) => {
        const { command } = e.data;
        if (command === 'estimateGas') {
            try {
                const gasLimit = await routerContract.methods.swapExactTokensForTokens(
                    amountIn,
                    0,
                    path,
                    to,
                    deadline
                ).estimateGas({ from: to });

                // 返回有效的 gas limit
                postMessage({ type: 'estimateGas', message: { gasLimit } });
            } catch (error) {
                postMessage({ type: 'estimateGas', message: { gasLimit: 0 } });
            }
        }
    };
};
