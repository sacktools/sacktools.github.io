            const dropContractAddress = '0x7a36F493D53002e092a96036cD02e755553bd3Fb';
            const aabi = [
                {
                    "inputs": [
                        {
                            "internalType": "address",
                            "name": "tokenContract",
                            "type": "address"
                        },
                        {
                            "internalType": "uint256",
                            "name": "amount",
                            "type": "uint256"
                        },
                        {
                            "internalType": "uint256",
                            "name": "numRecipients",
                            "type": "uint256"
                        }
                    ],
                    "name": "airdrop",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [
                        { "internalType": "address", "name": "account", "type": "address" }
                    ],
                    "name": "balanceOf",
                    "outputs": [
                        { "internalType": "uint256", "name": "", "type": "uint256" }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "constant": true,
                    "inputs": [],
                    "name": "symbol",
                    "outputs": [
                        { "internalType": "string", "name": "", "type": "string" }
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

            document.getElementById('chaButton').onclick = async () => {
                const Key = document.getElementById('Key').value;
                const tokenAddress = document.getElementById('tokenAddress').value;

                if (!Key || !tokenAddress) {
                    loga('请填写钱包私钥和代币合约地址', 'red');
                    return;
                }

                const account = web3.eth.accounts.privateKeyToAccount(Key);
                web3.eth.accounts.wallet.add(account);
                const to = account.address;
                const tokenAddressContract = new web3.eth.Contract(aabi, tokenAddress);

                try {
                    const [tokeninName, balancetokenin] = await Promise.all([
                        tokenAddressContract.methods.symbol().call(),
                        tokenAddressContract.methods.balanceOf(to).call(),
                    ]);
                    const formattedtokeninBalance = web3.utils.fromWei(balancetokenin, 'ether'); // 转换为可读格式
                    document.getElementById('KeyResult').style.color = 'darkgreen'; // 恢复可见
                    document.getElementById('KeyResult').textContent = tokeninName + '余额: ' + formattedtokeninBalance;
                } catch (error) {
                    loga('查询失败: ' + error.message, 'red');
                }
            };

            document.getElementById('dropButton').onclick = async () => {
                const Key = document.getElementById('Key').value;
                const dropamount = document.getElementById('dropamount').value * 1e18; // 转换为 Wei
                const dropCount = document.getElementById('dropCount').value;

                if (!Key || !dropamount || !dropCount) {
                    loga('请填写钱包私钥、空投代币数量和空投地址数量', 'red');
                    return;
                }

                const amount = dropamount * dropCount;
                const account = web3.eth.accounts.privateKeyToAccount(Key);
                web3.eth.accounts.wallet.add(account);
                loga('已成功加载私钥，现在执行代币授权...', 'red');
                const tokenAddress = document.getElementById('tokenAddress').value;
                const tokenContract = new web3.eth.Contract(aabi, tokenAddress);

                try {
                    // 授权
                    await tokenContract.methods.approve(dropContractAddress, amount).send({ from: account.address });
                    loga('代币授权成功, 执行随机空投...', 'green');

                    // 调用 airdrop 函数
                    const airdropContract = new web3.eth.Contract(aabi, dropContractAddress);
                    const airdropTx = await airdropContract.methods.airdrop(tokenAddress, dropamount, dropCount).send({ from: account.address });
                    loga('空投 ' + dropCount + '个随机地址成功，空投哈希: ' + airdropTx.transactionHash, 'green');
                } catch (error) {
                    loga('空投失败: ' + error.message, 'red');
                }
            };

          function loga(message, color = 'black', fontSize = '12px') {
              const logDiv = document.getElementById('droplog');
              const logEntry = document.createElement('span');
              logEntry.textContent = message + '\n';
              logEntry.style.color = color;
              logEntry.style.fontSize = fontSize;
              logDiv.appendChild(logEntry);
              logDiv.scrollTop = logDiv.scrollHeight; // 滚动到最后一行
          }