            // 监听单选框的变化
            const amountOptions = document.getElementsByName('amountOption');
            const amountInLabel = document.getElementById('amountInLabel');
            const amountOutMinLabel = document.getElementById('amountOutMinLabel');
            const buyintervalTimeLabel = document.getElementById('buyintervalTimeLabel');
            amountOptions.forEach(option => {
                option.addEventListener('change', () => {
                    if (option.value === '2') {
                        // 更改标签文本
                        amountInLabel.textContent = '支出代币最大数量:';
                        amountOutMinLabel.textContent = '买入固定代币数量:';
                        buyintervalTimeLabel.textContent = '监控间隔（ms）:';
                    } else {
                        // 恢复标签文本和默认值
                        amountInLabel.textContent = '输入支出代币数量:';
                        amountOutMinLabel.textContent = '获取代币最小数量:';
                        buyintervalTimeLabel.textContent = '买入间隔（ms）:';
                    }
                });
            });
            
            function showModal() {
                document.getElementById('addressModal').style.display = 'block';
            }

            function showModalB() {
                document.getElementById('addressModalB').style.display = 'block';
            }

            function closeModal() {
                document.getElementById('addressModal').style.display = 'none';
            }

            function closeModalB() {
                document.getElementById('addressModalB').style.display = 'none';
            }

            function confirmAddress() {
                const address = document.getElementById('customAddress').value;
                if (address) {
                    document.getElementById('customAddress').value = address; // 
                    closeModal();
                } else {
                    alert('请输入有效的地址');
                }
            }

            function confirmAddressB() {
                const address = document.getElementById('customBddress').value;
                if (address) {
                    document.getElementById('customBddress').value = address; // 
                    closeModalB();
                } else {
                    alert('请输入有效的地址');
                }
            }

            tokeninAddress.addEventListener('change', function() {
                if (this.value === '自定义') {
                    showModal()
                }
            });

            tokenOutAddress.addEventListener('change', function() {
                if (this.value === '自定义') {
                    showModalB()
                }
            });

            setInterval(() => {
                const now = new Date();
                const beijingTime = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
                document.getElementById("time").innerText = `北京时间: ${beijingTime}`;
            }, 1000);