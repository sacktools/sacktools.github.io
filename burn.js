// 初始化 Web3
const web3 = new Web3(Web3.givenProvider || "https://bsc-dataseed1.defibit.io");

// 合约地址
const tokenAAddress = '0x3e1dE025843971f36C136b53208982Dd98487777'; // tokenA 合约地址
const tokenBAddress = '0x0D2A890EeC6B5aC2c20975DeE48FcA912f9bd732'; // tokenB 合约地址
const deadAddress = '0x000000000000000000000000000000000000dEaD'; // 销毁地址

// 定义合约 ABI
const abi = [
  {
    "constant": true,
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "name": "", "type": "uint256" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "earned",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
  "inputs": [
    {
      "internalType": "uint256",
      "name": "amount",
      "type": "uint256"
    }
  ],
  "name": "burnTokens",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": true,
  "inputs": [
    {
      "internalType": "address",
      "name": "owner",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "spender",
      "type": "address"
    }
  ],
  "name": "allowance",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "address",
      "name": "spender",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "amount",
      "type": "uint256"
    }
  ],
  "name": "approve",
  "outputs": [
    {
      "internalType": "bool",
      "name": "",
      "type": "bool"
    }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
}


];

// 获取代币数据的函数
async function getTokenData() {
  const tokenAContract = new web3.eth.Contract(abi, tokenAAddress); // tokenA 合约实例
  const tokenBContract = new web3.eth.Contract(abi, tokenBAddress); // tokenB 合约实例

  try {
    // 获取 tokenA 的销毁余额
    const balanceA = await tokenAContract.methods.balanceOf(deadAddress).call();
    const formattedBalanceA = parseFloat(web3.utils.fromWei(balanceA, 'ether')).toFixed(2);
    document.getElementById('burned-tokens').textContent = formattedBalanceA; // 更新 tokenA 的销毁数量

    // 获取 tokenB 的总供应量
    const totalSupplyB = await tokenBContract.methods.totalSupply().call();
    const formattedTotalSupplyB = parseFloat(web3.utils.fromWei(totalSupplyB, 'ether')).toFixed(2);
    document.getElementById('burnsed-tokens').textContent = formattedTotalSupplyB; // 更新 tokenB 的总供应量
  } catch (error) {
    console.error('获取代币数据失败:', error);
    document.getElementById('burned-tokens').textContent = '获取失败';
    document.getElementById('burnsed-tokens').textContent = '获取失败';
  }
}

// 页面加载时立即调用
getTokenData();

// 连接钱包的事件监听器
document.getElementById('connect-wallet').addEventListener('click', async () => {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];
      const lastFourDigits = walletAddress.slice(-4);
      document.getElementById('connect-wallet').textContent = `...${lastFourDigits}`; // 显示后四位

      const tokenAContract = new web3.eth.Contract(abi, tokenAAddress); // 获取合约实例
      const tokenBContract = new web3.eth.Contract(abi, tokenBAddress); // 获取合约实例

      // 获取用户的 tokenA 和 tokenB 余额
      const userBalance = await tokenAContract.methods.balanceOf(walletAddress).call();
      const userburn = await tokenBContract.methods.balanceOf(walletAddress).call();
      const formattedUserBalance = parseFloat(web3.utils.fromWei(userBalance, 'ether')).toFixed(2);
      const formattedUserburn = parseFloat(web3.utils.fromWei(userburn, 'ether')).toFixed(2);
      document.getElementById('user-balance').textContent = `您的余额: ${formattedUserBalance} calorie`; // 更新用户的 tokenA 余额
      document.getElementById('user-burns').textContent = ` ${formattedUserburn}`; // 更新用户的 tokenB 余额

      // 获取 burn-button 按钮
      const burnButton = document.getElementById('burn-button');

      // 根据 userburn 值更新 burn-button 状态
      if (parseFloat(formattedUserburn) < 10000) {
        burnButton.disabled = false; // 启用按钮
        burnButton.classList.remove('disabled:pointer-events-none', 'disabled:opacity-50');
        burnButton.classList.add('hover:bg-primary/90');
      } else {
        burnButton.disabled = true; // 禁用按钮
        burnButton.classList.add('disabled:pointer-events-none', 'disabled:opacity-50');
        burnButton.classList.remove('hover:bg-primary/90');
      }

      // 获取 tokenB 的总供应量
      const totalSupplyB = await tokenBContract.methods.totalSupply().call();
      const formattedTotalSupplyB = parseFloat(web3.utils.fromWei(totalSupplyB, 'ether')).toFixed(2);

      // 计算 user-burns 占 totalSupplyB 的百分比
      const userBurnPercent = ((formattedUserburn / formattedTotalSupplyB) * 100).toFixed(2);
      document.getElementById('user-percent').textContent = ` ${userBurnPercent}%`; // 显示百分比

      // 调用 earned 函数并显示结果
      const upkeepData = await tokenBContract.methods.earned(walletAddress).call(); // 传递用户地址作为参数
      const upkeepValue = upkeepData; // 假设 earned 返回的是 uint256 值

      // 将 upkeepValue 转换为以太单位并格式化
      const formattedUpkeepValue = parseFloat(web3.utils.fromWei(upkeepValue, 'ether')).toFixed(6);
      document.getElementById('user-claim').textContent = ` ${formattedUpkeepValue}     BNB`; // 更新用户的 claim 信息

      // 根据 user-claim 值更新 claim-button 状态
      const claimButton = document.getElementById('claim-button');
      if (parseFloat(formattedUpkeepValue) > 0) {
        claimButton.classList.remove('bg-primary', 'hover:bg-primary/90');
        claimButton.classList.add('bg-green-500', 'hover:bg-green-600'); // 设置为绿色
        claimButton.disabled = false; // 使按钮可点击
      } else {
        claimButton.classList.add('bg-primary', 'hover:bg-primary/90');
        claimButton.classList.remove('bg-green-500', 'hover:bg-green-600'); // 恢复原样
        claimButton.disabled = true; // 禁用按钮
      }

    } catch (error) {
      console.error('用户拒绝了连接请求或发生错误:', error);
    }
  } else {
    alert('请安装MetaMask钱包');
  }
});



// claim-button 的单击事件监听器
document.getElementById('claim-button').addEventListener('click', async () => {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      const tokenBContract = new web3.eth.Contract(abi, tokenBAddress); // 获取 tokenB 合约实例

      // 调用 claim 函数
      const transaction = await tokenBContract.methods.claim().send({ from: walletAddress });

      console.log('Claim 成功:', transaction);
      alert('Claim 成功！您的奖励已领取。');
    } catch (error) {
      console.error('Claim 失败:', error);
      alert('Claim 失败，请重试或检查您的钱包连接。');
    }
  } else {
    alert('请安装 MetaMask 钱包');
  }
});

// burn-button 的单击事件监听器
document.getElementById('burn-button').addEventListener('click', async () => {
  if (typeof window.ethereum !== 'undefined') {
    try {
      // 获取用户钱包地址
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      // 获取用户输入的燃烧数量
      const burnInput = document.getElementById('burn-input'); // 假设有一个输入框用于输入燃烧数量
      const burnAmount = parseFloat(burnInput.value);

      if (isNaN(burnAmount) || burnAmount <= 0) {
        alert('请输入有效的燃烧数量');
        return;
      }

      // 转换燃烧数量为最小单位（如 wei）
      const burnAmountInWei = web3.utils.toWei(burnAmount.toString(), 'ether');

      // 获取 tokenA 和 tokenB 合约实例
      const tokenAContract = new web3.eth.Contract(abi, tokenAAddress); // tokenA 合约
      const tokenBContract = new web3.eth.Contract(abi, tokenBAddress); // tokenB 合约

      // 检查授权额度
      const allowance = await tokenAContract.methods.allowance(walletAddress, tokenBAddress).call();

      // 如果授权额度不足，先进行授权
      if (parseFloat(allowance) < parseFloat(burnAmountInWei)) {
        console.log('授权不足，正在授权...');
        await tokenAContract.methods.approve(tokenBAddress, burnAmountInWei).send({ from: walletAddress });
        console.log('授权成功！');
      }

      // 调用 tokenB 合约的 burnTokens 方法
      const transaction = await tokenBContract.methods.burnTokens(burnAmountInWei).send({ from: walletAddress });

      console.log('燃烧成功:', transaction);
      alert(`燃烧成功！您已燃烧 ${burnAmount} 个 tokenA 代币。`);

      // 更新用户余额和其他相关数据
      getTokenData(); // 重新获取代币数据并更新页面
    } catch (error) {
      console.error('燃烧失败:', error);
      alert('燃烧失败，请重试或检查您的钱包连接。');
    }
  } else {
    alert('请安装 MetaMask 钱包');
  }
});


