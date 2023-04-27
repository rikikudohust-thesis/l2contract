// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "./interfaces/VerifierRollupInterface.sol";
import "./interfaces/VerifierWithdrawInterface.sol";

contract Hermez {
    struct VerifierRollup {
        VerifierRollupInterface verifierRollup;
        uint256 maxTx;
        uint256 nLevels;
    }

    // ERC20 signatures:

    // bytes4(keccak256(bytes("transfer(address,uint256)")));
    bytes4 constant _TRANSFER_SIGNATURE = 0xa9059cbb;

    // bytes4(keccak256(bytes("transferFrom(address,address,uint256)")));
    bytes4 constant _TRANSFER_FROM_SIGNATURE = 0x23b872dd;

    // bytes4(keccak256(bytes("approve(address,uint256)")));
    bytes4 constant _APPROVE_SIGNATURE = 0x095ea7b3;

    // ERC20 extensions:

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 constant _PERMIT_SIGNATURE = 0xd505accf;

    // First 256 indexes reserved, first user index will be the 256
    uint48 constant _RESERVED_IDX = 255;

    // IDX 1 is reserved for exits
    uint48 constant _EXIT_IDX = 1;

    // Max load amount allowed (loadAmount: L1 --> L2)
    uint256 constant _LIMIT_LOAD_AMOUNT = (1 << 128);

    // Max amount allowed (amount L2 --> L2)
    uint256 constant _LIMIT_L2TRANSFER_AMOUNT = (1 << 192);

    // Max number of tokens allowed to be registered inside the rollup
    uint256 constant _LIMIT_TOKENS = (1 << 32);

    // [65 bytes] compressedSignature + [32 bytes] fromBjj-compressed + [4 bytes] tokenId
    uint256 constant _L1_COORDINATOR_TOTALBYTES = 101;

    // [20 bytes] fromEthAddr + [32 bytes] fromBjj-compressed + [6 bytes] fromIdx +
    // [5 bytes] loadAmountFloat40 + [5 bytes] amountFloat40 + [4 bytes] tokenId + [6 bytes] toIdx
    uint256 constant _L1_USER_TOTALBYTES = 78;

    uint256 constant _MAX_L1_USER_TX = 128;

    // Maximum L1 transactions allowed to be queued in a batch
    uint256 constant _MAX_L1_TX = 256;

    // Modulus zkSNARK
    uint256 constant _RFIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    uint8 public constant ABSOLUTE_MAX_L1L2BATCHTIMEOUT = 240;

    // This ethereum address is used internally for rollup accounts that don't have ethereum address, only Babyjubjub
    // This non-ethereum accounts can be created by the coordinator and allow users to have a rollup
    // account without needing an ethereum address
    address constant _ETH_ADDRESS_INTERNAL_ONLY = address(
        0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF
    );

    VerifierRollup[] public rollupVerifiers;
    VerifierWithdrawInterface public withdrawVerifier;

    uint48 public lastIdx;

    uint32 public lastForgedBatch;

    mapping(uint32 => uint256) public stateRootMap;

    mapping(uint32 => uint256) public exitRootMap;

    mapping(uint32 => bytes32) public l1L2TxsDataHashMap;

    mapping(uint32 => mapping(uint48 => bool)) public exitNullifierMap;

    address[] public tokenList;
    mapping(address => uint256) public tokenMap;

    mapping(uint32 => bytes) public mapL1TxQueue;

    uint64 public lastL1L2Batch;
    uint32 public nextL1ToForgeQueue;
    uint32 public newxtL1FillingQueue;
    uint32 public forgeL1L2BatchTimeout;

    constructor(
        address[] memory _verifiers,
        uint256[] memory _verifiersParams,
        address _withdrawVerifier,
        uint8 _forgeL1L2BatchTimeout,
        address _poseidon2Elements,
        address _poseidon3Elements,
        address _poseidon4Elements
    ) public {
        withdrawVerifier = VerifierWithdrawInterface(_withdrawVerifier);
        lastIdx = _RESERVED_IDX;
        nextL1ToForgeQueue = 1;
        tokenList.push(address(0));
    }

    function forgeBatch(
        uint48 newLastIdx,
        uint256 newStRoot,
        uint256 newExistRoot,
        bytes calldata encodeL1Tx,
        bytes calldata l1L2TxsData,
        uint8 verifierIdx,
        bool l1Batch,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external {
        require(
            msg.sender == tx.origin
        );
    }

    function addL1Transaction(
        uint256 babyPubkey,
        uint48 fromIdx
    ) external payable {

    } 
}