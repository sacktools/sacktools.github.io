importScripts('https://cdn.jsdelivr.net/npm/ethers@5.6.0/dist/ethers.umd.min.js');

self.onmessage = function(event) {
    const { prefix, suffix, maxAttempts } = event.data;
    let attemptCount = 0;
    let found = false;

    while (attemptCount < maxAttempts) {
        const privateKey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const wallet = new ethers.Wallet(privateKey);
        const walletAddress = wallet.address.toLowerCase();

        // 检查地址是否符合前缀和后缀
        if (walletAddress.startsWith('0x' + prefix) && walletAddress.endsWith(suffix)) {
            found = true;
            self.postMessage({ type: 'result', data: { privateKey, walletAddress, attemptCount } });
            break;
        }

        attemptCount++;

        // 每5000次尝试更新进度
        if (attemptCount % 5000 === 0) {
            self.postMessage({ type: 'progress', data: { attemptCount, maxAttempts } });
        }
    }

    if (!found) {
        self.postMessage({ type: 'error', data: { message: "未能在最大尝试次数内生成符合条件的钱包地址。" } });
    }
};
