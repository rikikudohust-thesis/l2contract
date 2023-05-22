// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "./interfaces/VerifierRollupInterface.sol";
import "./interfaces/VerifierWithdrawInterface.sol";
import "./libs/Helpers.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract L2Contract is Helpers {
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
    uint256 constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    uint256 constant _INPUT_SHA_CONSTANT_BYTES = 20082;

    uint8 public constant ABSOLUTE_MAX_L1L2BATCHTIMEOUT = 240;

    // This ethereum address is used internally for rollup accounts that don't have ethereum address, only Babyjubjub
    // This non-ethereum accounts can be created by the coordinator and allow users to have a rollup
    // account without needing an ethereum address
    address constant _ETH_ADDRESS_INTERNAL_ONLY =
        address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

    VerifierRollup[] public rollupVerifiers;

    // Withdraw verifier interface
    VerifierWithdrawInterface public withdrawVerifier;

    // Last account index created inside the rollup
    uint48 public lastIdx;

    // Last batch forged
    uint32 public lastForgedBatch;

    // Each batch forged will have a correlated 'state root'
    mapping(uint32 => uint256) public stateRootMap;

    // Each batch forged will have a correlated 'exit tree' represented by the exit root
    mapping(uint32 => uint256) public exitRootsMap;

    // Each batch forged will have a correlated 'l1L2TxDataHash'
    mapping(uint32 => bytes32) public l1L2TxsDataHashMap;

    // Mapping of exit nullifiers, only allowing each withdrawal to be made once
    // rootId => (Idx => true/false)
    mapping(uint32 => mapping(uint48 => bool)) public exitNullifierMap;

    // List of ERC20 tokens that can be used in rollup
    // ID = 0 will be reserved for ether
    address[] public tokenList;

    // Mapping addres of the token, with the tokenID associated
    mapping(address => uint256) public tokenMap;

    // Fee for adding a new token to the rollup in HEZ tokens
    uint256 public feeAddToken;

    // Map of queues of L1-user-tx transactions, the transactions are stored in bytes32 sequentially
    // The coordinator is forced to forge the next queue in the next L1-L2-batch
    mapping(uint32 => bytes) public mapL1TxQueue;

    // Ethereum block where the last L1-L2-batch was forged
    uint64 public lastL1L2Batch;

    // Queue index that will be forged in the next L1-L2-batch
    uint32 public nextL1ToForgeQueue;

    // Queue index wich will be filled with the following L1-User-Tx
    uint32 public nextL1FillingQueue;

    // Max ethereum blocks after the last L1-L2-batch, when exceeds the timeout only L1-L2-batch are allowed
    uint8 public forgeL1L2BatchTimeout;

    // Event emitted when a L1-user transaction is called and added to the nextL1FillingQueue queue
    event L1UserTxEvent(
        uint32 indexed queueIndex,
        uint8 indexed position, // Position inside the queue where the TX resides
        bytes l1UserTx
    );

    // Event emitted when a new token is added
    event AddToken(address indexed tokenAddress, uint32 tokenID);

    // Event emitted every time a batch is forged
    event ForgeBatch(uint32 indexed batchNum, uint16 l1UserTxsLen);

    // Event emitted when the governance update the `forgeL1L2BatchTimeout`
    event UpdateForgeL1L2BatchTimeout(uint8 newForgeL1L2BatchTimeout);

    // Event emitted when the governance update the `feeAddToken`
    event UpdateFeeAddToken(uint256 newFeeAddToken);

    // Event emitted when a withdrawal is done
    event WithdrawEvent(
        uint48 indexed idx,
        uint32 indexed numExitRoot,
        bool indexed instantWithdraw
    );

    // Event emitted when the contract is initialized
    event InitializeHermezEvent(
        uint8 forgeL1L2BatchTimeout,
        uint256 feeAddToken,
        uint64 withdrawalDelay
    );

    constructor(
        address[] memory _verifiers,
        // uint256[] memory _verifiersParams,
        address _withdrawVerifier,
        uint8 _forgeL1L2BatchTimeout,
        address _poseidon2Elements,
        address _poseidon3Elements,
        address _poseidon4Elements
    )
        public
        Helpers(_poseidon2Elements, _poseidon3Elements, _poseidon4Elements)
    {
        for (uint256 i = 0; i < _verifiers.length; i++) {
            rollupVerifiers.push(
                VerifierRollup({
                    verifierRollup: VerifierRollupInterface(_verifiers[i]),
                    maxTx: 0,
                    nLevels: 0
                })
            );
        }
        withdrawVerifier = VerifierWithdrawInterface(_withdrawVerifier);
        lastIdx = _RESERVED_IDX;
        nextL1ToForgeQueue = 1;
        tokenList.push(address(0));
    }

    // GOVERNANCE
    function addToken(address tokenAddress) public {
        require(
            IERC20(tokenAddress).totalSupply() > 0,
            "L2Contract::addToken: TOTAL_SUPPLY_ZERO"
        );
        uint256 currentTokens = tokenList.length;
        require(
            currentTokens < _LIMIT_TOKENS,
            "L2Contract::addToken: TOKEN_LIST_FULL"
        );
        require(
            tokenAddress != address(0),
            "L2Contract::addToken: ADDRESS_0_INVALID"
        );
        require(tokenMap[tokenAddress] == 0, "L2Contract::addToken: ALREADY_ADDED");

        tokenList.push(tokenAddress);
        tokenMap[tokenAddress] = currentTokens;

        emit AddToken(tokenAddress, uint32(currentTokens));
    }

    // CORIDINATOR

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
        require(msg.sender == tx.origin);
    }

    function addL1Transaction(
        uint256 babyPubKey,
        uint48 fromIdx,
        uint40 loadAmountF,
        uint40 amountF,
        uint32 tokenID,
        uint48 toIdx
    ) external payable {
        // check tokenID
        require(
            tokenID < tokenList.length,
            "L2Contract::addL1Transaction: TOKEN_NOT_REGISTERED"
        );

        // check loadAmount
        uint256 loadAmount = _float2Fix(loadAmountF);
        require(
            loadAmount < _LIMIT_LOAD_AMOUNT,
            "L2Contract::addL1Transaction: LOADAMOUNT_EXCEED_LIMIT"
        );

        // deposit token or ether
        if (loadAmount > 0) {
            if (tokenID == 0) {
                require(
                    loadAmount == msg.value,
                    "L2Contract::addL1Transaction: LOADAMOUNT_ETH_DOES_NOT_MATCH"
                );
            } else {
                require(
                    msg.value == 0,
                    "L2Contract::addL1Transaction: MSG_VALUE_NOT_EQUAL_0"
                );

                uint256 prevBalance = IERC20(tokenList[tokenID]).balanceOf(
                    address(this)
                );
                IERC20(tokenList[tokenID]).transferFrom(
                    msg.sender,
                    address(this),
                    loadAmount
                );

                uint256 postBalance = IERC20(tokenList[tokenID]).balanceOf(
                    address(this)
                );
                require(
                    postBalance - prevBalance == loadAmount,
                    "L2Contract::addL1Transaction: LOADAMOUNT_ERC20_DOES_NOT_MATCH"
                );
            }
        }

        // perform L1 User Tx
        _addL1Transaction(
            msg.sender,
            babyPubKey,
            fromIdx,
            loadAmountF,
            amountF,
            tokenID,
            toIdx
        );
    }

    /**
     * @dev Create a new rollup l1 user transaction
     * @param ethAddress Ethereum addres of the sender account or new account
     * @param babyPubKey Public key babyjubjub represented as point: sign + (Ay)
     * @param fromIdx Index leaf of sender account or 0 if create new account
     * @param loadAmountF Amount from L1 to L2 to sender account or new account
     * @param amountF Amount transfered between L2 accounts
     * @param tokenID Token identifier
     * @param toIdx Index leaf of recipient account, or _EXIT_IDX if exit, or 0 if not transfer
     * Events: `L1UserTxEvent`
     */
    function _addL1Transaction(
        address ethAddress,
        uint256 babyPubKey,
        uint48 fromIdx,
        uint40 loadAmountF,
        uint40 amountF,
        uint32 tokenID,
        uint48 toIdx
    ) internal {
        uint256 amount = _float2Fix(amountF);
        require(
            amount < _LIMIT_L2TRANSFER_AMOUNT,
            "L2Contract::_addL1Transaction: AMOUNT_EXCEED_LIMIT"
        );

        // toIdx can be: 0, _EXIT_IDX or (toIdx > _RESERVED_IDX)
        if (toIdx == 0) {
            require(
                (amount == 0),
                "L2Contract::_addL1Transaction: AMOUNT_MUST_BE_0_IF_NOT_TRANSFER"
            );
        } else {
            if ((toIdx == _EXIT_IDX)) {
                require(
                    (loadAmountF == 0),
                    "L2Contract::_addL1Transaction: LOADAMOUNT_MUST_BE_0_IF_EXIT"
                );
            } else {
                require(
                    ((toIdx > _RESERVED_IDX) && (toIdx <= lastIdx)),
                    "L2Contract::_addL1Transaction: INVALID_TOIDX"
                );
            }
        }
        // fromIdx can be: 0 if create account or (fromIdx > _RESERVED_IDX)
        if (fromIdx == 0) {
            require(
                babyPubKey != 0,
                "L2Contract::_addL1Transaction: INVALID_CREATE_ACCOUNT_WITH_NO_BABYJUB"
            );
        } else {
            require(
                (fromIdx > _RESERVED_IDX) && (fromIdx <= lastIdx),
                "L2Contract::_addL1Transaction: INVALID_FROMIDX"
            );
            require(
                babyPubKey == 0,
                "L2Contract::_addL1Transaction: BABYJUB_MUST_BE_0_IF_NOT_CREATE_ACCOUNT"
            );
        }

        _l1QueueAddTx(
            ethAddress,
            babyPubKey,
            fromIdx,
            loadAmountF,
            amountF,
            tokenID,
            toIdx
        );
    }

    function _l1QueueAddTx(
        address ethAddress,
        uint256 babyPubKey,
        uint48 fromIdx,
        uint40 loadAmountF,
        uint40 amountF,
        uint32 tokenID,
        uint48 toIdx
    ) internal {
        bytes memory l1Tx = abi.encodePacked(
            ethAddress,
            babyPubKey,
            fromIdx,
            loadAmountF,
            amountF,
            tokenID,
            toIdx
        );

        uint256 currentPosition = mapL1TxQueue[nextL1FillingQueue].length /
            _L1_USER_TOTALBYTES;

        // concatenate storage byte array with the new l1Tx
        _concatStorage(mapL1TxQueue[nextL1FillingQueue], l1Tx);

        emit L1UserTxEvent(nextL1FillingQueue, uint8(currentPosition), l1Tx);
        if (currentPosition + 1 >= _MAX_L1_USER_TX) {
            nextL1FillingQueue++;
        }
    }

    /**
     * @dev return the current L1-user-tx queue adding the L1-coordinator-tx
     * @param ptr Ptr where L1 data is set
     * @param l1Batch if true, the include l1TXs from the queue
     * [1 byte] V(ecdsa signature) || [32 bytes] S(ecdsa signature) ||
     * [32 bytes] R(ecdsa signature) || [32 bytes] fromBjj-compressed || [4 bytes] tokenId
     */
    function _buildL1Data(uint256 ptr, bool l1Batch) internal view {
        uint256 dPtr;
        uint256 dLen;

        (dPtr, dLen) = _getCallData(3);
        uint256 l1CoordinatorLength = dLen / _L1_COORDINATOR_TOTALBYTES;

        uint256 l1UserLength;
        bytes memory l1UserTxQueue;
        if (l1Batch) {
            l1UserTxQueue = mapL1TxQueue[nextL1ToForgeQueue];
            l1UserLength = l1UserTxQueue.length / _L1_USER_TOTALBYTES;
        } else {
            l1UserLength = 0;
        }

        require(
            l1UserLength + l1CoordinatorLength <= _MAX_L1_TX,
            "L2Contract::_buildL1Data: L1_TX_OVERFLOW"
        );

        if (l1UserLength > 0) {
            // Copy the queue to the ptr and update ptr
            assembly {
                let ptrFrom := add(l1UserTxQueue, 0x20)
                let ptrTo := ptr
                ptr := add(ptr, mul(l1UserLength, _L1_USER_TOTALBYTES))
                for {

                } lt(ptrTo, ptr) {
                    ptrTo := add(ptrTo, 32)
                    ptrFrom := add(ptrFrom, 32)
                } {
                    mstore(ptrTo, mload(ptrFrom))
                }
            }
        }

        for (uint256 i = 0; i < l1CoordinatorLength; i++) {
            uint8 v; // L1-Coordinator-Tx bytes[0]
            bytes32 s; // L1-Coordinator-Tx bytes[1:32]
            bytes32 r; // L1-Coordinator-Tx bytes[33:64]
            bytes32 babyPubKey; // L1-Coordinator-Tx bytes[65:96]
            uint256 tokenID; // L1-Coordinator-Tx bytes[97:100]

            assembly {
                v := byte(0, calldataload(dPtr))
                dPtr := add(dPtr, 1)

                s := calldataload(dPtr)
                dPtr := add(dPtr, 32)

                r := calldataload(dPtr)
                dPtr := add(dPtr, 32)

                babyPubKey := calldataload(dPtr)
                dPtr := add(dPtr, 32)

                tokenID := shr(224, calldataload(dPtr)) // 256-32 = 224
                dPtr := add(dPtr, 4)
            }

            require(
                tokenID < tokenList.length,
                "L2Contract::_buildL1Data: TOKEN_NOT_REGISTERED"
            );

            address ethAddress = _ETH_ADDRESS_INTERNAL_ONLY;

            // v must be >=27 --> EIP-155, v == 0 means no signature
            if (v != 0) {
                ethAddress = _checkSig(babyPubKey, r, s, v);
            }

            // add L1-Coordinator-Tx to the L1-tx queue
            assembly {
                mstore(ptr, shl(96, ethAddress)) // 256 - 160 = 96, write ethAddress: bytes[0:19]
                ptr := add(ptr, 20)

                mstore(ptr, babyPubKey) // write babyPubKey: bytes[20:51]
                ptr := add(ptr, 32)

                mstore(ptr, 0) // write zeros
                // [6 Bytes] fromIdx ,
                // [5 bytes] loadAmountFloat40 .
                // [5 bytes] amountFloat40
                ptr := add(ptr, 16)

                mstore(ptr, shl(224, tokenID)) // 256 - 32 = 224 write tokenID: bytes[62:65]
                ptr := add(ptr, 4)

                mstore(ptr, 0) // write [6 Bytes] toIdx
                ptr := add(ptr, 6)
            }
        }

        _fillZeros(
            ptr,
            (_MAX_L1_TX - l1UserLength - l1CoordinatorLength) *
                _L1_USER_TOTALBYTES
        );
    }

    /**
     * @dev Calculate the circuit input hashing all the elements
     * @param newLastIdx New total rollup accounts
     * @param newStRoot New state root
     * @param newExitRoot New exit root
     * @param l1Batch Indicates if this forge will be L2 or L1-L2
     * @param verifierIdx Verifier index
     */
    function _constructCircuitInput(
        uint48 newLastIdx,
        uint256 newStRoot,
        uint256 newExitRoot,
        bool l1Batch,
        uint8 verifierIdx
    ) internal view returns (uint256) {
        uint256 oldStRoot = stateRootMap[lastForgedBatch];
        uint256 oldLastIdx = lastIdx;
        uint256 dPtr; // Pointer to the calldata parameter data
        uint256 dLen; // Length of the calldata parameter

        // l1L2TxsData = l2Bytes * maxTx =
        // ([(nLevels / 8) bytes] fromIdx + [(nLevels / 8) bytes] toIdx + [5 bytes] amountFloat40 + [1 bytes] fee) * maxTx =
        // ((nLevels / 4) bytes + 3 bytes) * maxTx
        uint256 l1L2TxsDataLength = ((rollupVerifiers[verifierIdx].nLevels /
            8) *
            2 +
            5 +
            1) * rollupVerifiers[verifierIdx].maxTx;

        // [(nLevels / 8) bytes]
        uint256 feeIdxCoordinatorLength = (rollupVerifiers[verifierIdx]
            .nLevels / 8) * 64;

        // the concatenation of all arguments could be done with abi.encodePacked(args), but is suboptimal, especially with a large bytes arrays
        // [6 bytes] lastIdx +
        // [6 bytes] newLastIdx  +
        // [32 bytes] stateRoot  +
        // [32 bytes] newStRoot  +
        // [32 bytes] newExitRoot +
        // [_MAX_L1_TX * _L1_USER_TOTALBYTES bytes] l1TxsData +
        // totall1L2TxsDataLength +
        // feeIdxCoordinatorLength +
        // [2 bytes] chainID +
        // [4 bytes] batchNum =
        // _INPUT_SHA_CONSTANT_BYTES bytes +  totall1L2TxsDataLength + feeIdxCoordinatorLength
        bytes memory inputBytes;

        uint256 ptr; // Position for writing the bufftr

        assembly {
            let inputBytesLength := add(
                add(_INPUT_SHA_CONSTANT_BYTES, l1L2TxsDataLength),
                feeIdxCoordinatorLength
            )

            // Set inputBytes to the next free memory space
            inputBytes := mload(0x40)
            // Reserve the memory. 32 for the length , the input bytes and 32
            // extra bytes at the end for word manipulation
            mstore(0x40, add(add(inputBytes, 0x40), inputBytesLength))

            // Set the actua length of the input bytes
            mstore(inputBytes, inputBytesLength)

            // Set The Ptr at the begining of the inputPubber
            ptr := add(inputBytes, 32)

            mstore(ptr, shl(208, oldLastIdx)) // 256-48 = 208
            ptr := add(ptr, 6)

            mstore(ptr, shl(208, newLastIdx)) // 256-48 = 208
            ptr := add(ptr, 6)

            mstore(ptr, oldStRoot)
            ptr := add(ptr, 32)

            mstore(ptr, newStRoot)
            ptr := add(ptr, 32)

            mstore(ptr, newExitRoot)
            ptr := add(ptr, 32)
        }

        // Copy the L1TX Data
        _buildL1Data(ptr, l1Batch);
        ptr += _MAX_L1_TX * _L1_USER_TOTALBYTES;

        // Copy the L2 TX Data from calldata
        (dPtr, dLen) = _getCallData(4);
        require(
            dLen <= l1L2TxsDataLength,
            "L2Contract::_constructCircuitInput: L2_TX_OVERFLOW"
        );
        assembly {
            calldatacopy(ptr, dPtr, dLen)
        }
        ptr += dLen;

        // L2 TX unused data is padded with 0 at the end
        _fillZeros(ptr, l1L2TxsDataLength - dLen);
        ptr += l1L2TxsDataLength - dLen;

        // Copy the FeeIdxCoordinator from the calldata
        (dPtr, dLen) = _getCallData(5);
        require(
            dLen <= feeIdxCoordinatorLength,
            "L2Contract::_constructCircuitInput: INVALID_FEEIDXCOORDINATOR_LENGTH"
        );
        assembly {
            calldatacopy(ptr, dPtr, dLen)
        }
        ptr += dLen;
        _fillZeros(ptr, feeIdxCoordinatorLength - dLen);
        ptr += feeIdxCoordinatorLength - dLen;

        // store 2 bytes of chainID at the end of the inputBytes
        assembly {
            mstore(ptr, shl(240, chainid())) // 256 - 16 = 240
        }
        ptr += 2;

        uint256 batchNum = lastForgedBatch + 1;

        // store 4 bytes of batch number at the end of the inputBytes
        assembly {
            mstore(ptr, shl(224, batchNum)) // 256 - 32 = 224
        }

        return uint256(sha256(inputBytes)) % _RFIELD;
    }

    /**
     * @dev Clear the current queue, and update the `nextL1ToForgeQueue` and `nextL1FillingQueue` if needed
     */
    function _clearQueue() internal returns (uint16) {
        uint16 l1UserTxsLen = uint16(
            mapL1TxQueue[nextL1ToForgeQueue].length / _L1_USER_TOTALBYTES
        );
        delete mapL1TxQueue[nextL1ToForgeQueue];
        nextL1ToForgeQueue++;
        if (nextL1ToForgeQueue == nextL1FillingQueue) {
            nextL1FillingQueue++;
        }
        return l1UserTxsLen;
    }
}
