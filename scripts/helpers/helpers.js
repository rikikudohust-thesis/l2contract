const { expect } = require("chai");
const { ethers } = require("hardhat");
const Scalar = require("ffjavascript").Scalar;
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const { float40, txUtils, utils } = require("@hermeznetwork/commonjs");
const { BigNumber } = require("ethers");
const nLevels = 32;
const { stringifyBigInts, unstringifyBigInts } = require("ffjavascript").utils;

const L1_USER_BYTES = 78; // 20 ehtaddr, 32 babyjub, 4 token, 2 amountF, 2 loadAmountf, 6 fromIDx, 6 toidx

const babyjub0 = 0;
const fromIdx0 = 0;
const loadAmountF0 = 0;
const amountF0 = 0;
const tokenID0 = 0;
const toIdx0 = 0;
const emptyPermit = "0x";
let ABIbid = [
  "function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
];

let iface = new ethers.utils.Interface(ABIbid);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Forger {
  constructor(maxTx, maxL1Tx, nLevels, zkpayment, rollupDB, verifier) {
    this.maxTx = maxTx;
    this.maxL1Tx = maxL1Tx;
    this.nLevels = nLevels;
    this.zkpayment = zkpayment;
    this.rollupDB = rollupDB;
    this.verifier = verifier;

    this.l1TxB = 544;
    }

  async forgeBatch(l1Batch, l1TxUserArray, l1TxCoordinatorArray, l2TxArray, log) {
    const bb = await this.rollupDB.buildBatch(
      this.maxTx,
      this.nLevels,
      this.maxL1Tx
    );

    let jsL1TxData = ""
    for (let tx of l1TxUserArray) {
      bb.addTx(txUtils.decodeL1TxFull(tx));
      jsL1TxData = jsL1TxData + tx.slice(2);
    }

    const currentQueue = await this.zkpayment.nextL1FillingQueue();
    const SCL1TxData = await this.zkpayment.mapL1TxQueue(currentQueue);

    expect(SCL1TxData).to.equal(`0x${jsL1TxData}`);
    if (l1TxCoordinatorArray) {
      for (let tx of l1TxCoordinatorArray) {
        bb.addTx(txUtils.decodeL1TxFull(tx.l1TxBytes));
      }
    }

    if (l2TxArray) {
      for (let tx of l2TxArray) {
        bb.addTx(tx);
      }
    }

    await bb.build();
    // const data = await bb.getInput() 
    // fs.writeFile('input.json', JSON.stringify(data), (err) => {
    //   console.error(err)
    // })
    // console.log(await bb.getInput())
  }
}

async function calculateInputMaxTxLevels(maxTxArray, nLevelsArray) {
  let returnArray = [];
  for (let i = 0; i < maxTxArray.length; i++) {
    returnArray.push(
      Scalar.add(Scalar.e(maxTxArray[i]), Scalar.shl(nLevelsArray[i], 256 - 8))
    );
  }
  return returnArray;
}

async function l1TxCreateAccountDeposit(
  loadAmount,
  tokenID,
  babyjub,
  wallet,
  zkpayment,
  token
) {
  const loadAmountF = float40.fix2Float(loadAmount);
  const l1Tx = {
    toIdx: 0,
    tokenID: tokenID,
    amountF: 0,
    loadAmountF: loadAmountF,
    fromIdx: 0,
    fromBjjCompressed: babyjub,
    fromEtherAddr: wallet.address,
  }
  const l1Txbytes = `0x${txUtils.encodeL1TxFull(l1Tx)}`
  const lastQueue = await zkpayment.nextL1FillingQueue();
  const lastQueueBytes = await zkpayment.mapL1TxQueue(lastQueue);
  const currentIndex = (lastQueueBytes.length - 2) / 2 / L1_USER_BYTES;
  if (tokenID != 0) {
    var tx = await token.connect(wallet).approve(zkpayment.address, loadAmount);
    await tx.wait();
  }

  var tx = await zkpayment.connect(wallet).addL1Transaction(
    babyjub,
    fromIdx0,
    loadAmountF,
    amountF0,
    tokenID,
    toIdx0
  )
  await tx.wait();
  return l1Txbytes;
}

module.exports = {
  calculateInputMaxTxLevels,
  Forger,
  l1TxCreateAccountDeposit
};