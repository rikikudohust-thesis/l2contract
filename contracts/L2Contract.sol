// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.0;

import "./libs/Helpers.sol";
import "./interfaces/VerifierRollupInterface.sol";
import "./interfaces/VerifierWithdrawInterface.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ZkPayment is Helpers {
    struct VerifierRollup {
        VerifierRollupInterface verifierInterface;
        uint256 maxTx; // maximum rollup transactions in a batch: L2-tx + L1-tx transactions
        uint256 nLevels; // number of levels of the circuit
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

    // First 32 indexes reserved, first user index will be the 32
    uint48 constant _RESERVED_IDX = 31;

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

    // User TXs are the TX made by the user with a L1 TX
    // Coordinator TXs are the L2 account creation made by the coordinator whose signature
    // needs to be verified in L1.
    // The maximum number of L1-user TXs and L1-coordinartor-TX is limited by the _MAX_L1_TX
    // And the maximum User TX is _MAX_L1_USER_TX

    // Maximum L1-user transactions allowed to be queued in a batch
    uint256 constant _MAX_L1_USER_TX = 4;

    // Maximum L1 transactions allowed to be queued in a batch
    uint256 constant _MAX_L1_TX = 8;

    // Modulus zkSNARK
    uint256 constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // [6 bytes] lastIdx + [6 bytes] newLastIdx  + [32 bytes] stateRoot  + [32 bytes] newStRoot  + [32 bytes] newExitRoot +
    // [_MAX_L1_TX * _L1_USER_TOTALBYTES bytes] l1TxsData + totall1L2TxsDataLength + feeIdxCoordinatorLength + [2 bytes] chainID + [4 bytes] batchNum =
    // 18546 bytes + totall1L2TxsDataLength + feeIdxCoordinatorLength

    uint256 constant _INPUT_SHA_CONSTANT_BYTES = 738;

    uint8 public constant ABSOLUTE_MAX_L1L2BATCHTIMEOUT = 240;

    // This ethereum address is used internally for rollup accounts that don't have ethereum address, only Babyjubjub
    // This non-ethereum accounts can be created by the coordinator and allow users to have a rollup
    // account without needing an ethereum address
    address constant _ETH_ADDRESS_INTERNAL_ONLY =
        address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);

    // Verifiers array
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

    // HEZ token address
    address public tokenHEZ;

    address public zkPaymentGovernanceAddress;

    bytes public test;
    uint256 public hashData;

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
    event InitializezkPaymentEvent(
        uint8 forgeL1L2BatchTimeout,
        uint256 feeAddToken,
        uint64 withdrawalDelay
    );

    modifier onlyGovernance() {
        require(msg.sender == zkPaymentGovernanceAddress);
        _;
    }

    /**
     * @dev Initializer function (equivalent to the constructor). Since we use
     * upgradeable smartcontracts the state vars have to be initialized here.
     */
    function initialize(
        address[] memory _verifiers,
        uint256[] memory _verifiersParams,
        address _withdrawVerifier,
        uint8 _forgeL1L2BatchTimeout,
        uint256 _feeAddToken,
        address _poseidon2Elements,
        address _poseidon3Elements,
        address _poseidon4Elements
    ) external initializer {
        // set state variables
        _initializeVerifiers(_verifiers, _verifiersParams);
        withdrawVerifier = VerifierWithdrawInterface(_withdrawVerifier);
        forgeL1L2BatchTimeout = _forgeL1L2BatchTimeout;
        feeAddToken = _feeAddToken;

        // set default state variables
        lastIdx = _RESERVED_IDX;
        // lastL1L2Batch = 0 --> first batch forced to be L1Batch
        // nextL1ToForgeQueue = 0 --> First queue will be forged
        nextL1FillingQueue = 1;
        // stateRootMap[0] = 0 --> genesis batch will have root = 0
        tokenList.push(address(0)); // Token 0 is ETH

        // initialize libs
        _initializeHelpers(
            _poseidon2Elements,
            _poseidon3Elements,
            _poseidon4Elements
        );
        zkPaymentGovernanceAddress = msg.sender;
        // emit InitializeZkPaymentEvent(
        //     _forgeL1L2BatchTimeout,
        //     _feeAddToken,
        //     _withdrawalDelay
        // );
    }

    //////////////
    // Coordinator operations
    /////////////

    /**
     * @dev Forge a new batch providing the L2 Transactions, L1Corrdinator transactions and the proof.
     * If the proof is succesfully verified, update the current state, adding a new state and exit root.
     * In order to optimize the gas consumption the parameters `encodedL1CoordinatorTx`, `l1L2TxsData` and `feeIdxCoordinator`
     * are read directly from the calldata using assembly with the instruction `calldatacopy`
     * @param newLastIdx New total rollup accounts
     * @param newStRoot New state root
     * @param newExitRoot New exit root
     * @param encodedL1CoordinatorTx Encoded L1-coordinator transactions
     * @param l1L2TxsData Encoded l2 data
     * @param feeIdxCoordinator Encoded idx accounts of the coordinator where the fees will be payed
     * @param verifierIdx Verifier index
     * @param l1Batch Indicates if this batch will be L2 or L1-L2
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     * Events: `ForgeBatch`
     */
    function forgeBatch(
        uint48 newLastIdx,
        uint256 newStRoot,
        uint256 newExitRoot,
        bytes calldata encodedL1CoordinatorTx,
        bytes calldata l1L2TxsData,
        bytes calldata feeIdxCoordinator,
        uint8 verifierIdx,
        bool l1Batch,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external virtual {
        // Assure data availability from regular ethereum nodes
        // We include this line because it's easier to track the transaction data, as it will never be in an internal TX.
        // In general this makes no sense, as callling this function from another smart contract will have to pay the calldata twice.
        // But forcing, it avoids having to check.
        require(
            msg.sender == tx.origin,
            "zkPayment::forgeBatch: INTENAL_TX_NOT_ALLOWED"
        );

        // if (!l1Batch) {
        //     require(
        //         block.number < (lastL1L2Batch + forgeL1L2BatchTimeout), // No overflow since forgeL1L2BatchTimeout is an uint8
        //         "zkPayment::forgeBatch: L1L2BATCH_REQUIRED"
        //     );
        // }

        // calculate input
        uint256 input = _constructCircuitInput(
            newLastIdx,
            newStRoot,
            newExitRoot,
            l1Batch,
            verifierIdx
        );
        // hashData = input;

        // verify proof
        require(
            rollupVerifiers[verifierIdx].verifierInterface.verifyProof(
                proofA,
                proofB,
                proofC,
                [input]
            ),
            "zkPayment::forgeBatch: INVALID_PROOF"
        );

        // update state
        lastForgedBatch++;
        lastIdx = newLastIdx;
        stateRootMap[lastForgedBatch] = newStRoot;
        exitRootsMap[lastForgedBatch] = newExitRoot;
        l1L2TxsDataHashMap[lastForgedBatch] = sha256(l1L2TxsData);

        uint16 l1UserTxsLen;
        if (l1Batch) {
            // restart the timeout
            lastL1L2Batch = uint64(block.number);
            // clear current queue
            l1UserTxsLen = _clearQueue();
        }

        emit ForgeBatch(lastForgedBatch, l1UserTxsLen);
    }

    //////////////
    // User L1 rollup tx
    /////////////

    // This are all the possible L1-User transactions:
    // | fromIdx | toIdx | loadAmountF | amountF | tokenID(SC) | babyPubKey |           l1-user-TX            |
    // |:-------:|:-----:|:-----------:|:-------:|:-----------:|:----------:|:-------------------------------:|
    // |    0    |   0   |      0      |  0(SC)  |      X      |  !=0(SC)   |          createAccount          |
    // |    0    |   0   |     !=0     |  0(SC)  |      X      |  !=0(SC)   |      createAccountDeposit       |
    // |    0    | 255+  |      X      |    X    |      X      |  !=0(SC)   | createAccountDepositAndTransfer |
    // |  255+   |   0   |      X      |  0(SC)  |      X      |   0(SC)    |             Deposit             |
    // |  255+   |   1   |      0      |    X    |      X      |   0(SC)    |              Exit               |
    // |  255+   | 255+  |      0      |    X    |      X      |   0(SC)    |            Transfer             |
    // |  255+   | 255+  |     !=0     |    X    |      X      |   0(SC)    |       DepositAndTransfer        |
    // As can be seen in the table the type of transaction is determined basically by the "fromIdx" and "toIdx"
    // The 'X' means that can be any valid value and does not change the l1-user-tx type
    // Other parameters must be consistent, for example, if toIdx is 0, amountF must be 0, because there's no L2 transfer

    /**
     * @dev Create a new rollup l1 user transaction
     * @param babyPubKey Public key babyjubjub represented as point: sign + (Ay)
     * @param fromIdx Index leaf of sender account or 0 if create new account
     * @param loadAmountF Amount from L1 to L2 to sender account or new account
     * @param amountF Amount transfered between L2 accounts
     * @param tokenID Token identifier
     * @param toIdx Index leaf of recipient account, or _EXIT_IDX if exit, or 0 if not transfer
     * Events: `L1UserTxEvent`
     */
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
            "zkPayment::addL1Transaction: TOKEN_NOT_REGISTERED"
        );

        // check loadAmount
        uint256 loadAmount = _float2Fix(loadAmountF);
        require(
            loadAmount < _LIMIT_LOAD_AMOUNT,
            "zkPayment::addL1Transaction: LOADAMOUNT_EXCEED_LIMIT"
        );

        // deposit token or ether
        if (loadAmount > 0) {
            if (tokenID == 0) {
                require(
                    loadAmount == msg.value,
                    "zkPayment::addL1Transaction: LOADAMOUNT_ETH_DOES_NOT_MATCH"
                );
            } else {
                require(
                    msg.value == 0,
                    "zkPayment::addL1Transaction: MSG_VALUE_NOT_EQUAL_0"
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
                    "zkPayment::addL1Transaction: LOADAMOUNT_ERC20_DOES_NOT_MATCH"
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
            "zkPayment::_addL1Transaction: AMOUNT_EXCEED_LIMIT"
        );

        // toIdx can be: 0, _EXIT_IDX or (toIdx > _RESERVED_IDX)
        if (toIdx == 0) {
            require(
                (amount == 0),
                "zkPayment::_addL1Transaction: AMOUNT_MUST_BE_0_IF_NOT_TRANSFER"
            );
        } else {
            if ((toIdx == _EXIT_IDX)) {
                require(
                    (loadAmountF == 0),
                    "zkPayment::_addL1Transaction: LOADAMOUNT_MUST_BE_0_IF_EXIT"
                );
            } else {
                require(
                    ((toIdx > _RESERVED_IDX) && (toIdx <= lastIdx)),
                    "zkPayment::_addL1Transaction: INVALID_TOIDX"
                );
            }
        }
        // fromIdx can be: 0 if create account or (fromIdx > _RESERVED_IDX)
        if (fromIdx == 0) {
            require(
                babyPubKey != 0,
                "zkPayment::_addL1Transaction: INVALID_CREATE_ACCOUNT_WITH_NO_BABYJUB"
            );
        } else {
            require(
                (fromIdx > _RESERVED_IDX) && (fromIdx <= lastIdx),
                "zkPayment::_addL1Transaction: INVALID_FROMIDX"
            );
            require(
                babyPubKey == 0,
                "zkPayment::_addL1Transaction: BABYJUB_MUST_BE_0_IF_NOT_CREATE_ACCOUNT"
            );
        }
        if (block.number < (lastL1L2Batch + forgeL1L2BatchTimeout)) {
            nextL1FillingQueue++;
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

    //////////////
    // User operations
    /////////////

    /**
     * @dev Withdraw to retrieve the tokens from the exit tree to the owner account
     * Before this call an exit transaction must be done
     * @param tokenID Token identifier
     * @param amount Amount to retrieve
     * @param babyPubKey Public key babyjubjub represented as point: sign + (Ay)
     * @param numExitRoot Batch number where the exit transaction has been done
     * @param siblings Siblings to demonstrate merkle tree proof
     * @param idx Index of the exit tree account
     * @param instantWithdraw true if is an instant withdraw
     * Events: `WithdrawEvent`
     */
    function withdrawMerkleProof(
        uint32 tokenID,
        uint192 amount,
        uint256 babyPubKey,
        uint32 numExitRoot,
        uint256[] memory siblings,
        uint48 idx,
        bool instantWithdraw
    ) external {
        // numExitRoot is not checked because an invalid numExitRoot will bring to a 0 root
        // and this is an empty tree.
        // in case of instant withdraw assure that is available

        // build 'key' and 'value' for exit tree
        uint256[4] memory arrayState = _buildTreeState(
            tokenID,
            0,
            amount,
            babyPubKey,
            msg.sender
        );
        uint256 stateHash = _hash4Elements(arrayState);
        // get exit root given its index depth
        uint256 exitRoot = exitRootsMap[numExitRoot];
        // check exit tree nullifier
        require(
            exitNullifierMap[numExitRoot][idx] == false,
            "zkPayment::withdrawMerkleProof: WITHDRAW_ALREADY_DONE"
        );
        // check sparse merkle tree proof

        require(
            _smtVerifier(exitRoot, siblings, idx, stateHash) == true,
            "zkPayment::withdrawMerkleProof: SMT_PROOF_INVALID"
        );

        // set nullifier
        exitNullifierMap[numExitRoot][idx] = true;
        IERC20(tokenList[tokenID]).transfer(msg.sender, amount);

        emit WithdrawEvent(idx, numExitRoot, instantWithdraw);
    }

    /**
     * @dev Withdraw to retrieve the tokens from the exit tree to the owner account
     * Before this call an exit transaction must be done
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     * @param tokenID Token identifier
     * @param amount Amount to retrieve
     * @param numExitRoot Batch number where the exit transaction has been done
     * @param idx Index of the exit tree account
     * @param instantWithdraw true if is an instant withdraw
     * Events: `WithdrawEvent`
     */
    function withdrawCircuit(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint32 tokenID,
        uint192 amount,
        uint32 numExitRoot,
        uint48 idx,
        bool instantWithdraw
    ) external {
        // in case of instant withdraw assure that is available

        require(
            exitNullifierMap[numExitRoot][idx] == false,
            "zkPayment::withdrawCircuit: WITHDRAW_ALREADY_DONE"
        );

        // get exit root given its index depth
        uint256 exitRoot = exitRootsMap[numExitRoot];

        uint256 input = uint256(
            sha256(abi.encodePacked(exitRoot, msg.sender, tokenID, amount, idx))
        ) % _RFIELD;
        // verify zk-snark circuit
        require(
            withdrawVerifier.verifyProof(proofA, proofB, proofC, [input]) ==
                true,
            "zkPayment::withdrawCircuit: INVALID_ZK_PROOF"
        );

        // set nullifier
        exitNullifierMap[numExitRoot][idx] = true;

        IERC20(tokenList[tokenID]).transfer(msg.sender, amount);

        emit WithdrawEvent(idx, numExitRoot, instantWithdraw);
    }



    //////////////
    // Governance methods
    /////////////
    /**
     * @dev Update ForgeL1L2BatchTimeout
     * @param newForgeL1L2BatchTimeout New ForgeL1L2BatchTimeout
     * Events: `UpdateForgeL1L2BatchTimeout`
     */
    function updateForgeL1L2BatchTimeout(
        uint8 newForgeL1L2BatchTimeout
    ) external onlyGovernance {
        require(
            newForgeL1L2BatchTimeout <= ABSOLUTE_MAX_L1L2BATCHTIMEOUT,
            "zkPayment::updateForgeL1L2BatchTimeout: MAX_FORGETIMEOUT_EXCEED"
        );
        forgeL1L2BatchTimeout = newForgeL1L2BatchTimeout;
        emit UpdateForgeL1L2BatchTimeout(newForgeL1L2BatchTimeout);
    }

    /**
     * @dev Update feeAddToken
     * @param newFeeAddToken New feeAddToken
     * Events: `UpdateFeeAddToken`
     */
    function updateFeeAddToken(uint256 newFeeAddToken) external onlyGovernance {
        feeAddToken = newFeeAddToken;
        emit UpdateFeeAddToken(newFeeAddToken);
    }

    //////////////
    // Viewers
    /////////////

    /**
     * @dev Retrieve the number of tokens added in rollup
     * @return Number of tokens added in rollup
     */
    function registerTokensCount() public view returns (uint256) {
        return tokenList.length;
    }

    /**
     * @dev Retrieve the number of rollup verifiers
     * @return Number of verifiers
     */
    function rollupVerifiersLength() public view returns (uint256) {
        return rollupVerifiers.length;
    }

    //////////////
    // Internal/private methods
    /////////////

    /**
     * @dev Inclusion of a new token to the rollup
     * @param tokenAddress Smart contract token address
     * Events: `AddToken`
     */
    function addToken(address tokenAddress) public {
        require(
            IERC20(tokenAddress).totalSupply() > 0,
            "zkPayment::addToken: TOTAL_SUPPLY_ZERO"
        );
        uint256 currentTokens = tokenList.length;
        require(
            currentTokens < _LIMIT_TOKENS,
            "zkPayment::addToken: TOKEN_LIST_FULL"
        );
        require(
            tokenAddress != address(0),
            "zkPayment::addToken: ADDRESS_0_INVALID"
        );
        require(
            tokenMap[tokenAddress] == 0,
            "zkPayment::addToken: ALREADY_ADDED"
        );

        tokenList.push(tokenAddress);
        tokenMap[tokenAddress] = currentTokens;

        emit AddToken(tokenAddress, uint32(currentTokens));
    }

    /**
     * @dev Initialize verifiers
     * @param _verifiers verifiers address array
     * @param _verifiersParams encoeded maxTx and nlevels of the verifier as follows:
     * [8 bits]nLevels || [248 bits] maxTx
     */
    function _initializeVerifiers(
        address[] memory _verifiers,
        uint256[] memory _verifiersParams
    ) internal {
        for (uint256 i = 0; i < _verifiers.length; i++) {
            rollupVerifiers.push(
                VerifierRollup({
                    verifierInterface: VerifierRollupInterface(_verifiers[i]),
                    maxTx: (_verifiersParams[i] << 8) >> 8,
                    nLevels: _verifiersParams[i] >> (256 - 8)
                })
            );
        }
    }

    /**
     * @dev Add L1-user-tx, add it to the correspoding queue
     * l1Tx L1-user-tx encoded in bytes as follows: [20 bytes] fromEthAddr || [32 bytes] fromBjj-compressed || [4 bytes] fromIdx ||
     * [5 bytes] loadAmountFloat40 || [5 bytes] amountFloat40 || [4 bytes] tokenId || [4 bytes] toIdx
     * @param ethAddress Ethereum address of the rollup account
     * @param babyPubKey Public key babyjubjub represented as point: sign + (Ay)
     * @param fromIdx Index account of the sender account
     * @param loadAmountF Amount from L1 to L2
     * @param amountF  Amount transfered between L2 accounts
     * @param tokenID  Token identifier
     * @param toIdx Index leaf of recipient account
     * Events: `L1UserTxEvent`
     */
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
            "zkPayment::_buildL1Data: L1_TX_OVERFLOW"
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
                "zkPayment::_buildL1Data: TOKEN_NOT_REGISTERED"
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
        uint256 l1L2TxsDataLength = ((rollupVerifiers[verifierIdx].nLevels / 8)*
            2 +
            5 +
            1) * rollupVerifiers[verifierIdx].maxTx;

        // [(nLevels / 8) bytes]
        uint256 feeIdxCoordinatorLength = (rollupVerifiers[verifierIdx].nLevels /
      8) * 4;

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

        uint256 len;
        assembly {
            let inputBytesLength := add(
                add(_INPUT_SHA_CONSTANT_BYTES, l1L2TxsDataLength),
                feeIdxCoordinatorLength
            )
            len := inputBytesLength

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
            "zkPayment::_constructCircuitInput: L2_TX_OVERFLOW"
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
            "zkPayment::_constructCircuitInput: INVALID_FEEIDXCOORDINATOR_LENGTH"
        );
        assembly {
            calldatacopy(ptr, dPtr, dLen)
        }
        ptr += dLen;
        _fillZeros(ptr, feeIdxCoordinatorLength - dLen);
        ptr += feeIdxCoordinatorLength - dLen;

        // store 2 bytes of chainID at the end of the inputBytes
        assembly {
            mstore(ptr, shl(240, 1)) // 256 - 16 = 240
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

    function forgeBatchAllow(
        uint48 newLastIdx,
        uint256 newStRoot,
        uint256 newExitRoot,
        bytes calldata encodedL1CoordinatorTx,
        bytes calldata l1L2TxsData,
        bytes calldata feeIdxCoordinator,
        uint8 verifierIdx,
        bool l1Batch,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external view returns(bool) {
        // Assure data availability from regular ethereum nodes
        // We include this line because it's easier to track the transaction data, as it will never be in an internal TX.
        // In general this makes no sense, as callling this function from another smart contract will have to pay the calldata twice.
        // But forcing, it avoids having to check.
        require(
            msg.sender == tx.origin,
            "zkPayment::forgeBatch: INTENAL_TX_NOT_ALLOWED"
        );

        if (!l1Batch) {
            require(
                block.number < (lastL1L2Batch + forgeL1L2BatchTimeout), // No overflow since forgeL1L2BatchTimeout is an uint8
                "zkPayment::forgeBatch: L1L2BATCH_REQUIRED"
            );
        }

        // calculate input
        uint256 input = _constructCircuitInput(
            newLastIdx,
            newStRoot,
            newExitRoot,
            l1Batch,
            verifierIdx
        );
        // verify proof
        require(
            rollupVerifiers[verifierIdx].verifierInterface.verifyProof(
                proofA,
                proofB,
                proofC,
                [input]
            ),
            "zkPayment::forgeBatch: INVALID_PROOF"
        );
    }
}

