const {ethers}= require('hardhat')

async function main() {
    const zkPaymentAddress = "0x6a38Ec619c37A04aF3F16354C4e40b64534cE2b6"
    const zkPayment = await ethers.getContractAt("ZkPayment", zkPaymentAddress);
    const filter = {
        address: zkPayment.address,
        topics: [
            "0xdd5c7c5ea02d3c5d1621513faa6de53d474ee6f111eda6352a63e3dfe8c40119"
        ],
        fromBlock: 17368830,
    }
    zkPayment.queryFilter(filter, filter.fromBlock).then(events => {
        events.forEach(event => {
            console.log(`Received event: ${event.data}`);
        })
    })
}

main().then