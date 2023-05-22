pragma solidity ^0.8.0;

contract VerifierWithdraw {
    function verifyProof(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[1] calldata
    ) external view returns(bool) {
        return true;
    }
}