const web3 = new Web3(Web3.givenProvider || "https://bsc-dataseed1.defibit.io");
const ContractAddress = '0xeeee81a17ec4273b810cb9d08454f25f71c2900a';
const usdtAddress = '0x55d398326f99059ff775485246999027b3197955';
const abi = [
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }
];
const checkBalances = async () => {
    const deadAddress = '0x000000000000000000000000000000000000dead';
    const devAddress = '0x897b5880b8f1c7538f6699c22e785fc9eb8c9a8d';
    const additionalAddress = '0x81ad41414860f08b32e67a589BE4E68d17b622bc';
    const catContract = new web3.eth.Contract(abi, ContractAddress);
    const usdtContract = new web3.eth.Contract(abi, usdtAddress);
    try {
        // Using Promise.all for parallel processing
        const [deadBalance, devBalance, addBalance,addusdtBalance] = await Promise.all([
            catContract.methods.balanceOf(deadAddress).call(),
            catContract.methods.balanceOf(devAddress).call(),
            catContract.methods.balanceOf(additionalAddress).call(),
            usdtContract.methods.balanceOf(additionalAddress).call()
        ]);

        const formattedDeadBalance = parseFloat(web3.utils.fromWei(deadBalance, 'ether')).toFixed(9);
        const formattedDevBalance = parseFloat(web3.utils.fromWei(devBalance, 'ether')).toFixed(9);
        const formattedaddBalance = parseFloat(web3.utils.fromWei(addBalance, 'ether')).toFixed(9);
        const formattedaddusdtBalance = parseFloat(web3.utils.fromWei(addusdtBalance, 'ether')).toFixed(9);
        const catprice = parseFloat(formattedaddusdtBalance/formattedaddBalance).toFixed(2);
        const Deadpercent = parseFloat(formattedDeadBalance/200).toFixed(1);
        const Devpercent = parseFloat(formattedDevBalance/200).toFixed(1);
        const spanElement = document.querySelector('.percent.head-font');
        const spanElement2 = document.querySelector('.percent.head2-font');
        const buttonElement = document.querySelector('.left-btn');
        buttonElement.textContent =`Price 1 cat - $${catprice} `;
        spanElement.textContent = `${Deadpercent} `;
        spanElement2.textContent = `${Devpercent} `;


    } catch (error) {
        console.error('Error fetching balances:', error);
    }
};
   
// 每3秒自动执行一次
setInterval(checkBalances, 3000);